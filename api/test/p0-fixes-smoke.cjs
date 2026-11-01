/* P0 backend fixes, end to end against a RUNNING dev API seeded with `npm run seed`:
 *   1 order status state machine        5 seller re-moderation of live listings
 *   2 operator cancel with a reason     6 seller notifications (new order / customer cancel)
 *   3 refund correctness                7 seller balance can go negative
 *   4 promo cents + promo / flash lifecycle   8 self-purchase guard
 *
 *   API_URL=http://localhost:3001 ADMIN_PW=... WAREHOUSE_PW=... node test/p0-fixes-smoke.cjs
 *
 * ADMIN_PW / WAREHOUSE_PW / RIDER_PW override the seed password when those accounts were changed.
 * It toggles requireVerifiedForCheckout / productModeration / codEnabled / minPayoutUsd /
 * payoutClearanceHours and restores them at the end (even when a check throws).
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { hubId } = require('./journey.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const NEW_PW = 'P0-Pass-2026';
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
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@p0.test`, password: NEW_PW, name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email: `${label}${tag}@p0.test` };
};
/** Signs in a staff account; if its password is unknown here, the admin creates a fresh one with that role. */
const staffLogin = async (admin, email, envPw, role) => {
  try { return await login(email, envPw ?? PW); } catch {}
  const fresh = `${role.replace('_', '')}${tag}@smoke.test`;
  const r = await req(admin.sock, 'roles:createStaff', { email: fresh, name: `Smoke ${role}`, role, hubId: await hubId(admin) });
  if (!r.ok) throw new Error(`could not sign in ${email} nor create a ${role}: ${r.error}`);
  console.log(`  (${email} not usable here: using a fresh ${role} ${fresh})`);
  return login(fresh, r.data.tempPassword);
};
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const warehouse = await staffLogin(admin, 'warehouse@somba.app', process.env.WAREHOUSE_PW, 'warehouse_staff');
  const rider = await staffLogin(admin, 'rider@somba.app', process.env.RIDER_PW, 'rider').catch(() => null);
  const saved = (await req(admin.sock, 'settings:get')).data ?? {};
  const setting = (key, value) => req(admin.sock, 'settings:set', { key, value });
  const restore = async () => {
    for (const k of ['productModeration', 'requireVerifiedForCheckout', 'codEnabled', 'minPayoutUsd', 'payoutClearanceHours']) {
      if (saved[k] !== undefined) await setting(k, String(saved[k])).catch(() => undefined);
    }
  };

  try {
    await setting('productModeration', 'false');
    await setting('requireVerifiedForCheckout', 'false');
    await setting('codEnabled', 'true');
    await setting('minPayoutUsd', '1');
    await setting('payoutClearanceHours', '0');

    // ---- actors -----------------------------------------------------------
    const promote = async (label, role) => {
      const u = await register(label);
      await req(admin.sock, 'roles:setRole', { id: u.user.id, role });
      u.sock.close();
      return login(u.email, NEW_PW);
    };
    const ops = await promote('ops', 'admin_operations');
    const mkt = await promote('mkt', 'admin_marketing');
    const makeSeller = async (label, pickup = '7 Rue du Marché, Limete') => {
      const u = await register(label, 'seller');
      const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
      await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
      await req(u.sock, 'sellers:update', { pickupAddress: pickup });
      return { ...u, store };
    };
    const shopA = await makeSeller('alpha');
    const shopB = await makeSeller('beta', '12 Avenue Kasa-Vubu, Kalamu');
    const cust = await register('buyer');
    const listing = async (shop, name, price, stock = 50) => (await req(shop.sock, 'products:create', { name: `${name} ${tag}`, price, category: 'Electronics', stock })).data;
    const prodA = await listing(shopA, 'Alpha kettle', 30);
    const prodB = await listing(shopB, 'Beta lamp', 20);
    ok(prodA?.status === 'live' && prodB?.status === 'live', 'setup: two sellers each have a live product', JSON.stringify([prodA?.status, prodB?.status]));

    const stockOf = async (id) => (await req(cust.sock, 'products:get', { id })).data.stock;
    const wallet = async () => (await req(cust.sock, 'wallet:get')).data.balance;
    const order = async (items, extra = {}) => req(cust.sock, 'orders:create', { items, paymentMethod: 'stripe_card', shippingAddress: ADDRESS, ...extra });
    const view = async (id) => (await req(cust.sock, 'orders:list')).data.find((o) => o.id === id);
    const taskOf = (id) => until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === id));
    const taskNow = async (id) => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === id);
    const step = (who, id, status) => req(who.sock, 'orders:updateStatus', { orderId: id, status });
    const walk = async (who, id, statuses) => { for (const s of statuses) { const r = await step(who, id, s); if (!r.ok) return r; } return { ok: true }; };
    const notesOf = async (u) => (await req(u.sock, 'notifications:list')).data ?? [];

    // =======================================================================
    section('1. Order status state machine');
    let a = await order([{ productId: prodA.id, qty: 1 }]);
    ok(a.ok && a.data.status === 'confirmed', 'a paid order starts confirmed', a.error ?? a.data?.status);
    const o1 = a.data;
    const t1 = await taskOf(o1.id);
    ok(!!t1 && t1.status === 'unassigned', 'it has an open delivery task');
    a = await step(warehouse, o1.id, 'processing');
    ok(!a.ok, 'warehouse staff can no longer move orders by hand', a.error ?? '');
    ok(!(await step(cust, o1.id, 'processing')).ok && !(await step(shopA, o1.id, 'processing')).ok, 'customers and sellers cannot either');
    ok(!(await step(mkt, o1.id, 'processing')).ok, 'a marketing admin cannot');
    a = await step(ops, o1.id, 'delivered');
    ok(!a.ok && a.error === 'Cannot move an order from confirmed to delivered.', 'confirmed → delivered (skipping steps) is refused', a.error);
    a = await step(ops, o1.id, 'confirmed');
    ok(!a.ok && a.error === 'Cannot move an order from confirmed to confirmed.', 'a no-op move is refused', a.error);
    a = await step(ops, o1.id, 'pending');
    ok(!a.ok && a.error === 'Cannot move an order from confirmed to pending.', 'rewinding is refused', a.error);
    a = await step(ops, o1.id, 'returned');
    ok(!a.ok && a.error === 'Cannot move an order from confirmed to returned.', 'returning an order that was never delivered is refused', a.error);
    a = await step(ops, o1.id, 'banana');
    ok(!a.ok && /Unknown order status/.test(a.error ?? ''), 'an unknown status is refused', a.error);
    a = await step(admin, o1.id, 'processing');
    ok(a.ok && a.data.status === 'processing', 'admin: confirmed → processing', a.error);
    a = await step(ops, o1.id, 'shipped');
    ok(a.ok && a.data.status === 'shipped', 'operations: processing → shipped', a.error);
    a = await step(ops, o1.id, 'out_for_delivery');
    ok(a.ok && a.data.status === 'out_for_delivery', 'operations: shipped → out_for_delivery', a.error);
    a = await step(ops, o1.id, 'delivered');
    ok(a.ok && a.data.status === 'delivered', 'operations: out_for_delivery → delivered', a.error);
    const t1b = await taskNow(o1.id);
    ok(t1b?.status === 'delivered' && !!t1b.deliveredAt, 'delivering by hand closes the open delivery task (deliveredAt set)', JSON.stringify(t1b && { s: t1b.status, d: t1b.deliveredAt }));
    a = await step(ops, o1.id, 'processing');
    ok(!a.ok && a.error === 'Cannot move an order from delivered to processing.', 'a delivered order cannot go back', a.error);
    a = await step(ops, o1.id, 'returned');
    ok(a.ok && a.data.status === 'returned', 'delivered → returned', a.error);
    a = await step(ops, o1.id, 'delivered');
    ok(!a.ok && a.error === 'Cannot move an order from returned to delivered.', 'a returned order is final', a.error);

    // cash on delivery: hand delivery collects the cash
    a = await order([{ productId: prodA.id, qty: 1 }], { paymentMethod: 'cod' });
    ok(a.ok && a.data.status === 'pending', 'a COD order starts pending', a.error ?? a.data?.status);
    const cod = a.data;
    const codPay = async () => (await req(admin.sock, 'payments:list')).data.find((p) => p.orderId === cod.id);
    ok((await codPay())?.status === 'pending', 'its COD payment is pending (not collected yet)');
    a = await walk(ops, cod.id, ['confirmed', 'processing', 'shipped', 'out_for_delivery']);
    ok(a.ok && (await codPay())?.status === 'pending', 'COD stays uncollected until delivery', a.error ?? '');
    a = await step(ops, cod.id, 'delivered');
    ok(a.ok && (await codPay())?.status === 'succeeded', 'delivering a COD order by hand collects the cash', a.error ?? (await codPay())?.status);
    ok((await taskNow(cod.id))?.status === 'delivered', '…and closes its delivery task');

    // =======================================================================
    section('2. Operator cancel with a reason');
    const REASON = 'Customer asked by phone';
    const sA0 = await stockOf(prodA.id);
    const sB0 = await stockOf(prodB.id);
    const w0 = await wallet();
    a = await order([{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 2 }]);
    const o2 = a.data;
    ok(a.ok && (await stockOf(prodA.id)) === sA0 - 1, 'setup: a two-seller order reserves stock', a.error ?? '');
    for (const [who, label] of [[cust, 'a customer'], [shopA, 'a seller'], [warehouse, 'warehouse staff'], [mkt, 'a marketing admin']]) {
      a = await req(who.sock, 'orders:adminCancel', { orderId: o2.id, reason: REASON });
      ok(!a.ok, `${label} cannot use orders:adminCancel`, a.error ?? '');
    }
    a = await req(ops.sock, 'orders:adminCancel', { orderId: o2.id, reason: 'ab' });
    ok(!a.ok && /reason/i.test(a.error ?? ''), 'a reason shorter than 3 characters is refused', a.error);
    a = await req(ops.sock, 'orders:adminCancel', { orderId: o2.id });
    ok(!a.ok, 'a missing reason is refused');
    a = await req(ops.sock, 'orders:adminCancel', { orderId: o2.id, reason: REASON });
    ok(a.ok && a.data.status === 'cancelled', 'operations cancel the order with a reason', a.error ?? a.data?.status);
    const o2v = await view(o2.id);
    ok(o2v.items.length === 2 && o2v.items.every((i) => i.cancelReason === REASON), 'the reason is stored on every line', JSON.stringify(o2v.items.map((i) => i.cancelReason)));
    ok(near(await wallet(), w0 + o2.totalUsd), 'the customer is refunded in full to the wallet', `${w0} → ${await wallet()} (total ${o2.totalUsd})`);
    ok((await stockOf(prodA.id)) === sA0 && (await stockOf(prodB.id)) === sB0, 'stock is put back');
    ok((await taskNow(o2.id))?.status === 'failed', 'the delivery task is voided');
    ok((await notesOf(cust)).some((n) => n.entityId === o2.id && n.title === 'Order cancelled' && n.body.includes(REASON)), 'the customer notification carries the reason');
    ok((await notesOf(shopA)).some((n) => n.entityId === o2.id && n.type === 'order' && /cancelled/i.test(n.title)) && (await notesOf(shopB)).some((n) => n.entityId === o2.id && n.type === 'order' && /cancelled/i.test(n.title)), 'both sellers are told to stop packing');
    a = await req(ops.sock, 'orders:adminCancel', { orderId: o2.id, reason: REASON });
    ok(!a.ok, 'cancelling twice is refused (no second refund)');

    if (rider) {
      // until the rider has collected the parcel
      a = await order([{ productId: prodA.id, qty: 1 }]);
      const o3 = a.data;
      const t3 = await taskOf(o3.id);
      a = await req(ops.sock, 'logistics:assign', { taskId: t3.id, riderId: rider.user.id });
      ok(a.ok && (await view(o3.id)).status === 'processing', 'setup: a rider was given the pickup (processing)', a.error ?? '');
      a = await req(ops.sock, 'orders:adminCancel', { orderId: o3.id, reason: 'Wrong address given' });
      ok(a.ok && a.data.status === 'cancelled', 'cancel works while the rider has NOT collected the parcel', a.error ?? '');
      ok((await taskNow(o3.id))?.status === 'failed', '…and the rider\'s task is voided');

      a = await order([{ productId: prodA.id, qty: 1 }]);
      const o4 = a.data;
      const t4 = await taskOf(o4.id);
      await req(ops.sock, 'logistics:assign', { taskId: t4.id, riderId: rider.user.id });
      a = await req(rider.sock, 'delivery:updateStatus', { taskId: t4.id, status: 'picked_up' });
      ok(a.ok, 'setup: the rider collected the parcel', a.error ?? '');
      a = await req(ops.sock, 'orders:adminCancel', { orderId: o4.id, reason: 'Too late now' });
      ok(!a.ok && /no longer be cancelled/.test(a.error ?? ''), 'cancel is refused once the rider has collected it', a.error);
      // a hand delivery also closes a task that a rider already holds
      a = await walk(ops, o4.id, ['shipped', 'out_for_delivery', 'delivered']);
      ok(a.ok && (await taskNow(o4.id))?.status === 'delivered', 'delivering by hand closes a rider-held task too', a.error ?? '');
    } else {
      ok(false, 'rider login (set RIDER_PW) — rider-collected checks skipped');
    }

    // =======================================================================
    section('3. Refund correctness');
    a = await order([{ productId: prodA.id, qty: 2 }]);
    const o5 = a.data;
    const sA1 = await stockOf(prodA.id);
    const wRef0 = await wallet();
    await taskOf(o5.id);
    a = await req(admin.sock, 'orders:refund', { orderId: o5.id, toWallet: false });
    ok(!a.ok && /^(Only mobile-money payments can be refunded to a phone|Refunds to the phone need pawaPay to be connected)\. Refund to the customer's wallet\.$/.test(a.error ?? ''), 'a refund to the phone is refused with the exact copy when it is not possible', a.error);
    ok(near(await wallet(), wRef0) && (await view(o5.id)).status === 'confirmed', '…and nothing moved');
    ok(!(await req(ops.sock, 'orders:refund', { orderId: o5.id })).ok && !(await req(mkt.sock, 'orders:refund', { orderId: o5.id })).ok, 'only admin/finance may refund');
    a = await req(admin.sock, 'orders:refund', { orderId: o5.id });
    ok(a.ok && a.data.status === 'refunded', 'refunding an undelivered order works', a.error ?? '');
    ok(near(await wallet(), wRef0 + o5.totalUsd), 'the wallet gets back exactly what was paid', `${wRef0} → ${await wallet()} (total ${o5.totalUsd})`);
    ok((await view(o5.id)).status === 'cancelled', 'an undelivered refunded order becomes cancelled (not returned)', (await view(o5.id)).status);
    ok((await stockOf(prodA.id)) === sA1 + 2, 'its stock goes back on the shelf');
    const t5 = await taskNow(o5.id);
    ok(t5?.status === 'failed' && t5.failureReason === 'Refunded', 'its open delivery task is voided (failed / Refunded)', JSON.stringify(t5 && { s: t5.status, r: t5.failureReason }));
    ok(!(await req(admin.sock, 'orders:refund', { orderId: o5.id })).ok && near(await wallet(), wRef0 + o5.totalUsd), 'a second refund is refused and pays nothing');

    // a delivered order → returned, stock untouched
    a = await order([{ productId: prodA.id, qty: 1 }]);
    const o6 = a.data;
    await walk(ops, o6.id, ['processing', 'shipped', 'out_for_delivery', 'delivered']);
    const sA2 = await stockOf(prodA.id);
    const wRef2 = await wallet();
    a = await req(admin.sock, 'orders:refund', { orderId: o6.id });
    ok(a.ok && (await view(o6.id)).status === 'returned', 'refunding a DELIVERED order marks it returned', a.error ?? (await view(o6.id)).status);
    ok(near(await wallet(), wRef2 + o6.totalUsd) && (await stockOf(prodA.id)) === sA2, 'the customer is refunded; stock is not touched (goods are with the customer)');

    // never more than outstanding: B's line was already refunded by its seller
    const sA3 = await stockOf(prodA.id);
    const sB3 = await stockOf(prodB.id);
    const wRef3 = await wallet();
    a = await order([{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 1 }]);
    const o7 = a.data;
    await req(shopB.sock, 'orders:sellerCancel', { orderId: o7.id, reason: 'Out of stock' });
    const wRef3b = await wallet();
    ok(near(wRef3b, wRef3 + 20), 'setup: seller B cancelled their line and the customer got 20 back', `${wRef3} → ${wRef3b}`);
    a = await req(admin.sock, 'orders:refund', { orderId: o7.id });
    ok(a.ok && near(await wallet(), wRef3 + o7.totalUsd), 'the operator refund only pays the rest (never the 20 twice)', `${wRef3b} → ${await wallet()} (total ${o7.totalUsd})`);
    ok((await stockOf(prodA.id)) === sA3 && (await stockOf(prodB.id)) === sB3, 'each line is restocked exactly once (B was restocked by its seller)', JSON.stringify([sA3, await stockOf(prodA.id), sB3, await stockOf(prodB.id)]));

    // =======================================================================
    section('4. Promo cents, promo lifecycle, flash-sale lifecycle');
    const prodP = await listing(shopA, 'Promo plate', 33.33);
    const code = `P0${tag}`;
    a = await req(mkt.sock, 'promos:create', { code, type: 'percent', value: 10, minOrder: 0 });
    ok(a.ok, 'a marketing admin creates a 10% code', a.error ?? '');
    const promo = a.data;
    a = await req(cust.sock, 'promos:validate', { code, subtotalUsd: 33.33 });
    ok(a.ok && a.data.ok && a.data.discount === 3.33, '10% of $33.33 is $3.33 (to the cent, not a whole dollar)', JSON.stringify(a.data ?? a.error));
    a = await order([{ productId: prodP.id, qty: 1 }], { promoCode: code });
    ok(a.ok && a.data.discountUsd === 3.33, 'the order charges that exact discount', a.error ?? String(a.data?.discountUsd));
    await req(cust.sock, 'orders:cancel', { orderId: a.data?.id });

    ok(!(await req(cust.sock, 'promos:setActive', { id: promo.id, active: false })).ok, 'a customer cannot switch a promo');
    a = await req(ops.sock, 'promos:setActive', { id: promo.id, active: false });
    ok(!a.ok, 'operations (no content permission) cannot either', a.error ?? '');
    ok(!(await req(mkt.sock, 'promos:setActive', { id: promo.id, active: 'no' })).ok, 'active must be a boolean');
    ok(!(await req(mkt.sock, 'promos:setActive', { id: 'nope', active: false })).ok, 'an unknown promo is refused');
    a = await req(mkt.sock, 'promos:setActive', { id: promo.id, active: false });
    ok(a.ok && a.data.active === false, 'marketing switches the code OFF', a.error ?? '');
    a = await req(cust.sock, 'promos:validate', { code, subtotalUsd: 33.33 });
    ok(a.ok && a.data.ok === false, 'a switched-off code no longer validates', JSON.stringify(a.data));
    a = await req(mkt.sock, 'promos:setActive', { id: promo.id, active: true });
    ok(a.ok && a.data.active === true && (await req(cust.sock, 'promos:validate', { code, subtotalUsd: 33.33 })).data.ok === true, 'and back ON');

    // flash sales
    const prodF = await listing(shopA, 'Flash radio', 40);
    const iso = (offsetMin) => new Date(Date.now() + offsetMin * 60_000).toISOString();
    const flash = (extra) => req(mkt.sock, 'flashsales:create', { title: `Flash ${tag}`, productId: prodF.id, productName: prodF.name, flashPrice: 25, discount: 37, ...extra });
    a = await flash({ flashPrice: 40, startsAt: iso(-10), endsAt: iso(60) });
    ok(!a.ok && /below the normal price/.test(a.error ?? ''), 'a flash price equal to the normal price is refused', a.error);
    a = await flash({ flashPrice: 55, startsAt: iso(-10), endsAt: iso(60) });
    ok(!a.ok && /below the normal price/.test(a.error ?? ''), 'a flash price above the normal price is refused', a.error);
    a = await flash({ productId: 'no-such-product', startsAt: iso(-10), endsAt: iso(60) });
    ok(!a.ok && /does not exist/.test(a.error ?? ''), 'a flash sale on a missing product is refused', a.error);
    ok(!(await req(cust.sock, 'flashsales:create', { title: 'x', productId: prodF.id, productName: 'x', flashPrice: 1 })).ok, 'customers cannot create flash sales');
    const sched = (await flash({ startsAt: iso(60), endsAt: iso(120) })).data;
    const running = (await flash({ startsAt: iso(-10), endsAt: iso(60) })).data;
    const ended = (await flash({ startsAt: iso(-180), endsAt: iso(-120) })).data;
    const off = (await flash({ startsAt: iso(-300), endsAt: iso(-240), active: false })).data;
    ok(sched && running && ended && off, 'setup: scheduled, running, ended and inactive flash sales exist');
    ok((await req(cust.sock, 'products:get', { id: prodF.id })).data.price === 25, 'the running flash price applies in the shop');

    const ids = [sched.id, running.id, ended.id, off.id];
    const mine = (list) => list.filter((f) => ids.includes(f.id)).map((f) => f.id);
    const plain = (await req(cust.sock, 'flashsales:list')).data;
    ok(!mine(plain).includes(off.id), 'default list (shoppers): the inactive sale is not returned');
    const custAll = (await req(cust.sock, 'flashsales:list', { all: true })).data;
    ok(!mine(custAll).includes(off.id), '{ all: true } from a customer is ignored (unchanged list)');
    const guest = await connect(null);
    ok(Array.isArray((await req(guest, 'flashsales:list')).data), 'guests still get the list');
    guest.close();
    const all = (await req(mkt.sock, 'flashsales:list', { all: true })).data;
    ok(mine(all).length === 4, '{ all: true } for marketing returns scheduled, running, ended and inactive sales', JSON.stringify(mine(all)));
    ok(JSON.stringify(mine(all)) === JSON.stringify(ids), 'newest first (scheduled → running → ended → oldest)', JSON.stringify(mine(all)));
    ok(!mine((await req(ops.sock, 'flashsales:list', { all: true })).data).includes(off.id), '{ all: true } needs the content permission (operations get the plain list)');

    ok(!(await req(cust.sock, 'flashsales:end', { id: running.id })).ok && !(await req(ops.sock, 'flashsales:end', { id: running.id })).ok, 'only the content permission can end a sale');
    ok(!(await req(mkt.sock, 'flashsales:end', { id: 'nope' })).ok, 'ending an unknown sale is refused');
    await sleep(30);
    a = await req(mkt.sock, 'flashsales:end', { id: running.id });
    ok(a.ok && Date.parse(a.data.endsAt) <= Date.now(), 'ending a flash sale sets its end time to now', a.error ?? a.data?.endsAt);
    await sleep(30);
    ok((await req(cust.sock, 'products:get', { id: prodF.id })).data.price === 40, '…and the shop price falls back to normal at once');

    // =======================================================================
    section('5. Seller re-moderation of live listings');
    await setting('productModeration', 'true');
    const prodM = (await req(shopA.sock, 'products:create', { name: `Moderated desk ${tag}`, price: 100, category: 'Electronics', stock: 5, description: 'First text' })).data;
    ok(prodM?.status === 'pending', 'setup: with moderation on, a new seller listing waits for approval', prodM?.status);
    const approve = async () => (await req(admin.sock, 'products:update', { id: prodM.id, patch: { status: 'live' } })).data;
    ok((await approve())?.status === 'live', 'setup: a moderator approves it');
    const edit = (patch) => req(shopA.sock, 'products:update', { id: prodM.id, patch });
    a = await edit({ stock: 9 });
    ok(a.ok && a.data.status === 'live', 'a stock change keeps it live', a.error ?? a.data?.status);
    a = await edit({ price: 125 });
    ok(a.ok && a.data.status === 'live', 'a +25% price change keeps it live', a.error ?? a.data?.status);
    a = await edit({ name: prodM.name });
    ok(a.ok && a.data.status === 'live', 're-saving the same name keeps it live', a.error ?? a.data?.status);
    a = await edit({ description: 'A better description' });
    ok(a.ok && a.data.status === 'pending', 'a new description sends it back to pending', a.error ?? a.data?.status);
    ok((await notesOf(shopA)).some((n) => n.type === 'moderation' && n.body === `Your changes to ${prodM.name} are being reviewed`), 'the seller is told: "Your changes to X are being reviewed"');
    await approve();
    a = await edit({ price: 200 });
    ok(a.ok && a.data.status === 'pending', 'a price jump of more than 30% sends it back to pending', a.error ?? a.data?.status);
    await approve();
    a = await edit({ image: 'https://example.com/new.png' });
    ok(a.ok && a.data.status === 'pending', 'a new image sends it back to pending', a.error ?? a.data?.status);
    await approve();
    a = await edit({ category: 'Fashion' });
    ok(a.ok && a.data.status === 'pending', 'a new category sends it back to pending', a.error ?? a.data?.status);
    await approve();
    a = await edit({ name: `Renamed desk ${tag}` });
    ok(a.ok && a.data.status === 'pending', 'a new name sends it back to pending', a.error ?? a.data?.status);
    await approve();
    a = await req(admin.sock, 'products:update', { id: prodM.id, patch: { name: `Admin renamed ${tag}`, price: 500 } });
    ok(a.ok && a.data.status === 'live', 'admin edits are unaffected (still live)', a.error ?? a.data?.status);
    await setting('productModeration', 'false');
    a = await edit({ description: 'Edited with moderation off' });
    ok(a.ok && a.data.status === 'live', 'with moderation off a seller edit stays live', a.error ?? a.data?.status);

    // =======================================================================
    section('6. Seller notifications');
    const prodA2 = await listing(shopA, 'Alpha mixer', 30);
    const prodB2 = await listing(shopB, 'Beta fan', 20);
    a = await order([{ productId: prodA2.id, qty: 2 }, { productId: prodB2.id, qty: 1 }]);
    const o8 = a.data;
    const newOrderNote = async (shop, o) => (await notesOf(shop)).find((n) => n.entityId === o.id && n.title === 'New order');
    const nA = await until(() => newOrderNote(shopA, o8));
    const nB = await until(() => newOrderNote(shopB, o8));
    ok(nA && nA.type === 'order' && nA.body === `${o8.reference}: 2 item(s) to pack — $60.00`, 'seller A gets a persisted "New order" with their count and subtotal', nA?.body);
    ok(nB && nB.type === 'order' && nB.body === `${o8.reference}: 1 item(s) to pack — $20.00`, 'seller B gets their own count and subtotal', nB?.body);
    a = await req(cust.sock, 'orders:cancel', { orderId: o8.id });
    ok(a.ok, 'the customer cancels it', a.error ?? '');
    const cA = await until(async () => (await notesOf(shopA)).find((n) => n.entityId === o8.id && n.type === 'order' && /cancelled/i.test(n.title)));
    const cB = await until(async () => (await notesOf(shopB)).find((n) => n.entityId === o8.id && n.type === 'order' && /cancelled/i.test(n.title)));
    ok(!!cA && !!cB, 'both affected sellers are notified of the customer cancellation', JSON.stringify([cA?.title, cB?.title]));
    a = await order([{ productId: prodA2.id, qty: 1 }], { paymentMethod: 'cod' });
    const o9 = a.data;
    ok(a.ok && !!(await until(() => newOrderNote(shopA, o9))), 'a cash-on-delivery order notifies the seller too', a.error ?? '');
    ok(!(await newOrderNote(shopB, o9)), 'a seller with no item on the order is not notified');
    await req(cust.sock, 'orders:cancel', { orderId: o9.id });

    // =======================================================================
    section('7. Seller balance can go negative after a return');
    const shopC = await makeSeller('gamma');
    const prodC = await listing(shopC, 'Gamma sofa', 100, 10);
    const av0 = (await req(shopC.sock, 'payouts:available')).data;
    ok(av0.available === 0 && av0.owedUsd === 0, 'a new seller has nothing available and owes nothing', JSON.stringify(av0));
    a = await order([{ productId: prodC.id, qty: 1 }]);
    const o10 = a.data;
    await walk(ops, o10.id, ['processing', 'shipped', 'out_for_delivery', 'delivered']);
    const av1 = await until(async () => { const v = (await req(shopC.sock, 'payouts:available')).data; return v.available > 0 ? v : null; });
    ok(av1 && near(av1.earned, 100 * (1 - av1.commissionPct / 100)) && av1.owedUsd === 0, 'after delivery the seller has earnings available', JSON.stringify(av1));
    a = await req(shopC.sock, 'payouts:request', { amountUsd: av1.available, method: 'wallet' });
    ok(a.ok, 'the seller withdraws everything', a.error ?? '');
    const av2 = (await req(shopC.sock, 'payouts:available')).data;
    ok(av2.available === 0 && av2.owedUsd === 0, 'available is now exactly 0', JSON.stringify(av2));
    a = await req(shopC.sock, 'payouts:request', { amountUsd: 5, method: 'wallet' });
    ok(!a.ok && /withdraw up to \$0\.00/.test(a.error ?? ''), 'at 0 no further request is accepted', a.error);
    a = await req(admin.sock, 'orders:refund', { orderId: o10.id });
    ok(a.ok && (await view(o10.id)).status === 'returned', 'the delivered order is refunded and returned after the payout', a.error ?? '');
    const av3 = (await req(shopC.sock, 'payouts:available')).data;
    ok(av3.available < 0 && near(av3.owedUsd, -av3.available) && near(av3.owedUsd, av1.available), 'available goes NEGATIVE and owedUsd reports the debt', JSON.stringify(av3));
    a = await req(shopC.sock, 'payouts:request', { amountUsd: 5, method: 'wallet' });
    ok(!a.ok && /nothing can be withdrawn/.test(a.error ?? ''), 'a request is refused while the seller is in the red', a.error);
    // the money model never counts cancelled lines
    const prodC2 = await listing(shopC, 'Gamma rug', 50, 10);
    a = await order([{ productId: prodC2.id, qty: 1 }, { productId: prodC.id, qty: 1 }]);
    const o11 = a.data;
    await req(shopC.sock, 'orders:sellerCancel', { orderId: o11.id, reason: 'Out of stock', itemIds: [o11.items.find((i) => i.productId === prodC2.id).id] });
    await walk(ops, o11.id, ['processing', 'shipped', 'out_for_delivery', 'delivered']);
    const av4 = await until(async () => { const v = (await req(shopC.sock, 'payouts:available')).data; return v.available > av3.available + 1 ? v : null; });
    ok(av4 && near(av4.available - av3.available, 100 * (1 - av4.commissionPct / 100)), 'only the non-cancelled line earns (100, not 150)', JSON.stringify([av3.available, av4?.available]));

    // =======================================================================
    section('8. A seller cannot buy their own listing');
    a = await req(shopA.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
    ok(!a.ok && a.error === 'You cannot buy your own listing.', 'seller A is refused their own product', a.error ?? 'order was created');
    a = await req(shopA.sock, 'orders:create', { items: [{ productId: prodB.id, qty: 1 }, { productId: prodA.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
    ok(!a.ok && a.error === 'You cannot buy your own listing.', 'a mixed cart containing their own listing is refused whole', a.error ?? 'order was created');
    a = await req(shopA.sock, 'orders:create', { items: [{ productId: prodB.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
    ok(a.ok, 'but they can buy another seller\'s product', a.error ?? '');
    if (a.ok) await req(shopA.sock, 'orders:cancel', { orderId: a.data.id });

    // =======================================================================
    section('Audit trail');
    const audit = (await req(admin.sock, 'audit:list')).data ?? [];
    const has = (action, detail) => audit.some((l) => l.action === action && (!detail || (l.detail ?? '').includes(detail)));
    ok(has('order.cancelled', REASON), 'order.cancelled is audited with the reason');
    ok(has('orders:refund'), 'orders:refund is audited');
    ok(has('order.status'), 'manual status changes are audited');
    ok(has('promo.deactivate', code), 'promo deactivation is audited');
    ok(has('promo.activate', code), 'promo activation is audited');
    ok(has('flashsale.end'), 'flashsale.end is audited');
  } finally {
    await restore();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
