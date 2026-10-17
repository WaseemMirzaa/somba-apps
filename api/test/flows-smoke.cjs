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
  const guest = { sock: await connect() };
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

  // ---- seller campaigns change the price ---------------------------------------------
  section('Seller campaigns really change the price');
  const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const mk = async (name, price) => (await req(sellerU.sock, 'products:create', { name: `${name} ${tag}`, price, category: 'Electronics', stock: 80 })).data;
  const cp = await mk('Camp A', 200);
  const cq = await mk('Camp B', 100);
  const cr = await mk('Camp C', 200);
  const order1 = async (c, productId, qty = 1, extra = {}) => req(c.sock, 'orders:create', { items: [{ productId, qty }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }), ...extra });
  const priceOf = async (id) => (await req(cust.sock, 'products:get', { id })).data;
  a = await req(sellerU.sock, 'campaigns:create', { name: `Spring ${tag}`, discount: 25, productIds: [cp.id, cr.id], startDate: day(-1), endDate: day(1), budgetUsd: 100 });
  ok(a.ok && a.data.status === 'pending' && a.data.productIds.length === 2 && a.data.productCount === 2 && a.data.discount === 25, 'a seller proposes a 25% campaign on two of their products');
  const camp = a.data;
  ok(!(await req(seller2.sock, 'campaigns:create', { name: 'Steal', discount: 50, productIds: [cp.id] })).ok, "another store cannot put someone else's product in a campaign");
  ok(!(await req(sellerU.sock, 'campaigns:create', { name: 'Ghost', discount: 50, productIds: ['no-such-product'] })).ok, 'a product that does not exist is refused');
  ok(!(await req(sellerU.sock, 'campaigns:create', { name: 'Bad dates', discount: 10, startDate: day(2), endDate: day(1) })).ok, 'an end date before the start date is refused');
  ok(!(await req(sellerU.sock, 'campaigns:create', { name: 'Too much', discount: 95 })).ok, 'a discount over 90% is refused');
  let g = await priceOf(cp.id);
  ok(g.price === 200 && g.campaignPct === 0 && g.priceSource === 'base', 'a PENDING campaign gives no discount');
  a = await order1(cust, cp.id);
  ok(a.ok && a.data.subtotalUsd === 200 && a.data.campaignDiscountUsd === 0, 'and checkout charges the normal price', a.error ?? '');
  ok(!(await req(sellerU.sock, 'campaigns:setStatus', { id: camp.id, status: 'active' })).ok, 'a seller cannot approve their own campaign');
  const priceSeen = new Promise((res) => { cust.sock.on('product:updated', (p) => { if (p.id === cp.id && p.campaignPct === 25) res(p); }); setTimeout(() => res(null), 5000); });
  a = await req(admin.sock, 'campaigns:setStatus', { id: camp.id, status: 'active' });
  ok(a.ok && a.data.status === 'active', 'an admin approves it');
  const pushedPrice = await priceSeen;
  ok(pushedPrice?.price === 150, 'shoppers get the new price pushed live (product:updated)', JSON.stringify(pushedPrice && pushedPrice.price));
  g = await priceOf(cp.id);
  ok(g.price === 150 && g.originalPrice === 200 && g.discount === 25 && g.campaignPct === 25 && g.priceSource === 'campaign' && g.basePrice === 200, 'products:get shows the discounted price, the old price struck through and campaignPct', JSON.stringify({ p: g.price, o: g.originalPrice, c: g.campaignPct }));
  list = (await req(cust.sock, 'products:list')).data;
  ok(list.find((p) => p.id === cp.id)?.price === 150 && list.find((p) => p.id === cq.id)?.price === 100 && list.find((p) => p.id === cq.id)?.campaignPct === 0, 'products:list shows it too, and a product outside the campaign keeps its price');
  ok(list.find((p) => p.id === prod.id)?.campaignPct === 0, 'products without a campaign report campaignPct 0');
  a = await order1(cust, cp.id, 2);
  ok(a.ok && a.data.subtotalUsd === 300 && a.data.totalUsd === 303 && a.data.campaignDiscountUsd === 100, 'checkout charges the campaign price (2 x $150 + $3 delivery) and records the $100 discount', a.error ?? JSON.stringify({ s: a.data?.subtotalUsd, t: a.data?.totalUsd, d: a.data?.campaignDiscountUsd }));
  const li = a.data.items[0];
  ok(li.priceUsd === 150 && li.listPriceUsd === 200 && li.campaignPct === 25 && li.campaignId === camp.id, 'the order line keeps price, list price, campaignPct and campaignId');
  const stored = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === a.data.id);
  ok(stored.campaignDiscountUsd === 100 && stored.items[0].priceUsd === 150, 'and the stored order still says so');
  const counted = await until(async () => { const c = (await req(admin.sock, 'campaigns:list')).data.find((x) => x.id === camp.id); return c && c.orders >= 1 && c.revenueUsd >= 300 ? c : null; });
  ok(!!counted, 'the campaign engagement counters (orders, revenue) move with real sales');
  ok((await req(sellerU.sock, 'orders:list')).data.find((o) => o.id === a.data.id)?.items[0].priceUsd === 150, 'the seller sees the discounted line price');
  ok(!(await req(sellerU.sock, 'campaigns:update', { id: camp.id, patch: { discount: 90 } })).ok, 'a seller cannot raise the discount once it is approved');
  // flash + campaign never stack: the lowest price wins
  const flashAt = (price) => req(admin.sock, 'flashsales:create', { title: `Flash ${tag}`, productId: cr.id, productName: cr.name, flashPrice: price, discount: 0, startsAt: past, endsAt: future });
  await flashAt(190);
  g = await priceOf(cr.id);
  ok(g.price === 150 && g.priceSource === 'campaign', 'a flash price above the campaign price does not win (still $150)');
  await flashAt(120);
  g = await priceOf(cr.id);
  ok(g.price === 120 && g.priceSource === 'flash' && g.campaignPct === 0, 'a lower flash price wins, and is NOT stacked with the campaign (not $90)', JSON.stringify({ p: g.price, s: g.priceSource }));
  a = await order1(cust, cr.id);
  ok(a.ok && a.data.subtotalUsd === 120 && a.data.campaignDiscountUsd === 0, 'checkout charges the flash price and records no campaign discount');
  // a promo code is a coupon on top of the already-discounted subtotal
  a = await order1(other, cp.id, 1, { promoCode: 'SOMBA10' });
  ok(a.ok && a.data.subtotalUsd === 150 && a.data.discountUsd === 15 && a.data.totalUsd === 138, 'a promo code applies on top of the campaign price (150 - 10% + $3 delivery)', a.error ?? JSON.stringify({ s: a.data?.subtotalUsd, d: a.data?.discountUsd, t: a.data?.totalUsd }));
  // dates and status gate the discount
  await req(admin.sock, 'campaigns:update', { id: camp.id, patch: { startDate: day(-5), endDate: day(-3) } });
  g = await priceOf(cp.id);
  ok(g.price === 200 && g.campaignPct === 0, 'an EXPIRED campaign gives no discount');
  a = await order1(cust, cp.id);
  ok(a.ok && a.data.subtotalUsd === 200 && a.data.campaignDiscountUsd === 0, 'and checkout charges the normal price again');
  await req(admin.sock, 'campaigns:update', { id: camp.id, patch: { startDate: day(3), endDate: day(5) } });
  ok((await priceOf(cp.id)).price === 200, 'a campaign that has not started yet gives no discount');
  await req(admin.sock, 'campaigns:update', { id: camp.id, patch: { startDate: day(-1), endDate: day(1) } });
  ok((await priceOf(cp.id)).price === 150, 'inside its dates it discounts again');
  for (const st of ['rejected', 'pending', 'ended', 'draft']) {
    await req(admin.sock, 'campaigns:setStatus', { id: camp.id, status: st });
    ok((await priceOf(cp.id)).price === 200, `a ${st} campaign gives no discount`);
  }
  await req(admin.sock, 'campaigns:setStatus', { id: camp.id, status: 'scheduled' });
  ok((await priceOf(cp.id)).price === 150, 'a scheduled (approved) campaign whose start date has passed discounts');
  await req(admin.sock, 'campaigns:update', { id: camp.id, patch: { startDate: day(2) } });
  ok((await priceOf(cp.id)).price === 200, 'a scheduled campaign waits for its start date');
  await req(admin.sock, 'campaigns:setStatus', { id: camp.id, status: 'ended' });
  // whole-store campaign (no product list)
  a = await req(sellerU.sock, 'campaigns:create', { name: `Store-wide ${tag}`, discount: 10, startDate: day(-1), endDate: day(1) });
  await req(admin.sock, 'campaigns:setStatus', { id: a.data.id, status: 'active' });
  ok((await priceOf(cq.id)).price === 90 && (await priceOf(cp.id)).price === 180, 'a campaign without a product list covers the seller\'s whole store');
  ok((await priceOf(prod.id)).price !== undefined && (await req(cust.sock, 'products:get', { id: (await req(cust.sock, 'products:list')).data.find((p) => p.sellerId !== store.id)?.id ?? prod.id })).data.campaignPct === 0, "and another seller's products are untouched");
  const sf = (await req(guest.sock, 'sellers:storefront', { id: store.id })).data;
  ok(sf.products.find((p) => p.id === cq.id)?.price === 90 && sf.seller.plan !== undefined && !('planExpiresAt' in sf.seller), 'the public storefront shows the same campaign prices, and the plan in force but not its expiry date');
  await req(admin.sock, 'campaigns:setStatus', { id: a.data.id, status: 'ended' });

  // ---- reviews: seller reply + moderation -----------------------------------------------
  section('Reviews: seller reply and moderation');
  const deliverTo = async (c, productId, qty = 1) => {
    const o = (await order1(c, productId, qty)).data;
    const t = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((x) => x.orderId === o.id));
    await req(rider.sock, 'delivery:accept', { taskId: t.id });
    for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: t.id, status: st });
    return o;
  };
  const rp = await mk('Reviewed', 40);
  await deliverTo(cust, rp.id);
  await deliverTo(other, rp.id);
  a = await req(cust.sock, 'reviews:create', { productId: rp.id, rating: 2, text: 'Not great at all' });
  ok(a.ok && a.data.status === 'visible' && a.data.sellerReply === null, 'a delivered buyer reviews; new reviews are visible with no reply');
  const rv1 = a.data;
  const rv2 = (await req(other.sock, 'reviews:create', { productId: rp.id, rating: 5, text: 'Love it, works perfectly' })).data;
  g = await priceOf(rp.id);
  ok(g.rating === 3.5 && g.reviewsCount === 2, 'the product rating is the average of visible reviews', `${g.rating}/${g.reviewsCount}`);
  // reply
  ok(!(await req(cust.sock, 'reviews:reply', { reviewId: rv1.id, text: 'I am the buyer' })).ok, 'a customer cannot reply as the seller');
  ok(!(await req(seller2.sock, 'reviews:reply', { reviewId: rv1.id, text: 'Not my product at all' })).ok, "another store cannot reply to someone else's review");
  ok(!(await req(sellerU.sock, 'reviews:reply', { reviewId: rv1.id, text: 'x' })).ok, 'a one-character reply is refused');
  ok(!(await req(sellerU.sock, 'reviews:reply', { reviewId: 'no-such-review', text: 'Hello there' })).ok, 'replying to a missing review is refused');
  const heard = new Promise((res) => { cust.sock.once('review:updated', (r) => res(r)); setTimeout(() => res(null), 5000); });
  const noted = until(async () => (await req(cust.sock, 'notifications:list')).data.find((n) => n.title === 'The seller replied to your review'));
  a = await req(sellerU.sock, 'reviews:reply', { reviewId: rv1.id, text: 'Sorry about that, we will make it right.' });
  ok(a.ok && a.data.sellerReply === 'Sorry about that, we will make it right.' && !!a.data.sellerReplyAt, 'the seller of the product replies');
  const pushedReview = await heard;
  ok(pushedReview?.id === rv1.id && pushedReview.sellerReply?.startsWith('Sorry'), 'the customer is pushed the reply live (review:updated)');
  ok(!!(await noted), 'and notified');
  list = (await req(guest.sock, 'reviews:list', { productId: rp.id })).data;
  ok(list.find((r) => r.id === rv1.id)?.sellerReply?.startsWith('Sorry') && list.find((r) => r.id === rv1.id)?.sellerReplyAt, 'reviews:list includes the reply');
  ok((await req(sellerU.sock, 'reviews:seller')).data.find((r) => r.id === rv1.id)?.sellerReply?.startsWith('Sorry'), 'reviews:seller includes the reply');
  a = await req(sellerU.sock, 'reviews:reply', { reviewId: rv1.id, text: 'Update: a replacement is on its way.' });
  ok(a.ok && a.data.sellerReply.startsWith('Update'), 'a second reply replaces the first');
  // moderation
  ok(!(await req(sellerU.sock, 'reviews:setStatus', { reviewId: rv1.id, status: 'hidden' })).ok, 'a seller cannot hide reviews');
  ok(!(await req(cust.sock, 'reviews:setStatus', { reviewId: rv1.id, status: 'hidden' })).ok, 'a customer cannot hide reviews');
  ok(!(await req(admin.sock, 'reviews:setStatus', { reviewId: rv1.id, status: 'banana' })).ok, 'an unknown status is refused');
  ok(!(await req(admin.sock, 'reviews:setStatus', { reviewId: 'no-such-review', status: 'hidden' })).ok, 'a missing review is refused');
  a = await req(admin.sock, 'reviews:setStatus', { reviewId: rv1.id, status: 'hidden' });
  ok(a.ok && a.data.status === 'hidden', 'an admin hides a review');
  ok(!(await req(guest.sock, 'reviews:list', { productId: rp.id })).data.some((r) => r.id === rv1.id), 'it disappears from the public list');
  ok(!(await req(cust.sock, 'reviews:list', { productId: rp.id, includeHidden: true })).data.some((r) => r.id === rv1.id), 'a customer cannot ask for hidden reviews');
  ok((await req(admin.sock, 'reviews:list', { productId: rp.id, includeHidden: true })).data.some((r) => r.id === rv1.id), 'a moderator can');
  ok(!(await req(sellerU.sock, 'reviews:seller')).data.some((r) => r.id === rv1.id), "and it leaves the seller's feed");
  g = await priceOf(rp.id);
  ok(g.rating === 5 && g.reviewsCount === 1, 'the product rating no longer counts it (5.0 from 1 review)', `${g.rating}/${g.reviewsCount}`);
  a = await req(admin.sock, 'reviews:admin', { status: 'hidden' });
  ok(a.ok && a.data.some((r) => r.id === rv1.id && r.productName === rp.name) && a.data.every((r) => r.status === 'hidden'), 'reviews:admin lists the hidden ones for the moderation queue');
  ok(!(await req(cust.sock, 'reviews:admin')).ok, 'reviews:admin is staff only');
  await req(admin.sock, 'reviews:setStatus', { reviewId: rv2.id, status: 'hidden' });
  g = await priceOf(rp.id);
  ok(g.rating === 0 && g.reviewsCount === 0, 'with every review hidden the product has no rating');
  await req(admin.sock, 'reviews:setStatus', { reviewId: rv1.id, status: 'visible' });
  await req(admin.sock, 'reviews:setStatus', { reviewId: rv2.id, status: 'visible' });
  g = await priceOf(rp.id);
  ok(g.rating === 3.5 && g.reviewsCount === 2, 'restoring them brings the rating back (3.5)');
  ok((await req(guest.sock, 'reviews:list', { productId: rp.id })).data.length === 2, 'and the public list');

  // ---- verification policy ------------------------------------------------------------------
  section('Verification policy: requireVerifiedForCheckout');
  const unv = await register('unverified');
  ok((await req(guest.sock, 'settings:get')).data.requireVerifiedForCheckout === 'false', 'the policy is a public setting, off by default in the dev seed', JSON.stringify((await req(guest.sock, 'settings:get')).data));
  a = await order1(unv, prod.id);
  ok(a.ok, 'with the policy off, an unverified customer can order');
  ok(!(await req(cust.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'true' })).ok, 'customers cannot change the policy');
  ok(!(await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'perhaps' })).ok, 'an invalid value is refused');
  await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'true' });
  try {
    ok((await req(guest.sock, 'settings:get')).data.requireVerifiedForCheckout === 'true', 'apps can read that it is on');
    a = await order1(unv, prod.id);
    ok(!a.ok && /verify/i.test(a.error ?? '') && /phone|email/i.test(a.error ?? ''), 'an unverified customer cannot place an order; the message says what to verify', a.error ?? '');
    a = await req(unv.sock, 'wallet:topup', { amountUsd: 5, method: 'airtel_money', phone: '+243812345678' });
    ok(!a.ok && /verify/i.test(a.error ?? ''), 'nor top up the wallet', a.error ?? '');
    const sent = await rest('/api/v1/auth/email/send', {}, unv.token);
    ok(sent.status === 200 && sent.json.devToken, 'they ask for a verification email');
    ok((await rest('/api/v1/auth/email/verify', { token: sent.json.devToken })).status === 200, 'and confirm it');
    a = await order1(unv, prod.id);
    ok(a.ok, 'a verified customer can order again', a.error ?? '');
    a = await req(unv.sock, 'wallet:topup', { amountUsd: 5, method: 'airtel_money', phone: '+243812345678' });
    ok(a.ok && a.data.status === 'pending', 'and top up the wallet');
    const unv2 = await register('unverified2');
    const sentPhone = await rest('/api/v1/auth/phone/send', {}, unv2.token);
    if (sentPhone.status === 200 && sentPhone.json.devToken) {
      await rest('/api/v1/auth/phone/verify', { code: sentPhone.json.devToken }, unv2.token);
      ok((await order1(unv2, prod.id)).ok, 'a verified PHONE is enough as well');
    }
  } finally {
    await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' });
  }
  ok((await order1(await register('unverified3'), prod.id)).ok, 'switching the policy off lets unverified customers order again');

  // ---- seller subscription ---------------------------------------------------------------------
  section('Seller subscription plans');
  a = await req(guest.sock, 'sellers:plans');
  ok(a.ok && ['free', 'starter', 'pro', 'enterprise'].every((id) => a.data.some((p) => p.id === id)), 'sellers:plans is public and lists free / starter / pro / enterprise');
  ok(a.data.find((p) => p.id === 'pro').priceUsd === 99 && a.data.find((p) => p.id === 'enterprise').priceUsd === null, 'with monthly USD prices (enterprise = contact sales)');
  ok(!(await req(cust.sock, 'sellers:subscribe', { plan: 'pro', method: 'wallet' })).ok, 'a customer cannot subscribe');
  ok(!(await req(sellerU.sock, 'sellers:subscribe', { plan: 'nope', method: 'wallet' })).ok, 'an unknown plan is refused');
  ok(!(await req(sellerU.sock, 'sellers:subscribe', { plan: 'free', method: 'wallet' })).ok, 'the free plan needs no payment');
  ok(!(await req(sellerU.sock, 'sellers:subscribe', { plan: 'enterprise', method: 'wallet' })).ok, 'enterprise is sold by the sales team');
  ok(!(await req(sellerU.sock, 'sellers:subscribe', { plan: 'pro', method: 'cod' })).ok, 'cash on delivery is not a way to pay for a plan');
  a = await req(sellerU.sock, 'sellers:subscribe', { plan: 'pro', method: 'wallet' });
  ok(!a.ok && /insufficient/i.test(a.error ?? ''), 'paying from an empty wallet is refused', a.error ?? '');
  ok(!(await req(sellerU.sock, 'sellers:subscribe', { plan: 'starter', method: 'airtel_money', phone: 'abc' })).ok, 'a mobile-money plan payment needs a valid phone');
  let me = (await req(sellerU.sock, 'sellers:mine')).data;
  ok(me.plan === 'free' && me.activePlan === 'free', 'a new store is on the free plan');
  const planPush = new Promise((res) => { sellerU.sock.on('seller:updated', (x) => { if (x.plan === 'starter') res(x); }); setTimeout(() => res(null), 8000); });
  const finBefore = (await req(finance.sock, 'analytics:finance')).data;
  a = await req(sellerU.sock, 'sellers:subscribe', { plan: 'starter', method: 'airtel_money', phone: '+243812345678' });
  ok(a.ok && a.data.status === 'pending' && a.data.payment.status === 'pending' && a.data.payment.purpose === 'plan' && a.data.payment.amountUsd === 49, 'a mobile-money subscription is a pending payment of the plan price', a.error ?? JSON.stringify(a.data?.payment));
  const planPay = a.data.payment;
  ok((await req(sellerU.sock, 'sellers:mine')).data.plan === 'free', 'the plan does not change while the payment is pending');
  ok((await req(finance.sock, 'payments:list')).data.some((p) => p.reference === planPay.reference && p.purpose === 'plan'), 'finance sees it among the payments to confirm');
  await req(finance.sock, 'payments:confirm', { reference: planPay.reference });
  me = await until(async () => { const m = (await req(sellerU.sock, 'sellers:mine')).data; return m.plan === 'starter' ? m : null; });
  ok(!!me && me.activePlan === 'starter', 'once the payment succeeds the plan activates');
  const exp1 = new Date(me.planExpiresAt).getTime();
  ok(exp1 > Date.now() + 27 * 86400000 && exp1 < Date.now() + 32 * 86400000, 'and runs for a month', me.planExpiresAt);
  ok((await planPush)?.plan === 'starter', 'the seller is pushed seller:updated');
  const finAfter = (await req(finance.sock, 'analytics:finance')).data;
  ok(Math.abs(finAfter.subscriptionRevenueUsd - (finBefore.subscriptionRevenueUsd + 49)) < 0.011, 'subscription revenue shows up in the finance report');
  // pay by wallet: fund it first, then renew a different plan
  const topup = (await req(sellerU.sock, 'wallet:topup', { amountUsd: 250, method: 'orange_money', phone: '+243822345678' })).data;
  await req(finance.sock, 'payments:confirm', { reference: topup.reference });
  const funded = await until(async () => { const b = (await req(sellerU.sock, 'wallet:get')).data.balance; return b >= 250 ? b : null; });
  ok(!!funded, 'the seller tops up their wallet');
  a = await req(sellerU.sock, 'sellers:subscribe', { plan: 'pro', method: 'wallet' });
  ok(a.ok && a.data.status === 'active' && a.data.seller.plan === 'pro' && a.data.seller.activePlan === 'pro' && a.data.payment.status === 'succeeded', 'a wallet purchase activates the plan at once', a.error ?? '');
  ok(Math.abs((await req(sellerU.sock, 'wallet:get')).data.balance - (funded - 99)) < 0.011, 'and debits the wallet by the plan price');
  const exp2 = new Date(a.data.seller.planExpiresAt).getTime();
  ok(exp2 > Date.now() + 27 * 86400000 && exp2 < exp1 + 3 * 86400000, 'switching plan starts a fresh period (not the unused starter time on top)');
  const funded2 = (await req(sellerU.sock, 'wallet:get')).data.balance;
  a = await req(sellerU.sock, 'sellers:subscribe', { plan: 'pro', method: 'wallet' });
  const exp3 = a.ok ? new Date(a.data.seller.planExpiresAt).getTime() : 0;
  ok(a.ok && exp3 > exp2 + 27 * 86400000 && Math.abs((await req(sellerU.sock, 'wallet:get')).data.balance - (funded2 - 99)) < 0.011, 'renewing the same plan adds a month on top of the time left', a.error ?? '');
  // listing quota set by admin on a plan
  const original = JSON.stringify([
    { id: 'free', name: 'Free', priceUsd: 0, months: 1, features: [] },
    { id: 'starter', name: 'Starter', priceUsd: 49, months: 1, features: [] },
    { id: 'pro', name: 'Professional', priceUsd: 99, months: 1, features: [] },
    { id: 'enterprise', name: 'Enterprise', priceUsd: null, months: 1, features: [] },
  ]);
  ok(!(await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: '[{"id":"BAD ID","name":"x","priceUsd":1}]' })).ok, 'invalid plan settings are refused');
  ok(!(await req(cust.sock, 'settings:set', { key: 'sellerPlans', value: original })).ok, 'customers cannot edit plans');
  const capped = JSON.parse(original); capped[0].maxProducts = 1;
  await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: JSON.stringify(capped) });
  try {
    a = await req(seller2.sock, 'products:create', { name: `Quota 1 ${tag}`, price: 5, category: 'Electronics', stock: 1 });
    ok(a.ok, 'a free-plan store can list up to the plan quota');
    a = await req(seller2.sock, 'products:create', { name: `Quota 2 ${tag}`, price: 5, category: 'Electronics', stock: 1 });
    ok(!a.ok && /plan allows 1/.test(a.error ?? ''), 'and no further', a.error ?? '');
    ok((await req(sellerU.sock, 'products:create', { name: `Pro ok ${tag}`, price: 5, category: 'Electronics', stock: 1 })).ok, 'a store on a plan without a quota is not limited');
  } finally {
    await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: original });
  }
  ok((await req(seller2.sock, 'products:create', { name: `Quota 3 ${tag}`, price: 5, category: 'Electronics', stock: 1 })).ok, 'removing the quota lifts the limit');

  // cleanup the flash sale so reruns are clean
  void flashId;

  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `   - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
