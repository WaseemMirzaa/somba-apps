/* Commission stored per order line + per-payout settlement statements + batch approval,
 * end to end against a RUNNING dev API seeded with `npm run seed`:
 *   1 each line stores the commission in force when the order was placed
 *   2 changing the global commissionPct never moves earnings of existing orders
 *   3 payout request freezes a statement (sale lines, totals, opening/closing balance)
 *   4 statement access: owner and finance only
 *   5 batch approve (partial failure), reject releases lines, refund line after a return
 *
 *   API_URL=http://localhost:3001 ADMIN_PW=... node test/statements-smoke.cjs
 *
 * ADMIN_PW / WAREHOUSE_PW / RIDER_PW override the seed password when those accounts were changed.
 * It toggles commissionPct / productModeration / requireVerifiedForCheckout / minPayoutUsd /
 * payoutClearanceHours and restores them at the end (even when a check throws).
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const NEW_PW = 'Stmt-Pass-2026';
const tag = Date.now().toString().slice(-8);

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b) => Math.abs(a - b) < 0.011;
const rest = async (path, body, token) => {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
// The gateway allows 40 events/second/socket; pace each socket so a fast local DB never trips it.
const nextSlot = new WeakMap();
const req = async (s, ev, b = {}) => {
  const at = Math.max(Date.now(), nextSlot.get(s) ?? 0);
  nextSlot.set(s, at + 30);
  if (at > Date.now()) await sleep(at - Date.now());
  return new Promise((r) => s.emit(ev, b, r));
};
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@stmt.test`, password: NEW_PW, name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email: `${label}${tag}@stmt.test` };
};
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const saved = (await req(admin.sock, 'settings:get')).data ?? {};
  const setting = (key, value) => req(admin.sock, 'settings:set', { key, value });
  const restore = async () => {
    for (const k of ['commissionPct', 'productModeration', 'requireVerifiedForCheckout', 'minPayoutUsd', 'payoutClearanceHours']) {
      if (saved[k] !== undefined) await setting(k, String(saved[k])).catch(() => undefined);
    }
  };

  try {
    await setting('productModeration', 'false');
    await setting('requireVerifiedForCheckout', 'false');
    await setting('minPayoutUsd', '1');
    await setting('payoutClearanceHours', '0');
    await setting('commissionPct', '10');

    // ---- actors -----------------------------------------------------------
    const promote = async (label, role) => {
      const u = await register(label);
      await req(admin.sock, 'roles:setRole', { id: u.user.id, role });
      u.sock.close();
      return login(u.email, NEW_PW);
    };
    const ops = await promote('ops', 'admin_operations');
    const makeSeller = async (label) => {
      const u = await register(label, 'seller');
      const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
      await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
      await req(u.sock, 'sellers:update', { pickupAddress: '7 Rue du Marché, Limete' });
      return { ...u, store };
    };
    const shop1 = await makeSeller('sone');
    const shop2 = await makeSeller('stwo');
    const cust = await register('buyer');
    const listing = async (shop, name, price) => (await req(shop.sock, 'products:create', { name: `${name} ${tag}`, price, category: 'Electronics', stock: 50 })).data;
    const sofa = await listing(shop1, 'Statement sofa', 100);
    const lamp = await listing(shop2, 'Statement lamp', 50);
    ok(sofa?.status === 'live' && lamp?.status === 'live', 'setup: two sellers each have a live product', JSON.stringify([sofa?.status, lamp?.status]));

    const order = async (items) => req(cust.sock, 'orders:create', { items, paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
    const walk = async (id, statuses = ['processing', 'shipped', 'out_for_delivery', 'delivered']) => { for (const s of statuses) { const r = await req(ops.sock, 'orders:updateStatus', { orderId: id, status: s }); if (!r.ok) return r; } return { ok: true }; };
    const avail = async (shop) => (await req(shop.sock, 'payouts:available')).data;
    const statement = (who, id) => req(who.sock, 'payouts:statement', { payoutId: id });

    // =======================================================================
    section('1. Commission is stored on every order line');
    let a = await order([{ productId: sofa.id, qty: 2 }]); // 200 @ 10%
    const oA = a.data;
    ok(a.ok && oA.items[0].commissionPct === 10 && near(oA.items[0].commissionUsd, 20), 'line commission = 10% of 2 x 100 = 20', a.error ?? JSON.stringify(oA?.items?.[0]));
    a = await order([{ productId: lamp.id, qty: 1 }]); // 50 @ 10%
    const oB = a.data;
    ok(a.ok && oB.items[0].commissionPct === 10 && near(oB.items[0].commissionUsd, 5), 'second seller line: 10% of 50 = 5', a.error ?? '');
    const sellerView = (await req(shop1.sock, 'orders:list')).data.find((o) => o.id === oA.id);
    ok(sellerView?.items?.[0]?.commissionUsd === 20 && sellerView.items[0].commissionPct === 10, "the seller's own order view carries the stored commission", JSON.stringify(sellerView?.items?.[0]));

    // =======================================================================
    section('2. A new rate never rewrites existing orders');
    a = await setting('commissionPct', '25');
    ok(a.ok, 'finance raises the platform commission to 25%', a.error ?? '');
    a = await order([{ productId: sofa.id, qty: 1 }]); // 100 @ 25%
    const oC = a.data;
    ok(a.ok && oC.items[0].commissionPct === 25 && near(oC.items[0].commissionUsd, 25), 'a NEW order stores 25%', a.error ?? JSON.stringify(oC?.items?.[0]));
    a = await walk(oA.id);
    ok(a.ok, 'order A (placed at 10%) is delivered', a.error ?? '');
    a = await walk(oB.id);
    ok(a.ok, 'order B (placed at 10%) is delivered', a.error ?? '');
    const av1 = await until(async () => { const v = await avail(shop1); return v?.earned > 0 ? v : null; });
    ok(av1 && near(av1.earned, 180) && near(av1.commissionUsd, 20) && av1.commissionPct === 25, 'seller 1 earned 200 - 20 = 180 (not 150) and the current rate shown is 25%', JSON.stringify(av1));
    const av2 = await avail(shop2);
    ok(near(av2.earned, 45), 'seller 2 earned 50 - 5 = 45', JSON.stringify(av2));
    const fin = (await req(admin.sock, 'analytics:finance')).data;
    ok(fin && typeof fin.commissionEarnedUsd === 'number' && fin.commissionPct === 25, 'finance dashboard still reports the current rate', JSON.stringify(fin && { p: fin.commissionPct, e: fin.commissionEarnedUsd }));

    // =======================================================================
    section('3. A payout request freezes a statement');
    a = await req(shop1.sock, 'payouts:request', { amountUsd: 100, method: 'wallet' });
    const p1 = a.data;
    ok(a.ok && near(p1.statementGrossUsd, 200) && near(p1.statementCommissionUsd, 20) && near(p1.statementNetUsd, 180) && near(p1.statementRefundsUsd, 0), 'payout 1 carries the statement totals', a.error ?? JSON.stringify(p1));
    ok(near(p1.openingBalanceUsd, 0) && near(p1.closingBalanceUsd, 80), 'opening balance 0, closing balance 80 (180 - 100)', JSON.stringify([p1?.openingBalanceUsd, p1?.closingBalanceUsd]));
    a = await statement(shop1, p1.id);
    const st1 = a.data;
    ok(a.ok && st1.lines.length === 1 && st1.legacy === false, 'the statement has one sale line', a.error ?? JSON.stringify(st1?.lines?.length));
    const l1 = st1?.lines?.[0];
    ok(l1 && l1.kind === 'sale' && l1.orderId === oA.id && l1.orderReference === oA.reference && l1.qty === 2 && near(l1.grossUsd, 200) && l1.commissionPct === 10 && near(l1.commissionUsd, 20) && near(l1.netUsd, 180), 'line = order A: gross 200, 10%, commission 20, net 180', JSON.stringify(l1));
    const sums = (st) => ({
      gross: st.lines.reduce((t, l) => t + l.grossUsd, 0),
      commission: st.lines.reduce((t, l) => t + l.commissionUsd, 0),
      refunds: st.lines.reduce((t, l) => t + l.refundUsd, 0),
      net: st.lines.reduce((t, l) => t + l.netUsd, 0),
    });
    const s1 = sums(st1);
    ok(near(s1.gross, st1.totals.grossUsd) && near(s1.commission, st1.totals.commissionUsd) && near(s1.net, st1.totals.netUsd) && near(st1.totals.grossUsd - st1.totals.commissionUsd - st1.totals.refundsUsd, st1.totals.netUsd), 'CSV totals: lines add up to the totals, gross - commission - refunds = net', JSON.stringify(st1.totals));
    ok(near(st1.totals.openingBalanceUsd + st1.totals.netUsd - st1.totals.amountUsd, st1.totals.closingBalanceUsd), 'opening + net - payout = closing', JSON.stringify(st1.totals));
    a = await req(shop2.sock, 'payouts:request', { amountUsd: 45, method: 'wallet' });
    const p2 = a.data;
    ok(a.ok && near(p2.statementNetUsd, 45), 'seller 2 requests 45: its own statement', a.error ?? '');

    // =======================================================================
    section('4. Who may read a statement');
    a = await statement(shop2, p1.id);
    ok(!a.ok, "seller 2 cannot read seller 1's statement", a.error ?? 'was allowed');
    a = await statement(cust, p1.id);
    ok(!a.ok, 'a customer cannot read a statement', a.error ?? 'was allowed');
    a = await statement(admin, p1.id);
    ok(a.ok && a.data.lines.length === 1, 'finance can read any statement', a.error ?? '');
    a = await statement(shop1, 'does-not-exist');
    ok(!a.ok, 'an unknown payout id is refused', a.error ?? '');

    // =======================================================================
    section('5a. Lines already on a statement are not settled twice');
    a = await walk(oC.id);
    ok(a.ok, 'order C (placed at 25%) is delivered', a.error ?? '');
    const av3 = await until(async () => { const v = await avail(shop1); return near(v.available, 80 + 75) ? v : null; });
    ok(!!av3, 'available = 80 carried + 75 (100 - 25% commission) = 155', JSON.stringify(await avail(shop1)));
    a = await req(shop1.sock, 'payouts:request', { amountUsd: 155, method: 'bank', account: 'Holder S One, IBAN CD00 0000 0000' });
    const p3 = a.data;
    ok(a.ok && near(p3.statementGrossUsd, 100) && near(p3.statementCommissionUsd, 25) && near(p3.statementNetUsd, 75) && near(p3.openingBalanceUsd, 80) && near(p3.closingBalanceUsd, 0), 'statement 2 holds ONLY order C; opening balance 80 carried', a.error ?? JSON.stringify(p3));
    const st3 = (await statement(shop1, p3.id)).data;
    ok(st3?.lines.length === 1 && st3.lines[0].orderId === oC.id && st3.lines[0].commissionPct === 25, 'its line is order C at 25%', JSON.stringify(st3?.lines));

    // =======================================================================
    section('5b. Batch approve: each payout succeeds or fails on its own');
    a = await req(shop1.sock, 'payouts:approveBatch', { items: [{ payoutId: p1.id }] });
    ok(!a.ok, 'a seller cannot batch-approve', a.error ?? '');
    a = await req(admin.sock, 'payouts:approveBatch', { items: [{ payoutId: p1.id }, { payoutId: p2.id }, { payoutId: p3.id }] });
    const res = a.data ?? [];
    ok(a.ok && res.length === 3, 'the batch answers one result per payout', a.error ?? JSON.stringify(res));
    ok(res[0]?.ok && res[0].payout.status === 'paid' && res[1]?.ok && res[1].payout.status === 'paid', 'the two wallet payouts are paid', JSON.stringify(res.map((r) => [r.ok, r.error])));
    ok(res[2] && !res[2].ok && /reference of the transfer/.test(res[2].error ?? ''), 'the bank payout without a transfer reference fails (and only it)', res[2]?.error);
    a = await req(admin.sock, 'payouts:approveBatch', { items: [{ payoutId: p3.id, providerRef: `TRX-${tag}` }, { payoutId: p1.id }] });
    ok(a.ok && a.data[0].ok && a.data[0].payout.providerRef === `TRX-${tag}`, 'retrying the bank payout with its reference pays it', a.error ?? JSON.stringify(a.data));
    ok(a.data?.[1] && !a.data[1].ok, 'an already paid payout is reported as failed, not paid twice', JSON.stringify(a.data?.[1]));
    const audit = (await req(admin.sock, 'audit:list')).data ?? [];
    ok(audit.filter((l) => l.action === 'payout.paid' && [p1.reference, p2.reference, p3.reference].some((r) => (l.detail ?? '').includes(r))).length >= 3, 'each batch success is audited');
    a = await req(admin.sock, 'payouts:approveBatch', { items: [] });
    ok(!a.ok, 'an empty batch is refused', a.error ?? '');

    // =======================================================================
    section('5c. A rejected payout releases its lines');
    a = await order([{ productId: lamp.id, qty: 1 }]); // 50 @ 25% -> net 37.5
    const oE = a.data;
    await walk(oE.id);
    await until(async () => near((await avail(shop2)).available, 37.5));
    a = await req(shop2.sock, 'payouts:request', { amountUsd: 37.5, method: 'wallet' });
    const p5 = a.data;
    ok(a.ok && near(p5.statementNetUsd, 37.5), 'seller 2 requests 37.50', a.error ?? '');
    a = await req(admin.sock, 'payouts:reject', { payoutId: p5.id, note: 'Check account' });
    ok(a.ok && a.data.status === 'rejected', 'finance rejects it', a.error ?? '');
    ok((await statement(shop2, p5.id)).data?.lines.length === 1, 'the rejected statement keeps its line for history');
    a = await req(shop2.sock, 'payouts:request', { amountUsd: 37.5, method: 'wallet' });
    const p6 = a.data;
    const st6 = (await statement(shop2, p6?.id)).data;
    ok(a.ok && st6?.lines.length === 1 && st6.lines[0].orderId === oE.id && near(st6.totals.netUsd, 37.5), 'the next statement settles that sale again', a.error ?? JSON.stringify(st6));

    // =======================================================================
    section('5d. A return after settlement becomes a negative refund line');
    a = await order([{ productId: sofa.id, qty: 3 }]); // 300 @ 25% -> net 225
    const oD = a.data;
    await walk(oD.id);
    a = await req(admin.sock, 'orders:refund', { orderId: oA.id });
    ok(a.ok && (await req(cust.sock, 'orders:list')).data.find((o) => o.id === oA.id)?.status === 'returned', 'order A (settled on statement 1) is refunded and returned', a.error ?? '');
    // earned = C 75 + D 225 = 300; committed = 100 + 155 = 255 -> 45
    const av4 = await until(async () => { const v = await avail(shop1); return near(v.available, 45) ? v : null; });
    ok(!!av4, 'available = 300 earned - 255 already requested = 45', JSON.stringify(await avail(shop1)));
    a = await req(shop1.sock, 'payouts:request', { amountUsd: 45, method: 'wallet' });
    const p4 = a.data;
    const st4 = (await statement(shop1, p4?.id)).data;
    const refundLine = st4?.lines.find((l) => l.kind === 'refund');
    const saleLine = st4?.lines.find((l) => l.kind === 'sale');
    ok(a.ok && refundLine && refundLine.orderId === oA.id && near(refundLine.refundUsd, 180) && near(refundLine.netUsd, -180), 'the statement has a -180 refund line for order A', a.error ?? JSON.stringify(st4?.lines));
    ok(saleLine && saleLine.orderId === oD.id && near(saleLine.netUsd, 225), 'and the +225 sale line for order D', JSON.stringify(saleLine));
    ok(st4 && near(st4.totals.netUsd, 45) && near(st4.totals.refundsUsd, 180) && near(st4.totals.openingBalanceUsd, 0) && near(st4.totals.closingBalanceUsd, 0), 'totals: net 45, refunds 180, opening 0, closing 0', JSON.stringify(st4?.totals));
    a = await req(shop1.sock, 'payouts:list');
    ok(a.ok && a.data.some((p) => p.id === p4.id && p.statementNetUsd === 45), 'payouts:list carries the statement totals');
  } finally {
    await restore();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
