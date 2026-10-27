/* Multi-seller orders: one cart with items from two sellers becomes ONE order
 * (one payment, one delivery) in which each seller sees, packs, readies and may
 * cancel only THEIR package. Runs against a RUNNING dev API seeded with `npm run seed`.
 *
 *   API_URL=http://localhost:3001 node test/multi-seller-smoke.cjs
 *
 * ADMIN_PW / WAREHOUSE_PW override the seed password when those accounts were changed.
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { hubId, tasksOf, receiveAtHub } = require('./journey.cjs');
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
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@multi.test`, password: 'Multi-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
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
  const demoRider = await login('rider@somba.app');
  /** A parcel nobody collected cannot be scanned in: the demo rider is assigned and collects it first. */
  const limeteRider = await login('rider.limete@somba.app').catch(() => null);
  const collect = async (taskId) => {
    for (const r of [demoRider, limeteRider]) {
      if (!r) continue;
      const a = await req(admin.sock, 'logistics:assign', { taskId, riderId: r.user.id });
      if (a.ok) return req(r.sock, 'delivery:updateStatus', { taskId, status: 'picked_up' });
    }
    return null;
  };
  const moderation = (await req(admin.sock, 'settings:get')).data?.productModeration;
  const cod = (await req(admin.sock, 'settings:get')).data?.codEnabled;
  const verified = (await req(admin.sock, 'settings:get')).data?.requireVerifiedForCheckout;
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' });

  const makeSeller = async (label, pickup) => {
    const u = await register(label, 'seller');
    const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
    await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    await req(u.sock, 'sellers:update', { pickupAddress: pickup });
    return { ...u, store };
  };
  const shopA = await makeSeller('alpha', '7 Rue du Marché, Limete');
  const shopB = await makeSeller('beta', '12 Avenue Kasa-Vubu, Kalamu');
  const prodA = (await req(shopA.sock, 'products:create', { name: `Alpha kettle ${tag}`, price: 30, category: 'Electronics', stock: 10 })).data;
  const prodB = (await req(shopB.sock, 'products:create', { name: `Beta lamp ${tag}`, price: 20, category: 'Electronics', stock: 10 })).data;
  ok(prodA?.status === 'live' && prodB?.status === 'live', 'two sellers each list a live product', JSON.stringify([prodA?.status, prodB?.status]));
  const cust = await register('mixbuyer');
  const stockOf = async (id) => (await req(cust.sock, 'products:get', { id })).data.stock;
  const wallet = async () => (await req(cust.sock, 'wallet:get')).data.balance;

  section('One cart, two sellers → one order with a package per seller');
  const pushA = new Promise((res) => { shopA.sock.once('order:created', res); setTimeout(() => res(null), 4000); });
  let a = await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 2 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
  ok(a.ok && a.data.status === 'confirmed' && a.data.items.length === 2, 'the mixed cart is ONE order, paid once', a.error ?? a.data?.status);
  const order = a.data;
  ok(order.items.every((i) => i.sellerId && i.sellerName && i.fulfilment === 'open'), 'every line remembers its seller and starts open', JSON.stringify(order.items.map((i) => [i.sellerName, i.fulfilment])));
  const pa = await pushA;
  ok(pa && pa.items.length === 1 && pa.items[0].productId === prodA.id && pa.subtotalUsd === 30 && pa.sellerCount === 2 && pa.packageStatus === 'to_pack', "seller A is pushed only their line, their subtotal, and 'to pack'", JSON.stringify(pa && { n: pa.items.length, s: pa.subtotalUsd, c: pa.sellerCount, p: pa.packageStatus }));
  const listB = (await req(shopB.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(listB && listB.items.length === 1 && listB.items[0].productId === prodB.id && listB.subtotalUsd === 40, "seller B's list shows only B's line", JSON.stringify(listB && listB.items.map((i) => i.productId)));
  const pickups = await until(async () => { const t = (await tasksOf(admin, order.id)).filter((x) => x.kind === 'pickup'); return t.length === 2 ? t : null; });
  const sellerA = order.items.find((i) => i.productId === prodA.id).sellerId;
  const sellerB = order.items.find((i) => i.productId === prodB.id).sellerId;
  const pA = pickups?.find((t) => t.sellerId === sellerA);
  const pB = pickups?.find((t) => t.sellerId === sellerB);
  ok(pA && pB && /Limete/.test(pA.pickupAddress) && /Kalamu/.test(pB.pickupAddress), 'one pickup task per seller, each with that seller\'s pickup address', JSON.stringify(pickups?.map((t) => t.pickupAddress)));

  section('Each seller readies only their own package');
  a = await req(shopA.sock, 'orders:sellerReady', { orderId: order.id });
  ok(a.ok && !!a.data.readyAt && a.data.sellerId === sellerA, 'seller A ready: A\'s own pickup is ready for the rider (no waiting for B)', a.error ?? `readyAt=${a.data?.readyAt}`);
  ok(!(await tasksOf(admin, order.id)).find((t) => t.id === pB.id).readyAt, "B's pickup is not ready yet");
  let listA = (await req(shopA.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(listA?.packageStatus === 'ready', "seller A's package shows 'ready'", listA?.packageStatus);
  ok(listA?.otherSellersPacking === 1, 'seller A is told one other seller is still packing (no names)', String(listA?.otherSellersPacking));
  const listB2 = (await req(shopB.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(listB2?.packageStatus === 'to_pack', "seller B's package is still 'to pack'", listB2?.packageStatus);
  const custView = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(custView.items.find((i) => i.productId === prodA.id).fulfilment === 'ready' && custView.items.find((i) => i.productId === prodB.id).fulfilment === 'open', 'the customer sees each package\'s progress');

  section('A seller cancels only their part');
  const balance0 = await wallet();
  const stockB0 = await stockOf(prodB.id);
  ok(!(await req(shopB.sock, 'orders:sellerCancel', { orderId: order.id, reason: 'Out of stock', itemIds: [order.items.find((i) => i.productId === prodA.id).id] })).ok, "seller B cannot cancel seller A's line");
  ok(!(await req(cust.sock, 'orders:sellerCancel', { orderId: order.id, reason: 'nope' })).ok, 'a customer cannot use the seller cancel');
  ok(!(await req(shopB.sock, 'orders:sellerCancel', { orderId: order.id, reason: '' })).ok, 'a reason is required');
  a = await req(shopB.sock, 'orders:sellerCancel', { orderId: order.id, reason: 'Damaged in storage' });
  ok(a.ok && a.data.packageStatus === 'cancelled', "seller B cancels B's package", a.error ?? a.data?.packageStatus);
  ok(Math.abs((await wallet()) - balance0 - 40) < 0.01, 'the customer is refunded exactly B\'s lines (40) to the wallet', `${balance0} → ${await wallet()}`);
  ok((await stockOf(prodB.id)) === stockB0 + 2, "B's stock is put back");
  const after = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(after.status === 'confirmed' && after.items.find((i) => i.productId === prodA.id).fulfilment === 'ready', "the order carries on with seller A's package");
  const lineB = after.items.find((i) => i.productId === prodB.id);
  ok(lineB.fulfilment === 'cancelled' && lineB.cancelReason === 'Damaged in storage' && lineB.refundedUsd === 40, 'the cancelled line shows its reason and refund', JSON.stringify(lineB));
  const afterTasks = await tasksOf(admin, order.id);
  const pA2 = afterTasks.find((t) => t.id === pA.id);
  const pB2 = afterTasks.find((t) => t.id === pB.id);
  ok(pA2 && !!pA2.readyAt && pA2.status !== 'failed' && pB2?.status === 'failed', 'with B out, A\'s pickup carries on and B\'s pickup is voided', JSON.stringify([pA2?.status, pB2?.status]));
  ok(!(await req(shopB.sock, 'orders:sellerCancel', { orderId: order.id, reason: 'again' })).ok, 'a second cancel refunds nothing more');
  await collect(pA.id);
  a = await req(warehouse.sock, 'warehouse:receive', { taskId: pA.id });
  listA = (await req(shopA.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(a.ok && listA?.packageStatus === 'at_hub', "the hub scan moves A's package to 'at hub'", listA?.packageStatus);
  ok(!!(await until(async () => (await tasksOf(admin, order.id)).find((t) => t.kind === 'delivery'))), 'B is out, so A\'s parcel alone completes the order at the hub: the delivery leg appears');
  const notes = (await req(cust.sock, 'notifications:list')).data;
  ok(notes.some((n) => n.title === 'Item cancelled by the seller' && /Damaged in storage/.test(n.body)), 'the customer is told which item, why, and about the refund');

  section('Cancelling the last remaining package cancels the order');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
  const solo = a.data;
  const balance1 = await wallet();
  a = await req(shopA.sock, 'orders:sellerCancel', { orderId: solo.id, reason: 'Supplier delay' });
  const soloAfter = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === solo.id);
  ok(a.ok && soloAfter.status === 'cancelled' && soloAfter.items[0].fulfilment === 'cancelled', 'the whole order is cancelled', a.error ?? soloAfter?.status);
  ok((await wallet()) > balance1, 'and refunded in full', `${balance1} → ${await wallet()}`);

  section('A later full cancel never refunds or restocks a cancelled line twice');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
  const both = a.data;
  const w0 = await wallet();
  const sA0 = await stockOf(prodA.id);
  const sB0 = await stockOf(prodB.id);
  await req(shopB.sock, 'orders:sellerCancel', { orderId: both.id, reason: 'Out of stock' });
  a = await req(cust.sock, 'orders:cancel', { orderId: both.id });
  ok(a.ok && Math.abs((await wallet()) - w0 - both.totalUsd) < 0.01, `seller refund + customer cancel = exactly the ${both.totalUsd} paid (items + delivery), never more`, `${w0} → ${await wallet()}`);
  ok((await stockOf(prodA.id)) === sA0 + 1 && (await stockOf(prodB.id)) === sB0 + 1, 'each line is restocked once', JSON.stringify([sA0, await stockOf(prodA.id), sB0, await stockOf(prodB.id)]));

  section('The hub scan only receives packed packages');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
  const hubOrder = a.data;
  await req(shopA.sock, 'orders:sellerReady', { orderId: hubOrder.id });
  const hubSellerA = hubOrder.items.find((i) => i.productId === prodA.id).sellerId;
  const hubTask = await until(async () => (await tasksOf(admin, hubOrder.id)).find((t) => t.kind === 'pickup' && t.sellerId === hubSellerA));
  await collect(hubTask.id);
  await req(warehouse.sock, 'warehouse:receive', { taskId: hubTask.id });
  const hubB = (await req(shopB.sock, 'orders:list')).data.find((o) => o.id === hubOrder.id);
  const hubA = (await req(shopA.sock, 'orders:list')).data.find((o) => o.id === hubOrder.id);
  ok(hubA?.packageStatus === 'at_hub' && hubB?.packageStatus === 'to_pack', "A's packed package is at the hub; B, still packing, is not marked received", JSON.stringify([hubA?.packageStatus, hubB?.packageStatus]));
  a = await req(shopB.sock, 'orders:sellerReady', { orderId: hubOrder.id });
  ok(a.ok && !!a.data.readyAt, 'once B packs, B\'s pickup is ready too');
  ok(!(await tasksOf(admin, hubOrder.id)).some((t) => t.kind === 'delivery'), 'but there is no delivery leg until B\'s parcel is also at the hub');
  await req(cust.sock, 'orders:cancel', { orderId: hubOrder.id });

  section('Cash on delivery: less to collect');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'true' });
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 1 }], paymentMethod: 'cod', shippingAddress: ADDRESS });
  if (a.ok) {
    const codOrder = a.data;
    a = await req(shopB.sock, 'orders:sellerCancel', { orderId: codOrder.id, reason: 'Wrong colour in stock' });
    ok(a.ok, 'seller B cancels their part of the cash order', a.error ?? '');
    const codDelivery = await receiveAtHub(admin, codOrder.id, demoRider); // A's parcel reaches the hub, the delivery leg is created
    ok(Math.abs(codDelivery.codAmountUsd - (codOrder.totalUsd - 20)) < 0.01, 'the rider collects 20 less at the door', `${codOrder.totalUsd} → ${codDelivery?.codAmountUsd}`);
  } else {
    ok(false, 'COD order placed', a.error);
  }

  await req(admin.sock, 'settings:set', { key: 'productModeration', value: String(moderation ?? 'false') });
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: String(cod ?? 'false') });
  await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: String(verified ?? 'false') });
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
