/* Concurrency / database-integrity suite against a RUNNING API (dev mode, seeded).
 * Fires the same action many times at once and checks that exactly one wins:
 * stock can't be oversold, an order can't be cancelled or refunded twice, two
 * riders can't claim the same delivery, a payout can't be paid twice, a payment
 * can't be confirmed twice, and money/stock stay consistent afterwards.
 *
 *   API_URL=http://localhost:3001 node test/race-smoke.cjs
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const tag = Date.now().toString().slice(-8);

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The API allows 30 sign-ins/registrations a minute per address; when the suites run back to back (CI), wait and retry.
const rest = async (path, body, token) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && /ThrottlerException/.test(json?.message ?? '') && attempt < 6) {
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@race.test`, password: 'Race-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const addr = JSON.stringify({ line1: '1 Race St', city: 'Kinshasa' });
const order = (c, productId, qty = 1, method = 'stripe_card') => req(c.sock, 'orders:create', { items: [{ productId, qty }], paymentMethod: method, zoneId: 'gombe', shippingAddress: addr });

(async () => {
  const admin = await login('admin@somba.app');
  const finance = await login('finance@somba.app');
  const warehouse = await login('warehouse@somba.app');
  const rider1 = await login('rider@somba.app');
  const mk = await req(admin.sock, 'roles:createStaff', { email: `rider2${tag}@race.test`, name: 'Second Rider', role: 'rider' });
  const rider2 = await login(`rider2${tag}@race.test`, mk.data.tempPassword);
  const sellerU = await register('seller', 'seller');
  const store = (await req(sellerU.sock, 'sellers:register', kyc(`Race Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  const buyers = [];
  for (let i = 0; i < 8; i++) buyers.push(await register(`buyer${i}`));

  // ---- stock cannot be oversold ---------------------------------------------------------
  section('Many buyers, one unit of stock');
  let a = await req(sellerU.sock, 'products:create', { name: `Last One ${tag}`, price: 20, category: 'Electronics', stock: 1 });
  const last = a.data;
  const results = await Promise.all(buyers.map((b) => order(b, last.id)));
  const wins = results.filter((r) => r.ok);
  ok(wins.length === 1, 'exactly one of 8 simultaneous buyers gets the last unit', `wins=${wins.length}`);
  const after = (await req(admin.sock, 'products:get', { id: last.id })).data;
  ok(after.stock === 0, 'stock ends at exactly 0 (never negative)', `stock=${after.stock}`);

  a = await req(sellerU.sock, 'products:create', { name: `Five Left ${tag}`, price: 10, category: 'Electronics', stock: 5 });
  const five = a.data;
  const r2 = await Promise.all(buyers.map((b) => order(b, five.id, 1)));
  const w2 = r2.filter((r) => r.ok).length;
  ok(w2 === 5, 'with 5 units and 8 buyers exactly 5 orders succeed', `wins=${w2}`);
  ok((await req(admin.sock, 'products:get', { id: five.id })).data.stock === 0, 'stock ends at 0');
  const losers = r2.filter((r) => !r.ok);
  ok(losers.every((l) => /stock|sold out|too little/i.test(l.error ?? '')), 'losers get a readable sold-out message', losers[0]?.error ?? '');

  // ---- double cancel -------------------------------------------------------------------------
  section('Cancelling twice at the same time');
  a = await req(sellerU.sock, 'products:create', { name: `Cancel Me ${tag}`, price: 30, category: 'Electronics', stock: 10 });
  const canc = a.data;
  const buyer = buyers[0];
  const o = (await order(buyer, canc.id, 2)).data;
  const walletBefore = (await req(buyer.sock, 'wallet:get')).data.balance;
  const stockMid = (await req(admin.sock, 'products:get', { id: canc.id })).data.stock;
  const cancels = await Promise.all([1, 2, 3, 4, 5].map(() => req(buyer.sock, 'orders:cancel', { orderId: o.id })));
  ok(cancels.filter((c) => c.ok).length === 1, 'exactly one of 5 simultaneous cancels succeeds');
  const stockEnd = (await req(admin.sock, 'products:get', { id: canc.id })).data.stock;
  ok(stockEnd === stockMid + 2, 'stock is released exactly once', `${stockMid} → ${stockEnd}`);
  const refunds = (await req(buyer.sock, 'wallet:transactions')).data.filter((t) => t.type === 'refund' && Math.abs(t.amount - o.totalUsd) < 0.01);
  ok(refunds.length === 1, 'the refund is credited exactly once', `refunds=${refunds.length}`);
  void walletBefore;

  // ---- double refund ---------------------------------------------------------------------------
  section('Refunding twice at the same time');
  const buyer1 = buyers[1];
  const o2 = (await order(buyer1, canc.id, 1)).data;
  const rf = await Promise.all([1, 2, 3, 4].map(() => req(finance.sock, 'orders:refund', { orderId: o2.id, toWallet: true })));
  ok(rf.filter((r) => r.ok).length === 1, 'exactly one of 4 simultaneous refunds succeeds');
  const rfTx = (await req(buyer1.sock, 'wallet:transactions')).data.filter((t) => t.type === 'refund' && Math.abs(t.amount - o2.totalUsd) < 0.01);
  ok(rfTx.length === 1, 'the wallet is credited once');

  // ---- two riders, one delivery ----------------------------------------------------------------------
  section('Two riders claim the same delivery');
  const o3 = (await order(buyers[2], canc.id, 1)).data;
  const t3 = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === o3.id));
  const claims = await Promise.all([req(rider1.sock, 'delivery:accept', { taskId: t3.id }), req(rider2.sock, 'delivery:accept', { taskId: t3.id }), req(rider1.sock, 'delivery:accept', { taskId: t3.id })]);
  ok(claims.filter((c) => c.ok).length === 1, 'exactly one claim wins');
  const winner = claims.findIndex((c) => c.ok) === 1 ? rider2 : rider1;
  const loser = winner === rider1 ? rider2 : rider1;
  ok(!(await req(loser.sock, 'delivery:updateStatus', { taskId: t3.id, status: 'picked_up' })).ok, "the losing rider cannot move someone else's delivery");
  const pu = await Promise.all([1, 2, 3].map(() => req(winner.sock, 'delivery:updateStatus', { taskId: t3.id, status: 'picked_up' })));
  ok(pu.filter((c) => c.ok).length === 1, 'a double-tap on "picked up" is applied once');

  // ---- failing a task twice at once ---------------------------------------------------------------------
  section('Reporting a failed delivery twice at the same time');
  const fails2 = await Promise.all([1, 2].map(() => req(winner.sock, 'delivery:updateStatus', { taskId: t3.id, status: 'failed', reason: 'double tap' })));
  ok(fails2.filter((c) => c.ok).length === 1, 'one failure report is applied');
  await sleep(500);
  const queued = (await req(warehouse.sock, 'delivery:list')).data.filter((t) => t.orderId === o3.id && t.status === 'unassigned');
  ok(queued.length === 1, 'exactly one re-attempt task is queued', `queued=${queued.length}`);

  // ---- payout paid twice ------------------------------------------------------------------------------------
  section('Approving the same payout twice');
  a = await req(sellerU.sock, 'products:create', { name: `Payout Item ${tag}`, price: 100, category: 'Electronics', stock: 20 });
  const pay = a.data;
  const o4 = (await order(buyers[3], pay.id, 5)).data;
  const t4 = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === o4.id));
  await req(rider1.sock, 'delivery:accept', { taskId: t4.id });
  for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider1.sock, 'delivery:updateStatus', { taskId: t4.id, status: st });
  const avail = (await req(sellerU.sock, 'payouts:available')).data;
  ok(avail.available >= 400, 'delivered sales become available to the seller', `available=${avail.available}`);
  const po = (await req(sellerU.sock, 'payouts:request', { amountUsd: 100, method: 'wallet' })).data;
  const walletB = (await req(sellerU.sock, 'wallet:get')).data.balance;
  const ap = await Promise.all([1, 2, 3, 4].map(() => req(finance.sock, 'payouts:approve', { payoutId: po.id })));
  ok(ap.filter((r) => r.ok).length === 1, 'exactly one of 4 simultaneous approvals pays it', JSON.stringify(ap.map((r) => r.ok ? 'OK' : r.error)));
  const walletA = (await req(sellerU.sock, 'wallet:get')).data.balance;
  ok(Math.abs(walletA - walletB - 100) < 0.01, 'the seller is credited exactly once', `${walletB} → ${walletA}`);
  const over = await Promise.all([1, 2, 3].map(() => req(sellerU.sock, 'payouts:request', { amountUsd: avail.available, method: 'wallet' })));
  ok(over.filter((r) => r.ok).length <= 1, 'simultaneous payout requests cannot withdraw more than is available', `ok=${over.filter((r) => r.ok).length}`);

  // ---- payment confirmed twice ---------------------------------------------------------------------------------
  section('Confirming a payment twice at the same time');
  const buyer5 = buyers[5];
  const tp = (await req(buyer5.sock, 'wallet:topup', { amountUsd: 40, method: 'airtel_money', phone: '+243811111111' })).data;
  const before = (await req(buyer5.sock, 'wallet:get')).data.balance;
  const cf = await Promise.all([1, 2, 3].map(() => req(finance.sock, 'payments:confirm', { reference: tp.reference })));
  ok(cf.filter((r) => r.ok).length === 1, 'exactly one confirmation applies');
  const afterBal = await until(async () => { const b = (await req(buyer5.sock, 'wallet:get')).data.balance; return b > before ? b : null; });
  ok(Math.abs(afterBal - before - 40) < 0.01, 'the wallet is credited once', `${before} → ${afterBal}`);

  // ---- wallet spending race --------------------------------------------------------------------------------------------
  section('Spending the same wallet balance twice');
  const buyer6 = buyers[6];
  const tp6 = (await req(buyer6.sock, 'wallet:topup', { amountUsd: 40, method: 'airtel_money', phone: '+243822222222' })).data;
  await req(finance.sock, 'payments:confirm', { reference: tp6.reference });
  await until(async () => (await req(buyer6.sock, 'wallet:get')).data.balance >= 40);
  a = await req(sellerU.sock, 'products:create', { name: `Wallet Item ${tag}`, price: 35, category: 'Electronics', stock: 20 });
  const wi = a.data;
  const sp = await Promise.all([1, 2, 3].map(() => order(buyer6, wi.id, 1, 'wallet')));
  ok(sp.filter((r) => r.ok).length === 1, 'a $40 wallet can pay for only one $35 + fee order at a time');
  const bal = (await req(buyer6.sock, 'wallet:get')).data.balance;
  ok(bal >= 0, 'the wallet never goes negative', `balance=${bal}`);
  const stockW = (await req(admin.sock, 'products:get', { id: wi.id })).data.stock;
  ok(stockW === 19, 'stock reflects only the successful order (failed ones released it)', `stock=${stockW}`);

  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `   - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
