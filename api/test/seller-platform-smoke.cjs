/* End-to-end test of the seller platform: team accounts and roles, 2FA, customer <-> seller chat, storefront
 * (vacation, handling time, policies, goals), seller settings (notification switches, password, deleting an account),
 * private KYC documents, plan gating, and a suspended store. Runs against a RUNNING dev API seeded with `npm run seed`
 * (non-production: invitations return their `devToken`, TRANSLATE_PROVIDER=fake).
 *
 *   API_URL=http://localhost:3024 node test/seller-platform-smoke.cjs
 */
const { io } = require('socket.io-client');
const { createHmac } = require('crypto');
const { kyc } = require('./kyc.cjs');

const API = process.env.API_URL ?? 'http://localhost:3024';
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

// The API allows 30 sign-ins/registrations a minute per address; when the suites run back to back, wait and retry.
const rest = async (method, path, body, token, raw) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') ?? '';
    let json = null;
    let buf = null;
    if (/json/.test(type)) { try { json = await res.json(); } catch { /* empty */ } } else { buf = Buffer.from(await res.arrayBuffer()); }
    if (res.status === 429 && /ThrottlerException/.test(json?.message ?? '') && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json, buf, type };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
// The API allows 40 events a second per connection; wait a second and ask again, as a well-behaved client would.
const req = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
/** The next `event` this socket receives (or null after `ms`). Arm BEFORE the action that causes it. */
const nextEvent = (sock, event, ms = 3000, pred = () => true) => new Promise((resolve) => {
  const t = setTimeout(() => { sock.off(event, h); resolve(null); }, ms);
  const h = (p) => { if (pred(p)) { clearTimeout(t); sock.off(event, h); resolve(p); } };
  sock.on(event, h);
});
const login = async (email, pw = PW) => {
  const r = await rest('POST', '/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200 || !r.json.accessToken) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer', email) => {
  const r = await rest('POST', '/api/v1/auth/register', { email: email ?? `${label}${tag}@plat.test`, password: 'Plat-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email: email ?? `${label}${tag}@plat.test` };
};

// ── TOTP (RFC 6238), independent of the server's implementation ──────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32decode = (s) => {
  let bits = 0; let value = 0; const out = [];
  for (const ch of s.replace(/=+$/, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
};
const totp = (secret, offsetSteps = 0) => {
  const counter = Math.floor(Date.now() / 30000) + offsetSteps;
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
};

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const upload = async (path, token, buf = PNG, name = 'doc.png') => {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'image/png' }), name);
  return rest('POST', path, fd, token, true);
};

(async () => {
  const admin = await login('admin@somba.app');
  const cust = await register('buyer');
  const cust2 = await register('buyer2');
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'seller2faRequired', value: 'false' });
  const plansBefore = (await req(admin.sock, 'settings:get')).data.sellerPlans;
  // Known starting point: the Free plan has 1 team seat and allows campaigns.
  const start = (plansBefore ? JSON.parse(plansBefore) : []).map((p) => (p.id === 'free' ? { ...p, perks: { ...(p.perks ?? {}), teamSeats: 1, promotions: true } } : p));
  if (start.length) await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: JSON.stringify(start) });

  // An approved store with its owner, and accounts for each team role.
  const owner = await register('owner', 'seller');
  const store = (await req(owner.sock, 'sellers:register', kyc(`Plat Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  const staff = {};
  for (const r of ['manager', 'catalog', 'orders', 'finance', 'support']) staff[r] = await register(`st${r}`, 'seller');
  const stranger = await register('stranger', 'seller');
  let a;

  // ═════════════════════════════════════════════════════════════════════════
  section('Team: inviting, seats and roles');
  a = await req(owner.sock, 'team:list');
  ok(a.ok && a.data.members.length === 1 && a.data.members[0].role === 'owner' && a.data.members[0].isOwner, 'the owner sees themselves as the only member');
  ok(a.data.seats.max === 1 && a.data.seats.used === 0, 'the Free plan allows 1 team seat by default', JSON.stringify(a.data.seats));
  ok(!(await req(stranger.sock, 'team:list')).ok, 'an account with no store has no team');
  ok(!(await req(cust.sock, 'team:invite', { email: 'x@y.zz', role: 'orders' })).ok, 'a customer cannot invite');
  a = await req(owner.sock, 'team:invite', { email: 'not-an-email', role: 'orders' });
  ok(!a.ok && /valid e-mail/.test(a.error), 'a bad e-mail address is refused');
  a = await req(owner.sock, 'team:invite', { email: staff.finance.email, role: 'owner' });
  ok(!a.ok && /Choose a role/.test(a.error), 'owner is not a role you can hand out');
  a = await req(owner.sock, 'team:invite', { email: cust.email, role: 'orders' });
  ok(!a.ok && /shopper or staff account/.test(a.error), 'a shopper account cannot be invited as staff');
  const joinNote = nextEvent(owner.sock, 'notification:new', 4000, (n) => n.title === 'Team member joined');
  const inviteNote = nextEvent(staff.finance.sock, 'notification:new', 4000, (n) => n.title === 'Team invitation');
  a = await req(owner.sock, 'team:invite', { email: staff.finance.email, role: 'finance' });
  ok(a.ok && a.data.member.status === 'invited' && /^[0-9a-f]{64}$/.test(a.data.devToken), 'the owner invites a finance person (dev token returned)', a.error);
  const finToken = a.data.devToken;
  const inv = await inviteNote;
  ok(inv && inv.titleFr === 'Invitation à rejoindre l’équipe', 'the invitee, who has an account, gets a notice in their language', JSON.stringify(inv));
  a = await req(owner.sock, 'team:invite', { email: staff.manager.email, role: 'manager' });
  ok(!a.ok && /allows 1 team member/.test(a.error), 'the plan seat limit stops a second invitation', a.error);

  // The admin gives the Free plan 6 seats and turns promotions off (also used for the plan-gating checks below).
  const base = start.length ? start : [{ id: 'free', name: 'Free', priceUsd: 0, months: 1, features: [] }];
  const gated = base.map((p) => (p.id === 'free' ? { ...p, perks: { ...(p.perks ?? {}), teamSeats: 6, promotions: false } } : p));
  a = await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: JSON.stringify(gated) });
  ok(a.ok, 'an admin edits the plans (seats and promotions perks)', a.error);
  const tokens = { finance: finToken };
  for (const r of ['manager', 'catalog', 'orders', 'support']) {
    a = await req(owner.sock, 'team:invite', { email: staff[r].email, role: r });
    ok(a.ok, `the owner invites a ${r}`, a.error);
    tokens[r] = a.data?.devToken;
  }
  a = await req(owner.sock, 'team:invite', { email: staff.finance.email, role: 'finance', name: 'Fiona' });
  ok(a.ok && a.data.devToken && a.data.devToken !== finToken, 're-inviting re-sends with a fresh token (and takes no extra seat)');
  tokens.finance = a.data.devToken;
  ok((await req(owner.sock, 'team:list')).data.seats.used === 5, 'five seats are used');

  a = await rest('POST', '/api/v1/team/invite/preview', { token: tokens.finance });
  ok(a.status === 200 && a.json.storeName === `Plat Store ${tag}` && a.json.role === 'finance' && /^s\*\*\*|^[a-z]\*\*\*/.test(a.json.email) === false && a.json.email === staff.finance.email, 'the invitation page can read the invitation (public)', JSON.stringify(a.json));
  a = await rest('POST', '/api/v1/team/invite/preview', { token: 'f'.repeat(64) });
  ok(a.status === 404, 'a made-up token is a 404');

  // accepting
  a = await req(stranger.sock, 'team:accept', { token: tokens.finance });
  ok(!a.ok && /another e-mail address/.test(a.error), 'someone signed in with another e-mail cannot take the seat');
  ok(!(await req(cust.sock, 'team:accept', { token: tokens.finance })).ok, 'a shopper account cannot accept');
  ok(!(await req(owner.sock, 'team:accept', { token: tokens.finance })).ok, 'the store owner cannot accept (an owner is not staff)');
  ok(!(await req(staff.finance.sock, 'team:accept', { token: 'f'.repeat(64) })).ok, 'a wrong token is refused');
  ok(!(await req(staff.finance.sock, 'payouts:available')).ok, 'before accepting, the invitee still has no store');
  a = await req(staff.finance.sock, 'team:accept', { token: tokens.finance });
  ok(a.ok && a.data.role === 'finance' && a.data.seller.id === store.id && a.data.permissions.includes('finance'), 'the invitee accepts', a.error);
  const joined = await joinNote;
  ok(joined && joined.titleFr === 'Nouveau membre dans l’équipe' && /finance/.test(joined.body), 'the owner is notified (with French)', JSON.stringify(joined));
  ok(!(await req(staff.finance.sock, 'team:accept', { token: tokens.finance })).ok, 'an invitation token is single-use');
  for (const r of ['manager', 'catalog', 'orders', 'support']) {
    a = await req(staff[r].sock, 'team:accept', { token: tokens[r] });
    ok(a.ok && a.data.role === r, `${r} accepts`, a.error);
  }
  a = await req(owner.sock, 'team:list');
  ok(a.data.members.length === 6 && a.data.members.filter((m) => m.status === 'active').length === 6, 'the team has six active members');
  ok(!(await req(staff.finance.sock, 'team:list')).ok && !(await req(staff.manager.sock, 'team:list')).ok, 'only the owner can read the team list (even a manager cannot)');
  ok(!(await req(staff.manager.sock, 'team:invite', { email: 'q@q.qq', role: 'orders' })).ok, 'a manager cannot invite');
  ok(!(await req(staff.manager.sock, 'team:remove', { memberId: a.data.members[1].id })).ok && !(await req(staff.manager.sock, 'team:setRole', { memberId: a.data.members[1].id, role: 'orders' })).ok, 'a manager cannot remove people or change roles');
  a = await req(staff.finance.sock, 'team:me');
  ok(a.ok && a.data.role === 'finance' && a.data.seller.id === store.id && !a.data.permissions.includes('catalog'), 'team:me tells a member their role and permissions');
  a = await req(staff.finance.sock, 'sellers:mine');
  ok(a.ok && a.data.id === store.id && a.data.membership.role === 'finance' && !('idNumber' in a.data) && !('documentUrls' in a.data) && !('legalName' in a.data), 'sellers:mine works for staff, without the KYC papers', JSON.stringify(Object.keys(a.data ?? {})));
  a = await req(owner.sock, 'sellers:mine');
  ok(a.ok && a.data.membership.isOwner && a.data.idNumber && Array.isArray(a.data.documentUrls), 'the owner still sees everything');
  // a store owner cannot be invited, and one account works for one store
  const other = await register('otherowner', 'seller');
  const otherStore = (await req(other.sock, 'sellers:register', kyc(`Other Plat ${tag}`))).data;
  a = await req(owner.sock, 'team:invite', { email: other.email, role: 'orders' });
  ok(!a.ok && /already owns a store/.test(a.error), 'a person who owns a store cannot be invited');
  a = await req(staff.finance.sock, 'sellers:register', kyc(`Staff Store ${tag}`));
  ok(!a.ok && /work for a store as staff/.test(a.error), 'staff cannot open their own store while on a team');

  // ═════════════════════════════════════════════════════════════════════════
  section('Roles are enforced on the seller handlers');
  const prodBody = (n) => ({ name: `${n} ${tag}`, price: 20, category: 'Electronics', stock: 30 });
  a = await req(staff.finance.sock, 'products:create', prodBody('Fin'));
  ok(!a.ok && /finance/.test(a.error) && /does not allow/.test(a.error), 'finance cannot create products', a.error);
  a = await req(staff.orders.sock, 'products:create', prodBody('Ord'));
  ok(!a.ok, 'orders staff cannot create products');
  const pushedToOwner = nextEvent(owner.sock, 'product:created', 4000);
  const pushedToManager = nextEvent(staff.manager.sock, 'product:created', 4000);
  const pushedToFinance = nextEvent(staff.finance.sock, 'product:created', 2500);
  const pushedToOrders = nextEvent(staff.orders.sock, 'product:created', 4000);
  a = await req(staff.catalog.sock, 'products:create', prodBody('Cat'));
  ok(a.ok && a.data.sellerId === store.id, 'a catalog member creates a product for the store', a.error);
  const prod = a.data;
  ok((await pushedToOwner)?.id === prod.id, 'the owner gets product:created live');
  ok((await pushedToManager)?.id === prod.id, 'a manager hears it too');
  ok((await pushedToOrders)?.id === prod.id, 'orders staff (catalogue reader) hear it too');
  ok((await pushedToFinance) === null, 'finance staff do NOT hear listing changes');
  a = await req(staff.catalog.sock, 'products:update', { id: prod.id, patch: { price: 21 } });
  ok(a.ok, 'a catalog member edits it');
  ok(!(await req(staff.support.sock, 'products:update', { id: prod.id, patch: { price: 22 } })).ok, 'support staff cannot edit it');
  ok(!(await req(staff.finance.sock, 'products:delete', { id: prod.id })).ok, 'finance cannot delete it');
  a = await req(staff.support.sock, 'products:list');
  ok(a.ok && a.data.some((p) => p.id === prod.id), 'support can read the catalogue');
  a = await req(staff.finance.sock, 'products:list');
  ok(a.ok && a.data.some((p) => p.id === prod.id) && true, 'products:list stays public-safe for finance (live listings)');
  a = await req(stranger.sock, 'products:update', { id: prod.id, patch: { price: 23 } });
  ok(!a.ok, 'an unrelated seller cannot edit it');

  ok((await req(staff.orders.sock, 'orders:list')).ok, 'orders staff read the orders');
  ok(!(await req(staff.finance.sock, 'orders:list')).ok || (await req(staff.finance.sock, 'orders:list')).data.length === 0, 'finance cannot read orders');
  a = await req(staff.finance.sock, 'orders:list');
  ok(!a.ok && /finance/.test(a.error), 'finance gets the role error on orders:list', a.error);
  ok(!(await req(staff.catalog.sock, 'orders:sellerReady', { orderId: 'x' })).ok, 'catalog cannot mark orders ready');
  ok((await req(staff.finance.sock, 'payouts:available')).ok && (await req(staff.finance.sock, 'payouts:list')).ok, 'finance reads earnings and payouts');
  ok(!(await req(staff.catalog.sock, 'payouts:available')).ok && !(await req(staff.orders.sock, 'payouts:list')).ok, 'catalog and orders staff cannot see money');
  ok((await req(staff.finance.sock, 'sellers:stats')).ok && (await req(staff.manager.sock, 'sellers:stats')).ok, 'finance and manager read the store stats');
  ok(!(await req(staff.support.sock, 'sellers:stats')).ok, 'support cannot read the store stats');
  ok(!(await req(staff.finance.sock, 'sellers:update', { description: 'Hello there, a new store description' })).ok, 'finance cannot edit the storefront');
  const staffSaw = nextEvent(staff.finance.sock, 'seller:updated', 4000);
  const ownerSaw = nextEvent(owner.sock, 'seller:updated', 4000);
  ok((await req(staff.manager.sock, 'sellers:update', { description: 'Hello there, a managed store description' })).ok, 'a manager can');
  const [ss, os] = [await staffSaw, await ownerSaw];
  ok(os && os.idNumber && os.documentUrls, 'the owner is pushed the full store object (with KYC)');
  ok(ss && ss.id === store.id && !('idNumber' in ss) && !('documentUrls' in ss) && !('legalName' in ss) && !('userId' in ss), 'a finance member hears the store update live, WITHOUT the owner\'s KYC papers', JSON.stringify(Object.keys(ss ?? {})));
  ok(!(await req(staff.manager.sock, 'sellers:subscribe', { plan: 'starter', method: 'wallet' })).ok, 'a manager cannot buy a plan');
  a = await req(staff.support.sock, 'reviews:seller');
  ok(a.ok, 'support reads the store reviews');
  a = await req(staff.catalog.sock, 'reviews:seller');
  ok(a.ok && a.data.length === 0, 'catalog staff get no reviews (not their role)');

  // promotions perk
  a = await req(staff.catalog.sock, 'campaigns:create', { name: `Spring ${tag}`, discount: 10 });
  ok(!a.ok && /does not include promotions/.test(a.error), 'a plan without the promotions perk cannot run campaigns', a.error);
  const opened = base.map((p) => (p.id === 'free' ? { ...p, perks: { ...(p.perks ?? {}), teamSeats: 6, promotions: true } } : p));
  await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: JSON.stringify(opened) });
  a = await req(staff.catalog.sock, 'campaigns:create', { name: `Spring ${tag}`, discount: 10 });
  ok(a.ok, 'with the perk on, a catalog member creates a campaign', a.error);
  ok(!(await req(staff.finance.sock, 'campaigns:create', { name: `Nope ${tag}`, discount: 10 })).ok, 'finance cannot');
  a = await req(owner.sock, 'sellers:plan');
  ok(a.ok && a.data.perks.promotions === true && a.data.teamSeats.used === 5 && a.data.teamSeats.max === 6, 'sellers:plan reports perks and seats', JSON.stringify(a.data));

  // payout account
  a = await req(staff.finance.sock, 'sellers:payoutAccount:set', { method: 'bank', account: 'FR76 3000 1234 5678' });
  ok(!a.ok, 'finance cannot change the payout account');
  ok(!(await req(staff.manager.sock, 'sellers:payoutAccount:set', { method: 'bank', account: 'FR76 3000 1234 5678' })).ok, 'neither can a manager');
  a = await req(owner.sock, 'sellers:payoutAccount:set', { method: 'bank', account: 'FR76 3000 1234 5678' });
  ok(a.ok && a.data.set && a.data.account === 'FR76 3000 1234 5678', 'the owner saves it', a.error);
  a = await req(staff.finance.sock, 'sellers:payoutAccount:get');
  ok(a.ok && a.data.set && a.data.account === null && /••••/.test(a.data.masked), 'staff see only a masked account', JSON.stringify(a.data));
  a = await req(owner.sock, 'sellers:mine');
  ok(!('payoutAccount' in a.data) && a.data.payoutAccountMasked && !JSON.stringify(a.data).includes('3000 1234'), 'the account never appears in the store object');
  a = await req(admin.sock, 'sellers:get', { id: store.id });
  ok(a.ok && !JSON.stringify(a.data).includes('3000 1234'), 'nor in the admin view');
  a = await req(owner.sock, 'sellers:storefront', { id: store.id });
  ok(a.ok && !JSON.stringify(a.data).includes('3000 1234') && !('goals' in a.data.seller), 'nor on the public storefront');
  ok(!(await req(staff.finance.sock, 'payouts:request', { amountUsd: 20, method: 'bank', account: 'ATTACKER 12345' })).ok, 'staff cannot send a payout elsewhere (it uses the saved account, and there is nothing to withdraw yet)');

  // changing roles and removing
  a = await req(owner.sock, 'team:list');
  const mCatalog = a.data.members.find((m) => m.role === 'catalog');
  const meUpdate = nextEvent(staff.catalog.sock, 'team:me', 3000);
  const roleNote = nextEvent(staff.catalog.sock, 'notification:new', 4000, (n) => n.title === 'Team role changed');
  a = await req(owner.sock, 'team:setRole', { memberId: mCatalog.id, role: 'support' });
  ok(a.ok && a.data.role === 'support', 'the owner changes a role', a.error);
  ok((await meUpdate)?.role === 'support', 'the member is told live');
  const rn = await roleNote;
  ok(rn && /gestionnaire|support client/.test(rn.bodyFr ?? ''), 'and gets a French notice', JSON.stringify(rn));
  ok(!(await req(staff.catalog.sock, 'products:update', { id: prod.id, patch: { price: 24 } })).ok, 'the new role is enforced at once');
  ok((await req(staff.catalog.sock, 'reviews:seller')).ok, '…and the new permissions apply');
  const removedPush = nextEvent(staff.orders.sock, 'team:removed', 4000);
  const mOrders = (await req(owner.sock, 'team:list')).data.members.find((m) => m.role === 'orders');
  a = await req(owner.sock, 'team:remove', { memberId: mOrders.id });
  ok(a.ok, 'the owner removes a member', a.error);
  ok((await removedPush)?.sellerId === store.id, 'the removed member is told live');
  a = await req(staff.orders.sock, 'orders:list');
  ok(a.ok && a.data.length === 0, 'a removed member sees no orders any more');
  a = await req(staff.orders.sock, 'products:create', prodBody('Ghost'));
  ok(!a.ok && /Open a store first/.test(a.error), 'and cannot act for the store');
  ok(!(await req(owner.sock, 'team:setRole', { memberId: mOrders.id, role: 'orders' })).ok, 'a removed seat cannot be edited');
  ok((await req(owner.sock, 'team:list')).data.seats.used === 4, 'the seat is free again');
  // ═════════════════════════════════════════════════════════════════════════
  section('Two-factor authentication');
  const tw = await register('twofa', 'customer');
  a = await req(tw.sock, 'auth:2fa:status');
  ok(a.ok && a.data.enabled === false && a.data.pending === false, 'starts off');
  a = await req(tw.sock, 'auth:2fa:setup');
  ok(a.ok && /^[A-Z2-7]{32}$/.test(a.data.secret) && a.data.otpauthUrl.startsWith('otpauth://totp/'), 'setup returns a secret and an otpauth link');
  const secret = a.data.secret;
  ok((await req(tw.sock, 'auth:2fa:status')).data.pending === true, 'setup is pending until the first code');
  a = await req(tw.sock, 'auth:2fa:enable', { code: totp(secret, 1) === '000000' ? '123456' : '000001' });
  ok(!a.ok, 'a wrong code is refused');
  a = await req(tw.sock, 'auth:2fa:enable', { code: totp(secret) });
  ok(a.ok && a.data.enabled && a.data.recoveryCodes.length === 10 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(a.data.recoveryCodes[0]), 'the right code enables it and shows 10 recovery codes once', a.error);
  const recovery = a.data.recoveryCodes;
  ok((await req(tw.sock, 'auth:2fa:status')).data.recoveryRemaining === 10, 'status counts the recovery codes');
  ok(!(await req(tw.sock, 'auth:2fa:setup')).ok, 'setup is refused while it is on');
  a = await rest('POST', '/api/v1/auth/login', { email: tw.email, password: 'Plat-Pass-2026' });
  ok(a.status === 200 && a.json.needs2fa === true && a.json.challenge && !a.json.accessToken, 'login now asks for a second step');
  const challenge = a.json.challenge;
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge, code: '12345' });
  ok(a.status === 400 || a.status === 401, 'a malformed code is refused');
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: 'garbage', code: totp(secret, 1) });
  ok(a.status === 401, 'a forged challenge is refused');
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge, code: totp(secret) });
  ok(a.status === 400, 'the code that enabled 2FA cannot be replayed');
  const nextCode = totp(secret, 1);
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge, code: nextCode });
  ok(a.status === 200 && a.json.accessToken && a.json.user.id === tw.user.id, 'the next code completes the login', JSON.stringify(a.json));
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge, code: nextCode });
  ok(a.status === 400, 'and cannot be used twice');
  a = await rest('POST', '/api/v1/auth/login', { email: tw.email, password: 'Plat-Pass-2026' });
  const challenge2 = a.json.challenge;
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: challenge2, code: recovery[0] });
  ok(a.status === 200 && a.json.accessToken, 'a recovery code also signs in');
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: challenge2, code: recovery[0] });
  ok(a.status === 400, 'a recovery code works once');
  ok((await req(tw.sock, 'auth:2fa:status')).data.recoveryRemaining === 9, 'one recovery code is used up');
  a = await req(tw.sock, 'auth:2fa:recovery', { code: recovery[1] });
  ok(a.ok && a.data.recoveryCodes.length === 10 && !a.data.recoveryCodes.includes(recovery[2]), 'new recovery codes replace the old ones');
  const fresh = a.data.recoveryCodes;
  a = await rest('POST', '/api/v1/auth/login', { email: tw.email, password: 'Plat-Pass-2026' });
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: a.json.challenge, code: recovery[2] });
  ok(a.status === 400, 'an old recovery code no longer works');
  // The phone-code sign-in steps up the same way (it used to hand out tokens without asking for the second factor).
  const twPhone = `+24397${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  a = await req(tw.sock, 'me:update', { phone: twPhone });
  ok(a.ok, 'the shopper saves a phone number', a.error);
  a = await rest('POST', '/api/v1/auth/phone/send', {}, tw.token);
  ok(a.status === 200 && /^\d{6}$/.test(a.json?.devToken ?? ''), 'a verification code is sent to it', JSON.stringify(a.json));
  a = await rest('POST', '/api/v1/auth/phone/verify', { code: a.json.devToken }, tw.token);
  ok(a.status === 200 && a.json?.verified === true, 'the number is verified', JSON.stringify(a.json));
  a = await rest('POST', '/api/v1/auth/phone/login/send', { phone: twPhone });
  ok(a.status === 200 && /^\d{6}$/.test(a.json?.devToken ?? ''), 'a sign-in code is sent to the verified number', JSON.stringify(a.json));
  const phoneCode = a.json.devToken;
  a = await rest('POST', '/api/v1/auth/phone/login', { phone: twPhone, code: phoneCode });
  ok(a.status === 200 && a.json.needs2fa === true && !!a.json.challenge && !a.json.accessToken && !a.json.refreshToken, 'the right SMS code asks for the second factor instead of returning tokens', JSON.stringify(a.json)?.slice(0, 160));
  const phoneChallenge = a.json.challenge;
  a = await rest('POST', '/api/v1/auth/phone/login', { phone: twPhone, code: phoneCode });
  ok(a.status === 400, 'the SMS code is used up by that step');
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: phoneChallenge, code: '000000' });
  ok(a.status === 400 || a.status === 401, 'a wrong second-factor code is refused');
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: phoneChallenge, code: fresh[1] });
  ok(a.status === 200 && !!a.json.accessToken && a.json.user.id === tw.user.id, 'the authenticator / recovery code completes the phone sign-in', JSON.stringify(a.json)?.slice(0, 160));
  // five wrong codes lock the attempts
  let locked = false;
  const ch3 = (await rest('POST', '/api/v1/auth/login', { email: tw.email, password: 'Plat-Pass-2026' })).json.challenge;
  for (let i = 0; i < 7; i++) {
    const r = await rest('POST', '/api/v1/auth/login/2fa', { challenge: ch3, code: String(100000 + i) });
    if (r.status === 429) locked = true;
  }
  ok(locked, 'repeated wrong codes lock the attempts (429)');
  a = await rest('POST', '/api/v1/auth/login/2fa', { challenge: ch3, code: fresh[0] });
  ok(a.status === 429, 'even the right recovery code waits out the lock');
  ok(!(await req(tw.sock, 'auth:2fa:disable', { code: '999999' })).ok, 'disabling needs a valid code');

  // required for seller owners
  section('Two-factor authentication: required for seller owners');
  a = await req(admin.sock, 'settings:set', { key: 'seller2faRequired', value: 'true' });
  ok(a.ok, 'an admin switches seller2faRequired on', a.error);
  a = await req(owner.sock, 'orders:list');
  ok(!a.ok && /Two-factor authentication is required/.test(a.error), 'an owner without 2FA is stopped on seller calls', a.error);
  ok((await req(owner.sock, 'sellers:mine')).ok && (await req(owner.sock, 'auth:2fa:status')).data.required === true, 'but can still read the store and set 2FA up');
  ok((await req(staff.finance.sock, 'payouts:available')).ok, 'staff are not affected');
  a = await req(owner.sock, 'auth:2fa:setup');
  const osecret = a.data.secret;
  a = await req(owner.sock, 'auth:2fa:enable', { code: totp(osecret) });
  ok(a.ok, 'the owner enables 2FA', a.error);
  ok((await req(owner.sock, 'orders:list')).ok, 'and works again');
  a = await req(owner.sock, 'auth:2fa:disable', { code: a.data?.recoveryCodes?.[0] ?? '' });
  ok(!a.ok, 'a required owner cannot turn it off');
  await req(admin.sock, 'settings:set', { key: 'seller2faRequired', value: 'false' });
  ok(!(await req(admin.sock, 'settings:set', { key: 'seller2faRequired', value: 'maybe' })).ok, 'the setting only takes true / false');
  // from now on the owner's login needs a code: keep an authenticated socket (owner.sock) for the rest of the run

  // ═════════════════════════════════════════════════════════════════════════
  section('Chat: customer <-> seller');
  const ownerPush = nextEvent(owner.sock, 'chat:message', 4000);
  const supportPush = nextEvent(staff.support.sock, 'chat:message', 4000);
  const managerPush = nextEvent(staff.manager.sock, 'chat:message', 4000);
  const financePush = nextEvent(staff.finance.sock, 'chat:message', 2500);
  const custPush = nextEvent(cust.sock, 'chat:message', 4000);
  const ownerNote = nextEvent(owner.sock, 'notification:new', 4000, (n) => n.title === 'New customer message');
  a = await req(cust.sock, 'chat:start', { sellerId: store.id, productId: prod.id, text: 'Is this still available?' });
  ok(a.ok && a.data.conversation.productId === prod.id && a.data.message.senderSide === 'buyer', 'a customer starts a chat from a product', a.error);
  const conv = a.data.conversation;
  ok((await ownerPush)?.message.text === 'Is this still available?', 'the owner gets chat:message live');
  ok((await supportPush)?.conversation.unread === 1, 'a support member gets it, with their unread count');
  ok((await managerPush) !== null, 'a manager gets it');
  ok((await financePush) === null, 'finance does not');
  ok((await custPush)?.conversation.side === 'buyer', 'the customer\'s other screens get it too');
  const on = await ownerNote;
  ok(on && on.titleFr === 'Nouveau message client', 'the store gets a notice, with French', JSON.stringify(on));
  a = await req(cust.sock, 'chat:start', { sellerId: store.id, productId: prod.id, text: 'And in blue?' });
  ok(a.ok && a.data.conversation.id === conv.id, 'the same product reuses the same conversation');
  a = await req(cust.sock, 'chat:start', { sellerId: store.id, text: 'A general question' });
  ok(a.ok && a.data.conversation.id !== conv.id, 'a different context opens another conversation');
  a = await req(cust.sock, 'chat:start', { sellerId: store.id, productId: 'nope', text: 'x' });
  ok(!a.ok, 'a product of another store is refused');
  ok(!(await req(cust.sock, 'chat:start', { sellerId: store.id, text: '   ' })).ok, 'an empty message is refused');
  ok(!(await req(cust.sock, 'chat:start', { sellerId: store.id, text: 'x'.repeat(2001) })).ok, 'a very long message is refused');
  ok(!(await req(staff.finance.sock, 'chat:start', { sellerId: store.id, text: 'hi' })).ok, 'staff cannot message their own store');
  a = await req(owner.sock, 'chat:unread');
  ok(a.ok && a.data.seller >= 1 && a.data.total === a.data.seller, 'the owner has unread messages', JSON.stringify(a.data));
  a = await req(owner.sock, 'chat:list');
  const mine = a.data.find((c) => c.id === conv.id);
  ok(a.ok && mine && mine.unread === 2 && mine.side === 'seller' && mine.productName, 'chat:list shows the thread, its product and 2 unread', JSON.stringify(mine));
  ok((await req(staff.finance.sock, 'chat:list')).data.length === 0, 'finance sees no chats');
  a = await req(cust2.sock, 'chat:messages', { conversationId: conv.id });
  ok(!a.ok && /not found/.test(a.error), 'another customer cannot read the thread');
  ok(!(await req(staff.finance.sock, 'chat:messages', { conversationId: conv.id })).ok, 'nor can finance staff');
  ok(!(await req(cust2.sock, 'chat:send', { conversationId: conv.id, text: 'hi' })).ok, 'or write in it');
  a = await req(staff.support.sock, 'chat:messages', { conversationId: conv.id });
  ok(a.ok && a.data.messages.length === 2 && a.data.messages[0].text === 'Is this still available?' && a.data.hasMore === false, 'a support member reads the thread (oldest first)');
  a = await req(staff.support.sock, 'chat:messages', { conversationId: conv.id, before: a.data.messages[1].id, limit: 1 });
  ok(a.ok && a.data.messages.length === 1 && a.data.messages[0].text === 'Is this still available?', 'history pages back with `before`');
  const readPush = nextEvent(cust.sock, 'chat:read', 3000, (p) => p.conversationId === conv.id);
  const readOwner = nextEvent(owner.sock, 'chat:read', 3000, (p) => p.conversationId === conv.id);
  a = await req(staff.support.sock, 'chat:markRead', { conversationId: conv.id });
  ok(a.ok && a.data.unread === 0, 'a support member marks it read');
  ok((await readPush)?.side === 'seller' && (await readOwner) !== null, 'the customer and the owner\'s screens hear it');
  ok((await req(owner.sock, 'chat:list')).data.find((c) => c.id === conv.id).unread === 0, 'the unread count is shared by the seller side');
  const replyPush = nextEvent(cust.sock, 'chat:message', 4000);
  const custNote = nextEvent(cust.sock, 'notification:new', 4000, (n) => n.title === 'New message from the seller');
  a = await req(staff.support.sock, 'chat:send', { conversationId: conv.id, text: 'Yes, in stock!' });
  ok(a.ok && a.data.message.senderSide === 'seller' && a.data.message.senderName === 'stsupport user', 'a team member answers under their own name', a.error);
  const rp = await replyPush;
  ok(rp?.message.text === 'Yes, in stock!' && rp.conversation.unread === 1, 'the customer gets it live with 1 unread');
  const cn = await custNote;
  ok(cn && cn.titleFr === 'Nouveau message du vendeur', 'and a notice with French', JSON.stringify(cn));
  ok((await req(cust.sock, 'chat:unread')).data.buyer === 1, 'the customer\'s badge counts it');
  a = await req(cust.sock, 'chat:markRead', { conversationId: conv.id });
  ok(a.ok && (await req(cust.sock, 'chat:unread')).data.total === 0, 'reading clears it');
  a = await req(cust.sock, 'chat:send', { conversationId: conv.id, text: 'Photo', attachments: ['https://evil.example/x.png'] });
  ok(!a.ok, 'attachments must be platform uploads');
  // translate on demand
  const mid = (await req(cust.sock, 'chat:messages', { conversationId: conv.id })).data.messages[2].id;
  a = await req(cust.sock, 'translate:text', { kind: 'chat_message', id: mid, target: 'fr' });
  ok(a.ok && /Yes, in stock!/.test(a.data.text) && a.data.sourceLang, 'a participant translates a chat message on demand', a.error ?? JSON.stringify(a.data));
  ok(!(await req(cust2.sock, 'translate:text', { kind: 'chat_message', id: mid, target: 'fr' })).ok, 'an outsider cannot');
  ok(!(await req(staff.finance.sock, 'translate:text', { kind: 'chat_message', id: mid, target: 'fr' })).ok, 'neither can finance staff');
  ok(!(await req(cust.sock, 'translate:text', { kind: 'chat_message', id: 'not-an-id', target: 'fr' })).ok, 'only stored ids can be translated');
  ok(!(await req(cust.sock, 'translate:text', { kind: 'chat_message', id: mid, target: 'xx' })).ok, 'only English or French');
  // rate limit
  let sent = 0; let limited = false;
  for (let i = 0; i < 26; i++) {
    const r = await req(cust.sock, 'chat:send', { conversationId: conv.id, text: `spam ${i}` });
    if (r.ok) sent++; else if (/too fast/.test(r.error)) { limited = true; break; }
  }
  ok(limited && sent < 26, `sending is rate-limited (${sent} accepted)`);

  // ═════════════════════════════════════════════════════════════════════════
  section('Storefront: vacation, handling time, policies, goals');
  ok(!(await req(staff.finance.sock, 'sellers:goals:set', { revenueUsd: 5000 })).ok, 'finance cannot set goals');
  a = await req(owner.sock, 'sellers:goals:set', { revenueUsd: 5000, orders: 100, rating: 4.5 });
  ok(a.ok && a.data.revenueUsd === 5000 && a.data.orders === 100 && a.data.products === null, 'the owner saves goals on the server', a.error);
  a = await req(staff.finance.sock, 'sellers:goals:get');
  ok(a.ok && a.data.revenueUsd === 5000 && a.data.rating === 4.5, 'finance reads them');
  ok(!(await req(staff.support.sock, 'sellers:goals:get')).ok, 'support does not');
  ok(!(await req(owner.sock, 'sellers:goals:set', { orders: -3 })).ok && !(await req(owner.sock, 'sellers:goals:set', { rating: 9 })).ok, 'bad goals are refused');
  a = await req(owner.sock, 'sellers:goals:set', { revenueUsd: null, orders: 100 });
  ok(a.ok && a.data.revenueUsd === null && a.data.orders === 100 && (await req(owner.sock, 'sellers:goals:get')).data.orders === 100, 'goals persist and clear individually');

  a = await req(owner.sock, 'sellers:update', { handlingDays: 20 });
  ok(!a.ok && /0 to 14/.test(a.error), 'handling time over 14 days is refused');
  a = await req(owner.sock, 'sellers:update', { handlingDays: 3 });
  ok(a.ok && a.data.handlingDays === 3, 'the owner sets a 3-day handling time', a.error);
  a = await req(cust.sock, 'products:get', { id: prod.id });
  ok(a.ok && a.data.sellerHandlingDays === 3 && a.data.totalDeliveryDays === a.data.deliveryDays + 3, 'products carry the handling time and the total delivery time', JSON.stringify({ d: a.data?.deliveryDays, h: a.data?.sellerHandlingDays, t: a.data?.totalDeliveryDays }));

  a = await req(owner.sock, 'sellers:update', { vacationUntil: new Date(Date.now() - 86400000).toISOString() });
  ok(!a.ok && /future/.test(a.error), 'a vacation date in the past is refused');
  a = await req(owner.sock, 'sellers:update', { vacationUntil: new Date(Date.now() + 2 * 365 * 86400000).toISOString() });
  ok(!a.ok && /one year/.test(a.error), 'a vacation longer than a year is refused');
  ok(!(await req(owner.sock, 'sellers:update', { vacationUntil: 'soon' })).ok, 'a non-date is refused');
  const until1 = new Date(Date.now() + 7 * 86400000).toISOString();
  const vacPush = nextEvent(cust.sock, 'store:vacation', 4000);
  a = await req(staff.manager.sock, 'sellers:update', { vacationUntil: until1 });
  ok(a.ok && a.data.onVacation === true, 'a manager puts the store on vacation', a.error);
  const vp = await vacPush;
  ok(vp?.sellerId === store.id && vp.onVacation && /vacation/.test(vp.notice.en) && /vacances/.test(vp.notice.fr), 'shoppers are told live, in both languages');
  ok(vp?.ownerId === owner.user.id && Array.isArray(vp.sellerIds) && vp.sellerIds.includes(store.id) && vp.sellerIds.includes(owner.user.id), 'the push carries the store id AND the owner id, so a client can match either kind of listing', JSON.stringify([vp?.ownerId, vp?.sellerIds]));
  a = await req(cust.sock, 'products:get', { id: prod.id });
  ok(a.data.sellerOnVacation === true && a.data.sellerVacationNotice.en.includes('on vacation until') && a.data.sellerVacationNotice.fr.includes('en vacances jusqu’au'), 'the product says the store is away (EN and FR notice)');
  a = await req(cust.sock, 'sellers:storefront', { id: store.id });
  ok(a.ok && a.data.seller.onVacation === true && a.data.products.every((p) => p.sellerOnVacation), 'the public storefront shows it');
  ok(a.data.seller.vacationNotice && /vacation/.test(a.data.seller.vacationNotice.en) && /vacances/.test(a.data.seller.vacationNotice.fr), 'and carries the bilingual vacation notice in the storefront payload', JSON.stringify(a.data.seller.vacationNotice));
  a = await req(cust.sock, 'cart:set', { lines: [{ productId: prod.id, qty: 1 }] });
  ok(!a.ok && /on vacation/.test(a.error) && /en vacances/.test(a.error), 'adding to the cart is refused, with a bilingual message', a.error);
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  ok(!a.ok && /on vacation/.test(a.error) && /en vacances/.test(a.error), 'a new order is refused too', a.error);
  a = await req(owner.sock, 'sellers:update', { vacationUntil: null });
  ok(a.ok && a.data.onVacation === false && a.data.vacationUntil === null, 'the owner reopens the store');
  a = await req(cust.sock, 'cart:set', { lines: [{ productId: prod.id, qty: 1 }] });
  ok(a.ok, 'the cart accepts the product again', a.error);
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  ok(a.ok || !/vacation/.test(a.error), 'orders are no longer stopped by the vacation', a.error);
  if (a.ok) ok(true, 'the order was placed');
  await req(cust.sock, 'cart:set', { lines: [] });

  const policyPush = nextEvent(owner.sock, 'seller:updated', 8000, (s) => /^\[fr\]/.test(s.returnsPolicyFr ?? '') && /^\[fr\]/.test(s.shippingPolicyFr ?? ''));
  a = await req(owner.sock, 'sellers:update', { returnsPolicy: `Returns are accepted within 14 days of delivery (${tag}).`, shippingPolicy: `We ship within two working days (${tag}).` });
  ok(a.ok && a.data.returnsPolicy.startsWith('Returns are accepted'), 'the owner writes returns and shipping policies', a.error);
  const pp = await policyPush;
  ok(!!pp && pp.id === store.id, 'when the translation job finishes the owner gets a seller:updated push with the French policies', JSON.stringify(pp && { fr: pp.returnsPolicyFr }));
  ok(!(await req(owner.sock, 'sellers:update', { returnsPolicy: 'short' })).ok, 'a too-short policy is refused');
  const sf = await until(async () => {
    const r = await req(cust.sock, 'sellers:storefront', { id: store.id });
    return r.ok && /^\[fr\]/.test(r.data.seller.returnsPolicyFr ?? '') ? r.data.seller : null;
  }, 8000);
  ok(!!sf && sf.returnsPolicy.startsWith('Returns are accepted') && /^\[fr\]/.test(sf.shippingPolicyFr), 'the other language is filled in by the translation pipeline', JSON.stringify(sf));
  a = await req(owner.sock, 'sellers:update', { returnsPolicyFr: 'Les retours sont acceptés sous 14 jours.' });
  a = await req(cust.sock, 'sellers:storefront', { id: store.id });
  ok(a.data.seller.returnsPolicyFr === 'Les retours sont acceptés sous 14 jours.' && a.data.seller.returnsPolicy.startsWith('Returns are accepted'), 'a hand-written French policy is kept next to the English one');

  // ═════════════════════════════════════════════════════════════════════════
  section('Seller settings: notification switches, password, deleting accounts');
  a = await req(staff.finance.sock, 'me:prefs');
  ok(a.ok && a.data.notify && a.data.notify.order === true && a.data.notify.payout === true, 'staff have notification switches (all on by default)');
  a = await req(staff.finance.sock, 'me:setPrefs', { notify: { order: false, review: false } });
  ok(a.ok && a.data.notify.order === false && a.data.notify.review === false && a.data.notify.payout === true, 'a member turns some off');
  ok(!(await req(staff.finance.sock, 'me:setPrefs', { notify: { nonsense: true } })).ok && !(await req(staff.finance.sock, 'me:setPrefs', { notify: { order: 'yes' } })).ok, 'unknown kinds and non-booleans are refused');
  a = await req(staff.finance.sock, 'me:changePassword', { current: 'Plat-Pass-2026', next: 'Plat-Pass-2027' });
  ok(a.ok && a.data.accessToken, 'a team member changes their password', a.error);
  a = await rest('POST', '/api/v1/auth/login', { email: staff.finance.email, password: 'Plat-Pass-2027' });
  ok(a.status === 200, 'and signs in with it');
  // a staff member deletes their account -> they leave the team
  const leaver = await register('leaver', 'seller');
  const lt = (await req(owner.sock, 'team:invite', { email: leaver.email, role: 'orders' })).data.devToken;
  ok((await req(leaver.sock, 'team:accept', { token: lt })).ok, 'a new member joins');
  ok(!(await req(leaver.sock, 'me:delete', { password: 'wrong' })).ok, 'deleting needs the password');
  a = await req(leaver.sock, 'me:delete', { password: 'Plat-Pass-2026' });
  ok(a.ok && a.data.deleted, 'a team member deletes their account', a.error);
  a = await req(owner.sock, 'team:list');
  ok(!a.data.members.some((m) => m.userId === leaver.user.id && m.status === 'active'), 'and leaves the team');
  const quitter = await register('quitter', 'seller');
  const qt = (await req(owner.sock, 'team:invite', { email: quitter.email, role: 'support' })).data.devToken;
  ok((await req(quitter.sock, 'team:accept', { token: qt })).ok, 'another member joins');
  const leftNote = nextEvent(owner.sock, 'notification:new', 4000, (n) => n.title === 'Team member left');
  ok((await req(quitter.sock, 'team:leave')).ok, 'and steps down by themselves');
  const ln = await leftNote;
  ok(ln && ln.titleFr === 'Un membre a quitté l’équipe', 'the owner is told, with French', JSON.stringify(ln));
  ok(!(await req(quitter.sock, 'team:me')).ok && !(await req(quitter.sock, 'team:leave')).ok, 'they have no seat any more');

  // an owner closes the store by deleting the account
  const closer = await register('closer', 'seller');
  const cstore = (await req(closer.sock, 'sellers:register', kyc(`Closing Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: cstore.id, status: 'approved' });
  const cprod = (await req(closer.sock, 'products:create', prodBody('Closing'))).data;
  const cinv = (await req(closer.sock, 'team:invite', { email: staff.manager.email, role: 'orders' }));
  ok(!cinv.ok, 'a person who works for another store cannot be invited');
  ok(cprod && cprod.status === 'live', 'the closing store has a live listing');
  a = await req(closer.sock, 'me:delete', { password: 'Plat-Pass-2026' });
  ok(a.ok, 'an owner with no open orders and no earnings deletes their account', a.error);
  a = await req(admin.sock, 'sellers:get', { id: cstore.id });
  ok(a.ok && a.data.status === 'suspended' && /deleted the account/.test(a.data.statusReason), 'the store is closed', JSON.stringify(a.data && { s: a.data.status, r: a.data.statusReason }));
  a = await req(cust.sock, 'products:get', { id: cprod.id });
  ok(!a.ok || a.data.status !== 'live', 'its listings are off the storefront');

  // ═════════════════════════════════════════════════════════════════════════
  section('Private KYC documents');
  const kycOwner = await register('kycowner', 'seller');
  a = await upload('/api/v1/private-uploads', kycOwner.token);
  ok(a.status === 201 && a.json.id && /\/api\/v1\/private-uploads\/[0-9a-f-]{36}$/.test(a.json.url), 'a seller uploads a document to the private store', JSON.stringify(a.json));
  const doc = a.json;
  ok((await upload('/api/v1/private-uploads', undefined)).status === 401, 'uploading needs a login');
  a = await upload('/api/v1/private-uploads', kycOwner.token, Buffer.from('<script>alert(1)</script>'), 'x.png');
  ok(a.status === 400, 'only real images / PDFs are accepted (content sniffed)');
  a = await req(kycOwner.sock, 'sellers:register', kyc(`Kyc Store ${tag}`, { documentUrls: [doc.url] }));
  ok(a.ok && a.data.documentUrls[0] === doc.url, 'the application can carry the private document', a.error);
  const kycStore = a.data;
  a = await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, kycOwner.token);
  ok(a.status === 200 && /image\/png/.test(a.type) && a.buf.length === PNG.length, 'the owner downloads it');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, admin.token)).status === 200, 'an admin downloads it');
  const modLogin = await login('ops@somba.app');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, modLogin.token)).status === 200, 'so does operations (a reviewer)');
  const finLogin = await login('finance@somba.app');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, finLogin.token)).status === 404, 'finance (not a reviewer) cannot');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, stranger.token)).status === 404, 'another seller cannot');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, cust.token)).status === 404, 'a customer cannot');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`)).status === 401, 'nobody without a login can');
  ok((await rest('GET', `/api/v1/private-uploads/${doc.id}`, null, staff.manager.token)).status === 404, 'not even a store manager');
  a = await req(kycOwner.sock, 'private:link', { id: doc.id });
  ok(a.ok && /sig=/.test(a.data.url), 'the owner gets a signed link', a.error);
  ok((await rest('GET', a.data.url.replace(API, ''))).status === 200, 'which opens without a header');
  ok((await rest('GET', a.data.url.replace(API, '').replace(/sig=[0-9a-f]{4}/, 'sig=0000'))).status === 401, 'a tampered link does not');
  ok(!(await req(stranger.sock, 'private:link', { id: doc.id })).ok, 'a stranger gets no link');
  a = await req(cust.sock, 'sellers:storefront', { id: kycStore.id });
  ok(!a.ok || !JSON.stringify(a.data).includes('private-uploads'), 'documents never show on a storefront');
  // another seller cannot attach someone else's private file
  const thief = await register('thief', 'seller');
  a = await req(thief.sock, 'sellers:register', kyc(`Thief Store ${tag}`, { documentUrls: [doc.url] }));
  ok(!a.ok, 'a private document cannot be reused by another applicant', a.error);
  // legacy: a public upload referenced in an application is moved behind the login
  const legacy = await register('legacy', 'seller');
  a = await upload('/api/v1/uploads', legacy.token);
  ok(a.status === 201 && /\/uploads\//.test(a.json.url), 'an old client uploads to the public folder');
  const pubUrl = a.json.url;
  ok((await rest('GET', pubUrl.replace(API, ''))).status === 200, 'it is public at first');
  a = await req(legacy.sock, 'sellers:register', kyc(`Legacy Store ${tag}`, { documentUrls: [pubUrl] }));
  ok(a.ok && /private-uploads/.test(a.data.documentUrls[0]) && a.data.documentUrls[0] !== pubUrl, 'registering moves the document to a private URL', JSON.stringify(a.data?.documentUrls));
  ok((await rest('GET', pubUrl.replace(API, ''))).status === 404, 'the public copy is gone');
  ok((await rest('GET', a.data.documentUrls[0].replace(API, ''), null, legacy.token)).status === 200, 'the owner still reads it');
  a = await req(admin.sock, 'sellers:get', { id: kycStore.id });
  ok(a.ok && a.data.documentUrls[0] === doc.url, 'admins see the private URL in the application');

  // ═════════════════════════════════════════════════════════════════════════
  section('Reputation');
  a = await req(admin.sock, 'sellers:rescore', { sellerId: store.id });
  ok(a.ok && a.data.badge === 'bronze' && a.data.rating === 0 && a.data.ratingCount === 0, 'a store with no reviews is bronze with a 0 rating', JSON.stringify(a.data));
  ok(!(await req(owner.sock, 'sellers:rescore', { sellerId: store.id })).ok, 'a seller cannot re-score');
  ok((await req(admin.sock, 'sellers:rescore')).data.updated >= 1, 'an admin can re-score every store');

  // ═════════════════════════════════════════════════════════════════════════
  section('A suspended store is read-only');
  const sprod = (await req(staff.manager.sock, 'products:create', prodBody('Susp'))).data;
  a = await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'suspended', reason: 'Policy check in progress' });
  ok(a.ok, 'an admin suspends the store', a.error);
  ok((await req(owner.sock, 'orders:list')).ok, 'the owner still reads their orders');
  ok((await req(staff.manager.sock, 'orders:list')).ok, 'a manager still reads orders');
  ok((await req(staff.finance.sock, 'payouts:available')).ok && (await req(staff.finance.sock, 'payouts:list')).ok, 'finance still reads earnings and payouts');
  ok((await req(staff.finance.sock, 'sellers:stats')).ok && (await req(owner.sock, 'analytics:seller')).ok, 'stats and analytics stay readable');
  ok((await req(owner.sock, 'sellers:mine')).data.status === 'suspended', 'sellers:mine says suspended');
  for (const [who, ev, body] of [
    ['owner', 'products:create', prodBody('Late')],
    ['manager', 'products:update', { id: sprod?.id ?? 'x', patch: { price: 5 } }],
    ['owner', 'orders:sellerReady', { orderId: 'x' }],
    ['owner', 'orders:sellerCancel', { orderId: 'x', reason: 'nope' }],
    ['finance', 'payouts:request', { amountUsd: 20, method: 'wallet' }],
    ['owner', 'campaigns:create', { name: 'Late campaign', discount: 10 }],
    ['owner', 'sellers:update', { description: 'Updating while suspended please' }],
    ['owner', 'team:invite', { email: `late${tag}@plat.test`, role: 'orders' }],
    ['owner', 'sellers:goals:set', { orders: 5 }],
  ]) {
    const sock = who === 'owner' ? owner.sock : staff[who].sock;
    const r = await req(sock, ev, body);
    ok(!r.ok && /suspended/.test(r.error), `${ev} is refused for a suspended store (${who})`, r.error);
  }
  a = await req(owner.sock, 'sellers:subscribe', { plan: 'starter', method: 'wallet' });
  ok(!a.ok, 'a suspended store cannot buy a plan', a.error);
  a = await req(owner.sock, 'sellers:resubmit', kyc(`Late KYC ${tag}`));
  ok(!a.ok && /suspended store cannot resubmit/.test(a.error), 'nor resubmit its application (the service says why)', a.error);
  a = await req(staff.support.sock, 'chat:send', { conversationId: conv.id, text: 'hello?' });
  ok(!a.ok && /suspended/.test(a.error), 'chat replies are paused, reading is not');
  ok((await req(staff.support.sock, 'chat:messages', { conversationId: conv.id })).ok, 'the thread can still be read');
  ok(!(await req(cust2.sock, 'chat:start', { sellerId: store.id, text: 'hi' })).ok, 'and shoppers cannot start new chats with a suspended store');
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  ok((await req(staff.manager.sock, 'products:update', { id: sprod.id, patch: { price: 6 } })).ok, 'when reinstated, writes work again');

  // ── restore the plans as they were ───────────────────────────────────────
  if (plansBefore) await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: plansBefore });
  await req(admin.sock, 'settings:set', { key: 'seller2faRequired', value: 'false' });

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed:\n - ' + fails.join('\n - ')); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
})().catch((e) => { console.error('Smoke crashed:', e); process.exit(1); });
