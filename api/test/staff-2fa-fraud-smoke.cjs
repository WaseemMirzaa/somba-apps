/* Staff two-factor authentication + fraud rules, against a RUNNING API (seeded: `npm run seed`).
 *
 *   API_URL=http://localhost:3052 FRAUD_SWEEP_MS=3000 node test/staff-2fa-fraud-smoke.cjs
 *
 * The API must run with a short fraud sweep (FRAUD_SWEEP_MS=3000) and MM_PROVIDER=sandbox. Failed payments and
 * returns are written straight into the database the API uses (read from api/.env: DB_*), because no API call fails a
 * payment or files a return on demand. Everything this suite changes is put back (staff 2FA flag, thresholds, COD).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { io } = require('socket.io-client');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const tag = Date.now().toString().slice(-8);
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(300); } return null; };

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
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200 || !r.json.accessToken) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, extra = {}) => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@fraud.test`, password: 'Fraud-Pass-2026', name: `${label} user`, ...extra });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

// ── TOTP (RFC 6238, SHA-1, 30 s, 6 digits): what an authenticator app does ──────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, offset = 0) => {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac('sha1', b32(secret)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
};

(async () => {
  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USERNAME ?? 'root', password: process.env.DB_PASSWORD ?? '', database: process.env.DB_DATABASE });
  const admin = await login('admin@somba.app');
  const guest = { sock: await connect() };
  const sockets = [guest.sock, admin.sock];
  let saved = {};
  let restorer = admin; // a super admin that is never held at enrolment: the one that has 2FA on (set below)
  try {
    saved = (await req(admin.sock, 'settings:get')).data;
    ok(saved.requireStaffTwoFactor === 'false', 'the staff two-factor requirement starts off');
    ok(saved.fraudFailedPayments24h === '5' && saved.fraudReturnRatePct === '50', 'the fraud thresholds start at their defaults (5 payments, 50% returns)');

    // ───────────────────────── Staff two-factor authentication ─────────────────────────
    section('Staff 2FA: accounts for the test (a second super admin, a finance admin, a support admin)');
    const mk = async (label, role) => {
      const r = await req(admin.sock, 'roles:createStaff', { email: `${label}${tag}@staff.test`, name: `${label} staff`, role });
      if (!r.ok) throw new Error(`createStaff ${label}: ${r.error}`);
      return { id: r.data.id, email: r.data.email, pw: r.data.tempPassword };
    };
    const s1 = await mk('boss', 'admin_support');
    const s2 = await mk('fin', 'admin_finance');
    const s3 = await mk('sup', 'admin_support');
    ok((await req(admin.sock, 'roles:setRole', { id: s1.id, role: 'admin' })).ok, 'the super admin makes the first account a second super admin');

    const boss = await login(s1.email, s1.pw); sockets.push(boss.sock);
    restorer = boss;
    let a = await req(boss.sock, 'auth:2fa:status');
    ok(a.ok && a.data.enabled === false && a.data.required === false && a.data.requiredFor === 'staff', 'status: off, not required, required-for staff', JSON.stringify(a));

    section('Staff 2FA: enrolment from the account page (QR link + manual key + confirm code), recovery codes');
    a = await req(boss.sock, 'auth:2fa:setup');
    ok(a.ok && /^[A-Z2-7]{32}$/.test(a.data.secret) && a.data.otpauthUrl.startsWith('otpauth://totp/'), 'setup returns the manual key and the authenticator link');
    const secret = a.data.secret;
    a = await req(boss.sock, 'auth:2fa:enable', { code: '000000' });
    ok(!a.ok && /not right/.test(a.error), 'a wrong confirm code does not turn it on');
    a = await req(boss.sock, 'auth:2fa:enable', { code: totp(secret) });
    ok(a.ok && a.data.recoveryCodes.length === 10, 'the right code turns it on and returns 10 recovery codes once');
    const recovery = a.data.recoveryCodes;
    ok((await req(boss.sock, 'auth:2fa:status')).data.recoveryRemaining === 10, 'status counts 10 recovery codes left');
    ok(((await req(admin.sock, 'roles:staff')).data.find((u) => u.id === s1.id) ?? {}).twofaEnabled === true, 'the roles page data shows 2FA on for that account');

    section('Staff 2FA: sign-in asks for the code');
    let r = await rest('/api/v1/auth/login', { email: s1.email, password: s1.pw });
    ok(r.status === 200 && r.json.needs2fa === true && r.json.challenge && !r.json.accessToken, 'password alone gives a challenge and no session');
    const challenge = r.json.challenge;
    r = await rest('/api/v1/auth/login/2fa', { challenge, code: '123456' });
    ok(r.status === 400, 'a wrong code is refused', String(r.status));
    r = await rest('/api/v1/auth/login/2fa', { challenge, code: totp(secret, 1) });
    ok(r.status === 200 && r.json.accessToken && r.json.user.role === 'admin', 'the right code finishes the sign-in');
    r = await rest('/api/v1/auth/login/2fa', { challenge, code: totp(secret, 1) });
    ok(r.status === 400 || r.status === 401, 'the same code cannot be used twice');
    r = await rest('/api/v1/auth/login', { email: s1.email, password: s1.pw });
    const viaRecovery = await rest('/api/v1/auth/login/2fa', { challenge: r.json.challenge, code: recovery[0] });
    ok(viaRecovery.status === 200 && viaRecovery.json.accessToken, 'a recovery code signs in');
    r = await rest('/api/v1/auth/login', { email: s1.email, password: s1.pw });
    const again = await rest('/api/v1/auth/login/2fa', { challenge: r.json.challenge, code: recovery[0] });
    ok(again.status === 400, 'a recovery code works only once');
    r = await rest('/api/v1/auth/login', { email: s1.email, password: 'Wrong-password-1' });
    ok(r.status === 401, 'a wrong password never gets a challenge');

    section('Staff 2FA: the platform setting (requireStaffTwoFactor)');
    const fin = await login(s2.email, s2.pw); sockets.push(fin.sock);
    a = await req(fin.sock, 'settings:set', { key: 'requireStaffTwoFactor', value: 'true' });
    ok(!a.ok && /super admin/i.test(a.error), 'a department admin cannot change the requirement', a.error);
    a = await req(admin.sock, 'settings:set', { key: 'requireStaffTwoFactor', value: 'true' });
    ok(!a.ok && /own account first/i.test(a.error), 'a super admin without 2FA cannot turn it on (it would lock them out)', a.error);
    a = await req(boss.sock, 'settings:set', { key: 'requireStaffTwoFactor', value: 'true' });
    ok(a.ok && a.data.requireStaffTwoFactor === 'true', 'a super admin with 2FA turns it on');

    a = await req(fin.sock, 'orders:list');
    ok(!a.ok && a.code === 'twofa_required' && /Two-factor authentication is required/.test(a.error), 'a finance admin without 2FA is refused everything else', JSON.stringify(a));
    a = await req(admin.sock, 'orders:list');
    ok(!a.ok && a.code === 'twofa_required', 'so is the seeded super admin, who has no 2FA yet');
    a = await req(fin.sock, 'auth:2fa:status');
    ok(a.ok && a.data.required === true && a.data.enabled === false, 'but the status event still works and says it is required');
    a = await req(fin.sock, 'auth:2fa:disable', { code: '123456' });
    ok(!a.ok, 'cannot turn 2FA off when it is not on');
    ok((await req(fin.sock, 'settings:get')).ok, 'the settings read stays open (the menu needs it)');
    ok((await req(fin.sock, 'notifications:list')).ok !== undefined, 'notices stay reachable');
    const customerLike = await register('shopper'); sockets.push(customerLike.sock);
    ok((await req(customerLike.sock, 'orders:list')).ok, 'a customer is not affected');
    const sellerLike = await login('seller@somba.app'); sockets.push(sellerLike.sock);
    ok((await req(sellerLike.sock, 'orders:list')).ok, 'a seller is not affected');
    const rider = await login('rider@somba.app'); sockets.push(rider.sock);
    ok((await req(rider.sock, 'rider:assignment')).ok, 'a rider is not affected');

    a = await req(fin.sock, 'auth:2fa:setup');
    const finSecret = a.data.secret;
    a = await req(fin.sock, 'auth:2fa:enable', { code: totp(finSecret) });
    ok(a.ok && a.data.recoveryCodes.length === 10, 'the held admin enrols');
    a = await req(fin.sock, 'orders:list');
    ok(a.ok, 'and is let through at once, without signing in again');
    a = await req(fin.sock, 'auth:2fa:disable', { code: totp(finSecret, 1) });
    ok(!a.ok && /required for staff/.test(a.error), 'while it is required, staff cannot turn their own 2FA off', a.error);

    section('Staff 2FA: the super admin resets another staff member (audited)');
    const finKicked = new Promise((res) => fin.sock.once('disconnect', () => res(true)));
    a = await req(fin.sock, 'auth:2fa:reset', { userId: s1.id });
    ok(!a.ok && /Super admin only/.test(a.error), 'a department admin cannot reset anyone');
    a = await req(boss.sock, 'auth:2fa:reset', { userId: s1.id });
    ok(!a.ok && /own account page/.test(a.error), 'nobody can reset their own account');
    a = await req(boss.sock, 'auth:2fa:reset', { userId: (await req(boss.sock, 'roles:staff')).data.find((u) => u.email === 'rider@somba.app').id });
    ok(!a.ok && /not on for this account/.test(a.error), 'resetting an account without 2FA is refused');
    a = await req(boss.sock, 'auth:2fa:reset', { userId: s2.id });
    ok(a.ok && a.data.twofaEnabled === false, 'the super admin resets the finance admin');
    ok(await Promise.race([finKicked, sleep(3000).then(() => false)]), 'their open sessions end');
    r = await rest('/api/v1/auth/login', { email: s2.email, password: s2.pw });
    ok(r.status === 200 && r.json.accessToken && !r.json.needs2fa, 'they sign in with the password alone again');
    const fin2 = { sock: await connect(r.json.accessToken) }; sockets.push(fin2.sock);
    a = await req(fin2.sock, 'orders:list');
    ok(!a.ok && a.code === 'twofa_required', 'and, with the requirement on, are held at enrolment again');
    const log = await req(boss.sock, 'audit:list', { action: 'staff.2fa.reset' });
    const logRows = Array.isArray(log.data) ? log.data : (log.data?.items ?? []);
    ok(log.ok && logRows.some((e) => e.entityId === s2.id && e.actor === 'boss staff' && e.role === 'admin'), 'the reset is in the audit log with who did it', JSON.stringify(log).slice(0, 160));
    const notice = (await req(fin2.sock, 'notifications:list')).data ?? [];
    ok(notice.some((n) => /Two-factor authentication reset/.test(n.title)), 'the person got a security notice');

    a = await req(boss.sock, 'settings:set', { key: 'requireStaffTwoFactor', value: 'false' });
    ok(a.ok && a.data.requireStaffTwoFactor === 'false', 'the super admin turns the requirement off again');
    ok((await req(admin.sock, 'orders:list')).ok, 'and the seeded admin is free again');

    // ───────────────────────── Fraud rules ─────────────────────────
    section('Fraud: who can see the page, and the threshold settings');
    const sup = await login(s3.email, s3.pw); sockets.push(sup.sock);
    a = await req(sup.sock, 'fraud:list');
    ok(a.ok && Array.isArray(a.data), 'the support admin can open the fraud alerts');
    const mkt = await mk('mkt', 'admin_marketing');
    const mktLogin = await login(mkt.email, mkt.pw); sockets.push(mktLogin.sock);
    ok(!(await req(mktLogin.sock, 'fraud:list')).ok, 'the marketing admin cannot');
    a = await req(admin.sock, 'settings:set', { key: 'fraudFailedPayments24h', value: '1' });
    ok(!a.ok && /whole number between 2 and 100/.test(a.error), 'a threshold outside its range is refused', a.error);
    a = await req(admin.sock, 'settings:set', { key: 'fraudReturnRatePct', value: '12.5' });
    ok(!a.ok, 'a fractional threshold is refused');
    for (const [k, v] of Object.entries({ fraudNewAccountOrders24h: '2', fraudAddressChanges24h: '2', fraudSharedAccounts: '2', fraudFailedPayments24h: '3', fraudReturnMinOrders: '2', fraudReturnRatePct: '50' })) {
      a = await req(admin.sock, 'settings:set', { key: k, value: v });
      if (!a.ok) ok(false, `set ${k}`, a.error);
    }
    ok((await req(admin.sock, 'settings:get')).data.fraudNewAccountOrders24h === '2', 'thresholds are saved');
    ok((await req(guest.sock, 'settings:get')).data.fraudNewAccountOrders24h === undefined, 'but guests and shoppers never see them');

    const cheap = (await req(admin.sock, 'products:create', { name: `Fraud item ${tag}`, price: 5, category: 'Electronics', stock: 500 })).data;
    const alertsFor = async (c) => ((await req(sup.sock, 'fraud:list')).data ?? []).filter((x) => x.customerId === c.user.id);
    const place = (c, method = 'wallet') => req(c.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: method });
    const fund = async (c) => { await req(c.sock, 'wallet:topup', { amountUsd: 50, method: 'airtel_money', phone: '+243812345678' }); await until(async () => (await req(c.sock, 'wallet:get')).data.balance >= 50); };

    section('Fraud: many orders from a brand-new account in 24 hours');
    const c1 = await register('newbie'); sockets.push(c1.sock);
    await fund(c1);
    ok((await place(c1)).ok, 'first order placed');
    ok((await alertsFor(c1)).length === 0, 'one order raises nothing');
    ok((await place(c1)).ok, 'second order placed (limit set to 2)');
    let list = await alertsFor(c1);
    const na = list.find((x) => x.type === 'new_account_orders');
    ok(!!na && /2 orders in the last 24 hours from an account created/.test(na.reason) && /commandes/.test(na.reasonFr) && na.status === 'open', 'an alert with the reason and its French text', JSON.stringify(list));
    ok((await place(c1)).ok, 'third order placed');
    ok((await alertsFor(c1)).filter((x) => x.type === 'new_account_orders').length === 1, 'still one alert for the day (deduplicated)');

    section('Fraud: many address changes before delivery');
    const first = await req(c1.sock, 'addresses:create', { label: 'A', line1: '1 Rue', city: 'Kinshasa' });
    ok(first.ok, 'an address is added while orders are on their way');
    await req(c1.sock, 'addresses:update', { id: first.data.id, patch: { line1: '2 Rue Autre' } });
    const ac = await until(async () => (await alertsFor(c1)).find((x) => x.type === 'address_changes'));
    ok(!!ac && /delivery address changes in the last 24 hours/.test(ac.reason), 'a second change raises the alert at once (no waiting for the sweep)', JSON.stringify(ac));

    section('Fraud: the same phone on several accounts');
    const sharedPhone = `+2438${tag}`.slice(0, 13);
    const p1 = await register('phoneA', { phone: sharedPhone }); sockets.push(p1.sock);
    const p2 = await register('phoneB', { phone: sharedPhone }); sockets.push(p2.sock);
    await fund(p2);
    ok((await place(p2)).ok, 'the second account places an order');
    const sp = await until(async () => (await alertsFor(p2)).find((x) => x.type === 'shared_identity'));
    ok(!!sp && /2 accounts use the same phone number/.test(sp.reason), 'an alert says 2 accounts share the phone', JSON.stringify(sp));

    section('Fraud: many failed payment attempts (the sweep picks them up)');
    const c4 = await register('failer'); sockets.push(c4.sock);
    for (let i = 0; i < 3; i++) {
      await db.execute('INSERT INTO payments (id, reference, userId, method, amountUsd, status, purpose, failureReason) VALUES (UUID(), ?, ?, ?, 10, ?, ?, ?)', [`SMK${tag}${i}`.slice(0, 24), c4.user.id, 'airtel_money', 'failed', 'order', 'declined']);
    }
    const fp = await until(async () => (await alertsFor(c4)).find((x) => x.type === 'failed_payments'), 20000);
    ok(!!fp && fp.reason === '3 failed payment attempts in the last 24 hours (limit 3).', 'an alert after the sweep, with the count and the limit', JSON.stringify(fp));
    ok(fp && /tentatives de paiement/.test(fp.reasonFr), 'and its French text');

    section('Fraud: a high refund/return rate over 30 days');
    const c5 = await register('returner'); sockets.push(c5.sock);
    await fund(c5);
    const o1 = (await place(c5)).data, o2 = (await place(c5)).data;
    for (const o of [o1, o2]) {
      await db.execute("INSERT INTO disputes (id, reference, orderId, orderReference, customerId, customerName, type, reason) VALUES (UUID(), ?, ?, ?, ?, ?, 'return', 'smoke')", [`RSM${o.id.slice(0, 8)}`.slice(0, 24), o.id, o.reference, c5.user.id, 'returner user']);
    }
    const rr = await until(async () => (await alertsFor(c5)).find((x) => x.type === 'return_rate'), 20000);
    ok(!!rr && /2 of 2 orders in the last 30 days were returned, disputed or refunded \(100%, limit 50%\)/.test(rr.reason), 'an alert says 2 of 2 orders came back', JSON.stringify(rr));

    section('Fraud: a rule alert can be reviewed and blocked from the page; Block suspends the account');
    a = await req(mktLogin.sock, 'fraud:setStatus', { id: fp.id, status: 'reviewed' });
    ok(!a.ok, 'marketing cannot touch alerts');
    a = await req(sup.sock, 'fraud:setStatus', { id: fp.id, status: 'blocked' });
    ok(!a.ok && /Confirm/.test(a.error), 'blocking needs the confirmation', a.error);
    a = await req(sup.sock, 'fraud:setStatus', { id: fp.id, status: 'blocked', confirm: true });
    ok(a.ok && a.data.status === 'blocked', 'the support admin blocks the alert (an alert with no order)');
    r = await rest('/api/v1/auth/login', { email: `failer${tag}@fraud.test`, password: 'Fraud-Pass-2026' });
    ok(r.status === 401 && /suspended/.test(r.json?.message ?? ''), 'the customer can no longer sign in');
    a = await req(sup.sock, 'fraud:setStatus', { id: fp.id, status: 'open', confirm: true });
    ok(a.ok, 'moving it back reactivates the account');
    r = await rest('/api/v1/auth/login', { email: `failer${tag}@fraud.test`, password: 'Fraud-Pass-2026' });
    ok(r.status === 200, 'and they can sign in again');

    section('Fraud: cash on delivery cap (only while COD is offered)');
    await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });
    const cod1 = await register('cod1'); sockets.push(cod1.sock);
    a = await place(cod1, 'cod');
    ok(!a.ok, 'COD is refused while the flag is off, so no COD alert can exist');
    await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'true' });
    await req(admin.sock, 'settings:set', { key: 'codCapUsd', value: '1' });
    a = await place(cod1, 'cod');
    const cod = a.ok ? await until(async () => (await alertsFor(cod1)).find((x) => x.type === 'cod_risk')) : null;
    ok(!!cod && /^Cash-on-delivery order of \$\d+\.\d\d is above the \$1\.00 cap\.$/.test(cod.reason), 'with COD on, an order above the cap raises the COD alert with its reason', a.error ?? JSON.stringify(cod));
  } finally {
    // put back what this suite changed
    for (const k of ['codEnabled', 'codCapUsd', 'requireStaffTwoFactor', 'fraudNewAccountOrders24h', 'fraudAddressChanges24h', 'fraudSharedAccounts', 'fraudFailedPayments24h', 'fraudReturnMinOrders', 'fraudReturnRatePct']) {
      if (saved[k] !== undefined) await req(restorer.sock, 'settings:set', { key: k, value: saved[k] }).catch(() => undefined);
    }
    await db.end().catch(() => undefined);
    sockets.forEach((s) => s.close());
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
