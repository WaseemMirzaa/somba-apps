/* End-to-end test of account lifecycle, uploads, push registration, new payment
 * methods and suspension — against a RUNNING API (non-production mode, because
 * it reads the dev-only `devToken` the API returns instead of emailing/SMS-ing).
 *
 *   API_URL=http://localhost:3001 ADMIN_EMAIL=... ADMIN_PASSWORD=... node test/account-smoke.cjs
 */
const { io } = require('socket.io-client');
const { createHmac } = require('crypto');

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@somba.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Somba@2026';
const MM_SECRET = process.env.MM_WEBHOOK_SECRET ?? 'dev-only-mm-webhook-secret';
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

  console.log('\n— Nobody can register themselves as staff');
  for (const role of ['admin', 'admin_finance', 'warehouse_staff', 'rider']) {
    const x = await rest('POST', '/api/v1/auth/register', { email: `esc-${role}-${tag}@smoke.test`, password: 'Smoke-Pass-2026', name: 'Eve', role });
    ok(x.status === 403, `register as ${role} is refused (403)`, `(got ${x.status})`);
  }
  const sx = await rest('POST', '/api/v1/auth/register', { email: `seller-${tag}@smoke.test`, password: 'Smoke-Pass-2026', name: 'Sam', role: 'seller' });
  ok(sx.status === 201 && sx.json.user.role === 'seller', 'a seller can still sign up');

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
  const PHONE = '+243 81 234 5678';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const orderOf = async (id) => (await req(s, 'orders:list')).data.find((o) => o.id === id);
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
  const balance = async () => (await req(s, 'wallet:get')).data.balance;
  const webhook = (obj, secret = MM_SECRET) => {
    const raw = JSON.stringify(obj);
    return fetch(API + '/api/v1/payments/webhook/mobile-money', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': createHmac('sha256', secret).update(raw).digest('hex') },
      body: raw,
    });
  };
  const payOf = async (orderId) => (await req(s, 'payments:list')).data.find((p) => p.orderId === orderId);

  console.log('\n— Cash on delivery is off by default');
  await req(admin, 'settings:set', { key: 'codEnabled', value: 'false' }); // (another suite may have enabled it)
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'cod', deliveryFeeUsd: 5 });
  ok(!a.ok && /not available/i.test(a.error ?? ''), 'COD refused while codEnabled is false', a.error ?? '');
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'bitcoin', deliveryFeeUsd: 5 });
  ok(!a.ok, 'unknown payment method refused');

  console.log('\n— Mobile money (Airtel / Orange / M-Pesa): pending until the network confirms');
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'orange_money', deliveryFeeUsd: 5 });
  ok(!a.ok && /phone/i.test(a.error ?? ''), 'mobile money needs a phone number', a.error ?? '');
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'orange_money', deliveryFeeUsd: 5, paymentPhone: 'abc' });
  ok(!a.ok, 'invalid phone number refused');
  const stockBefore = (await req(s, 'products:get', { id: pid })).data.stock;

  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'orange_money', deliveryFeeUsd: 5, paymentPhone: PHONE });
  ok(a.ok && a.data.status === 'pending', 'mobile-money order starts PENDING (not paid yet)', a.error ?? '');
  const mm1 = a.data;
  let pay = await payOf(mm1.id);
  ok(pay && pay.status === 'pending' && pay.purpose === 'order' && pay.providerRef?.startsWith('sbx_'), 'payment is pending with a provider reference');
  ok(pay && !pay.phone.includes('81 234') && pay.phone.includes('…'), 'subscriber number is masked in payment records');
  const unassignedNow = (await req(admin, 'delivery:unassigned')).data;
  ok(a.ok && !unassignedNow.some((t) => t.orderId === mm1.id), 'unpaid order is NOT visible to the warehouse/riders yet');
  a = await req(admin, 'orders:updateStatus', { orderId: mm1.id, status: 'shipped' });
  ok(!a.ok && /payment/i.test(a.error ?? ''), 'staff cannot ship an unpaid order', a.error ?? '');
  ok((await req(s, 'products:get', { id: pid })).data.stock === stockBefore - 1, 'stock is reserved while waiting for approval');

  const confirmed = await until(async () => { const o = await orderOf(mm1.id); return o?.status === 'confirmed' ? o : null; });
  ok(!!confirmed, 'subscriber approves → order becomes CONFIRMED (live)');
  ok((await req(admin, 'delivery:unassigned')).data.some((t) => t.orderId === mm1.id), 'confirmed order now reaches the warehouse');
  ok((await payOf(mm1.id))?.status === 'succeeded', 'payment is succeeded');

  // declined by the subscriber (sandbox: number ending 0000) → cancelled + restocked
  const stock2 = (await req(s, 'products:get', { id: pid })).data.stock;
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'vodacom_mpesa', deliveryFeeUsd: 5, paymentPhone: '+243810000000' });
  ok(a.ok, 'M-Pesa order placed');
  const declined = await until(async () => { const o = await orderOf(a.data.id); return o?.status === 'cancelled' ? o : null; });
  ok(!!declined, 'declined payment → order CANCELLED');
  ok((await req(s, 'products:get', { id: pid })).data.stock === stock2, 'declined payment → stock released');

  console.log('\n— Webhook security + idempotency');
  const body = (ref, extra = {}) => ({ reference: ref, status: 'succeeded', providerRef: `agg_${ref}`, ...extra });
  const bal0 = await balance();
  a = await req(s, 'wallet:topup', { amountUsd: 25, method: 'orange_money', phone: PHONE });
  ok(a.ok && a.data.status === 'pending' && a.data.purpose === 'topup', 'top-up returns a PENDING payment (wallet not credited yet)', a.error ?? '');
  const topRef = a.data.reference;
  ok((await balance()) === bal0, 'wallet is NOT credited before confirmation');
  let w = await webhook(body(topRef), 'wrong-secret');
  ok(w.status === 401, 'webhook with a bad signature is rejected (401)');
  w = await fetch(API + '/api/v1/payments/webhook/mobile-money', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(topRef)) });
  ok(w.status === 401, 'unsigned webhook is rejected (401)');
  w = await webhook(body(topRef, { amountUsd: 1 }));
  ok(w.status === 200 && (await balance()) === bal0, 'webhook reporting the WRONG amount does not credit the wallet');
  w = await webhook(body(topRef, { amountUsd: 25 }));
  ok(w.status === 200, 'correctly signed webhook accepted');
  ok((await until(async () => (await balance()) === bal0 + 25)) !== null, 'wallet credited +$25 by the webhook');
  await webhook(body(topRef, { amountUsd: 25 })); // replay
  await sleep(2200); // sandbox auto-confirm timer also fires — must not double-credit
  ok((await balance()) === bal0 + 25, 'replayed webhook + sandbox timer do NOT double-credit');
  w = await webhook(body('PAY-DOESNOTEXIST'));
  ok(w.status === 200, 'webhook for an unknown reference is acknowledged, not an error');
  a = await req(s, 'wallet:topup', { amountUsd: 25, method: 'stripe_card', phone: PHONE });
  ok(!a.ok, 'top-up only via mobile money');
  a = await req(s, 'wallet:topup', { amountUsd: 25, method: 'airtel_money' });
  ok(!a.ok, 'top-up needs a phone number');

  console.log('\n— Cancelling an UNPAID order gives no free refund; a late payment is not lost');
  const bal1 = await balance();
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'airtel_money', deliveryFeeUsd: 5, paymentPhone: PHONE });
  const unpaid = a.data;
  const unpaidPay = await payOf(unpaid.id);
  a = await req(s, 'orders:cancel', { orderId: unpaid.id });
  ok(a.ok && a.data.status === 'cancelled', 'customer cancels the unpaid order');
  ok((await balance()) === bal1, 'cancelling an unpaid order does NOT credit the wallet');
  ok((await payOf(unpaid.id))?.status === 'failed', 'its pending payment is closed');
  await webhook(body(unpaidPay.reference, { amountUsd: unpaid.totalUsd }));
  ok((await until(async () => (await balance()) === bal1 + unpaid.totalUsd)) !== null, 'money that arrives after cancellation is credited to the wallet (not lost)');
  ok((await orderOf(unpaid.id))?.status === 'cancelled', 'the cancelled order stays cancelled');

  console.log('\n— Cancelling a PAID order refunds exactly once');
  a = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'airtel_money', deliveryFeeUsd: 5, paymentPhone: PHONE });
  const paid = a.data;
  await until(async () => (await orderOf(paid.id))?.status === 'confirmed');
  const bal2 = await balance();
  a = await req(s, 'orders:cancel', { orderId: paid.id });
  ok(a.ok, 'customer cancels the paid order');
  ok((await balance()) === bal2 + paid.totalUsd, `paid order refunded to wallet (+$${paid.totalUsd})`);

  console.log('\n— Order integrity (the server, not the client, decides the price)');
  const real = (await req(s, 'products:get', { id: pid })).data;
  const mk = (over) => ({ items: [{ productId: pid, qty: 1 }], paymentMethod: 'orange_money', paymentPhone: PHONE, deliveryFeeUsd: 5, ...over });
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

  console.log('\n— Promo codes are applied by the server');
  const promoCode = `T${tag}`;
  a = await req(admin, 'promos:create', { code: promoCode, type: 'percent', value: 10, minOrder: 5, description: 'test' });
  ok(a.ok, 'admin creates a promo');
  const lineA = { items: [{ productId: pid, qty: 1 }], paymentMethod: 'orange_money', paymentPhone: PHONE, deliveryFeeUsd: 0 };
  a = await req(s, 'orders:create', { ...lineA, promoCode });
  ok(a.ok && a.data.promoCode === promoCode.toUpperCase() && a.data.discountUsd > 0 && Math.abs(a.data.totalUsd - (a.data.subtotalUsd - a.data.discountUsd)) < 0.011, `discount applied on the server (-$${a.data?.discountUsd})`, a.error ?? '');
  a = await req(s, 'orders:create', { ...lineA, promoCode: 'NOPE-NOT-REAL' });
  ok(!a.ok, 'unknown promo code is rejected (not silently ignored)');
  a = await req(s, 'orders:create', { ...lineA, promoCode, deliveryFeeUsd: 5 });
  ok(a.ok && Math.abs(a.data.totalUsd - (a.data.subtotalUsd - a.data.discountUsd + 5)) < 0.011, 'promo + delivery fee add up');

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
