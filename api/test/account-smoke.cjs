/* End-to-end test of account lifecycle, uploads, push registration, new payment
 * methods and suspension — against a RUNNING API (non-production mode, because
 * it reads the dev-only `devToken` the API returns instead of emailing/SMS-ing).
 *
 *   API_URL=http://localhost:3001 ADMIN_EMAIL=... ADMIN_PASSWORD=... node test/account-smoke.cjs
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

const rest = async (method, path, body, token, raw) => {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const email = `acct${tag}@smoke.test`;
  const pw = 'Smoke-Pass-2026';

  console.log('\n— Registration & email verification');
  let r = await rest('POST', '/api/v1/auth/register', { email, password: pw, name: 'Smoke User', phone: '+243 970 000 111' });
  ok(r.status === 201 && r.json.user.emailVerified === false && r.json.user.prefs.push === true, 'register → unverified, default prefs');
  let { accessToken: at, refreshToken: rt } = r.json;

  r = await rest('POST', '/api/v1/auth/email/send', null, at);
  ok(r.status === 200 && r.json.devToken, 'email/send returns a dev token (non-prod only)');
  const emailTok = r.json.devToken;
  r = await rest('POST', '/api/v1/auth/email/send', null, at);
  ok(r.status === 429 || r.status === 200 && r.json.sent === false, 'email resend inside cooldown is refused', `(got ${r.status})`);
  r = await rest('POST', '/api/v1/auth/email/verify', { token: 'f'.repeat(64) });
  ok(r.status === 400, 'bogus email token rejected');
  r = await rest('POST', '/api/v1/auth/email/verify', { token: emailTok });
  ok(r.status === 200 && r.json.verified === true, 'real email token verifies');
  r = await rest('POST', '/api/v1/auth/email/verify', { token: emailTok });
  ok(r.status === 400, 'email token is single-use');
  r = await rest('GET', '/api/v1/auth/me', null, at);
  ok(r.json.emailVerified === true, '/auth/me now shows emailVerified');

  console.log('\n— Phone OTP');
  r = await rest('POST', '/api/v1/auth/phone/send', null, at);
  ok(r.status === 200 && /^\d{6}$/.test(r.json.devToken ?? ''), 'phone/send issues a 6-digit code');
  const code = r.json.devToken;
  r = await rest('POST', '/api/v1/auth/phone/verify', { code: code === '000000' ? '111111' : '000000' }, at);
  ok(r.status === 400, 'wrong OTP rejected');
  r = await rest('POST', '/api/v1/auth/phone/verify', { code }, at);
  ok(r.status === 200 && r.json.verified, 'correct OTP verifies phone');

  console.log('\n— OTP brute-force lockout');
  await new Promise((x) => setTimeout(x, 31_000)); // clear the resend cooldown
  r = await rest('POST', '/api/v1/auth/phone/send', null, at);
  const code2 = r.json.devToken;
  const wrong = code2 === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) await rest('POST', '/api/v1/auth/phone/verify', { code: wrong }, at);
  r = await rest('POST', '/api/v1/auth/phone/verify', { code: code2 }, at);
  ok(r.status === 400, 'after 5 wrong tries even the CORRECT code is locked out');

  console.log('\n— Profile, prefs, password (WebSocket)');
  let s = await connect(at);
  let a = await req(s, 'me:update', { name: 'Smoke Renamed', phone: '+243 970 000 222' });
  ok(a.ok && a.data.name === 'Smoke Renamed' && a.data.phoneVerified === false, 'me:update renames + un-verifies a changed phone');
  a = await req(s, 'me:update', { phone: 'not-a-phone' });
  ok(!a.ok, 'invalid phone rejected');
  a = await req(s, 'me:update', { name: 'x' });
  ok(!a.ok, 'too-short name rejected');
  a = await req(s, 'me:setPrefs', { sms: true, market: 'DRC' });
  ok(a.ok && a.data.sms === true && a.data.market === 'DRC' && a.data.push === true, 'me:setPrefs merges preferences');
  a = await req(s, 'me:setPrefs', { market: 'MARS' });
  ok(!a.ok, 'invalid market rejected');
  a = await req(s, 'me:prefs');
  ok(a.ok && a.data.market === 'DRC', 'prefs persisted');
  a = await req(s, 'me:changePassword', { current: 'wrong-password', next: 'New-Pass-2026' });
  ok(!a.ok, 'change password needs the correct current password');
  a = await req(s, 'me:changePassword', { current: pw, next: 'New-Pass-2026' });
  ok(a.ok && a.data.accessToken, 'change password returns fresh tokens');
  const oldRefresh = rt;
  at = a.data.accessToken; rt = a.data.refreshToken;
  r = await rest('POST', '/api/v1/auth/refresh', { refreshToken: oldRefresh });
  ok(r.status === 401, 'old refresh token revoked after password change');
  r = await rest('POST', '/api/v1/auth/refresh', { refreshToken: rt });
  ok(r.status === 200, 'new refresh token works');
  s.close();

  console.log('\n— Forgot / reset password');
  r = await rest('POST', '/api/v1/auth/forgot', { email: `nobody${tag}@smoke.test` });
  ok(r.status === 200 && r.json.sent === true && !r.json.devToken, 'unknown email → same {sent:true}, no token (no account enumeration)');
  r = await rest('POST', '/api/v1/auth/forgot', { email });
  ok(r.status === 200 && r.json.devToken, 'known email issues a reset token');
  const resetTok = r.json.devToken;
  r = await rest('POST', '/api/v1/auth/reset', { token: resetTok, password: 'short' });
  ok(r.status === 400, 'weak new password rejected');
  r = await rest('POST', '/api/v1/auth/reset', { token: resetTok, password: 'Reset-Pass-2026' });
  ok(r.status === 200, 'reset with valid token succeeds');
  r = await rest('POST', '/api/v1/auth/reset', { token: resetTok, password: 'Another-Pass-2026' });
  ok(r.status === 400, 'reset token is single-use');
  r = await rest('POST', '/api/v1/auth/login', { email, password: 'New-Pass-2026' });
  ok(r.status === 401, 'previous password no longer works');
  r = await rest('POST', '/api/v1/auth/refresh', { refreshToken: rt });
  ok(r.status === 401, 'reset signed out existing sessions');
  r = await rest('POST', '/api/v1/auth/login', { email, password: 'Reset-Pass-2026' });
  ok(r.status === 200, 'login with the reset password works');
  at = r.json.accessToken; rt = r.json.refreshToken;
  const userId = r.json.user.id;

  console.log('\n— Uploads');
  const form = (buf, type, name) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); return f; };
  r = await rest('POST', '/api/v1/uploads', form(PNG, 'image/png', 'a.png'), null, true);
  ok(r.status === 401, 'upload without a token → 401');
  r = await rest('POST', '/api/v1/uploads', form(Buffer.from('<script>alert(1)</script>'), 'text/html', 'x.html'), at, true);
  ok(r.status === 400, 'HTML upload rejected');
  r = await rest('POST', '/api/v1/uploads', form(Buffer.from('<script>alert(1)</script>'), 'image/png', 'evil.png'), at, true);
  ok(r.status === 400, 'HTML disguised as image/png rejected by magic-byte check');
  r = await rest('POST', '/api/v1/uploads', form(Buffer.alloc(6 * 1024 * 1024, 1), 'image/png', 'big.png'), at, true);
  ok(r.status === 413 || r.status === 400, 'oversize file rejected', `(got ${r.status})`);
  r = await rest('POST', '/api/v1/uploads', form(PNG, 'image/png', 'a.png'), at, true);
  ok(r.status === 201 && /\/uploads\/[0-9a-f-]+\.png$/.test(r.json?.url ?? ''), 'valid PNG accepted → public URL');
  if (r.json?.url) {
    const img = await fetch(r.json.url);
    ok(img.status === 200 && img.headers.get('content-type') === 'image/png' && img.headers.get('x-content-type-options') === 'nosniff', 'uploaded image is served with nosniff');
  }

  console.log('\n— Push device registry');
  s = await connect(at);
  a = await req(s, 'devices:register', { token: `fcm-${tag}`, platform: 'android', app: 'customer' });
  ok(a.ok && a.data.registered === true, 'devices:register');
  a = await req(s, 'devices:unregister', { token: `fcm-${tag}` });
  ok(a.ok, 'devices:unregister');

  console.log('\n— New payment methods (Orange Money, Vodacom M-Pesa)');
  const adminLogin = await rest('POST', '/api/v1/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  ok(adminLogin.status === 200, 'admin can sign in');
  const admin = await connect(adminLogin.json.accessToken);
  let products = (await req(s, 'products:list')).data;
  if (!products.length) {
    const p = await req(admin, 'products:create', { name: 'Smoke Item', price: 10, category: 'Electronics', stock: 50 });
    products = [p.data];
  }
  const pid = products[0].id;
  for (const method of ['orange_money', 'vodacom_mpesa']) {
    a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: method, deliveryFeeUsd: 5 });
    ok(a.ok && a.data.paymentMethod === method, `order paid with ${method}`, a.error ?? '');
  }

  console.log('\n— Order integrity (the server, not the client, decides the price)');
  const real = (await req(s, 'products:get', { id: pid })).data;
  const mk = (over) => ({ items: [{ productId: pid, qty: 1 }], paymentMethod: 'orange_money', deliveryFeeUsd: 5, ...over });
  a = await req(s, 'orders:create', mk({ deliveryFeeUsd: -5 }));
  ok(!a.ok, 'negative delivery fee rejected');
  a = await req(s, 'orders:create', mk({ deliveryFeeUsd: 9999 }));
  ok(!a.ok, 'absurd delivery fee rejected');
  for (const q of [0, 1.5, -2, 101, 'abc']) {
    a = await req(s, 'orders:create', mk({ items: [{ productId: pid, qty: q }] }));
    ok(!a.ok, `quantity ${JSON.stringify(q)} rejected`);
  }
  a = await req(s, 'orders:create', mk({ items: [{ name: 'Not A Real Product', priceUsd: -10, qty: 1 }] }));
  ok(!a.ok, 'negative client-supplied price rejected');
  a = await req(s, 'orders:create', mk({ items: [{ name: 'Not A Real Product', priceUsd: 0, qty: 1 }] }));
  ok(!a.ok, 'zero client-supplied price rejected');
  a = await req(s, 'orders:create', mk({ items: [{ name: real.name, priceUsd: 0.01, qty: 1 }] }));
  ok(a.ok && a.data.items[0].priceUsd === real.price, `underpaying a real product is impossible (charged ${a.data?.items?.[0]?.priceUsd}, listed ${real.price})`);
  await req(admin, 'products:update', { id: pid, patch: { stock: 2 } });
  a = await req(s, 'orders:create', mk({ items: [{ productId: pid, qty: 3 }] }));
  ok(!a.ok && /Only 2/.test(a.error ?? ''), 'cannot order more than is in stock', a.error ?? '');
  a = await req(s, 'orders:create', mk({ items: [{ productId: pid, qty: 2 }] }));
  ok(a.ok, 'ordering exactly the remaining stock works');
  a = await req(s, 'orders:create', mk({ items: [{ productId: pid, qty: 1 }] }));
  ok(!a.ok && /out of stock/i.test(a.error ?? ''), 'sold-out product cannot be ordered', a.error ?? '');
  await req(admin, 'products:update', { id: pid, patch: { stock: 50 } });

  console.log('\n— Suspended customers are locked out');
  a = await req(admin, 'customers:setActive', { id: userId, active: false });
  ok(a.ok, 'admin suspends the customer');
  r = await rest('POST', '/api/v1/auth/login', { email, password: 'Reset-Pass-2026' });
  ok(r.status === 401, 'suspended customer cannot log in');
  r = await rest('POST', '/api/v1/auth/refresh', { refreshToken: rt });
  ok(r.status === 401, 'suspended customer cannot refresh');
  const blocked = await connect(at).then(() => false).catch(() => true);
  ok(blocked, 'suspended customer cannot open an authenticated socket (rejected at handshake)');
  a = await req(admin, 'customers:setActive', { id: userId, active: true });
  r = await rest('POST', '/api/v1/auth/login', { email, password: 'Reset-Pass-2026' });
  ok(r.status === 200, 'reactivated customer can log in again');
  at = r.json.accessToken;

  console.log('\n— Account deletion');
  s.close(); s = await connect(at);
  a = await req(s, 'me:delete', { password: 'wrong' });
  ok(!a.ok, 'delete needs the right password');
  a = await req(s, 'me:delete', { password: 'Reset-Pass-2026' });
  ok(a.ok && a.data.deleted, 'me:delete erases the account');
  r = await rest('POST', '/api/v1/auth/login', { email, password: 'Reset-Pass-2026' });
  ok(r.status === 401, 'deleted account cannot log in');
  r = await rest('POST', '/api/v1/auth/register', { email, password: pw, name: 'Reborn' });
  ok(r.status === 201, 'the email address is free to register again');

  admin.close();
  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) console.log('Failed:\n - ' + fails.join('\n - '));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
