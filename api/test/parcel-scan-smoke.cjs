/* Parcel labels and scans, end to end on a RUNNING API seeded with `npm run seed` (throw-away database; see the notes in the PR).
 *
 *   API_URL=http://localhost:3018 node test/parcel-scan-smoke.cjs
 *
 * Scenarios: (1) the seller marks a package ready in 2 boxes and gets two KOMORIKO labels (no customer phone or street on them),
 * changes the box count while nothing was scanned (the old labels are void), and cannot once a rider scanned a box. (2) The
 * pickup: the rider cannot collect before both boxes are scanned ("Scan every parcel first: 1 of 2 scanned."), a wrong code and a
 * void label are refused with precise copy, a repeat scan is harmless. (3) At the warehouse: staff cannot scan the leg in until
 * every box arrived; a box scanned by its code records the arrival and scans the leg in on the last one; a manager marks a box by
 * hand (an operator cannot) and it is audited. (4) The delivery leg: boxes scanned out, on the road, drop-off scans before the
 * customer's code, then delivered. (5) With requireParcelScan off nothing blocks, and scanning still records.
 * It switches settings for itself and puts them back.
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { tasksOf } = require('./journey.cjs');
const API = process.env.API_URL ?? 'http://localhost:3018';
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
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@parcel.test`, password: 'Parcel-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const SELLER_PIN = { lat: -4.3031, lng: 15.3033 };
const KALAMU = { commune: 'Kalamu', pin: { lat: -4.3366, lng: 15.3175 } };
const addr = (p) => JSON.stringify({ line1: '1 Test Street', city: 'Kinshasa', phone: '+243 811 111 111', commune: p.commune, geo: p.pin });
const CODE = /^PKG-[2-9A-HJ-NP-Z]{8}$/;

(async () => {
  const admin = await login('admin@somba.app');
  const manager = await login('warehouse@somba.app'); // Entrepôt Kinshasa, manager
  const operator = await login('operator@somba.app'); // Entrepôt Kinshasa, operator
  const rider = await login('rider@somba.app');
  const KEYS = ['productModeration', 'requireDeliveryCode', 'requireVerifiedForCheckout', 'expressDeliveryEnabled', 'requireParcelScan'];
  const was = Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, (await req(admin.sock, 'settings:get')).data?.[k]])));
  const set = (key, value) => req(admin.sock, 'settings:set', { key, value: String(value) });
  for (const [k, v] of Object.entries({ productModeration: 'false', requireDeliveryCode: 'true', requireVerifiedForCheckout: 'false', expressDeliveryEnabled: 'false', requireParcelScan: 'true' })) await set(k, v);
  const restore = async () => { for (const [k, v] of Object.entries(was)) if (v !== undefined && v !== null) await set(k, v); };

  try {
    const shop = await (async () => {
      const u = await register('pshop', 'seller');
      const store = (await req(u.sock, 'sellers:register', kyc(`Parcel Store ${tag}`))).data;
      await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
      await req(u.sock, 'sellers:update', { pickupAddress: '14 Avenue du Commerce, Gombe', pickupLat: SELLER_PIN.lat, pickupLng: SELLER_PIN.lng });
      return { ...u, store };
    })();
    const prod = (await req(shop.sock, 'products:create', { name: `Parcel lamp ${tag}`, price: 20, category: 'Electronics', stock: 80 })).data;
    const cust = await register('pbuyer');
    const place = async () => {
      const r = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr(KALAMU) });
      if (!r.ok) throw new Error(`orders:create: ${r.error}`);
      return r.data;
    };
    const legs = async (orderId, kind) => (await tasksOf(admin, orderId)).filter((t) => (kind ? t.kind === kind : true) && t.status !== 'failed');
    const assign = async (taskId) => { const a = await req(admin.sock, 'logistics:assign', { taskId, riderId: rider.user.id }); if (!a.ok) throw new Error(`assign: ${a.error}`); };
    const scan = (taskId, code, stage, extra = {}) => req(rider.sock, 'rider:scanParcel', { taskId, code, stage, ...extra });
    const move = (taskId, status, extra = {}) => req(rider.sock, 'delivery:updateStatus', { taskId, status, ...extra });

    // ── 1. Labels ───────────────────────────────────────────────────────────────────────────────────────────────────
    section('The seller marks the package ready in boxes and gets labels');
    const order = await place();
    const pickup = await until(async () => (await legs(order.id, 'pickup'))[0]);
    ok(!!pickup, 'the order has a pickup leg');
    let a = await req(shop.sock, 'orders:sellerReady', { orderId: order.id, boxCount: 0 });
    ok(!a.ok && /1 to 20/.test(a.error ?? ''), 'a box count of 0 is refused', a.error ?? 'was allowed');
    a = await req(shop.sock, 'orders:sellerReady', { orderId: order.id, boxCount: 21 });
    ok(!a.ok && /1 to 20/.test(a.error ?? ''), 'a box count of 21 is refused', a.error ?? 'was allowed');
    a = await req(shop.sock, 'orders:sellerReady', { orderId: order.id, boxCount: 2 });
    ok(a.ok && a.data.boxCount === 2 && a.data.labels?.length === 2, 'package ready with 2 boxes returns 2 labels', a.error ?? JSON.stringify(a.data?.labels));
    let labels = a.data?.labels ?? [];
    ok(labels.every((l) => CODE.test(l.code) && l.boxCount === 2 && l.orderReference === order.reference && l.storeName && l.destinationArea), 'each label has a code, "n of 2", the order reference, the store and the destination area', JSON.stringify(labels[0]));
    ok(labels.map((l) => l.boxNo).join() === '1,2' && new Set(labels.map((l) => l.code)).size === 2, 'boxes are numbered 1 and 2 with different codes');
    ok(!JSON.stringify(labels).match(/811 111 111|Test Street|phone/i), 'a label never carries the customer\'s phone or street');
    ok(a.data?.boxesLocked === false, 'the box count is not locked before a scan');
    a = await req(shop.sock, 'orders:sellerLabels', { orderId: order.id });
    ok(a.ok && a.data.labels.map((l) => l.code).join() === labels.map((l) => l.code).join() && a.data.locked === false, 'orders:sellerLabels returns the same labels (reprint)', a.error ?? '');
    a = await req(cust.sock, 'orders:sellerLabels', { orderId: order.id });
    ok(!a.ok, 'a customer cannot read a seller\'s labels', a.error ?? 'was allowed');
    const old = labels.map((l) => l.code);
    a = await req(shop.sock, 'orders:sellerBoxes', { orderId: order.id, boxCount: 3 });
    ok(a.ok && a.data.boxCount === 3 && a.data.labels.length === 3 && a.data.labels.every((l) => !old.includes(l.code)), 'changing to 3 boxes before any scan makes new labels', a.error ?? '');
    a = await req(shop.sock, 'orders:sellerBoxes', { orderId: order.id, boxCount: 2 });
    ok(a.ok && a.data.labels.length === 2, 'and back to 2 boxes', a.error ?? '');
    labels = a.data.labels;

    // ── 2. The pickup at the seller ─────────────────────────────────────────────────────────────────────────────────
    section('The rider must scan every box before collecting');
    await assign(pickup.id);
    const task = (await req(rider.sock, 'rider:tasks')).data.find((t) => t.id === pickup.id);
    ok(task?.parcels?.length === 2 && task.pickupComplete === false && task.scanRequired === true, 'the rider\'s task carries the 2 boxes, the pickup is incomplete and the rule is on', JSON.stringify(task && [task.parcels?.length, task.pickupComplete, task.scanRequired]));
    a = await move(pickup.id, 'picked_up');
    ok(!a.ok && a.error === 'Scan every parcel first: 0 of 2 scanned.', 'collecting with no scan is refused with the numbers', a.error ?? 'was allowed');
    a = await scan(pickup.id, old[0], 'pickup');
    ok(!a.ok && a.error === `${old[0]} was cancelled; use the new label.`, 'a void label is refused: use the new label', a.error ?? 'was allowed');
    a = await scan(pickup.id, 'PKG-ZZZZZZZZ', 'pickup');
    ok(!a.ok && a.error === 'PKG-ZZZZZZZZ is not part of this pickup.', 'a code that is not on the leg is refused', a.error ?? 'was allowed');
    a = await scan(pickup.id, 'hello', 'pickup');
    ok(!a.ok && /not a KOMORIKO parcel code/.test(a.error ?? ''), 'text that is not a code is refused', a.error ?? 'was allowed');
    a = await scan(pickup.id, labels[0].code, 'dropoff');
    ok(!a.ok && /not picked up yet/.test(a.error ?? ''), 'a drop-off before the pickup is refused', a.error ?? 'was allowed');
    a = await scan(pickup.id, labels[0].code, 'pickup');
    ok(a.ok && a.data.scanned === 1 && a.data.total === 2 && a.data.pickupComplete === false && a.data.already === false, 'scanning box 1: 1 of 2', a.error ?? JSON.stringify(a.data));
    a = await scan(pickup.id, labels[0].code.toLowerCase(), 'pickup');
    ok(a.ok && a.data.already === true && a.data.scanned === 1, 'the same scan again is harmless (already)', a.error ?? '');
    a = await move(pickup.id, 'picked_up');
    ok(!a.ok && a.error === 'Scan every parcel first: 1 of 2 scanned.', 'one box of two is not enough', a.error ?? 'was allowed');
    a = await req(shop.sock, 'orders:sellerBoxes', { orderId: order.id, boxCount: 1 });
    ok(!a.ok && a.error === 'The rider already scanned these boxes. Contact support to change them.', 'after a pickup scan the box count is locked', a.error ?? 'was allowed');
    a = await req(shop.sock, 'orders:sellerLabels', { orderId: order.id });
    ok(a.ok && a.data.locked === true, 'the labels still print, and say the count is locked');
    a = await scan(pickup.id, labels[1].code, 'pickup', { manual: true });
    ok(a.ok && a.data.pickupComplete === true && a.data.scanned === 2, 'box 2 (typed) completes the pickup checklist', a.error ?? '');
    a = await req(operator.sock, 'rider:scanParcel', { taskId: pickup.id, code: labels[0].code, stage: 'pickup' });
    ok(!a.ok && /Riders only/.test(a.error ?? ''), 'only a rider can scan on a leg', a.error ?? 'was allowed');
    a = await move(pickup.id, 'picked_up');
    ok(a.ok && a.data.status === 'picked_up', 'with every box scanned the rider collects', a.error ?? '');

    // ── 3. The warehouse ────────────────────────────────────────────────────────────────────────────────────────────
    section('At the warehouse the desk scans the boxes in');
    a = await req(operator.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(!a.ok && a.error === 'Scan every parcel first: 0 of 2 scanned.', 'the leg cannot be scanned in before the boxes arrived', a.error ?? 'was allowed');
    a = await scan(pickup.id, labels[0].code, 'dropoff');
    ok(a.ok && a.data.scanned === 1 && a.data.total === 2, 'the rider scans box 1 at the warehouse door: 1 of 2', a.error ?? '');
    a = await req(operator.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(!a.ok && a.error === 'Scan every parcel first: 1 of 2 scanned.', 'the desk is still refused', a.error ?? 'was allowed');
    a = await req(operator.sock, 'logistics:scanIn', { code: 'PKG-ZZZZZZZZ' });
    ok(!a.ok && /is not due at your warehouse/.test(a.error ?? ''), 'a code that is not due here is refused', a.error ?? 'was allowed');
    a = await req(operator.sock, 'logistics:scanIn', { code: labels[1].code });
    ok(a.ok && a.data.completed === true && a.data.task.status === 'delivered', 'scanning the last box by its code records its arrival and scans the leg in', a.error ?? JSON.stringify(a.data?.completed));
    ok(a.ok && a.data.checklist.dropoffComplete === true && a.data.checklist.parcels.every((p) => p.dropoffScannedAt), 'both boxes show their arrival');
    const delivery = await until(async () => (await legs(order.id, 'delivery'))[0]);
    ok(!!delivery, 'the delivery leg now exists');

    section('A manager can mark a box by hand; an operator and a rider cannot');
    const order2 = await place();
    const pickup2 = await until(async () => (await legs(order2.id, 'pickup'))[0]);
    a = await req(shop.sock, 'orders:sellerReady', { orderId: order2.id });
    ok(a.ok && a.data.boxCount === 1 && a.data.labels.length === 1, 'the default is one box', a.error ?? '');
    const box = a.data.labels[0].code;
    await assign(pickup2.id);
    await scan(pickup2.id, box, 'pickup');
    await move(pickup2.id, 'picked_up');
    a = await req(operator.sock, 'logistics:markParcel', { taskId: pickup2.id, code: box, stage: 'dropoff', reason: 'label torn' });
    ok(!a.ok && /supervisor or a manager/.test(a.error ?? ''), 'an operator cannot mark by hand', a.error ?? 'was allowed');
    a = await req(rider.sock, 'logistics:markParcel', { taskId: pickup2.id, code: box, stage: 'dropoff', reason: 'label torn' });
    ok(!a.ok, 'a rider cannot skip a scan', a.error ?? 'was allowed');
    a = await req(manager.sock, 'logistics:markParcel', { taskId: pickup2.id, code: box, stage: 'dropoff', reason: '' });
    ok(!a.ok && /reason/.test(a.error ?? ''), 'a reason is required', a.error ?? 'was allowed');
    a = await req(manager.sock, 'logistics:markParcel', { taskId: pickup2.id, code: box, stage: 'dropoff', reason: 'label torn' });
    ok(a.ok && a.data.checklist.dropoffComplete === true, 'a manager marks the box scanned with a reason', a.error ?? '');
    const audit = (await req(admin.sock, 'audit:list', { limit: 100 })).data ?? [];
    ok(audit.some((l) => l.action === 'parcel.marked_by_hand' && /label torn/.test(l.detail ?? '')), 'the manual mark is in the audit log', JSON.stringify(audit.slice(0, 1)));
    a = await req(operator.sock, 'logistics:scanIn', { taskId: pickup2.id });
    ok(a.ok && a.data.task.status === 'delivered', 'the leg can then be scanned in', a.error ?? '');

    // ── 4. The delivery to the customer ─────────────────────────────────────────────────────────────────────────────
    section('The delivery leg: scan out, on the road, scan before the code');
    await assign(delivery.id);
    a = await req(operator.sock, 'logistics:dispatchTransfer', { taskId: delivery.id });
    ok(!a.ok && a.error === 'Scan every parcel first: 0 of 2 scanned.', 'the desk cannot hand the parcel to the rider before the boxes are scanned out', a.error ?? 'was allowed');
    a = await req(operator.sock, 'logistics:dispatchTransfer', { code: labels[0].code });
    ok(a.ok && a.data.completed === false && a.data.checklist.parcels.filter((p) => p.pickupScannedAt).length === 1, 'a box scanned out by the desk ticks 1 of 2 and the leg stays', a.error ?? JSON.stringify(a.data?.completed));
    a = await scan(delivery.id, labels[1].code, 'pickup');
    ok(a.ok && a.data.pickupComplete === true, 'the rider scans the other box: the pickup is complete', a.error ?? '');
    a = await req(operator.sock, 'logistics:dispatchTransfer', { taskId: delivery.id });
    ok(a.ok && a.data.status === 'picked_up', 'the desk hands the parcel over', a.error ?? '');
    a = await move(delivery.id, 'in_transit');
    ok(a.ok, 'the rider is on the road', a.error ?? '');
    const code = (await req(cust.sock, 'orders:deliveryCode', { orderId: order.id })).data;
    a = await move(delivery.id, 'delivered', { code: code.code });
    ok(!a.ok && a.error === 'Scan every parcel first: 0 of 2 scanned.', 'the customer\'s code is not even checked before the drop-off scans', a.error ?? 'was allowed');
    a = await scan(delivery.id, labels[0].code, 'dropoff');
    a = await move(delivery.id, 'delivered', { code: code.code });
    ok(!a.ok && a.error === 'Scan every parcel first: 1 of 2 scanned.', 'one of two is not enough at the customer', a.error ?? 'was allowed');
    a = await scan(delivery.id, labels[1].code, 'dropoff');
    ok(a.ok && a.data.dropoffComplete === true, 'both boxes scanned at the customer', a.error ?? '');
    a = await move(delivery.id, 'delivered', { code: '0000' });
    ok(!a.ok && /Wrong delivery code/.test(a.error ?? ''), 'a wrong code is still refused', a.error ?? 'was allowed');
    a = await move(delivery.id, 'delivered', { code: code.code });
    ok(a.ok && a.data.status === 'delivered', 'then the customer\'s code hands the parcel over', a.error ?? '');
    a = await req(shop.sock, 'orders:sellerLabels', { orderId: order.id });
    ok(!a.ok && /delivered/.test(a.error ?? ''), 'labels cannot be reprinted once the package was delivered', a.error ?? 'was allowed');

    // ── 5. The setting off ──────────────────────────────────────────────────────────────────────────────────────────
    section('With requireParcelScan off nothing blocks, and scanning still records');
    await set('requireParcelScan', 'false');
    const order3 = await place();
    const pickup3 = await until(async () => (await legs(order3.id, 'pickup'))[0]);
    a = await req(shop.sock, 'orders:sellerReady', { orderId: order3.id, boxCount: 2 });
    const l3 = a.data?.labels ?? [];
    await assign(pickup3.id);
    a = await scan(pickup3.id, l3[0]?.code, 'pickup');
    ok(a.ok && a.data.required === false && a.data.scanned === 1, 'a scan still records (1 of 2) with the rule off', a.error ?? '');
    a = await move(pickup3.id, 'picked_up');
    ok(a.ok && a.data.status === 'picked_up', 'the rider collects with one box scanned', a.error ?? '');
    a = await req(operator.sock, 'logistics:scanIn', { taskId: pickup3.id });
    ok(a.ok && a.data.task.status === 'delivered', 'the desk scans the leg in with no arrival scan', a.error ?? '');
    const row = ((await req(admin.sock, 'logistics:queue', { status: 'all', limit: 500 })).data?.tasks ?? []).find((t) => t.id === pickup3.id);
    ok(row && row.scanRequired === false, 'the leg view says the rule is off', JSON.stringify(row?.scanRequired));
  } finally {
    await restore();
  }

  for (const c of [admin, manager, operator, rider]) c.sock.close();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed: ' + fails.join('; ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
