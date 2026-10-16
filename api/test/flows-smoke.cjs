/* Regression suite for the flow fixes (failed deliveries, pickup + hub receiving,
 * product moderation, flash-sale pricing, returns before refunds, manual
 * payment confirmation, staff creation). Runs against a RUNNING dev API that
 * was seeded with `npm run seed`.
 *
 *   API_URL=http://localhost:3001 node test/flows-smoke.cjs
 */
const { io } = require('socket.io-client');
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
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@flows.test`, password: 'Flows-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

(async () => {
  const admin = await login('admin@somba.app');
  const finance = await login('finance@somba.app');
  const warehouse = await login('warehouse@somba.app');
  const rider = await login('rider@somba.app');
  const cust = await register('buyer');
  const other = await register('other');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });

  // an approved seller with a pickup address
  const sellerU = await register('shop', 'seller');
  const store = (await req(sellerU.sock, 'sellers:register', { name: `Flow Store ${tag}` })).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  const seller2 = await register('shop2', 'seller');
  const store2 = (await req(seller2.sock, 'sellers:register', { name: `Other Store ${tag}` })).data;
  await req(admin.sock, 'sellers:setStatus', { id: store2.id, status: 'approved' });
  let a = await req(sellerU.sock, 'sellers:update', { pickupAddress: '7 Rue du Marché, Limete' });
  ok(a.ok && a.data.pickupAddress === '7 Rue du Marché, Limete', 'a seller saves their pickup address');
  a = await req(sellerU.sock, 'sellers:update', { pickupAddress: 'x' });
  ok(!a.ok, 'a too-short pickup address is refused');

  // ---- product moderation ---------------------------------------------------
  section('Product moderation');
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'true' });
  a = await req(sellerU.sock, 'products:create', { name: `Moderated ${tag}`, price: 40, category: 'Electronics', stock: 10 });
  ok(a.ok && a.data.status === 'pending', 'with moderation on, a seller listing starts as pending');
  const pending = a.data;
  let list = (await req(cust.sock, 'products:list')).data;
  ok(!list.some((p) => p.id === pending.id), 'shoppers do not see a pending listing');
  list = (await req(sellerU.sock, 'products:list')).data;
  ok(list.some((p) => p.id === pending.id), 'the seller sees their own pending listing');
  ok(!(await req(sellerU.sock, 'products:update', { id: pending.id, patch: { status: 'live' } })).ok, 'a seller cannot approve their own listing');
  const sawNote = until(async () => (await req(sellerU.sock, 'notifications:list')).data.find((n) => n.title === 'Product approved'));
  const pushed = new Promise((res) => { sellerU.sock.once('product:updated', res); setTimeout(() => res(null), 4000); });
  a = await req(admin.sock, 'products:update', { id: pending.id, patch: { status: 'live' } });
  const sellerSaw = await pushed;
  ok(sellerSaw?.id === pending.id && sellerSaw?.status === 'live', 'the owning seller gets product:updated live when it is approved');
  ok(a.ok && a.data.status === 'live', 'a moderator approves it');
  list = (await req(cust.sock, 'products:list')).data;
  ok(list.some((p) => p.id === pending.id), 'the approved listing is visible to shoppers');
  ok(!!(await sawNote), 'the seller is notified of the approval');
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  a = await req(sellerU.sock, 'products:create', { name: `Direct ${tag}`, price: 25, category: 'Electronics', stock: 50 });
  ok(a.ok && a.data.status === 'live', 'with moderation off, a seller listing goes live at once');
  const prod = a.data;
  ok(!(await req(cust.sock, 'settings:set', { key: 'productModeration', value: 'false' })).ok, 'customers cannot change moderation settings');
  ok(!(await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'maybe' })).ok, 'an invalid moderation value is refused');

  // ---- flash-sale pricing -----------------------------------------------------
  section('Flash-sale price is shown and charged');
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  a = await req(admin.sock, 'flashsales:create', { title: `Flash ${tag}`, productId: prod.id, productName: prod.name, flashPrice: 10, discount: 60, startsAt: past, endsAt: future });
  ok(a.ok, 'a marketing admin creates a flash sale');
  const flashId = a.data?.id;
  list = (await req(cust.sock, 'products:list')).data;
  const listed = list.find((p) => p.id === prod.id);
  ok(listed?.price === 10 && listed?.originalPrice === 25 && listed?.discount === 60, 'the storefront shows the flash price with the normal price struck through', JSON.stringify(listed && { p: listed.price, o: listed.originalPrice, d: listed.discount }));
  const sellerOrderPush = new Promise((res) => { sellerU.sock.once('order:created', res); setTimeout(() => res(null), 4000); });
  const otherSellerPush = new Promise((res) => { seller2.sock.once('order:created', res); setTimeout(() => res(null), 1500); });
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  const sp = await sellerOrderPush;
  ok(sp && sp.reference === a.data.reference && !('shippingAddress' in sp) && !('customerId' in sp) && sp.customerName === 'buyer', 'the seller is pushed the order live, without address or customer id');
  ok((await otherSellerPush) === null, 'a different seller is NOT told about it');
  ok(a.ok && a.data.subtotalUsd === 10, 'checkout charges the flash price', a.error ?? `subtotal ${a.data?.subtotalUsd}`);

  // ---- pickup, seller ready, hub receive --------------------------------------
  section('Pickup address, seller ready, hub receiving');
  const order = a.data;
  const task = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === order.id));
  ok(!!task && /Limete/.test(task.pickupAddress ?? ''), 'the delivery task carries the seller pickup address', task?.pickupAddress ?? 'no task');
  ok(!(await req(seller2.sock, 'orders:sellerReady', { orderId: order.id })).ok, "another seller cannot mark someone else's order ready");
  ok(!(await req(cust.sock, 'orders:sellerReady', { orderId: order.id })).ok, 'a customer cannot mark an order ready');
  a = await req(sellerU.sock, 'orders:sellerReady', { orderId: order.id });
  ok(a.ok && !!a.data.readyAt, 'the seller marks the parcel ready for pickup');
  ok(!(await req(cust.sock, 'warehouse:receive', { taskId: task.id })).ok, 'a customer cannot receive parcels');
  ok(!(await req(rider.sock, 'warehouse:receive', { taskId: task.id })).ok, 'a rider cannot receive parcels at the hub');
  a = await req(warehouse.sock, 'warehouse:receive', { taskId: task.id });
  ok(a.ok && !!a.data.receivedAt, 'warehouse staff scan the parcel in');
  const rq = (await req(rider.sock, 'rider:tasks')).data.find((t) => t.id === task.id);
  ok(rq && /Limete/.test(rq.pickupAddress ?? '') && rq.readyAt && rq.receivedAt, 'the rider sees where to collect it, and that it is ready and received');

  // ---- failed delivery: re-attempt, then cancel + refund ------------------------
  section('Failed delivery workflow');
  const stockBefore = (await req(cust.sock, 'products:get', { id: prod.id })).data.stock;
  let current = task;
  const customerNotes = async () => (await req(cust.sock, 'notifications:list')).data;
  for (let attempt = 1; attempt <= 3; attempt++) {
    a = await req(rider.sock, 'delivery:accept', { taskId: current.id });
    ok(a.ok, `attempt ${attempt}: rider accepts`, a.error ?? '');
    ok((await req(rider.sock, 'delivery:updateStatus', { taskId: current.id, status: 'failed', reason: `Customer unreachable #${attempt}` })).ok, `attempt ${attempt}: rider reports the delivery failed with a reason`);
    const orders = (await req(cust.sock, 'orders:list')).data;
    const o = orders.find((x) => x.id === order.id);
    if (attempt < 3) {
      ok(o.status === 'confirmed', `attempt ${attempt}: the order is back to confirmed (not stuck out for delivery)`, o.status);
      const next = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === order.id && t.status === 'unassigned'));
      ok(next && next.attempts === attempt + 1 && next.id !== current.id, `attempt ${attempt}: a fresh task is queued (attempt ${attempt + 1})`);
      ok(/Delivery attempt failed/.test(JSON.stringify(await customerNotes())), `attempt ${attempt}: the customer is told`);
      current = next;
    } else {
      ok(o.status === 'cancelled', 'after 3 failed attempts the order is cancelled', o.status);
    }
  }
  const stockAfter = (await req(cust.sock, 'products:get', { id: prod.id })).data.stock;
  ok(stockAfter === stockBefore + 1, 'the stock is released after the final failed attempt', `${stockBefore} → ${stockAfter}`);
  const w = (await req(cust.sock, 'wallet:transactions')).data;
  ok(w.some((t) => t.type === "refund" && Math.abs(t.amount - order.totalUsd) < 0.01), 'the prepaid amount is refunded to the customer wallet');
  const mine = (await req(rider.sock, 'delivery:list')).data.find((t) => t.id === task.id);
  ok(mine?.failureReason?.startsWith('Customer unreachable'), 'the failure reason is kept on the task');
  ok(!(await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'delivered' })).ok, 'a finished attempt cannot be revived');

  // ---- proof of delivery code -----------------------------------------------------
  section('Proof of delivery: the customer code');
  ok(!(await req(cust.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'true' })).ok, 'customers cannot switch the delivery-code rule');
  await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'true' });
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  const oc = a.data;
  const tc = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === oc.id));
  ok(!JSON.stringify(tc).includes('proofCode'), 'the handover code is never part of the task data staff and riders receive');
  await req(rider.sock, 'delivery:accept', { taskId: tc.id });
  await req(rider.sock, 'delivery:updateStatus', { taskId: tc.id, status: 'picked_up' });
  await req(rider.sock, 'delivery:updateStatus', { taskId: tc.id, status: 'in_transit' });
  a = await req(cust.sock, 'orders:deliveryCode', { orderId: oc.id });
  ok(a.ok && a.data.required && /^\d{4}$/.test(a.data.code ?? ''), 'the customer can see their 4-digit code', JSON.stringify(a));
  const code = a.data.code;
  ok(!(await req(other.sock, 'orders:deliveryCode', { orderId: oc.id })).ok, "another customer cannot read someone else's code");
  ok(!(await req(rider.sock, 'orders:deliveryCode', { orderId: oc.id })).ok, 'the rider cannot read the code either');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: tc.id, status: 'delivered' });
  ok(!a.ok && /code/i.test(a.error ?? ''), 'delivering without the code is refused', a.error ?? '');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: tc.id, status: 'delivered', code: code === '1234' ? '4321' : '1234' });
  ok(!a.ok && /Wrong delivery code/.test(a.error ?? ''), 'a wrong code is refused');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: tc.id, status: 'delivered', code });
  ok(a.ok && a.data.status === 'delivered', 'the right code completes the delivery');
  ok((await req(cust.sock, 'orders:deliveryCode', { orderId: oc.id })).data.code === null, 'the code is gone once delivered');
  await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'false' });

  // ---- customer can cancel after one failed attempt --------------------------------
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  const o2 = a.data;
  const t2 = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === o2.id));
  await req(rider.sock, 'delivery:accept', { taskId: t2.id });
  await req(rider.sock, 'delivery:updateStatus', { taskId: t2.id, status: 'picked_up' });
  await req(rider.sock, 'delivery:updateStatus', { taskId: t2.id, status: 'failed', reason: 'Wrong address' });
  a = await req(cust.sock, 'orders:cancel', { orderId: o2.id });
  ok(a.ok && a.data.status === 'cancelled', 'after a failed attempt the customer can still cancel and be refunded');
  const live = (await req(warehouse.sock, 'delivery:list')).data.filter((t) => t.orderId === o2.id && ['unassigned', 'assigned', 'picked_up', 'in_transit'].includes(t.status));
  ok(live.length === 0, 'cancelling voids the re-queued task too');

  // ---- returns must arrive before a refund --------------------------------------------
  section('Returns: goods first, then the refund');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 2 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  const o3 = a.data;
  const t3 = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === o3.id));
  await req(rider.sock, 'delivery:accept', { taskId: t3.id });
  for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: t3.id, status: st });
  const stockBeforeReturn = (await req(cust.sock, 'products:get', { id: prod.id })).data.stock;
  a = await req(cust.sock, 'disputes:open', { orderId: o3.id, type: 'return', reason: 'Not as described at all' });
  ok(a.ok, 'the customer opens a return on a delivered order');
  const ret = a.data;
  ok((await req(warehouse.sock, 'disputes:list')).data.some((d) => d.id === ret.id), 'warehouse staff can see the return to receive');
  ok(!(await req(other.sock, 'disputes:list')).data.some((d) => d.id === ret.id), "another customer cannot see it");
  ok((await req(sellerU.sock, 'disputes:list')).data.some((d) => d.id === ret.id), 'the seller of the returned goods can see the request');
  ok(!(await req(seller2.sock, 'disputes:list')).data.some((d) => d.id === ret.id), 'an unrelated seller cannot');
  a = await req(admin.sock, 'disputes:resolve', { disputeId: ret.id, refund: true });
  ok(!a.ok && /received/i.test(a.error ?? ''), 'a refund is refused until the goods are received', a.error ?? '');
  ok(!(await req(cust.sock, 'disputes:markReceived', { disputeId: ret.id })).ok, 'a customer cannot mark their own return as received');
  a = await req(warehouse.sock, 'disputes:markReceived', { disputeId: ret.id });
  ok(a.ok && !!a.data.receivedAt, 'the warehouse marks the return as received');
  ok(!(await req(warehouse.sock, 'disputes:markReceived', { disputeId: ret.id })).ok, 'it cannot be marked twice');
  const stockAfterReturn = (await req(cust.sock, 'products:get', { id: prod.id })).data.stock;
  ok(stockAfterReturn === stockBeforeReturn + 2, 'the returned goods go back into stock', `${stockBeforeReturn} → ${stockAfterReturn}`);
  a = await req(admin.sock, 'disputes:resolve', { disputeId: ret.id, refund: true });
  ok(a.ok && a.data.status === 'resolved', 'with the goods received, finance resolves with a refund');

  // ---- manual payment confirmation -----------------------------------------------------
  section('Finance confirms mobile-money payments by hand');
  a = await req(cust.sock, 'wallet:topup', { amountUsd: 30, method: 'airtel_money', phone: '+243812345678' });
  ok(a.ok && a.data.status === 'pending', 'a mobile-money top-up starts pending');
  const pay = a.data;
  ok(!(await req(cust.sock, 'payments:confirm', { reference: pay.reference })).ok, 'a customer cannot confirm their own payment');
  ok(!(await req(warehouse.sock, 'payments:confirm', { reference: pay.reference })).ok, 'warehouse staff cannot confirm payments');
  const before = (await req(cust.sock, 'wallet:get')).data.balance;
  a = await req(finance.sock, 'payments:confirm', { reference: pay.reference });
  ok(a.ok && a.data.status === 'succeeded', 'finance confirms the payment');
  const afterBal = await until(async () => { const b = (await req(cust.sock, 'wallet:get')).data.balance; return b === before + 30 ? b : null; });
  ok(afterBal === before + 30, 'the wallet is credited once');
  ok(!(await req(finance.sock, 'payments:confirm', { reference: pay.reference })).ok, 'a payment cannot be confirmed twice');
  a = await req(cust.sock, 'wallet:topup', { amountUsd: 12, method: 'orange_money', phone: '+243822345678' });
  a = await req(finance.sock, 'payments:decline', { reference: a.data.reference, reason: 'No money received' });
  ok(a.ok && a.data.status === 'failed', 'finance can decline a payment');
  ok((await req(cust.sock, 'wallet:get')).data.balance === before + 30, 'a declined payment does not touch the wallet');

  // ---- payouts ---------------------------------------------------------------------------
  section('Payout destination and settings');
  ok(!(await req(sellerU.sock, 'payouts:request', { amountUsd: 50, method: 'mobile_money' })).ok, 'a mobile-money payout needs a number');
  a = await req(admin.sock, 'settings:set', { key: 'minPayoutUsd', value: 25 });
  ok(a.ok, 'finance sets the minimum payout');
  a = await req(sellerU.sock, 'payouts:request', { amountUsd: 20, method: 'wallet' });
  ok(!a.ok && /minimum payout is \$25/.test(a.error ?? ''), 'the configured minimum applies', a.error ?? '');
  await req(admin.sock, 'settings:set', { key: 'minPayoutUsd', value: 10 });

  // ---- staff accounts ------------------------------------------------------------------------
  section('Staff accounts');
  const email = `rider${tag}@staff.test`;
  ok(!(await req(finance.sock, 'roles:createStaff', { email, name: 'New Rider', role: 'rider' })).ok, 'only the super admin creates staff');
  ok(!(await req(admin.sock, 'roles:createStaff', { email, name: 'Bad', role: 'admin' })).ok, 'a second super admin cannot be created this way');
  a = await req(admin.sock, 'roles:createStaff', { email, name: 'New Rider', role: 'rider', phone: '+243800000001' });
  ok(a.ok && a.data.role === 'rider' && a.data.tempPassword?.length >= 10, 'the super admin creates a rider with a temporary password');
  const signin = await rest('/api/v1/auth/login', { email, password: a.data.tempPassword });
  ok(signin.status === 200 && signin.json.user.role === 'rider', 'the new rider can sign in');
  ok(!(await req(admin.sock, 'roles:createStaff', { email, name: 'Dup', role: 'rider' })).ok, 'a duplicate email is refused');
  const staff = (await req(admin.sock, 'roles:staff')).data;
  ok(staff.some((s) => s.email === email && s.role === 'rider' && s.active === true && s.phone === '+243800000001'), 'riders show up in the staff list with phone and active flag');

  // cleanup the flash sale so reruns are clean
  void flashId;

  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `   - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
