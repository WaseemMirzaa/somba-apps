/* Production-mode check (NODE_ENV=production, MM_PROVIDER=manual, bootstrap data only):
 * the safe defaults are really in force and manual payment confirmation works.
 *   API_URL=http://localhost:3003 ADMIN_EMAIL=… ADMIN_PASSWORD=… node test/prod-check.cjs */
const { io } = require('socket.io-client');
const API = process.env.API_URL ?? 'http://localhost:3003';
const tag = Date.now().toString().slice(-8);
let pass = 0; const fails = [];
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fails.push(n); console.log('  ❌ ' + n + ' ' + x); } };
const rest = async (path, body) => { const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };
const conn = (t) => new Promise((res, rej) => { const s = io(API, { auth: t ? { token: t } : {}, transports: ['websocket'], forceNew: true }); s.on('ready', () => res(s)); s.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 8000); });
const req = (s, e, b = {}) => new Promise((r) => s.emit(e, b, r));
(async () => {
  const al = await rest('/api/v1/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  ok(al.status === 200, 'the bootstrap admin can sign in');
  const admin = await conn(al.json.accessToken);
  const reg = await rest('/api/v1/auth/register', { email: `prod${tag}@check.test`, password: 'Prod-Check-2026', name: 'Prod Check' });
  ok(reg.status === 201, 'a customer can register');
  const cust = await conn(reg.json.accessToken);
  const staffTry = await rest('/api/v1/auth/register', { email: `evil${tag}@check.test`, password: 'Prod-Check-2026', name: 'Evil', role: 'admin' });
  ok(staffTry.status === 403, 'registering as admin is refused');
  const settings = (await req(admin, 'settings:get')).data;
  ok(settings.codEnabled === 'false' && settings.productModeration === 'true' && settings.requireDeliveryCode === 'true', 'production defaults: COD off, moderation on, handover code required', JSON.stringify(settings));
  ok(settings.requireVerifiedForCheckout === 'true', 'production default: a verified phone or email is required to check out', JSON.stringify(settings));
  ok((await req(cust, 'settings:get')).data.requireVerifiedForCheckout === 'true', 'and customers can read the policy (to show the prompt)');
  const unv = await req(cust, 'orders:create', { items: [{ name: 'Free stuff', priceUsd: 1, qty: 1 }], paymentMethod: 'wallet', zoneId: 'gombe' });
  ok(!unv.ok && /verify/i.test(unv.error ?? ''), 'an unverified customer is told to verify before ordering', unv.error ?? '');
  const unvTop = await req(cust, 'wallet:topup', { amountUsd: 25, method: 'orange_money', phone: '+243822222222' });
  ok(!unvTop.ok && /verify/i.test(unvTop.error ?? ''), 'and before topping up');
  ok(!(await req(cust, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' })).ok, 'a customer cannot switch the policy off');
  // the rest of this check exercises payment paths, so switch the policy off (as an admin could)
  await req(admin, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' });
  ok(!(await req(cust, 'orders:create', { items: [{ name: 'Free stuff', priceUsd: 1, qty: 1 }], paymentMethod: 'wallet', zoneId: 'gombe' })).ok, 'client-priced items are refused in production');
  const fp = await rest('/api/v1/auth/forgot', { email: `prod${tag}@check.test` });
  ok(fp.status === 200 && !fp.json.devToken, 'no reset token is leaked in production');
  const t = await req(cust, 'wallet:topup', { amountUsd: 25, method: 'orange_money', phone: '+243822222222' });
  ok(t.ok && t.data.status === 'pending', 'a mobile-money top-up waits for finance (manual provider)');
  ok(!(await req(cust, 'payments:confirm', { reference: t.data.reference })).ok, 'the customer cannot confirm it');
  const before = (await req(cust, 'wallet:get')).data.balance;
  const c = await req(admin, 'payments:confirm', { reference: t.data.reference });
  ok(c.ok && c.data.status === 'succeeded', 'the admin confirms it');
  await new Promise((r) => setTimeout(r, 500));
  ok((await req(cust, 'wallet:get')).data.balance === before + 25, 'the wallet is credited');
  ok(!(await req(cust, 'orders:create', { items: [], paymentMethod: 'cod' })).ok, 'COD is refused');
  const staff = await req(admin, 'roles:createStaff', { email: `rider${tag}@check.test`, name: 'Rider One', role: 'rider' });
  ok(staff.ok && staff.data.tempPassword, 'the admin creates a rider account');
  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`); if (fails.length) console.log(fails.join('\n')); process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
