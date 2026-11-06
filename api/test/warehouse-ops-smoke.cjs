/* Warehouse operations (round 2, D) against a RUNNING dev API seeded with `npm run seed`: the warehouse's own settings (who may
 * change them, validation, audit), the aged-parcel alerts at each level (and that running the job again alerts nobody twice),
 * return to seller, the batch-size limit, auto-assignment (least busy rider; riders never accept or refuse), and the leg
 * analytics (on-time rate, per-rider counts, date range; counts only).
 *
 * The aged-parcel job is run by hand with `warehouseOps:runNow { asOf }`, which moves the job's clock (honoured outside production
 * only), so no test waits 24 hours.
 *
 *   API_URL=http://localhost:3054 node test/warehouse-ops-smoke.cjs
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { hubId: demoHubId, tasksOf, toDelivery } = require('./journey.cjs');
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
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && /ThrottlerException/.test(json?.message ?? '') && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
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
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@ops.test`, password: 'Ops-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const addr = JSON.stringify({ line1: '1 Ops St', city: 'Kinshasa' });
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const allDay = { workStart: '00:00', workEnd: '23:59', workDays: [1, 2, 3, 4, 5, 6, 7], timezone: 'UTC' };

(async () => {
  const admin = await login('admin@somba.app');
  const ops = await login('ops@somba.app');
  const finance = await login('finance@somba.app');
  const manager = await login('warehouse@somba.app'); // manager, Entrepôt Kinshasa
  const operator = await login('operator@somba.app'); // operator, Entrepôt Kinshasa
  const limete = await login('warehouse.limete@somba.app'); // supervisor, Entrepôt Limete
  const rider = await login('rider@somba.app');
  const cust = await register('cust');
  const sellerU = await register('seller', 'seller');
  const store = (await req(sellerU.sock, 'sellers:register', kyc(`Ops Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  const prod = (await req(sellerU.sock, 'products:create', { name: `Ops Item ${tag}`, price: 20, category: 'Electronics', stock: 200 })).data;
  const kin = await demoHubId(admin);
  const lim = await demoHubId(admin, 'Entrepôt Limete');
  ok(!!kin && !!lim, 'the demo warehouses exist');
  const order = async () => (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr })).data;
  const unassignedAt = async (hub) => ((await req(admin.sock, 'logistics:queue', { hubId: hub, status: 'unassigned', limit: 200 })).data?.tasks ?? []);
  const notices = async (u) => (await req(u.sock, 'notifications:list')).data ?? [];
  let a;

  // ── settings ────────────────────────────────────────────────────────────────
  section('Warehouse settings: who may read and change them');
  a = await req(manager.sock, 'hubSettings:get');
  ok(a.ok && a.data.hubId === kin && a.data.canEdit === true, 'the manager reads their warehouse settings and may edit them', JSON.stringify(a));
  ok(a.ok && a.data.agedLevels.length === 3 && a.data.batchSize >= 1 && a.data.autoAssignRule === 'least_busy', 'the settings carry hours, batch size, auto-assignment rule and the three alert ages');
  a = await req(operator.sock, 'hubSettings:get');
  ok(a.ok && a.data.canEdit === false, 'an operator may read them but not edit');
  ok(!(await req(operator.sock, 'hubSettings:update', { batchSize: 7 })).ok, 'an operator cannot change them');
  ok(!(await req(limete.sock, 'hubSettings:update', { hubId: kin, batchSize: 7 })).ok, "a supervisor of another warehouse cannot change this warehouse's settings (hubId ignored, not a manager)");
  ok(!(await req(finance.sock, 'hubSettings:update', { hubId: kin, batchSize: 7 })).ok, 'a finance admin cannot change them');
  ok(!(await req(rider.sock, 'hubSettings:get')).ok, 'a rider cannot read them');
  ok(!(await req(cust.sock, 'hubSettings:get')).ok, 'a customer cannot read them');
  a = await req(admin.sock, 'hubSettings:get');
  ok(!a.ok && /Choose a warehouse/.test(a.error), 'an admin must name the warehouse');

  section('Warehouse settings: validation (server side)');
  for (const [patch, name] of [
    [{ workStart: '19:00', workEnd: '08:00' }, 'closing before opening'],
    [{ workStart: '8am' }, 'a time that is not HH:MM'],
    [{ workDays: [] }, 'no working day'],
    [{ workDays: [0, 9] }, 'weekdays out of range'],
    [{ timezone: 'Mars/Olympus' }, 'an unknown time zone'],
    [{ batchSize: 0 }, 'a batch size of 0'],
    [{ batchSize: 500 }, 'a batch size of 500'],
    [{ autoAssign: 'yes' }, 'auto-assignment that is not a boolean'],
    [{ autoAssignRule: 'random' }, 'an unknown assignment rule'],
    [{ agedLevels: [48, 24, 72] }, 'alert ages out of order'],
    [{ agedLevels: [24, 48] }, 'two alert ages'],
    [{ deliveryTargetHours: 0 }, 'a delivery target of 0'],
  ]) ok(!(await req(manager.sock, 'hubSettings:update', patch)).ok, `refused: ${name}`);
  a = await req(manager.sock, 'hubSettings:get');
  ok(a.data.batchSize !== 500 && a.data.batchSize !== 0, 'nothing invalid was stored');

  section('Warehouse settings: the manager saves (audited), an ops admin edits another warehouse');
  a = await req(manager.sock, 'hubSettings:update', { ...allDay, batchSize: 30, autoAssign: false, agedLevels: [1, 2, 3], deliveryTargetHours: 48 });
  ok(a.ok && a.data.batchSize === 30 && a.data.agedLevels.join() === '1,2,3' && a.data.isDefault === false && a.data.openNow === true, 'the manager saves hours, batch size, ages and target', JSON.stringify(a));
  a = await req(manager.sock, 'hubSettings:get');
  ok(a.data.batchSize === 30 && a.data.deliveryTargetHours === 48 && a.data.workDays.length === 7, 'and reads them back');
  a = await req(manager.sock, 'hubSettings:update', { hubId: lim, batchSize: 11 });
  ok(a.ok && a.data.hubId === kin && a.data.batchSize === 11, "a manager's own hub is used whatever hubId they send");
  a = await req(limete.sock, 'hubSettings:get');
  ok(a.ok && a.data.batchSize === 20, "and the other warehouse's settings did not change");
  await req(manager.sock, 'hubSettings:update', { batchSize: 30 });
  a = await req(ops.sock, 'hubSettings:update', { hubId: lim, batchSize: 25, agedLevels: [10, 20, 30] });
  ok(a.ok && a.data.hubId === lim && a.data.batchSize === 25, 'an operations admin changes another warehouse');
  a = await req(limete.sock, 'hubSettings:get');
  ok(a.ok && a.data.batchSize === 25 && a.data.canEdit === false, 'its supervisor sees the change but cannot edit');
  a = await req(admin.sock, 'audit:list', { action: 'hub.settings.updated' });
  ok(a.ok && a.data.some((l) => /batchSize 20 -> 30|batchSize \d+ -> 30/.test(l.detail ?? '')) && a.data.some((l) => l.entityId === lim), 'both changes are in the audit log with before and after');
  await req(ops.sock, 'hubSettings:update', { hubId: lim, batchSize: 20, agedLevels: [24, 48, 72] });

  // ── analytics (a delivered order, auto-assignment off) ─────────────────────
  section('Analytics: on-time rate, time per leg, per-rider counts');
  const o1 = await order();
  const t1 = await toDelivery(admin, rider, o1.id);
  for (const st of ['picked_up', 'in_transit', 'delivered']) a = await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: st });
  ok(a.ok, 'the rider completes the delivery', JSON.stringify(a));
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  a = await req(manager.sock, 'analytics:legs', { from: today, to: tomorrow });
  ok(a.ok, 'a manager reads the leg analytics', JSON.stringify(a));
  const an = a.data;
  ok(an?.targetHours === 48 && an.onTime.deliveries >= 1 && an.onTime.ratePct === 100, 'the delivery handed over within the 48 h target counts as on time', JSON.stringify(an?.onTime));
  ok(an?.legs.some((l) => l.kind === 'delivery' && l.completed >= 1 && typeof l.avgHours === 'number'), 'average time per leg by kind');
  const row = an?.riders.find((r) => r.riderId === rider.user.id);
  ok(!!row && row.completed >= 1 && typeof row.successRatePct === 'number', 'per-rider completed, failed and success rate');
  ok(!/usd|pay|salary|earn|wage|commission/i.test(JSON.stringify(an)), 'analytics carry counts and times only: no pay');
  a = await req(manager.sock, 'analytics:legs', { from: '2020-01-01', to: '2020-01-02' });
  ok(a.ok && a.data.onTime.deliveries === 0 && a.data.onTime.ratePct === null && a.data.riders.length === 0, 'a period with no deliveries has no rate and no riders');
  ok(!(await req(manager.sock, 'analytics:legs', { from: tomorrow, to: today })).ok, 'a start date after the end date is refused');
  ok(!(await req(manager.sock, 'analytics:legs', { from: '2015-01-01', to: today })).ok, 'a period longer than a year is refused');
  ok(!(await req(manager.sock, 'analytics:legs', { from: 'soon' })).ok, 'a bad date is refused');
  ok(!(await req(operator.sock, 'analytics:legs', {})).ok, 'an operator cannot read the analytics');
  ok((await req(finance.sock, 'analytics:legs', { hubId: kin })).ok, 'an admin can, for one warehouse');
  ok(!(await req(rider.sock, 'analytics:legs', {})).ok, 'a rider cannot');

  // ── aged parcels ────────────────────────────────────────────────────────────
  section('Aged parcels: alert levels, escalation, idempotency');
  const o2 = await order();
  const stuck = await toDelivery(admin, rider, o2.id, { assign: false }); // a delivery leg waiting at the warehouse
  ok(stuck.status === 'unassigned', 'a delivery leg is waiting at the warehouse');
  ok(!(await req(manager.sock, 'warehouseOps:runNow')).ok, 'a manager cannot run the job by hand');
  a = await req(admin.sock, 'warehouseOps:runNow', { asOf: hoursFromNow(1.5) });
  ok(a.ok && a.data.aged.alerted >= 1, 'level 1 (1 h in this test) alerts', JSON.stringify(a));
  a = await req(manager.sock, 'aged:summary', { asOf: hoursFromNow(1.5) });
  ok(a.ok && a.data.levels.join() === '1,2,3' && a.data.byTask[stuck.id]?.level === 1 && a.data.byTask[stuck.id]?.alertedAt, 'the aged board shows level 1 and when it was alerted', JSON.stringify(a.data?.byTask?.[stuck.id]));
  let mine = await notices(manager);
  ok(mine.some((n) => n.title === 'Aged parcel' && n.entityId === stuck.id), 'the warehouse is told in-app (no supervisor here, so the manager)');
  ok(mine.some((n) => n.title === 'Aged parcel' && n.entityId === stuck.id && /Colis|colis|tâche|ouverte/.test(`${n.titleFr ?? ''}${n.bodyFr ?? ''}`)), 'with its French text');
  const before = mine.filter((n) => n.entityId === stuck.id).length;
  a = await req(admin.sock, 'warehouseOps:runNow', { asOf: hoursFromNow(1.5) });
  ok(a.ok && a.data.aged.alerted === 0, 'running the job again alerts nobody twice', JSON.stringify(a));
  ok((await notices(manager)).filter((n) => n.entityId === stuck.id).length === before, 'and sends no second notice');
  a = await req(admin.sock, 'warehouseOps:runNow', { asOf: hoursFromNow(2.5) });
  ok(a.ok && a.data.aged.alerted >= 1, 'level 2 alerts as the parcel ages');
  a = await req(admin.sock, 'warehouseOps:runNow', { asOf: hoursFromNow(3.5) });
  ok(a.ok && a.data.aged.alerted >= 1, 'level 3, the last, escalates');
  a = await req(manager.sock, 'aged:summary', { asOf: hoursFromNow(3.5) });
  ok(a.ok && a.data.byTask[stuck.id]?.level === 3 && a.data.counts[2] >= 1, 'the board shows level 3');
  ok((await notices(manager)).some((n) => n.title === 'Parcel escalated' && n.entityId === stuck.id), 'the manager is told of the escalation');
  ok((await notices(admin)).some((n) => n.title === 'Parcel escalated' && n.entityId === stuck.id), 'and the admins');
  a = await req(admin.sock, 'warehouseOps:runNow', { asOf: hoursFromNow(200) });
  ok(a.ok && a.data.aged.alerted === 0, 'nothing more after the last level');
  ok(!(await req(operator.sock, 'aged:summary')).ok, 'an operator cannot read the aged board');

  section('Return to seller');
  ok(!(await req(operator.sock, 'aged:returnToSeller', { taskId: stuck.id })).ok, 'an operator cannot return a parcel');
  ok(!(await req(limete.sock, 'aged:returnToSeller', { taskId: stuck.id })).ok, "another warehouse's supervisor cannot");
  ok(!(await req(rider.sock, 'aged:returnToSeller', { taskId: stuck.id })).ok, 'a rider cannot');
  a = await req(manager.sock, 'aged:returnToSeller', { taskId: stuck.id });
  ok(a.ok && a.data.closed.status === 'failed' && a.data.closed.failureReason === 'Returned to seller' && a.data.legs.length >= 1 && a.data.legs.every((l) => l.kind === 'return_to_seller' && l.fromHubId === kin && l.status === 'unassigned'), 'the manager sends it back: the delivery closes and a return leg opens', JSON.stringify(a));
  const legIds = (a.data?.legs ?? []).map((l) => l.id).sort();
  a = await req(manager.sock, 'aged:returnToSeller', { taskId: stuck.id });
  ok(a.ok && a.data.legs.map((l) => l.id).sort().join() === legIds.join(), 'doing it again returns the same legs (idempotent)');
  const live = (await tasksOf(admin, o2.id)).filter((t) => t.kind === 'return_to_seller');
  ok(live.length === legIds.length, 'no duplicate return legs were created');
  ok((await notices(admin)).some((n) => n.title === 'Parcel returned to seller'), 'the admins are told to review the order');
  const o3 = await order();
  const moving = await toDelivery(admin, rider, o3.id); // assigned to the rider
  await req(rider.sock, 'delivery:updateStatus', { taskId: moving.id, status: 'picked_up' });
  a = await req(manager.sock, 'aged:returnToSeller', { taskId: moving.id });
  ok(!a.ok && /rider already has/.test(a.error), 'a parcel a rider already has cannot be returned', JSON.stringify(a));
  const pk = (await tasksOf(admin, o3.id)).find((t) => t.kind === 'pickup');
  ok(!(await req(manager.sock, 'aged:returnToSeller', { taskId: pk.id })).ok, 'only the customer delivery can be returned');
  ok(!(await req(manager.sock, 'aged:returnToSeller', { taskId: 'nope' })).ok, 'an unknown task is refused');
  for (const st of ['in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: moving.id, status: st });

  // ── batch size ──────────────────────────────────────────────────────────────
  section('Batch size limit');
  await req(manager.sock, 'hubSettings:update', { batchSize: 1 });
  const p1 = await order();
  const p2 = await order();
  await sleep(300);
  const pend = (await unassignedAt(kin)).filter((t) => [p1.id, p2.id].includes(t.orderId));
  ok(pend.length >= 2, 'two parcels are waiting for a rider', String(pend.length));
  a = await req(manager.sock, 'warehouse:buildBatch', { taskIds: pend.slice(0, 2).map((t) => t.id), riderId: rider.user.id });
  ok(!a.ok && /at most 1 parcel/.test(a.error), 'a batch over the warehouse limit is refused by the server', JSON.stringify(a));
  a = await req(manager.sock, 'warehouse:buildBatch', { taskIds: [pend[0].id], riderId: rider.user.id });
  ok(a.ok, 'a batch within the limit is made');
  await req(manager.sock, 'hubSettings:update', { batchSize: 30 });

  // ── auto-assignment ─────────────────────────────────────────────────────────
  section('Auto-assignment: least busy rider, nobody accepts');
  a = await req(rider.sock, 'delivery:accept', { taskId: pend[1].id });
  ok(!a.ok, 'a rider still cannot accept a task: the warehouse assigns every task', JSON.stringify(a));
  const created = await req(admin.sock, 'roles:createStaff', { email: `rider2.${tag}@ops.test`, name: 'Second Rider', role: 'rider', hubId: kin });
  ok(created.ok, 'a second rider joins Entrepôt Kinshasa', JSON.stringify(created));
  const riders = (await req(manager.sock, 'warehouse:riders')).data ?? [];
  ok(riders.length >= 2, 'the warehouse has two active riders');
  a = await req(manager.sock, 'hubSettings:update', { ...allDay, autoAssign: true });
  ok(a.ok && a.data.autoAssign === true && a.data.openNow === true, 'the manager switches auto-assignment on');
  const loadBefore = new Map(((await req(manager.sock, 'warehouse:riders')).data ?? []).map((r) => [r.id, r.activeTasks]));
  const minLoad = Math.min(...loadBefore.values());
  const o4 = await order();
  await sleep(400);
  const pickup4 = (await tasksOf(admin, o4.id)).find((t) => t.kind === 'pickup');
  ok(pickup4?.status === 'assigned' && !!pickup4.riderId, 'a new task is assigned the moment it is created, with no staff action', JSON.stringify(pickup4 && { status: pickup4.status, riderId: pickup4.riderId }));
  ok(loadBefore.get(pickup4?.riderId) === minLoad, 'and it goes to the least busy rider of the warehouse', JSON.stringify([...loadBefore]));
  ok(!(await notices(manager)).some((n) => n.title === 'Task to assign' && n.entityId === pickup4?.id), 'staff get no "task to assign" notice for it');
  const o5 = await order();
  await sleep(400);
  const pickup5 = (await tasksOf(admin, o5.id)).find((t) => t.kind === 'pickup');
  const after = new Map(((await req(manager.sock, 'warehouse:riders')).data ?? []).map((r) => [r.id, r.activeTasks]));
  ok(pickup5?.status === 'assigned' && after.get(pickup5.riderId) - 1 === Math.min(...[...after].map(([id, n]) => (id === pickup5.riderId ? n - 1 : n))), 'the next task goes to whoever is least busy at that moment', JSON.stringify([...after]));
  await req(manager.sock, 'hubSettings:update', { autoAssign: false });
  const o6 = await order();
  await sleep(400);
  const pickup6 = (await tasksOf(admin, o6.id)).find((t) => t.kind === 'pickup');
  ok(pickup6?.status === 'unassigned', 'with auto-assignment off a new task waits for staff again');
  await req(manager.sock, 'hubSettings:update', { workStart: '00:00', workEnd: '00:01', workDays: [1] }); // closed (except a minute on Mondays)
  await req(manager.sock, 'hubSettings:update', { autoAssign: true });
  const o7 = await order();
  await sleep(400);
  const pickup7 = (await tasksOf(admin, o7.id)).find((t) => t.kind === 'pickup');
  const dow = new Date().getUTCDay();
  const midnightMonday = dow === 1 && new Date().getUTCHours() === 0 && new Date().getUTCMinutes() < 1;
  ok(midnightMonday || pickup7?.status === 'unassigned', 'outside working hours nothing is assigned automatically');
  await req(manager.sock, 'hubSettings:update', allDay);
  a = await req(admin.sock, 'warehouseOps:runNow');
  ok(a.ok && a.data.autoAssigned >= 1, 'the job gives out the tasks that waited once the warehouse is open', JSON.stringify(a));
  const pickup7b = (await tasksOf(admin, o7.id)).find((t) => t.kind === 'pickup');
  ok(pickup7b?.status === 'assigned', 'the waiting task is now with a rider');
  await req(manager.sock, 'hubSettings:update', { autoAssign: false });
  // leave the warehouse the way the seed had it
  a = await req(ops.sock, 'hubSettings:update', { hubId: kin, workStart: '08:00', workEnd: '18:00', workDays: [1, 2, 3, 4, 5, 6], timezone: 'Africa/Kinshasa', batchSize: 20, agedLevels: [24, 48, 72], deliveryTargetHours: 24, autoAssign: false });
  ok(a.ok && a.data.agedLevels.join() === '24,48,72', 'settings put back');

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
