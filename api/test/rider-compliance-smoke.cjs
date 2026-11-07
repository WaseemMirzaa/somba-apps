/* Rider vehicle and compliance documents, end to end against a RUNNING API (non-production mode). It creates its own warehouses,
 * riders and staff through the admin account, so it works on an empty database after `npm run bootstrap:prod`.
 *
 *   API_URL=http://localhost:3001 ADMIN_EMAIL=... ADMIN_PASSWORD=... node test/rider-compliance-smoke.cjs
 */
const { io } = require('socket.io-client');
const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@somba.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Somba@2026';
const tag = Date.now().toString().slice(-8);

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);

const rest = async (method, path, body, token, form) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { ...(body && !form ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json, res };
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
    const r = await new Promise((res) => s.emit(ev, b, res));
    if (r?.ok === false && /Too many requests/.test(r.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return r;
  }
};
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, password) => {
  const r = await rest('POST', '/api/v1/auth/login', { email, password });
  if (r.status !== 200 && r.status !== 201) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const uploadPrivate = async (token, buf, type = 'image/png', name = 'scan.png') => {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  return rest('POST', '/api/v1/private-uploads', null, token, fd);
};
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

(async () => {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const hub = async (name) => (await req(admin.sock, 'warehouse:saveHub', { name: `${name} ${tag}`, city: 'Kinshasa', country: 'CD', address: '1 Test Road', capacity: 100, lat: -4.3, lng: 15.3 })).data;
  const [h1, h2] = [await hub('Compliance A'), await hub('Compliance B')];
  ok(!!h1?.id && !!h2?.id, 'two warehouses exist');
  const staff = async (role, hubId, tier, label) => {
    const c = await req(admin.sock, 'roles:createStaff', { email: `${label}${tag}@smoke.test`, name: `${label} ${tag}`, role, hubId, warehouseTier: tier });
    if (!c.ok) throw new Error(`createStaff ${label}: ${c.error}`);
    return { id: c.data.id, ...(await login(c.data.email, c.data.tempPassword)) };
  };
  const r1 = await staff('rider', h1.id, undefined, 'riderone');
  const r2 = await staff('rider', h2.id, undefined, 'ridertwo');
  const sup1 = await staff('warehouse_staff', h1.id, 'supervisor', 'supone');
  const op1 = await staff('warehouse_staff', h1.id, 'operator', 'opone');
  const mgr2 = await staff('warehouse_staff', h2.id, 'manager', 'mgrtwo');
  const fin = await staff('admin_finance', null, undefined, 'fin');
  const ops = await staff('admin_operations', null, undefined, 'opsadmin');

  section('A rider reads their own vehicle and documents');
  let v = await req(r1.sock, 'rider:vehicle');
  ok(v.ok && v.data.exists === false && v.data.riderId === r1.id && v.data.model === null, 'a new rider has an empty vehicle', JSON.stringify(v));
  let d = await req(r1.sock, 'rider:documents');
  ok(d.ok && Array.isArray(d.data) && d.data.length === 0, 'and no documents');
  for (const [who, name] of [[fin, 'a finance admin'], [sup1, 'a warehouse supervisor'], [admin, 'an admin']]) {
    ok(!(await req(who.sock, 'rider:vehicle')).ok && !(await req(who.sock, 'rider:documents')).ok, `${name} is refused the rider-only events`);
  }

  section('Upload a document (scan through the private store)');
  const up = await uploadPrivate(r1.token, PNG);
  ok(up.status === 201 && up.json.id, 'the scan is stored privately', JSON.stringify(up.json));
  const pushes = [];
  r1.sock.on('rider:document:updated', (x) => pushes.push(x));
  const staffPushes = [];
  sup1.sock.on('riderCompliance:updated', (x) => staffPushes.push(x));
  let u = await req(r1.sock, 'rider:documentUpload', { type: 'driver_licence', number: 'KN-998877', expiresOn: day(10), fileId: up.json.id });
  ok(u.ok && u.data.status === 'pending' && u.data.expiry.state === 'expiring' && u.data.number === 'KN-998877', 'it starts pending, 10 days to expiry = expiring', u.error ?? JSON.stringify(u.data));
  ok(!!(await until(async () => pushes.find((p) => p.id === u.data?.id))), 'the rider hears rider:document:updated');
  ok(!!(await until(async () => staffPushes.find((p) => p.riderId === r1.id))), 'staff of the warehouse hear riderCompliance:updated');
  const docId = u.data.id;
  u = await req(r1.sock, 'rider:documentUpload', { type: 'driver_licence', fileId: up.json.id });
  ok(!u.ok && /already sent/.test(u.error), 'the same scan cannot be sent twice', u.error ?? '');
  const other = await uploadPrivate(r2.token, PNG);
  u = await req(r1.sock, 'rider:documentUpload', { type: 'id_card', fileId: other.json.id });
  ok(!u.ok && /Upload the file again/.test(u.error), 'another rider\'s scan cannot be attached', u.error ?? '');
  const web = await uploadPrivate(r1.token, WEBP, 'image/webp', 'x.webp');
  u = await req(r1.sock, 'rider:documentUpload', { type: 'id_card', fileId: web.json.id });
  ok(!u.ok && /JPEG, PNG or PDF/.test(u.error), 'a WebP scan is refused', u.error ?? '');
  const junk = await uploadPrivate(r1.token, Buffer.from('<script>alert(1)</script>'), 'image/png', 'x.png');
  ok(junk.status === 400, 'a file that is not an image or PDF is refused by the store', String(junk.status));
  const big = await uploadPrivate(r1.token, Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), 'application/pdf', 'big.pdf');
  ok(big.status === 400 || big.status === 413, 'a file over 5 MB is refused', String(big.status));
  u = await req(r1.sock, 'rider:documentUpload', { type: 'passport', fileId: up.json.id });
  ok(!u.ok && /Document type/.test(u.error), 'an unknown type is refused');
  const pdf = await uploadPrivate(r1.token, PDF, 'application/pdf', 'ins.pdf');
  u = await req(r1.sock, 'rider:documentUpload', { type: 'vehicle_insurance', expiresOn: day(-3), fileId: pdf.json.id });
  ok(u.ok && u.data.mime === 'application/pdf' && u.data.expiry.state === 'expired', 'a PDF is accepted; an expired date shows as expired (a warning only)', u.error ?? '');
  d = await req(r1.sock, 'rider:documents');
  ok(d.ok && d.data.length === 2 && d.data.every((x) => x.riderId === r1.id), 'the rider lists both');
  ok(((await req(r2.sock, 'rider:documents')).data ?? []).length === 0, 'another rider sees none of them');
  const tasks = await req(r1.sock, 'rider:tasks');
  ok(tasks.ok, 'the rider can still read their tasks with an expired document (nothing blocks work)');

  section('The scan stays private');
  const noAuth = await fetch(`${API}/api/v1/private-uploads/${up.json.id}`);
  ok(noAuth.status === 401, 'no sign-in, no file', String(noAuth.status));
  const mine = await fetch(`${API}/api/v1/private-uploads/${up.json.id}`, { headers: { authorization: `Bearer ${r1.token}` } });
  ok(mine.status === 200 && Buffer.from(await mine.arrayBuffer()).equals(PNG), 'the rider can read their own scan');
  const theirs = await fetch(`${API}/api/v1/private-uploads/${up.json.id}`, { headers: { authorization: `Bearer ${r2.token}` } });
  ok(theirs.status === 404, 'another rider cannot', String(theirs.status));
  for (const [who, name, expect] of [[sup1, 'the supervisor of the rider\'s warehouse', true], [ops, 'an operations admin', true], [admin, 'the super admin', true], [op1, 'an operator of the warehouse', false], [mgr2, 'a manager of another warehouse', false], [fin, 'a finance admin', false]]) {
    const link = await req(who.sock, 'private:link', { id: up.json.id });
    ok(link.ok === expect, `${name} ${expect ? 'gets' : 'does not get'} a signed link`, JSON.stringify(link));
    if (expect && link.ok) { const f = await fetch(link.data.url); ok(f.status === 200, `...and the link opens the file`, String(f.status)); }
  }

  section('Staff edit the vehicle (scope, permission, validation, audit)');
  const vehicle = { model: 'Honda CG 125', type: 'motorbike', plate: 'kn 4821 a', colour: 'Black', odometerKm: 18240, fuel: 'petrol', insuranceValidUntil: day(20), lastServiceOn: day(-30), nextServiceOn: day(-2) };
  const vp = [];
  r1.sock.on('rider:vehicle:updated', (x) => vp.push(x));
  let e = await req(sup1.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, ...vehicle });
  ok(e.ok && e.data.plate === 'KN 4821 A' && e.data.insurance.state === 'expiring' && e.data.service.state === 'expired', 'the supervisor of the rider\'s warehouse edits it', e.error ?? '');
  ok(!!(await until(async () => vp.find((p) => p.model === 'Honda CG 125'))), 'the rider hears rider:vehicle:updated');
  v = await req(r1.sock, 'rider:vehicle');
  ok(v.ok && v.data.exists && v.data.model === 'Honda CG 125' && v.data.odometerKm === 18240, 'the rider reads what staff saved');
  e = await req(r1.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, model: 'Hacked' });
  ok(!e.ok, 'the rider cannot edit their own vehicle', e.error ?? '');
  e = await req(mgr2.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, model: 'Hacked' });
  ok(!e.ok && /Rider not found/.test(e.error), 'a manager of another warehouse cannot', e.error ?? '');
  e = await req(op1.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, model: 'Hacked' });
  ok(!e.ok && /supervisors and managers/.test(e.error), 'an operator cannot', e.error ?? '');
  e = await req(fin.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, model: 'Hacked' });
  ok(!e.ok && /Not allowed/.test(e.error), 'a finance admin cannot', e.error ?? '');
  e = await req(ops.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, odometerKm: -4 });
  ok(!e.ok && /Odometer/.test(e.error), 'a negative odometer is refused', e.error ?? '');
  e = await req(ops.sock, 'riderCompliance:updateVehicle', { riderId: r1.id, nextServiceOn: '2026-02-31' });
  ok(!e.ok && /Next service/.test(e.error), 'an impossible date is refused', e.error ?? '');
  e = await req(ops.sock, 'riderCompliance:updateVehicle', { riderId: r2.id, colour: 'Red' });
  ok(e.ok && e.data.colour === 'Red', 'an operations admin edits a rider of any warehouse', e.error ?? '');
  v = await req(r1.sock, 'rider:vehicle');
  ok(v.data.model === 'Honda CG 125', 'refused edits changed nothing');

  section('Staff read the record and review documents');
  let g = await req(sup1.sock, 'riderCompliance:get', { riderId: r1.id });
  ok(g.ok && g.data.documents.length === 2 && g.data.vehicle.plate === 'KN 4821 A' && g.data.canEdit === true && g.data.rider.id === r1.id, 'the supervisor reads vehicle and documents');
  ok(!(await req(mgr2.sock, 'riderCompliance:get', { riderId: r1.id })).ok, 'a manager of another warehouse cannot read them');
  ok(!(await req(op1.sock, 'riderCompliance:get', { riderId: r1.id })).ok, 'an operator cannot');
  ok(!(await req(r2.sock, 'riderCompliance:get', { riderId: r1.id })).ok, 'a rider cannot read a colleague\'s record');
  let rv = await req(sup1.sock, 'riderCompliance:reviewDocument', { id: docId, decision: 'reject' });
  ok(!rv.ok && /reason/i.test(rv.error), 'a rejection needs a reason', rv.error ?? '');
  rv = await req(mgr2.sock, 'riderCompliance:reviewDocument', { id: docId, decision: 'approve' });
  ok(!rv.ok, 'a manager of another warehouse cannot approve', rv.error ?? '');
  rv = await req(sup1.sock, 'riderCompliance:reviewDocument', { id: docId, decision: 'reject', reason: 'Photo is blurry, please retake it' });
  ok(rv.ok && rv.data.status === 'rejected' && rv.data.rejectionReason.startsWith('Photo') && rv.data.reviewedByName === sup1.user.name, 'the supervisor rejects with a reason', rv.error ?? '');
  d = await req(r1.sock, 'rider:documents');
  const mineDoc = d.data.find((x) => x.id === docId);
  ok(mineDoc.status === 'rejected' && /blurry/.test(mineDoc.rejectionReason), 'the rider reads the reason');
  const notices = await req(r1.sock, 'notifications:list');
  ok(notices.ok && notices.data.some((n) => n.title === 'Document rejected' && n.titleFr === 'Document refusé'), 'the rider got a notice, with French text', JSON.stringify(notices.data?.slice?.(0, 2)));
  rv = await req(ops.sock, 'riderCompliance:reviewDocument', { id: docId, decision: 'approve' });
  ok(rv.ok && rv.data.status === 'approved' && rv.data.rejectionReason === null, 'an operations admin approves it later (the reason is cleared)', rv.error ?? '');

  section('Every staff write is in the audit log');
  const au = await req(admin.sock, 'audit:list', { entity: 'rider_document' });
  const au2 = await req(admin.sock, 'audit:list', { entity: 'rider_vehicle' });
  const acts = [...(au.data ?? []), ...(au2.data ?? [])].map((x) => x.action);
  ok(acts.filter((a) => a === 'rider.document.rejected').length >= 1 && acts.filter((a) => a === 'rider.document.approved').length >= 1, 'approve and reject are logged', acts.join());
  ok(acts.filter((a) => a === 'rider.vehicle.updated').length >= 2, 'vehicle edits are logged', acts.join());
  const text = JSON.stringify([...(au.data ?? []), ...(au2.data ?? [])]);
  ok(!text.includes('KN 4821') && !text.includes('KN-998877'), 'the log holds no plate and no document number');
  ok(!(await req(fin.sock, 'audit:list', {})).ok, 'and a finance admin cannot read the log (unchanged rule)');

  for (const x of [admin, r1, r2, sup1, op1, mgr2, fin, ops]) x.sock.close();
  console.log(`\n${pass} passed, ${fails.length} failed${fails.length ? `: ${fails.join(' | ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
