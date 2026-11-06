/* The "type this in live" paths of deploy/DEMO-SEED.md, end to end: a new customer signs up, a new store owner registers
 * with the sample KYC documents of deploy/demo/kyc, an admin approves it, the owner lists a product.
 *
 *   API_URL=http://localhost:3063 DEMO_CREDENTIALS_FILE=... GUIDE_PASSWORD='any 10+ characters' node test/demo-signup-check.cjs
 *
 * It creates two accounts on the demo domain (guide.customer / guide.seller @demo.sombateka.test): the removal takes them out.
 * It needs the demo admin (credentials file) for the approval step.
 */
const { io } = require('socket.io-client');
const { readFileSync } = require('fs');
const { join } = require('path');
const { createHmac } = require('crypto');
const API = process.env.API_URL ?? 'http://localhost:3063';
const PW = process.env.GUIDE_PASSWORD;
if (!PW || PW.length < 10) throw new Error('Set GUIDE_PASSWORD (10 or more characters).');
let pass = 0; const fails = [];
const ok = (c, n, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fails.push(n); console.log(`  ❌ ${n} ${x}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token) => { const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const connect = (token) => new Promise((res, rej) => { const s = io(API, { auth: { token }, transports: ['websocket'] }); s.on('ready', () => res(s)); s.on('connect_error', rej); setTimeout(() => rej(new Error('socket timeout')), 10000); });
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
const cred = readFileSync(process.env.DEMO_CREDENTIALS_FILE, 'utf8');
const field = (email, key) => new RegExp(`\\[${email}\\][^\\[]*?\\n${key} = (\\S+)`).exec(cred)?.[1];
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let b = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); b += 5; if (b >= 8) { o.push((v >>> (b - 8)) & 255); b -= 8; } } return Buffer.from(o); };
const totp = (k) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(k)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };

(async () => {
  console.log('— New customer sign-up');
  const c = await post('/api/v1/auth/register', { email: 'guide.customer@demo.sombateka.test', password: PW, name: 'Guide Customer', phone: '+243 900 000 901', locale: 'en' });
  ok(c.status === 201, 'customer registers', JSON.stringify(c.json));
  const cs = await connect(c.json.accessToken);
  ok((await req(cs, 'me:get')).data?.role === 'customer', 'customer is signed in over the socket');
  const unverified = await req(cs, 'orders:create', { items: [{ productId: 'x', qty: 1 }], paymentMethod: 'wallet' });
  ok(unverified.ok === false, 'a new, unverified customer cannot order yet', JSON.stringify(unverified).slice(0, 100));
  cs.close();

  console.log('\n— New seller registration with the sample documents');
  const u = await post('/api/v1/auth/register', { email: 'guide.seller@demo.sombateka.test', password: PW, name: 'Guide Owner', phone: '+243 900 000 902', role: 'seller' });
  ok(u.status === 201, 'store owner account registers', JSON.stringify(u.json));
  const token = u.json.accessToken;
  const urls = [];
  for (const f of ['sample-id-card.jpg', 'sample-rccm.jpg']) {
    const fd = new FormData(); fd.append('file', new Blob([readFileSync(join(__dirname, '..', '..', 'deploy', 'demo', 'kyc', f))], { type: 'image/jpeg' }), f);
    const r = await fetch(API + '/api/v1/private-uploads', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
    const j = await r.json(); ok(r.status === 201 && j.url, `${f} uploaded as a private document`, JSON.stringify(j)); urls.push(j.url);
  }
  const os = await connect(token);
  const reg = await req(os, 'sellers:register', { name: 'Guide Store', legalName: 'Guide Store SARL (demo)', phone: '+243 900 000 902', idNumber: 'DEMO-ID-0901', rccm: 'CD/KIN/RCCM/DEMO-0901', taxNumber: 'A0000901D', documentUrls: urls, acceptTerms: true });
  ok(reg.ok && reg.data?.status === 'pending', 'store application is pending', JSON.stringify(reg).slice(0, 120));
  const refused = await req(os, 'products:create', { name: 'Too early', price: 5, category: 'Grocery', stock: 1 });
  ok(refused.ok === false, 'listing is refused while the application is pending', JSON.stringify(refused).slice(0, 100));

  console.log('\n— Admin approves');
  const adminEmail = 'admin.super@demo.sombateka.test';
  const l = await post('/api/v1/auth/login', { email: adminEmail, password: field(adminEmail, 'password') });
  await sleep(1200);
  const t = await post('/api/v1/auth/login/2fa', { challenge: l.json.challenge, code: totp(field(adminEmail, 'totp_key')) });
  ok(t.status === 200 || t.status === 201, 'demo super admin signs in with the two-factor code', JSON.stringify(t.json));
  const as = await connect(t.json.accessToken);
  const pending = (await req(as, 'sellers:list', { status: 'pending', limit: 50 })).data ?? [];
  const mine = (Array.isArray(pending) ? pending : pending.items ?? []).find((s) => s.name === 'Guide Store');
  ok(!!mine, 'the application is in the admin queue');
  const docs = await req(as, 'private:link', { id: urls[0].split('/').pop() });
  ok(docs.ok && docs.data?.url, 'the admin can open the uploaded document');
  const ap = await req(as, 'sellers:setStatus', { id: mine?.id, status: 'approved', reason: 'Demo approval' });
  ok(ap.ok, 'admin approves the store', JSON.stringify(ap).slice(0, 100));
  const seller = (await req(os, 'sellers:mine')).data;
  ok(seller?.status === 'approved', 'the owner sees the store approved');
  const noPin = await req(os, 'products:create', { name: 'Notebook', price: 3, category: 'Books', stock: 5 });
  ok(noPin.ok === false && /pin/i.test(noPin.error ?? ''), 'listing needs the pickup pin first', JSON.stringify(noPin).slice(0, 100));
  as.close(); os.close();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed: ' + fails.join('; ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
