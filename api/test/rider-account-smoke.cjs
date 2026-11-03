/* A rider's own account, against a RUNNING API seeded with `npm run seed`: edit name and phone (`me:update`), change the password
 * (`me:changePassword`), and the sessions that change revokes. Used by the rider app (Profile > Edit profile / Change password) and
 * the web rider portal (/rider/profile). It restores what it changes.
 *
 *   API_URL=http://localhost:3001 node test/rider-account-smoke.cjs
 */
const { io } = require('socket.io-client');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const NEW_PW = `Changed-${Date.now().toString().slice(-6)}-Pw`;

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (path, body) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, refresh: r.json.refreshToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
/** A socket handshake with this token: does the server let it in (`ready`) or turn it away (`unauthorized`)? */
const handshake = (token) => new Promise((resolve) => {
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  const done = (v) => { s.close(); resolve(v); };
  s.on('ready', () => done('ready'));
  s.on('unauthorized', () => done('unauthorized'));
  s.on('connect_error', () => done('unauthorized'));
  setTimeout(() => done('timeout'), 6000);
});

(async () => {
  const RIDER = 'rider.limete@somba.app';
  const OTHER = 'rider@somba.app';
  let me = await login(RIDER);
  const other = await login(OTHER);
  const original = (await req(me.sock, 'me:get')).data;
  const otherBefore = (await req(other.sock, 'me:get')).data;
  ok(original?.role === 'rider' && original.email === RIDER && original.hubId, 'the rider reads their own account (me:get)', JSON.stringify(original));

  try {
    section('Work stats (riders are salaried: workload, never pay)');
    let w = await req(me.sock, 'rider:workStats');
    const keys = ['totalTasks', 'completed', 'active', 'failed', 'completedToday', 'completedLast7Days', 'successRate', 'byKind', 'codCollectedUsd'];
    ok(w.ok && keys.every((k) => k in w.data), 'a rider reads their work stats (rider:workStats)', JSON.stringify(w));
    ok(w.ok && !/earning|perTask/i.test(JSON.stringify(w.data)) && Object.keys(w.data).filter((k) => /usd/i.test(k)).join() === 'codCollectedUsd', 'the payload has no pay, only the cash collected');
    ok(w.ok && w.data.byKind.every((k) => Object.keys(k).sort().join() === 'count,kind' && k.count > 0), 'byKind is counts only');
    ok(w.ok && w.data.completedToday <= w.data.completedLast7Days && w.data.completedLast7Days <= w.data.completed, 'today <= last 7 days <= all time');
    ok(w.ok && (w.data.successRate === null || (Number.isInteger(w.data.successRate) && w.data.successRate >= 0 && w.data.successRate <= 100)), 'the success rate is a whole percent or null', String(w.data?.successRate));
    const old = await req(me.sock, 'rider:earnings');
    ok(old.ok && JSON.stringify(old.data) === JSON.stringify(w.data), 'the old rider:earnings name returns the same payload');
    const cust = await login('customer@somba.app').catch(() => null);
    if (cust) { ok(!(await req(cust.sock, 'rider:workStats')).ok && !(await req(cust.sock, 'rider:earnings')).ok, 'a customer is refused both names'); cust.sock.close(); }
    const anon = await connect(null).catch(() => null);
    if (anon) { ok(!(await req(anon, 'rider:workStats')).ok, 'a guest is refused'); anon.close(); }

    section('Edit name and phone (me:update)');
    const second = await login(RIDER); // the web portal open at the same time as the app
    const pushed = [];
    second.sock.on('me:updated', (u) => pushed.push(u));
    let a = await req(me.sock, 'me:update', { name: '  Jean-Pierre Mukendi ', phone: ' +243 99 111 2222 ' });
    ok(a.ok && a.data.name === 'Jean-Pierre Mukendi' && a.data.phone === '+243 99 111 2222' && a.data.role === 'rider' && a.data.email === RIDER, 'the rider edits their name and phone (trimmed)', a.error ?? JSON.stringify(a.data));
    ok((await req(me.sock, 'me:get')).data.name === 'Jean-Pierre Mukendi', 'and me:get shows it');
    ok(!!(await until(async () => pushed.find((u) => u.name === 'Jean-Pierre Mukendi'))), 'the rider\'s other open session (the web portal) hears it: me:updated');
    ok(a.data.phoneVerified === false, 'a new phone number is not verified');

    a = await req(me.sock, 'me:update', { name: 'J' });
    ok(!a.ok && a.error === 'Name must be 2–80 characters.', 'a one-letter name is refused', a.error ?? '');
    a = await req(me.sock, 'me:update', { phone: 'call me' });
    ok(!a.ok && a.error === 'Enter a valid phone number.', 'a phone that is not a number is refused', a.error ?? '');
    ok((await req(me.sock, 'me:get')).data.name === 'Jean-Pierre Mukendi', 'a refusal changes nothing');

    a = await req(me.sock, 'me:update', { phone: '' });
    ok(a.ok && a.data.phone === null, 'a blank phone clears it');

    a = await req(me.sock, 'me:update', { name: 'Jean-Pierre Mukendi', email: 'evil@somba.app', role: 'admin', hubId: 'other-hub', active: false, walletBalance: 9999, tokenVersion: 9, passwordHash: 'x' });
    const after = (await req(me.sock, 'me:get')).data;
    ok(a.ok && after.email === RIDER && after.role === 'rider' && after.hubId === original.hubId && after.active === true && after.walletBalance === original.walletBalance, 'e-mail, role, warehouse, active flag and wallet cannot be set through the profile', JSON.stringify(after));
    ok((await login(RIDER, PW)).user.id === original.id, 'the password and the sessions are untouched too (still signs in)');
    ok(!(await req(me.sock, 'staff:setActive', { userId: other.user.id, active: false })).ok && !(await req(me.sock, 'roles:setRole', { userId: me.user.id, role: 'admin' })).ok, 'a rider cannot edit anyone else\'s account or role');

    const otherAfter = (await req(other.sock, 'me:get')).data;
    ok(otherAfter.name === otherBefore.name && otherAfter.phone === otherBefore.phone, 'another rider\'s account was not touched');
    second.sock.close();

    section('Change password (me:changePassword) and the sessions it ends');
    const oldAccess = me.token;
    const oldRefresh = me.refresh;
    a = await req(me.sock, 'me:changePassword', { current: 'not-my-password', next: NEW_PW });
    ok(!a.ok && a.error === 'Current password is incorrect.', 'a wrong current password is refused', a.error ?? '');
    a = await req(me.sock, 'me:changePassword', { current: PW, next: 'short' });
    ok(!a.ok && a.error === 'New password must be at least 8 characters.', 'a new password under 8 characters is refused', a.error ?? '');
    ok((await login(RIDER, PW)).user.id === original.id, 'a refusal changes nothing (the old password still signs in)');

    a = await req(me.sock, 'me:changePassword', { current: PW, next: NEW_PW });
    ok(a.ok && a.data.accessToken && a.data.refreshToken && a.data.user.id === original.id, 'the new password is accepted and the answer carries fresh tokens', a.error ?? '');
    const fresh = a.data;
    let r = await rest('/api/v1/auth/login', { email: RIDER, password: PW });
    ok(r.status === 401, 'the old password no longer signs in', String(r.status));
    r = await rest('/api/v1/auth/login', { email: RIDER, password: NEW_PW });
    ok(r.status === 200, 'the new one does', String(r.status));

    r = await rest('/api/v1/auth/refresh', { refreshToken: oldRefresh });
    ok(r.status === 401 && /revoked/i.test(r.json?.message ?? ''), 'another phone still holding the OLD refresh token is signed out: "Session has been revoked."', JSON.stringify([r.status, r.json]));
    ok((await handshake(oldAccess)) === 'unauthorized', 'and its old access token is turned away at the socket handshake (the app then asks to refresh, is refused, and signs the rider out)');
    r = await rest('/api/v1/auth/refresh', { refreshToken: fresh.refreshToken });
    ok(r.status === 201 || r.status === 200, 'this phone\'s fresh refresh token keeps working', String(r.status));
    ok((await handshake(fresh.accessToken)) === 'ready', 'and its fresh access token is let in');

    section('COD is not offered: what the rider is told (codEnabled) and web push for the rider portal');
    const admin = await login('admin@somba.app');
    const adminSettings = await req(admin.sock, 'settings:get');
    const codWas = adminSettings.data?.codEnabled;
    let st = await req(me.sock, 'settings:get');
    ok(st.ok && 'codEnabled' in st.data, 'a rider can read the public setting codEnabled (settings:get)', JSON.stringify(st));
    ok(st.ok && st.data.codEnabled === 'false', 'it is "false" on a launch-configured platform: the rider app and portal hide every COD surface', String(st.data?.codEnabled));
    ok(st.ok && !('commissionPct' in st.data) && !('minPayoutUsd' in st.data), 'the rider is not sent the admin-only settings');
    const pushes = [];
    me.sock.on('settings:updated', (d) => pushes.push(d));
    a = await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'true' });
    ok(a.ok, 'an admin switches COD on', a.error ?? '');
    ok(await until(() => pushes.some((d) => d.codEnabled === 'true')), 'the rider is pushed settings:updated {codEnabled: "true"}: the apps show COD at once');
    a = await req(admin.sock, 'settings:set', { key: 'codEnabled', value: codWas ?? 'false' });
    ok(a.ok, 'and back off', a.error ?? '');
    ok(await until(() => pushes.some((d) => d.codEnabled === (codWas ?? 'false'))), 'the rider is pushed the change back: the apps hide COD again');
    st = await req(me.sock, 'settings:get');
    ok(st.ok && st.data.codEnabled === (codWas ?? 'false'), 'settings:get agrees', String(st.data?.codEnabled));
    const webToken = `r2e-web-token-${Date.now()}`;
    a = await req(me.sock, 'devices:register', { token: webToken, platform: 'web', app: 'web' });
    ok(a.ok && a.data.registered === true, 'the rider portal registers its browser for web push (devices:register, platform web)', JSON.stringify(a));
    a = await req(me.sock, 'devices:test');
    ok(a.ok && a.data.devices >= 1, 'a test notice counts that browser among the rider\'s devices', JSON.stringify(a));
    a = await req(other.sock, 'devices:unregister', { token: webToken });
    ok(a.ok, 'another rider cannot unregister it (scoped to the owner, no error)', JSON.stringify(a));
    a = await req(me.sock, 'devices:test');
    ok(a.ok && a.data.devices >= 1, '... and it is still registered', JSON.stringify(a));
    a = await req(me.sock, 'devices:unregister', { token: webToken });
    ok(a.ok, 'sign-out removes the browser token (devices:unregister)', JSON.stringify(a));
    me.sock.removeAllListeners('settings:updated');
    admin.sock.close();

    section('Put everything back');
    const back = await login(RIDER, NEW_PW);
    a = await req(back.sock, 'me:changePassword', { current: NEW_PW, next: PW });
    ok(a.ok, 'the password is changed back', a.error ?? '');
    me = await login(RIDER, PW);
    a = await req(me.sock, 'me:update', { name: original.name, phone: original.phone });
    ok(a.ok && a.data.name === original.name && a.data.phone === original.phone, 'name and phone are restored', a.error ?? '');
  } finally {
    // best effort if a check above crashed halfway
    try {
      const r = await rest('/api/v1/auth/login', { email: RIDER, password: NEW_PW });
      if (r.status === 200) { const s = await connect(r.json.accessToken); await req(s, 'me:changePassword', { current: NEW_PW, next: PW }); s.close(); }
    } catch {}
  }

  console.log(fails.length ? `\n❌ ${pass} passed, ${fails.length} failed:\n   - ${fails.join('\n   - ')}` : `\n🎉 ${pass} passed, 0 failed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
