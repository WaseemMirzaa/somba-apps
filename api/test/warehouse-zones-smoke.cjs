/* Warehouses, zones and riders: each zone belongs to a warehouse, riders and warehouse staff have a home
 * warehouse, and a new delivery only reaches the riders of the warehouse that serves its zone. Runs against a
 * RUNNING dev API that was seeded with `npm run seed`. It adds two throwaway zones and puts the setting back.
 *
 *   API_URL=http://localhost:3001 node test/warehouse-zones-smoke.cjs
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
  for (let i = 0; i < 4; i++) {
    const r = await rest('/api/v1/auth/login', { email, password: pw });
    if (r.status === 200) return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
    if (r.status !== 429) throw new Error(`login ${email}: ${r.status}`);
    await sleep(15000);
  }
  throw new Error(`login ${email}: rate limited`);
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@zones.test`, password: 'Zones-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
/** Collect a socket's events of one name while the test runs. */
const record = (sock, ev) => { const seen = []; sock.on(ev, (p) => seen.push(p)); return seen; };

(async () => {
  const admin = await login('admin@somba.app');
  const cust = await register('zbuyer');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });
  const original = (await req(admin.sock, 'settings:get')).data.deliveryZones;

  try {
    // ---- two warehouses, one zone each -------------------------------------------------
    section('Zones belong to a warehouse');
    let hubs = ((await req(admin.sock, 'warehouse:hubs', { activeOnly: true })).data ?? []).filter((h) => h.active !== false);
    while (hubs.length < 2) {
      const made = await req(admin.sock, 'warehouse:saveHub', { name: `Zone test hub ${tag}-${hubs.length}`, city: 'Kinshasa', country: 'DRC', capacity: 100 });
      hubs = [...hubs, made.data];
    }
    const [H1, H2] = hubs;
    const zoneA = { id: `wza${tag}`, name: `Alpha ${tag}`, nameFr: `Alpha ${tag}`, city: 'Kinshasa', feeUsd: 2, hubId: H1.id };
    const zoneB = { id: `wzb${tag}`, name: `Beta ${tag}`, nameFr: `Beta ${tag}`, city: 'Kinshasa', feeUsd: 2, hubId: H2.id };
    const base = (() => { try { return JSON.parse(original ?? '[]'); } catch { return []; } })();
    let a = await req(admin.sock, 'settings:set', { key: 'deliveryZones', value: JSON.stringify([...base, { ...zoneA, hubId: 'no-such-hub' }]) });
    ok(!a.ok, 'a zone pointing at an unknown warehouse is refused', a.error ?? '');
    a = await req(admin.sock, 'settings:set', { key: 'deliveryZones', value: JSON.stringify([...base, zoneA, zoneB]) });
    ok(a.ok, 'the admin ties each zone to a warehouse', a.error ?? '');

    // ---- riders and staff get a home warehouse --------------------------------------------
    section('Riders and warehouse staff have a home warehouse');
    const mk = async (role, label) => {
      const r = await req(admin.sock, 'roles:createStaff', { email: `${label}${tag}@zones.test`, name: `${label} ${tag}`, role });
      if (!r.ok) throw new Error(`createStaff ${label}: ${r.error}`);
      return r.data;
    };
    const riderA = await mk('rider', 'ridera');
    const riderB = await mk('rider', 'riderb');
    const staffA = await mk('warehouse_staff', 'staffa');
    a = await req(admin.sock, 'roles:setHub', { userId: cust.user.id, hubId: H1.id });
    ok(!a.ok, 'a customer cannot be given a warehouse');
    a = await req(admin.sock, 'roles:setHub', { userId: riderA.id, hubId: H1.id, preferredZones: [zoneB.id] });
    ok(!a.ok && /zone/i.test(a.error ?? ''), "a rider cannot prefer another warehouse's zone", a.error ?? '');
    a = await req(admin.sock, 'roles:setHub', { userId: riderA.id, hubId: H1.id, preferredZones: [zoneA.id] });
    ok(a.ok && a.data.hubId === H1.id && a.data.preferredZones[0] === zoneA.id, 'rider A works at warehouse 1 and prefers zone A', a.error ?? '');
    a = await req(admin.sock, 'roles:setHub', { userId: staffA.id, hubId: H1.id, preferredZones: [zoneA.id] });
    ok(!a.ok, 'only riders have preferred zones');
    ok((await req(admin.sock, 'roles:setHub', { userId: staffA.id, hubId: H1.id })).ok, 'staff A works at warehouse 1');
    ok((await req(admin.sock, 'roles:setHub', { userId: riderB.id, hubId: H2.id })).ok, 'rider B works at warehouse 2');
    const staffList = (await req(admin.sock, 'roles:staff')).data ?? [];
    ok(staffList.find((u) => u.id === riderA.id)?.hubId === H1.id, 'the staff list shows the home warehouse');

    // Sign in after the change (setHub drops open sockets so they rejoin the right rooms).
    const rA = await login(riderA.email, riderA.tempPassword);
    const rB = await login(riderB.email, riderB.tempPassword);
    const sA = await login(staffA.email, staffA.tempPassword);
    const me = (await req(rA.sock, 'me:get')).data;
    ok(me?.hubId === H1.id && me?.preferredZones?.[0] === zoneA.id, "the rider's profile carries the warehouse and zones");
    const asg = (await req(rA.sock, 'rider:assignment')).data;
    ok(asg?.hub?.id === H1.id && asg.hubZones.some((z) => z.id === zoneA.id) && asg.preferredZones[0]?.name === zoneA.name, 'the rider sees their warehouse, its zones and their preferred zones by name');
    ok(!(await req(sA.sock, 'rider:assignment')).ok, 'rider:assignment is for riders only');
    ok(!(await req(sA.sock, 'roles:setHub', { userId: riderB.id, hubId: H1.id })).ok, 'warehouse staff cannot move people between warehouses');

    // ---- orders go to the warehouse of their zone -----------------------------------------
    section("A new delivery reaches only its warehouse's riders");
    const sellerU = await register('zshop', 'seller');
    const store = (await req(sellerU.sock, 'sellers:register', kyc(`Zone Store ${tag}`))).data;
    await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    let prod = (await req(sellerU.sock, 'products:create', { name: `Zone item ${tag}`, price: 20, category: 'Electronics', stock: 20 })).data;
    if (prod.status !== 'live') prod = (await req(admin.sock, 'products:update', { id: prod.id, patch: { status: 'live' } })).data;
    const evA = record(rA.sock, 'delivery:updated');
    const evB = record(rB.sock, 'delivery:updated');
    const buy = (zone, addr) => req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', ...(zone ? { zoneId: zone } : {}), shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa', ...addr }) });
    a = await buy(zoneA.id, {});
    ok(a.ok, 'an order to zone A is placed', a.error ?? '');
    const oA = a.data;
    a = await buy(null, { commune: `Commune de ${zoneB.name}` });
    ok(a.ok && a.data.zoneId === zoneB.id, 'an order with no zone gets the zone of its commune', a.error ?? a.data?.zoneId);
    const oB = a.data;
    const tA = await until(async () => (await req(admin.sock, 'delivery:list')).data.find((t) => t.orderId === oA.id));
    const tB = await until(async () => (await req(admin.sock, 'delivery:list')).data.find((t) => t.orderId === oB.id));
    ok(tA?.hubId === H1.id, 'the zone A delivery belongs to warehouse 1', tA?.hubId);
    ok(tB?.hubId === H2.id, 'the zone B delivery belongs to warehouse 2', tB?.hubId);

    const ids = async (u, ev) => ((await req(u.sock, ev)).data ?? []).map((t) => t.id);
    let seen = await ids(rA, 'delivery:unassigned');
    ok(seen.includes(tA.id) && !seen.includes(tB.id), "rider A's open list has warehouse 1's delivery only");
    seen = await ids(rB, 'delivery:unassigned');
    ok(seen.includes(tB.id) && !seen.includes(tA.id), "rider B's open list has warehouse 2's delivery only");
    const queueA = (await req(rA.sock, 'rider:tasks')).data ?? [];
    ok(queueA.some((t) => t.id === tA.id) && !queueA.some((t) => t.id === tB.id), "rider A's queue is limited to warehouse 1");
    const mine = queueA.find((t) => t.id === tA.id);
    ok(mine?.preferred === true && mine?.zoneName === zoneA.name, 'the queue names the zone and marks it as one of the rider\'s zones');

    const noticeOf = async (u, taskId) => ((await req(u.sock, 'notifications:list')).data ?? []).find((n) => n.type === 'task' && n.entityId === taskId);
    ok(!!(await until(() => noticeOf(rA, tA.id))), 'rider A is told about the zone A delivery');
    ok(!!(await until(() => noticeOf(rB, tB.id))), 'rider B is told about the zone B delivery');
    await sleep(500);
    ok(!(await noticeOf(rA, tB.id)) && !(await noticeOf(rB, tA.id)), "no rider is told about another warehouse's delivery");
    ok(evA.some((t) => t.id === tA.id) && !evA.some((t) => t.id === tB.id), "rider A's live feed carries warehouse 1's delivery only");
    ok(evB.some((t) => t.id === tB.id) && !evB.some((t) => t.id === tA.id), "rider B's live feed carries warehouse 2's delivery only");

    a = await req(rA.sock, 'delivery:accept', { taskId: tB.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), "a rider cannot take another warehouse's delivery", a.error ?? '');

    // ---- warehouse staff see their own warehouse -----------------------------------------
    section('Warehouse staff work on their own warehouse');
    seen = await ids(sA, 'delivery:list');
    ok(seen.includes(tA.id) && !seen.includes(tB.id), "staff A's parcel list is limited to warehouse 1");
    const riders = ((await req(sA.sock, 'warehouse:riders')).data ?? []).map((r) => r.id);
    ok(riders.includes(riderA.id) && !riders.includes(riderB.id), "staff A's rider list is limited to warehouse 1");
    a = await req(sA.sock, 'warehouse:buildBatch', { taskIds: [tA.id], riderId: riderB.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), "staff cannot batch parcels to another warehouse's rider", a.error ?? '');
    a = await req(sA.sock, 'delivery:assign', { taskId: tB.id, riderId: riderA.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), "staff cannot assign another warehouse's parcel", a.error ?? '');
    const rANotes = record(rA.sock, 'notification:new');
    a = await req(sA.sock, 'warehouse:buildBatch', { taskIds: [tA.id], riderId: riderA.id });
    ok(a.ok, "staff batch warehouse 1's parcel to rider A", a.error ?? '');
    ok(!!(await until(async () => rANotes.find((n) => n.type === 'task')) ), 'rider A is told a delivery was assigned');

    seen = await ids(admin, 'delivery:list');
    ok(seen.includes(tA.id) && seen.includes(tB.id), 'admins see every warehouse');
    seen = ((await req(admin.sock, 'delivery:list', { hubId: H2.id })).data ?? []).map((t) => t.id);
    ok(seen.includes(tB.id) && !seen.includes(tA.id), 'admins can look at one warehouse');
    a = await req(admin.sock, 'delivery:assign', { taskId: tB.id, riderId: riderA.id });
    ok(a.ok, 'an admin may still assign across warehouses', a.error ?? '');

    for (const u of [rA, rB, sA]) u.sock.close();
    for (const id of [riderA.id, riderB.id, staffA.id]) await req(admin.sock, 'roles:setHub', { userId: id, hubId: null });
  } finally {
    await req(admin.sock, 'settings:set', { key: 'deliveryZones', value: original ?? '[]' });
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed:\n - ' + fails.join('\n - ')); process.exitCode = 1; }
  process.exit();
})().catch((e) => { console.error(e); process.exit(1); });
