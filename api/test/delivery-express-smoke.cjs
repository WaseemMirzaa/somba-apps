/* Express delivery: when the seller and the customer are in the same commune and the seller has express on, a rider goes straight
 * from the seller to the customer, skipping the warehouse. Runs against a RUNNING dev API seeded with `npm run seed`. It turns
 * express, the delivery code and the Kinshasa warehouse's auto-assignment (open round the clock) on for itself, and puts every
 * setting back. Orders are prepaid (card): nothing is collected at the door.
 *
 *   API_URL=http://localhost:3001 node test/delivery-express-smoke.cjs
 *
 * Scenarios: (1) the store toggle (needs a pin) and the quote: the express fee and date, then orders:create gives ONE express leg
 * (no pickup, no transfer) that waits for the seller. (2) The seller marks it ready, which auto-assigns it; the rider walks
 * picked_up -> in_transit -> delivered with the code; the order status follows, the seller is told "Package collected",
 * and the payment stays succeeded. (3) Each exclusion quotes a standard route: setting off, two sellers, seller toggle off,
 * a different commune, no customer pin, farther than expressMaxKm. (4) Both failures: before collection the express leg opens
 * again; after collection a pickup leg brings the parcel back with the same rider and a normal delivery follows.
 * (5) aged:returnToSeller on an express leg is refused.
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { tasksOf } = require('./journey.cjs');
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
const money = (n) => Math.round(n * 100) / 100;
const rest = async (path, body, token) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && /ThrottlerException/.test(json?.message ?? '') && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const rawReq = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
// Parcel scanning is on by default: each move that needs the boxes scanned first gets them (journey.cjs `withScans`); parcel-scan-smoke.cjs tests the scanning itself.
const scanOpts = {};
const req = require('./journey.cjs').withScans(rawReq, scanOpts);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@express.test`, password: 'Express-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

// A pin alone only finds the nearest commune centroid, so every place also names its commune.
const SELLER_PIN = { lat: -4.3031, lng: 15.3033 }; // the Gombe commune centroid: a pin alone resolves to the nearest commune centroid
const GOMBE = { commune: 'Gombe', pin: { lat: -4.3086, lng: 15.3171 } };
const KALAMU = { commune: 'Kalamu', pin: { lat: -4.3366, lng: 15.3175 } };
const addr = (p) => JSON.stringify({ line1: '1 Test Street', city: 'Kinshasa', ...(p.commune ? { commune: p.commune } : {}), ...(p.pin ? { geo: p.pin } : {}) });
const NEEDS_PIN = 'This store has no pinned pickup location. Ask the seller to pin it in Store settings before turning on express delivery.';
const NO_RETURN = 'An express parcel is still with the seller. Cancel the order instead.';

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  scanOpts.admin = admin; // desk admin: marks a run's boxes in by hand when a run is received
  const finance = await login('finance@somba.app');
  const ops = await login('ops@somba.app');
  const demoRider = await login('rider@somba.app');
  const get = async (key) => (await req(admin.sock, 'settings:get')).data?.[key];
  const KEYS = ['productModeration', 'requireDeliveryCode', 'requireVerifiedForCheckout', 'expressDeliveryEnabled', 'expressDeliveryDays', 'expressBaseUsd', 'expressPerKmUsd', 'expressMaxUsd', 'expressMaxKm'];
  const was = Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, await get(k)])));
  const set = (key, value) => req(admin.sock, 'settings:set', { key, value: String(value) });
  for (const [k, v] of Object.entries({ productModeration: 'false', requireDeliveryCode: 'true', requireVerifiedForCheckout: 'false', expressDeliveryEnabled: 'true', expressDeliveryDays: '1', expressBaseUsd: '3', expressPerKmUsd: '1', expressMaxUsd: '10', expressMaxKm: '0' })) await set(k, v);

  // The Kinshasa warehouse works round the clock and auto-assigns for the duration of the smoke (its own values are put back at the end).
  const kin = ((await req(admin.sock, 'hubs:list')).data ?? []).find((h) => h.name === 'Entrepôt Kinshasa');
  const hubBefore = (await req(admin.sock, 'hubSettings:get', { hubId: kin.id })).data;
  await req(admin.sock, 'hubSettings:update', { hubId: kin.id, autoAssign: true, workStart: '00:00', workEnd: '23:59', workDays: [1, 2, 3, 4, 5, 6, 7] });

  const riderTasks = async () => (await req(demoRider.sock, 'rider:tasks')).data ?? [];
  const legsOf = async (orderId, kind) => (await tasksOf(admin, orderId)).filter((t) => (kind ? t.kind === kind : true));
  const statusOf = async (cust, orderId) => (await req(cust.sock, 'orders:list')).data.find((o) => o.id === orderId);
  const payOf = async (orderId) => ((await req(finance.sock, 'payments:list', { limit: 300 })).data ?? []).find((p) => p.orderId === orderId);
  /** The leg is the demo rider's (auto-assignment may have picked another rider of the warehouse). */
  const toDemoRider = async (taskId) => {
    const a = await req(admin.sock, 'logistics:assign', { taskId, riderId: demoRider.user.id });
    if (!a.ok) throw new Error(`assign: ${a.error}`);
  };
  const forward = async (taskId, status, extra = {}) => req(demoRider.sock, 'delivery:updateStatus', { taskId, status, ...extra });

  const makeSeller = async (label, pin = true) => {
    const u = await register(label, 'seller');
    const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
    await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    await req(u.sock, 'sellers:update', { pickupAddress: '14 Avenue du Commerce, Gombe', ...(pin ? { pickupLat: SELLER_PIN.lat, pickupLng: SELLER_PIN.lng } : {}) });
    return { ...u, store };
  };

  // ── 1. The toggle, the quote, the order ─────────────────────────────────────────────────────────────────────────
  section('Express is KOMORIKO\'s switch (sellers:setExpress); it needs a pinned pickup location');
  // a support agent and a moderator (fresh accounts, promoted, then signed in again: a role change ends the old session)
  const promote = async (label, role) => {
    const u = await register(label);
    const r = await req(admin.sock, 'roles:setRole', { id: u.user.id, role });
    if (!r.ok) throw new Error(`setRole ${role}: ${r.error}`);
    u.sock.close();
    return login(`${label}${tag}@express.test`, 'Express-Pass-2026');
  };
  const support = await promote('exsupport', 'admin_support');
  const moderator = await promote('exmod', 'admin_moderation');
  const nopin = await makeSeller('exnopin', false);
  let a = await req(nopin.sock, 'sellers:update', { expressDelivery: true });
  ok(a.ok, 'a seller sending expressDelivery (an old client) is ignored without an error', a.error ?? '');
  ok((await req(nopin.sock, 'sellers:mine')).data?.expressDelivery === false, 'and express stays off: it is not the seller\'s to switch');
  ok(!(await req(nopin.sock, 'sellers:setExpress', { sellerId: nopin.store.id, enabled: true })).ok, 'a seller cannot call sellers:setExpress');
  for (const [who, role] of [[support, 'support'], [finance, 'finance'], [moderator, 'moderation']]) ok(!(await req(who.sock, 'sellers:setExpress', { sellerId: nopin.store.id, enabled: true })).ok, `${role} cannot switch express`);
  a = await req(admin.sock, 'sellers:setExpress', { sellerId: nopin.store.id, enabled: true });
  ok(!a.ok && a.error === NEEDS_PIN, 'admin cannot switch it on for a store with no pin, with the pin message', a.error ?? 'was allowed');
  a = await req(admin.sock, 'sellers:setExpress', { sellerId: nopin.store.id, enabled: 'yes' });
  ok(!a.ok && a.error === 'Express delivery must be true or false.', 'a non-boolean is refused', a.error ?? 'was allowed');
  a = await req(admin.sock, 'sellers:setExpress', { sellerId: 'nope', enabled: true });
  ok(!a.ok && /Store not found/.test(a.error ?? ''), 'an unknown store is refused', a.error ?? '');
  await req(nopin.sock, 'sellers:update', { pickupLat: SELLER_PIN.lat, pickupLng: SELLER_PIN.lng });
  a = await req(ops.sock, 'sellers:setExpress', { sellerId: nopin.store.id, enabled: true });
  ok(a.ok && a.data.expressDelivery === true, 'once the seller pins the location, operations switches express on', a.error ?? '');
  ok(await until(async () => (await req(nopin.sock, 'notifications:list')).data?.some((n) => n.title === 'Express delivery turned on')), 'the seller is told');
  a = await req(nopin.sock, 'sellers:update', { pickupLat: null, pickupLng: null });
  ok(a.ok && a.data.expressDelivery === false, 'clearing the pin switches express off', a.error ?? JSON.stringify(a.data?.expressDelivery));

  const shop = await makeSeller('exshop');
  a = await req(admin.sock, 'sellers:setExpress', { sellerId: shop.store.id, enabled: true });
  ok(a.ok && a.data.expressDelivery === true, 'admin switches express on for a pinned store', a.error ?? '');
  const mine = (await req(shop.sock, 'sellers:mine')).data;
  ok(mine?.expressDelivery === true, 'sellers:mine carries expressDelivery');
  const prod = (await req(shop.sock, 'products:create', { name: `Express kettle ${tag}`, price: 30, category: 'Electronics', stock: 50 })).data;
  ok(prod?.status === 'live', 'the store lists a live product', JSON.stringify(prod?.status));
  const pub = (await req(admin.sock, 'sellers:storefront', { id: shop.store.id })).data;
  ok(pub?.seller?.expressDelivery === true && pub.products?.[0]?.sellerExpressDelivery === true, 'the public storefront and its products carry expressDelivery / sellerExpressDelivery', JSON.stringify([pub?.seller?.expressDelivery, pub?.products?.[0]?.sellerExpressDelivery]));
  const cust = await register('exbuyer');
  const line = (p, qty = 1) => ({ productId: p.id, qty });
  const quote = (place, lines, extra = {}) => req(cust.sock, 'delivery:quote', { city: 'Kinshasa', ...(place.commune ? { commune: place.commune } : {}), ...(place.pin ? { geo: place.pin } : {}), lines, ...extra });

  section('The quote: express fee and date');
  let q = (await quote(GOMBE, [line(prod)])).data;
  ok(q?.deliveryMode === 'express' && q.express === true, 'a same-commune order quotes express', JSON.stringify([q?.deliveryMode, q?.express]));
  ok(q && q.transfer === false && q.transferUsd === 0 && q.feeOverrideUsd === null && q.extraDays === 0 && (q.origins?.[0]?.hops ?? []).length === 0, 'no transfer, no hops, no extra days, no area flat fee');
  ok(q && Math.abs(q.feeUsd - Math.min(10, 3 + 1 * q.distanceKm)) < 0.02 && q.distanceKm > 0, 'the fee is min(max, base + perKm x km) from the seller pin to the customer pin', JSON.stringify([q?.feeUsd, q?.distanceKm]));
  ok(q?.prepDays === 2 && q.routeDays === 1 && q.estimateDays === 3 && /^\d{4}-\d{2}-\d{2}$/.test(q.estimatedDeliveryDate ?? ''), 'the days are prep 2 + expressDeliveryDays 1, with a date', JSON.stringify([q?.prepDays, q?.routeDays, q?.estimateDays, q?.estimatedDeliveryDate]));

  section('orders:create gives one express leg that waits for the seller');
  const place = async (lines, method = 'stripe_card', where = GOMBE) => {
    const r = await req(cust.sock, 'orders:create', { items: lines, paymentMethod: method, shippingAddress: addr(where) });
    if (!r.ok) throw new Error(`orders:create: ${r.error}`);
    return r.data;
  };
  const order = await place([line(prod)]);
  ok(order.deliveryMode === 'express' && order.estimatedDeliveryDate === q.estimatedDeliveryDate, 'the order records deliveryMode express and the quoted date', JSON.stringify([order.deliveryMode, order.estimatedDeliveryDate, q.estimatedDeliveryDate]));
  ok(Math.abs(order.deliveryFeeUsd - q.feeUsd) < 0.011, 'it charges exactly the quoted fee', `${order.deliveryFeeUsd} vs ${q.feeUsd}`);
  const legs = await until(async () => { const l = await legsOf(order.id); return l.length ? l : null; });
  ok(legs?.length === 1 && legs[0].kind === 'express', 'ONE leg, of kind express: no pickup, no transfer, no delivery', JSON.stringify(legs?.map((l) => l.kind)));
  const leg = legs?.[0];
  ok(leg && leg.hubId === kin.id && leg.fromHubId === null && leg.toHubId === null && leg.sellerId === shop.store.id, 'it has no warehouse at either end and is managed by the Kinshasa warehouse', JSON.stringify([leg?.hubId === kin.id, leg?.fromHubId, leg?.toHubId]));
  ok(leg && JSON.stringify(leg.sellerIds) === JSON.stringify([shop.store.id]) && leg.status === 'unassigned' && leg.readyAt === null, 'it carries the seller and is not offered to a rider before the seller is ready', JSON.stringify([leg?.sellerIds, leg?.status, leg?.readyAt]));
  ok((await payOf(order.id))?.status === 'succeeded', 'the payment succeeded from the start (prepaid)');
  await sleep(1500);
  ok((await legsOf(order.id, 'express'))[0].status === 'unassigned', 'it stays unassigned while the seller has not packed it (auto-assignment waits)');
  a = await req(admin.sock, 'aged:returnToSeller', { taskId: leg.id });
  ok(!a.ok && a.error === NO_RETURN, 'aged:returnToSeller on an express leg is refused with the dedicated message', a.error ?? 'was allowed');

  // ── 2. The lifecycle ────────────────────────────────────────────────────────────────────────────────────────────
  section('The seller marks it ready: it is auto-assigned, and the rider walks it to the customer');
  a = await req(shop.sock, 'orders:sellerReady', { orderId: order.id });
  ok(a.ok && a.data.kind === 'express', 'orders:sellerReady finds the express leg', a.error ?? JSON.stringify(a.data?.kind));
  const assigned = await until(async () => { const l = (await legsOf(order.id, 'express'))[0]; return l?.status === 'assigned' ? l : null; });
  ok(assigned && assigned.readyAt && assigned.riderId, 'marking it ready auto-assigns it to a rider of the warehouse', JSON.stringify(assigned && [assigned.status, assigned.riderId]));
  await toDemoRider(leg.id);
  ok((await statusOf(cust, order.id)).status === 'processing', 'the order is processing once a rider is assigned', (await statusOf(cust, order.id)).status);
  const sellerNotes = () => req(shop.sock, 'notifications:list').then((r) => (r.data ?? []).map((n) => n.title));
  ok((await sellerNotes()).includes('Pickup scheduled'), 'the seller was told "Pickup scheduled"');
  const row = (await riderTasks()).find((t) => t.id === leg.id);
  ok(row && row.kind === 'express' && row.from?.type === 'seller' && row.to?.type === 'customer' && row.needsCode === true && row.completesOrder === true && row.order?.items?.length === 1, 'the rider sees the express leg, from the seller to the customer, with the code to ask for', JSON.stringify(row && [row.kind, row.from?.type, row.to?.type, row.needsCode]));
  a = await forward(leg.id, 'picked_up');
  ok(a.ok && a.data.status === 'picked_up', 'the rider collects the parcel from the seller', a.error ?? '');
  let view = await statusOf(cust, order.id);
  ok(view.status === 'shipped' && view.items.every((i) => i.fulfilment === 'received'), 'the order is shipped and the lines are received (the seller can no longer cancel)', JSON.stringify([view.status, view.items.map((i) => i.fulfilment)]));
  ok(view.rider?.name === demoRider.user.name, 'the customer sees the rider');
  ok((await sellerNotes()).includes('Package collected'), 'the seller was told "Package collected"');
  a = await forward(leg.id, 'in_transit');
  ok(a.ok && (await statusOf(cust, order.id)).status === 'out_for_delivery', 'in transit: out for delivery');
  const code = (await req(cust.sock, 'orders:deliveryCode', { orderId: order.id })).data;
  ok(code?.required === true && /^\d{4}$/.test(code?.code ?? ''), 'the customer has the code of the express leg', JSON.stringify(code));
  a = await forward(leg.id, 'delivered', { code: '0000' });
  ok(!a.ok && /Wrong delivery code/.test(a.error ?? ''), 'a wrong code is refused', a.error ?? 'was allowed');
  a = await forward(leg.id, 'picked_up');
  ok(!a.ok && a.error === 'An express delivery that is in transit cannot become picked up.', 'a status that is not allowed is refused in the leg\'s own words ("An express delivery …")', a.error ?? 'was allowed');
  a = await forward(leg.id, 'delivered', { code: code.code });
  ok(a.ok && a.data.status === 'delivered', 'the code alone hands the parcel over', a.error ?? '');
  view = await statusOf(cust, order.id);
  ok(view.status === 'delivered' && view.items.every((i) => !!i.deliveredAt), 'the order is delivered and its lines are stamped', view.status);
  const pay = await payOf(order.id);
  ok(pay && pay.status === 'succeeded' && Math.abs(pay.amountUsd - order.totalUsd) < 0.011, 'the payment is still the one succeeded payment for the total', JSON.stringify(pay && [pay.status, pay.amountUsd]));

  // ── 3. Every exclusion is a standard route ─────────────────────────────────────────────────────────────────────
  section('Each exclusion quotes a standard route');
  const standard = async (name, placeArg, lines) => {
    const r = await quote(placeArg, lines);
    ok(r.ok && r.data.deliveryMode === 'standard' && r.data.express === false, name, JSON.stringify(r.ok ? [r.data.deliveryMode, r.data.express] : r.error));
    return r.data;
  };
  await set('expressDeliveryEnabled', 'false');
  await standard('the setting is off', GOMBE, [line(prod)]);
  await set('expressDeliveryEnabled', 'true');
  const shop2 = await makeSeller('exshop2');
  await req(admin.sock, 'sellers:setExpress', { sellerId: shop2.store.id, enabled: true });
  const prod2 = (await req(shop2.sock, 'products:create', { name: `Express lamp ${tag}`, price: 20, category: 'Electronics', stock: 50 })).data;
  await standard('two sellers (both with express on)', GOMBE, [line(prod), line(prod2)]);
  await req(admin.sock, 'sellers:setExpress', { sellerId: shop.store.id, enabled: false });
  const off = await standard('the seller has express off', GOMBE, [line(prod)]);
  ok(off && off.transfer === false && off.estimateDays === 3 && off.routeDays === 1, 'a standard quote keeps the local days (prep 2 + 1) and no transfer', JSON.stringify([off?.estimateDays, off?.routeDays]));
  await req(admin.sock, 'sellers:setExpress', { sellerId: shop.store.id, enabled: true });
  const far = await standard('a different commune (Kalamu, same warehouse)', KALAMU, [line(prod)]);
  ok(far && far.destinationHubId === kin.id, 'the other commune is still served by the same warehouse', far?.destinationHubName);
  await standard('the customer has no pin', { commune: 'Gombe' }, [line(prod)]);
  await set('expressMaxKm', '0.01');
  await standard('farther than expressMaxKm', GOMBE, [line(prod)]);
  await set('expressMaxKm', '0');
  q = (await quote(GOMBE, [line(prod)])).data;
  ok(q?.deliveryMode === 'express', 'switching everything back brings express back', q?.deliveryMode);
  const stdOrder = await (async () => { await set('expressDeliveryEnabled', 'false'); const o = await place([line(prod)]); await set('expressDeliveryEnabled', 'true'); return o; })();
  ok(stdOrder.deliveryMode === 'standard', 'an order placed with the setting off is recorded standard', stdOrder.deliveryMode);
  const stdLegs = await until(async () => { const l = await legsOf(stdOrder.id); return l.length ? l : null; });
  ok(stdLegs?.length === 1 && stdLegs[0].kind === 'pickup', 'and gets the usual pickup leg (never an express one)', JSON.stringify(stdLegs?.map((l) => l.kind)));
  await req(admin.sock, 'orders:adminCancel', { orderId: stdOrder.id, reason: 'smoke clean-up' });

  // ── 4. Failures ─────────────────────────────────────────────────────────────────────────────────────────────────
  const express = async () => {
    const o = await place([line(prod)]);
    const l = (await until(async () => { const x = await legsOf(o.id, 'express'); return x.length ? x : null; }))[0];
    const r = await req(shop.sock, 'orders:sellerReady', { orderId: o.id });
    if (!r.ok) throw new Error(`sellerReady: ${r.error}`);
    await until(async () => (await legsOf(o.id, 'express'))[0].status === 'assigned');
    await toDemoRider(l.id);
    return { order: o, leg: l };
  };
  section('A failure before the rider collected the parcel: the same express leg opens again');
  const f1 = await express();
  a = await forward(f1.leg.id, 'failed', { reason: 'Seller closed' });
  ok(a.ok, 'the rider reports the seller was closed', a.error ?? '');
  const again = await until(async () => { const x = (await legsOf(f1.order.id, 'express')).filter((t) => t.status !== 'failed'); return x.length ? x[0] : null; });
  ok(again && again.attempts === 2 && again.id !== f1.leg.id, 'a new express leg for attempt 2', JSON.stringify(again && [again.attempts, again.status]));
  ok((await legsOf(f1.order.id, 'pickup')).length === 0, 'no pickup leg: the parcel never left the seller');
  const st1 = (await statusOf(cust, f1.order.id)).status;
  ok(['confirmed', 'processing'].includes(st1), 'the order goes back (confirmed, then processing again once the re-opened leg is assigned), never forward', st1);
  ok(again && again.readyAt, 'the new leg is still ready (the seller already packed it)');
  await req(admin.sock, 'orders:adminCancel', { orderId: f1.order.id, reason: 'smoke clean-up' });

  section('A failure after the rider collected the parcel: it comes back with the same rider, then a normal delivery');
  const f2 = await express();
  await forward(f2.leg.id, 'picked_up');
  await forward(f2.leg.id, 'in_transit');
  a = await forward(f2.leg.id, 'failed', { reason: 'Customer not reachable' });
  ok(a.ok, 'the rider reports the customer was not reachable', a.error ?? '');
  const back = await until(async () => (await legsOf(f2.order.id, 'pickup'))[0]);
  ok(back && back.status === 'picked_up' && back.riderId === demoRider.user.id && back.toHubId === kin.id && back.parentTaskId === f2.leg.id, 'a pickup leg for the SAME rider, already picked up, to the warehouse, linked to the express leg', JSON.stringify(back && [back.status, back.riderId === demoRider.user.id, back.toHubId === kin.id, back.parentTaskId === f2.leg.id]));
  const keep = await statusOf(cust, f2.order.id);
  ok(keep.status === 'out_for_delivery', 'the order keeps its status (it is not sent back to confirmed around goods on the road)', keep.status);
  ok((await riderTasks()).some((t) => t.id === back?.id && t.kind === 'pickup'), 'the rider\'s list shows the pickup back to the warehouse');
  a = await req(admin.sock, 'logistics:scanIn', { taskId: back.id });
  ok(a.ok, 'warehouse staff scan the parcel in', a.error ?? '');
  const next = await until(async () => (await legsOf(f2.order.id, 'delivery'))[0]);
  ok(next && next.attempts === 2 && next.hubId === kin.id && JSON.stringify(next.sellerIds) === JSON.stringify([shop.store.id]), 'a normal delivery leg follows from the warehouse, counted as the second attempt', JSON.stringify(next && [next.attempts, next.sellerIds]));
  await toDemoRider(next.id);
  await forward(next.id, 'picked_up');
  await forward(next.id, 'in_transit');
  const code2 = (await req(cust.sock, 'orders:deliveryCode', { orderId: f2.order.id })).data?.code;
  a = await forward(next.id, 'delivered', { code: code2 });
  ok(a.ok && (await statusOf(cust, f2.order.id)).status === 'delivered', 'the delivery hands it over and the order is delivered', a.error ?? '');
  const pay2 = await payOf(f2.order.id);
  ok(pay2 && pay2.status === 'succeeded' && Math.abs(pay2.amountUsd - f2.order.totalUsd) < 0.011, 'the payment is one succeeded payment for the total', JSON.stringify(pay2 && [pay2.status, pay2.amountUsd]));

  await req(admin.sock, 'hubSettings:update', { hubId: kin.id, autoAssign: !!hubBefore.autoAssign, workStart: hubBefore.workStart, workEnd: hubBefore.workEnd, workDays: hubBefore.workDays });
  for (const [key, value] of Object.entries(was)) if (value !== undefined) await set(key, value);
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
