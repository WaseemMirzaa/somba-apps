/* Cash on delivery, end to end (C-cod): the rider confirms the cash at the door and the server records amount, time and
 * person (a different amount is refused, a repeat records nothing twice); the rider sees the cash they hold; a
 * supervisor or manager of the rider's warehouse records the hand-over (partial allowed, never more than held, tier and
 * warehouse enforced); every step is audited. Runs against a RUNNING dev API that was seeded with `npm run seed`;
 * it switches cash on delivery on for itself.
 *
 *   API_URL=http://localhost:3001 node test/cod-cash-smoke.cjs
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { hubId, tasksOf, toDelivery } = require('./journey.cjs');
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
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
// Ask the API over the socket. The API allows 40 events a second per connection; a test that runs faster than
// that waits a second and asks again, as a well-behaved client would.
const req = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1100));
      continue;
    }
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
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@flows.test`, password: 'Flows-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

(async () => {
  const admin = await login('admin@somba.app');
  const finance = await login('finance@somba.app');
  const mgrK = await login('warehouse@somba.app'); // Entrepôt Kinshasa, manager
  const opK = await login('operator@somba.app'); // Entrepôt Kinshasa, operator
  const supL = await login('warehouse.limete@somba.app'); // Entrepôt Limete, supervisor
  const rider = await login('rider@somba.app'); // Entrepôt Kinshasa
  const riderL = await login('rider.limete@somba.app');
  const cust = await register('codbuyer');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'true' });
  await req(admin.sock, 'settings:set', { key: 'codCapUsd', value: '5000' });
  await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'false' });

  const sellerU = await register('codshop', 'seller');
  const store = (await req(sellerU.sock, 'sellers:register', kyc(`COD Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  await req(sellerU.sock, 'sellers:update', { pickupAddress: '7 Rue du Marché, Limete' });
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  let a = await req(sellerU.sock, 'products:create', { name: `COD item ${tag}`, price: 40, category: 'Electronics', stock: 50 });
  if (!a.ok) throw new Error(`products:create: ${a.error}`);
  const prod = a.data;
  const address = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });
  const placeCod = async (qty) => {
    const r = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty }], paymentMethod: 'cod', shippingAddress: address });
    if (!r.ok) throw new Error(`orders:create (cod): ${r.error}`);
    return r.data;
  };
  const toRoad = async (order) => {
    const t = await toDelivery(admin, rider, order.id);
    await req(rider.sock, 'delivery:updateStatus', { taskId: t.id, status: 'picked_up' });
    await req(rider.sock, 'delivery:updateStatus', { taskId: t.id, status: 'in_transit' });
    return t;
  };
  const taskOf = async (id) => ((await req(admin.sock, 'delivery:list', { limit: 500 })).data ?? []).find((t) => t.id === id);
  const money = (n) => Math.round(n * 100) / 100;

  // The rider's balance before this run (the seed delivers a few cash orders); everything below is measured against it.
  const before = (await req(rider.sock, 'cash:mine')).data;
  ok(before && typeof before.heldUsd === 'number' && Array.isArray(before.handovers), 'a rider reads their cash in hand', JSON.stringify(before));
  const startHeld = before.heldUsd;
  const statsBefore = (await req(rider.sock, 'rider:workStats')).data;
  ok(statsBefore && typeof statsBefore.completed === 'number', 'a rider reads their work stats', JSON.stringify(statsBefore));

  section('Collecting the cash at the door');
  const o1 = await placeCod(1);
  const t1 = await toRoad(o1);
  const due1 = (await taskOf(t1.id)).codAmountUsd;
  ok(due1 > 0 && Math.abs(due1 - o1.totalUsd) < 0.011, 'the delivery task carries the cash to collect', `${due1} vs ${o1.totalUsd}`);
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: 'delivered' });
  ok(!a.ok && /Confirm the cash you collected/.test(a.error ?? ''), 'delivering a COD parcel without confirming the cash is refused', a.error ?? 'was allowed');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: 'delivered', cashUsd: money(due1 - 1) });
  ok(!a.ok && /not the amount to collect/.test(a.error ?? '') && a.error.includes(due1.toFixed(2)), 'a different amount is refused and the message names the amount due', a.error ?? 'was allowed');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: 'delivered', cashUsd: money(due1 + 5) });
  ok(!a.ok, 'more cash than due is refused too');
  const notYet = await taskOf(t1.id);
  ok(notYet.status === 'in_transit' && notYet.codCollectedUsd === null, 'a refused confirmation leaves the task on the road with no cash recorded');
  a = await req(cust.sock, 'cash:mine');
  ok(!a.ok, 'only a rider can read a rider\'s cash in hand', a.error ?? '');
  const t0 = Date.now();
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: 'delivered', cashUsd: due1 });
  ok(a.ok && a.data.status === 'delivered', 'the exact amount completes the delivery', a.error ?? '');
  const done1 = await taskOf(t1.id);
  ok(done1.codCollectedUsd === due1 && done1.codCollectedById === rider.user.id && Math.abs(new Date(done1.codCollectedAt).getTime() - t0) < 60000, 'the task records the amount, the rider and the time', JSON.stringify({ a: done1.codCollectedUsd, by: done1.codCollectedById, at: done1.codCollectedAt }));
  ok(done1.codHandedOverUsd === 0, 'nothing is handed over yet');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: 'delivered', cashUsd: due1 });
  ok(a.ok, 'confirming the same delivery again is harmless', a.error ?? '');
  const again = await taskOf(t1.id);
  ok(again.codCollectedAt === done1.codCollectedAt && again.codCollectedUsd === due1, 'the repeat records nothing twice');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: 'delivered', cashUsd: money(due1 - 1) });
  ok(!a.ok, 'a repeat with a different amount is refused');
  const pay = ((await req(finance.sock, 'payments:list', { limit: 200 })).data ?? []).find((p) => p.orderId === o1.id);
  ok(pay?.status === 'succeeded', 'the COD payment is marked collected', JSON.stringify(pay && pay.status));
  const audit1 = (await req(admin.sock, 'audit:list')).data ?? [];
  ok(audit1.some((l) => l.action === 'payment.cod_collected' && l.actor === rider.user.name && l.detail.includes(due1.toFixed(2))), 'the payment shows who collected how much, in the audit trail');
  ok(audit1.some((l) => l.action === 'cod.collected' && l.entityId === t1.id), 'the delivery shows the cash collection in the audit trail');

  section('Cash in hand and the warehouse count sheet');
  const mine = (await req(rider.sock, 'cash:mine')).data;
  ok(Math.abs(mine.heldUsd - money(startHeld + due1)) < 0.011, 'the rider now holds the cash they collected', `${mine.heldUsd} vs ${startHeld + due1}`);
  const stats = (await req(rider.sock, 'rider:workStats')).data;
  // Getting the parcel to the road also has this rider complete its seller pickup, so `completed` rises by the pickup too: check the delivery by its kind.
  const nOf = (st, kind) => (st.byKind.find((k) => k.kind === kind) ?? { count: 0 }).count;
  ok(stats && nOf(stats, 'delivery') === nOf(statsBefore, 'delivery') + 1 && stats.completed > statsBefore.completed && stats.completedToday - statsBefore.completedToday === stats.completed - statsBefore.completed, 'the delivery shows in the work stats: completed, completed today and the delivery count all went up', JSON.stringify([statsBefore, stats]));
  ok(stats && Math.abs(stats.codCollectedUsd - statsBefore.codCollectedUsd - due1) < 0.011, 'the cash collected in the work stats grew by the amount taken at the door');
  ok(stats && !/earning|perTask/i.test(JSON.stringify(stats)), 'the work stats carry no pay');
  ok(JSON.stringify((await req(rider.sock, 'rider:earnings')).data) === JSON.stringify(stats), 'the old rider:earnings name still answers, with the same payload');
  let rec = (await req(mgrK.sock, 'warehouse:reconcile')).data ?? [];
  let row = rec.find((r) => r.riderId === rider.user.id);
  ok(row && Math.abs(row.heldUsd - mine.heldUsd) < 0.011 && row.collectedUsd >= due1, 'the count sheet shows what the rider collected and still holds', JSON.stringify(row));

  section('Recording the hand-over');
  const held = mine.heldUsd;
  a = await req(opK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
  ok(!a.ok && /supervisors and managers/.test(a.error ?? ''), 'an operator cannot record a hand-over (supervisor tier)', a.error ?? 'was allowed');
  a = await req(cust.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
  ok(!a.ok, 'a customer cannot', a.error ?? '');
  a = await req(rider.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
  ok(!a.ok, 'a rider cannot record their own hand-over', a.error ?? '');
  a = await req(supL.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
  ok(!a.ok && /another warehouse/.test(a.error ?? ''), "another warehouse's supervisor cannot take this rider's cash", a.error ?? 'was allowed');
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: money(held + 0.01) });
  ok(!a.ok && /holds/.test(a.error ?? ''), 'more than the rider holds is refused', a.error ?? 'was allowed');
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: -5 });
  ok(!a.ok, 'a negative amount is refused');
  a = await req(mgrK.sock, 'cash:handover', { riderId: riderL.user.id, amountUsd: 1 });
  ok(!a.ok && /another warehouse/.test(a.error ?? ''), "a manager cannot take another warehouse's rider's cash");
  ok((await req(rider.sock, 'cash:mine')).data.heldUsd === held, 'refused attempts changed nothing');

  const pushed = new Promise((res) => { rider.sock.once('cash:updated', res); setTimeout(() => res(null), 4000); });
  const part = money(Math.min(10, held / 2));
  const ref = `smoke-${tag}`;
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: part, note: 'first part', clientRef: ref });
  ok(a.ok && a.data.handover.amountUsd === part && a.data.handover.receivedById === mgrK.user.id && a.data.handover.receivedByName === mgrK.user.name, 'a manager records a partial hand-over: who, how much', a.error ?? JSON.stringify(a.data));
  ok(a.ok && Math.abs(a.data.balance.heldUsd - money(held - part)) < 0.011, 'the rider balance goes down by that amount', JSON.stringify(a.data?.balance));
  ok(a.ok && !!a.data.handover.createdAt, 'and when');
  ok((await pushed) !== null, 'the rider is told live (cash:updated)');
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: part, note: 'first part', clientRef: ref });
  ok(a.ok && Math.abs(a.data.balance.heldUsd - money(held - part)) < 0.011, 'sending the same receipt again records it once');
  const mine2 = (await req(rider.sock, 'cash:mine')).data;
  ok(Math.abs(mine2.heldUsd - money(held - part)) < 0.011 && mine2.handovers[0]?.amountUsd === part && mine2.handovers[0]?.receivedByName === mgrK.user.name, 'the rider sees the balance and the receipt', JSON.stringify(mine2.handovers[0]));
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: money(held - part + 0.01) });
  ok(!a.ok, 'more than what is left is refused after a partial hand-over');
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: money(held - part) });
  ok(a.ok && a.data.balance.heldUsd === 0, 'the rest can be handed over: the balance reaches zero', a.error ?? JSON.stringify(a.data?.balance));
  a = await req(mgrK.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
  ok(!a.ok && /no cash/.test(a.error ?? ''), 'with nothing held, nothing can be recorded', a.error ?? '');
  rec = (await req(mgrK.sock, 'warehouse:reconcile')).data ?? [];
  row = rec.find((r) => r.riderId === rider.user.id);
  ok(row && row.heldUsd === 0 && row.handedOverUsd >= held && !!row.lastHandoverAt, 'the count sheet shows the hand-over and the last time', JSON.stringify(row));
  const done2 = await taskOf(t1.id);
  ok(done2.codHandedOverUsd > 0 && done2.codHandedOverUsd <= done2.codCollectedUsd, 'the delivery shows how much of its cash was handed in');
  const hist = (await req(opK.sock, 'cash:history')).data ?? [];
  ok(hist.length >= 2 && hist.every((h) => h.hubId === hist[0].hubId) && hist.some((h) => h.note === 'first part'), 'any staff of the warehouse can read the receipts', JSON.stringify(hist.length));
  ok(((await req(supL.sock, 'cash:history')).data ?? []).every((h) => h.riderId !== rider.user.id), "another warehouse does not see this warehouse's receipts");
  ok(!(await req(cust.sock, 'cash:history')).ok, 'a customer cannot read the receipts');
  const audit2 = (await req(admin.sock, 'audit:list')).data ?? [];
  ok(audit2.filter((l) => l.action === 'cod.handover' && l.entityId === rider.user.id).length >= 2, 'every hand-over is in the audit trail', String(audit2.filter((l) => l.action === 'cod.handover').length));

  section('A prepaid delivery needs no cash');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: address });
  const op = a.data;
  const tp = await toRoad(op);
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: tp.id, status: 'delivered', cashUsd: 12 });
  ok(!a.ok && /No cash is due/.test(a.error ?? ''), 'an invented amount on a prepaid delivery is refused', a.error ?? 'was allowed');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: tp.id, status: 'delivered' });
  ok(a.ok, 'a prepaid delivery completes with no cash', a.error ?? '');
  ok((await taskOf(tp.id)).codCollectedUsd === null, 'and records none');

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log(fails.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
