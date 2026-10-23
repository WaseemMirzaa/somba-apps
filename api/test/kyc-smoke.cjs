/* Seller KYC, decision reasons and listing restore on reinstatement.
 * Runs against a RUNNING dev API seeded with `npm run seed`.
 *
 *   ADMIN_PW=... API_URL=http://localhost:3001 node test/kyc-smoke.cjs
 *
 * Covers: register refused without KYC; register with KYC -> pending; reject needs a reason;
 * the seller sees the reason; resubmit -> pending with the reason cleared; approve; suspend
 * (reason required) drafts the live listing; reinstate puts it live again; the public
 * storefront carries no KYC / moderation fields.
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
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@kyc.test`, password: 'Kyc-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

const KYC_FIELDS = ['legalName', 'phone', 'idNumber', 'rccm', 'taxNumber', 'documentUrls', 'termsAcceptedAt', 'kycSubmittedAt', 'statusReason', 'statusChangedAt', 'suspendedListingIds', 'userId', 'pickupAddress'];

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const moderation = (await req(admin.sock, 'settings:get')).data?.productModeration;
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  const guest = await connect(null);

  try {
    const seller = await register('kycseller', 'seller');
    const mine = async () => (await req(seller.sock, 'sellers:mine')).data;

    section('Registering needs KYC');
    let a = await req(seller.sock, 'sellers:register', { name: `Bare Store ${tag}` });
    ok(!a.ok && /Legal name/.test(a.error ?? ''), 'a bare { name } registration is refused', a.error);
    a = await req(seller.sock, 'sellers:register', kyc(`KYC Store ${tag}`, { acceptTerms: false }));
    ok(!a.ok && /accept the seller terms/.test(a.error ?? ''), 'terms must be accepted', a.error);
    a = await req(seller.sock, 'sellers:register', kyc(`KYC Store ${tag}`, { documentUrls: [] }));
    ok(!a.ok && /between 1 and 5/.test(a.error ?? ''), 'at least one document is required', a.error);
    a = await req(seller.sock, 'sellers:register', kyc(`KYC Store ${tag}`, { documentUrls: ['https://evil.example/x.png'] }));
    ok(!a.ok && /Document/.test(a.error ?? ''), 'documents must be platform uploads', a.error);
    ok((await mine()) === null, 'nothing was created by the refused attempts');

    a = await req(seller.sock, 'sellers:register', kyc(`KYC Store ${tag}`));
    const store = a.data;
    ok(a.ok && store.status === 'pending' && !!store.kycSubmittedAt && !!store.termsAcceptedAt, 'a complete application is accepted as pending', a.error);
    ok(Array.isArray(store?.documentUrls) && store.documentUrls.length === 1 && store.legalName && store.phone && store.idNumber, 'the owner sees their KYC (documents as an array)', JSON.stringify(store));
    const again = await req(seller.sock, 'sellers:register', kyc(`Another ${tag}`));
    ok(again.ok && again.data.id === store.id, 'registering again returns the same store (idempotent)');

    section('Admin sees the KYC');
    a = await req(admin.sock, 'sellers:get', { id: store.id });
    ok(a.ok && a.data.legalName === store.legalName && Array.isArray(a.data.documentUrls) && !('suspendedListingIds' in a.data), 'sellers:get returns the store with parsed documents', a.error);
    a = await req(seller.sock, 'sellers:get', { id: store.id });
    ok(!a.ok, 'sellers:get is admin-only');
    const listed = (await req(admin.sock, 'sellers:list', { limit: 200 })).data?.find((s) => s.id === store.id);
    ok(listed && listed.idNumber === store.idNumber, 'sellers:list carries the KYC for admins');

    section('Rejection needs a reason the seller can read');
    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'rejected' });
    ok(!a.ok && /reason/i.test(a.error ?? ''), 'reject without a reason is refused', a.error);
    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'rejected', reason: 'abc' });
    ok(!a.ok, 'a too-short reason is refused');
    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'rejected', reason: 'The ID photo is unreadable.' });
    ok(a.ok && a.data.status === 'rejected', 'reject with a reason works', a.error);
    let m = await mine();
    ok(m.status === 'rejected' && m.statusReason === 'The ID photo is unreadable.' && !!m.statusChangedAt, 'the seller sees the reason via sellers:mine', JSON.stringify(m));

    section('Resubmission');
    a = await req(seller.sock, 'sellers:resubmit', kyc(`KYC Store ${tag}`, { acceptTerms: false }));
    ok(!a.ok && /accept the seller terms/.test(a.error ?? ''), 'resubmit is validated like register', a.error);
    a = await req(seller.sock, 'sellers:resubmit', kyc(`KYC Store ${tag}`, { legalName: `KYC Store ${tag} SA` }));
    ok(a.ok && a.data.status === 'pending' && a.data.statusReason === null && a.data.legalName === `KYC Store ${tag} SA`, 'a rejected store resubmits: pending again, reason cleared', a.error);
    a = await req(seller.sock, 'sellers:resubmit', kyc(`KYC Store ${tag}`));
    ok(!a.ok, 'a pending store with KYC on file cannot resubmit again', a.error);

    section('Approval, listings, suspension and reinstatement');
    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved', reason: 'Documents verified' });
    ok(a.ok && a.data.status === 'approved', 'approve (reason optional)', a.error);
    const prod = (await req(seller.sock, 'products:create', { name: `KYC lamp ${tag}`, price: 12, category: 'Electronics', stock: 5 })).data;
    ok(prod?.status === 'live', 'the approved seller publishes a live product', prod?.status);

    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'suspended' });
    ok(!a.ok && /reason/i.test(a.error ?? ''), 'suspend without a reason is refused', a.error);
    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'suspended', reason: 'Counterfeit complaints under review.' });
    ok(a.ok && a.data.status === 'suspended', 'suspend with a reason works', a.error);
    let p = (await req(admin.sock, 'products:get', { id: prod.id })).data;
    ok(p?.status === 'draft', 'the live listing went to draft', p?.status);
    a = await req(guest, 'products:get', { id: prod.id });
    ok(!a.ok, 'and is gone from the public storefront');
    a = await req(seller.sock, 'sellers:resubmit', kyc(`KYC Store ${tag}`));
    ok(!a.ok && /suspended store cannot resubmit/.test(a.error ?? ''), 'a suspended store cannot resubmit', a.error);
    m = await mine();
    ok(m.statusReason === 'Counterfeit complaints under review.', 'the seller sees the suspension reason');

    a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    ok(a.ok && a.data.status === 'approved' && a.data.statusReason === null, 'reinstate (no reason needed)', a.error);
    p = (await req(guest, 'products:get', { id: prod.id })).data;
    ok(p?.status === 'live', 'the listing is live again after reinstatement', p?.status);

    section('The public storefront exposes nothing private');
    a = await req(guest, 'sellers:storefront', { id: store.id });
    const leaked = a.ok ? KYC_FIELDS.filter((k) => k in a.data.seller) : ['(storefront failed)'];
    ok(a.ok && leaked.length === 0, 'no KYC, moderation or owner fields on the storefront', `${a.error ?? ''} ${leaked.join(',')}`);
  } finally {
    await req(admin.sock, 'settings:set', { key: 'productModeration', value: String(moderation ?? 'false') });
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
