/* Round 2, seller portal and customer app: following a store (and the new-product notice to followers), photos in
 * reviews (4 at most, hidden with the review), the return deadline and the response-time timers (returns, disputes,
 * replacements, exchanges), vacation mode pushed live and ended by the sweep, what a Support team member may call, the
 * Help contact settings, and cash on delivery staying off.
 *
 * Runs against a RUNNING API seeded with `npm run seed` (fake translator). It reads and writes the same MySQL database
 * to age orders (mark them delivered / old); DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE as for the API.
 *
 *   API_URL=http://localhost:3056 DB_DATABASE=somba_r2f AFTER_SALE_SWEEP_MS=1500 VACATION_SWEEP_MS=1500 node test/r2f-smoke.cjs
 *
 * The API must run with AFTER_SALE_SWEEP_MS=1500 and VACATION_SWEEP_MS=1500 (the timers are waited for, not faked).
 */
const { io } = require('socket.io-client');
const mysql = require('mysql2/promise');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3056';
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
    const res = await new Promise((r) => { const t = setTimeout(() => r({ ok: false, error: `timeout: ${ev}` }), 15000); s.emit(ev, b, (x) => { clearTimeout(t); r(x); }); });
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
/** The next time `ev` arrives on `sock` (or null after `ms`). Start BEFORE doing the thing that causes it. */
const nextEvent = (sock, ev, match = () => true, ms = 6000) => new Promise((res) => {
  const t = setTimeout(() => { sock.off(ev, h); res(null); }, ms);
  const h = (p) => { if (match(p)) { clearTimeout(t); sock.off(ev, h); res(p); } };
  sock.on(ev, h);
});
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@r2f.test`, password: 'R2f-Pass-2026', name: `${label} User`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email: `${label}${tag}@r2f.test` };
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = async (token) => {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
  const res = await fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  return (await res.json()).url;
};
const noticesOf = async (u) => (await req(u.sock, 'notifications:list')).data ?? [];
const hasNotice = async (u, pred, ms) => !!(await until(async () => (await noticesOf(u)).find(pred), ms));

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USERNAME ?? 'root', password: process.env.DB_PASSWORD ?? '', database: process.env.DB_DATABASE ?? 'somba_r2f', timezone: 'Z' });
  const sql = async (q, p = []) => (await db.query(q, p))[0];
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const guest = { sock: await connect() };
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'returnWindowDays', value: '7' });
  await req(admin.sock, 'settings:set', { key: 'sellerResponseHours', value: '48' });
  const plansNow = (await req(admin.sock, 'settings:get')).data.sellerPlans;
  const plans = (plansNow ? JSON.parse(plansNow) : []).map((p) => (p.id === 'free' ? { ...p, perks: { ...(p.perks ?? {}), teamSeats: 4, promotions: true } } : p));
  if (plans.length) await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: JSON.stringify(plans) });

  const cust = await register('buyer');
  const cust2 = await register('buyer2');
  const mod = await (async () => {
    const u = await register('mod');
    await req(admin.sock, 'roles:setRole', { id: u.user.id, role: 'admin_moderation' });
    u.sock.close();
    const r = await rest('/api/v1/auth/login', { email: u.email, password: 'R2f-Pass-2026' });
    return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
  })();
  const agent = await (async () => {
    const u = await register('agent');
    await req(admin.sock, 'roles:setRole', { id: u.user.id, role: 'admin_support' });
    u.sock.close();
    const r = await rest('/api/v1/auth/login', { email: u.email, password: 'R2f-Pass-2026' });
    return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
  })();
  const owner = await register('owner', 'seller');
  const store = (await req(owner.sock, 'sellers:register', kyc(`R2F Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  const mkProduct = async (name, price, stock = 60) => {
    const r = await req(owner.sock, 'products:create', { name: `${name} ${tag}`, price, category: 'Electronics', stock });
    if (!r.ok) throw new Error(`product ${name}: ${r.error}`);
    return r.data;
  };
  const pA = await mkProduct('Headphones', 20);
  const pB = await mkProduct('Charger', 10);
  const pC = await mkProduct('Cable', 5);

  const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa', geo: { lat: -4.3276, lng: 15.3136 } });
  /** A delivered order: placed and paid for through the API, then aged by hand (delivery itself is logistics' business). */
  const delivered = async (buyer, items, ageDays = 0) => {
    const a = await req(buyer.sock, 'orders:create', { items, paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
    if (!a.ok) throw new Error(`orders:create: ${a.error}`);
    const o = a.data;
    await until(async () => (await sql('SELECT status FROM orders WHERE id = ?', [o.id]))[0]?.status === 'confirmed');
    const when = new Date(Date.now() - ageDays * 86400000);
    await sql("UPDATE orders SET status = 'delivered', updatedAt = ? WHERE id = ?", [when, o.id]);
    await sql("UPDATE delivery_tasks SET status = 'delivered', deliveredAt = ? WHERE orderId = ? AND kind IN ('delivery')", [when, o.id]);
    return o;
  };
  let a;

  // ═════════════════════════════════════════════════════════════════════════
  section('Following a store');
  a = await req(guest.sock, 'follows:state', { sellerId: store.id });
  ok(a.ok && a.data.following === false && a.data.followers === 0, 'a guest can read the follower count (and is not following)', a.error);
  ok(!(await req(guest.sock, 'follows:toggle', { sellerId: store.id })).ok, 'a guest cannot follow');
  ok(!(await req(guest.sock, 'follows:list')).ok, 'a guest has no Following list');
  a = await req(owner.sock, 'follows:toggle', { sellerId: store.id });
  ok(!a.ok && /your own store/.test(a.error ?? ''), 'a store owner cannot follow their own store', a.error);
  ok(!(await req(cust.sock, 'follows:toggle', { sellerId: 'nope' })).ok && !(await req(cust.sock, 'follows:toggle', {})).ok, 'an unknown store or a missing store id is refused');
  const pendingStore = await (async () => { const u = await register('pend', 'seller'); return (await req(u.sock, 'sellers:register', kyc(`R2F Pending ${tag}`))).data; })();
  ok(!(await req(cust.sock, 'follows:toggle', { sellerId: pendingStore.id })).ok, 'a store that is not approved cannot be followed');
  const otherDevice = nextEvent(cust.sock, 'follows:updated', (p) => p.sellerId === store.id);
  a = await req(cust.sock, 'follows:toggle', { sellerId: store.id });
  ok(a.ok && a.data.following === true && a.data.followers === 1 && a.data.sellerId === store.id, 'a customer follows the store', a.error);
  ok((await otherDevice)?.following === true, "the customer's other devices are told (follows:updated)");
  a = await req(cust.sock, 'follows:toggle', { sellerId: store.id, following: true });
  ok(a.ok && a.data.followers === 1, 'following again changes nothing (one follow per customer and store)');
  a = await req(cust2.sock, 'follows:toggle', { sellerId: store.id });
  ok(a.ok && a.data.followers === 2, 'a second customer follows: two followers');
  a = await req(cust.sock, 'follows:list');
  ok(a.ok && a.data.length === 1 && a.data[0].id === store.id && a.data[0].name === store.name && !('userId' in a.data[0]) && !JSON.stringify(a.data).includes(owner.user.id), 'the Following list has the store with public fields only (no owner account id)', JSON.stringify(a.data));
  const owned = await req(cust.sock, 'follows:toggle', { sellerId: owner.user.id, following: true });
  ok(owned.ok && owned.data.sellerId === store.id && owned.data.followers === 2, "the owner's account id (older listings carry it) resolves to the same store");

  section('Following: a new product reaches the followers (bell + push payload), and only them');
  const bell1 = nextEvent(cust.sock, 'notification:new', (n) => n.type === 'store');
  const bell3 = nextEvent(cust2.sock, 'notification:new', (n) => n.type === 'store');
  const cust3 = await register('buyer3');
  const noBell = nextEvent(cust3.sock, 'notification:new', (n) => n.type === 'store', 2500);
  const pNew = await mkProduct('Wireless Speaker', 35);
  const n1 = await bell1;
  ok(n1 && n1.title === 'New from a store you follow' && n1.entityId === pNew.id && n1.body.includes(store.name) && n1.titleFr === 'Nouveau chez une boutique que vous suivez' && n1.bodyFr.includes(store.name), 'the follower gets the notice, in English and French, opening the product', JSON.stringify(n1));
  ok(n1 && n1.link === `/shop/products/${pNew.id}`, 'its link opens the product page', n1?.link);
  ok(!!(await bell3), 'every follower is told');
  ok(!(await noBell), 'someone who does not follow is not');
  ok(!(await noticesOf(owner)).some((n) => n.type === 'store'), 'nor is the store owner');
  const bell1b = nextEvent(cust.sock, 'notification:new', (n) => n.type === 'store', 2500);
  await req(owner.sock, 'products:update', { id: pNew.id, patch: { price: 33 } });
  ok(!(await bell1b), 'editing a live product does not notify again');
  await req(cust2.sock, 'follows:toggle', { sellerId: store.id, following: false });
  const bell1c = nextEvent(cust.sock, 'notification:new', (n) => n.type === 'store');
  const bell3c = nextEvent(cust2.sock, 'notification:new', (n) => n.type === 'store', 2500);
  const pNew2 = await mkProduct('Phone Case', 9);
  ok((await bell1c)?.entityId === pNew2.id, 'the one who still follows is told about the next product');
  ok(!(await bell3c), 'the one who unfollowed is not');
  a = await req(cust.sock, 'follows:toggle', { sellerId: store.id });
  ok(a.ok && a.data.following === false && a.data.followers === 0, 'unfollowing removes the follow', a.error);
  ok((await req(cust.sock, 'follows:list')).data.length === 0, 'the Following list is empty again');

  // ═════════════════════════════════════════════════════════════════════════
  section('Photos in reviews');
  const o1 = await delivered(cust, [{ productId: pA.id, qty: 1 }]);
  const o2 = await delivered(cust2, [{ productId: pA.id, qty: 1 }]);
  const photos = [];
  for (let i = 0; i < 5; i++) photos.push(await upload(cust.token));
  ok(photos.every((p) => /\/uploads\/[0-9a-f-]{36}\.png$/.test(p)), 'photos are uploaded through the existing POST /api/v1/uploads', photos[0]);
  a = await req(cust.sock, 'reviews:create', { productId: pA.id, rating: 5, text: 'Great sound, see the photos', photos });
  ok(!a.ok && /up to 4 photos/.test(a.error ?? ''), 'a fifth photo is refused', a.error);
  a = await req(cust.sock, 'reviews:create', { productId: pA.id, rating: 5, text: 'Great sound, see the photos', photos: ['https://evil.example/x.jpg'] });
  ok(!a.ok && /uploaded through the app/.test(a.error ?? ''), 'a link that is not an upload is refused', a.error);
  ok((await req(guest.sock, 'reviews:list', { productId: pA.id })).data.length === 0, 'a refused review saves nothing');
  const live = nextEvent(owner.sock, 'review:created');
  a = await req(cust.sock, 'reviews:create', { productId: pA.id, rating: 1, text: 'Awful, the photo shows the crack', photos: photos.slice(0, 4) });
  ok(a.ok && a.data.photos.length === 4 && a.data.photos[0] === photos[0], 'the customer reviews with 4 photos', a.error);
  const rv = a.data;
  ok((await live)?.photos?.length === 4, 'the seller is pushed the review with its photos');
  a = await req(cust2.sock, 'reviews:create', { productId: pA.id, rating: 5, text: 'No photos here, still great' });
  ok(a.ok && Array.isArray(a.data.photos) && a.data.photos.length === 0, 'a review without photos has an empty list');
  const shown = (await req(guest.sock, 'reviews:list', { productId: pA.id })).data;
  ok(shown.find((r) => r.id === rv.id)?.photos.length === 4, 'shoppers (even guests) see the photos on the product page');
  ok((await req(owner.sock, 'reviews:seller')).data.find((r) => r.id === rv.id)?.photos.length === 4, "the seller's reviews list has the photos");
  ok((await req(mod.sock, 'reviews:admin', {})).data.find((r) => r.id === rv.id)?.photos.length === 4, 'moderation sees the photos');
  const imgRes = await fetch(rv.photos[0]);
  ok(imgRes.status === 200 && /image\/png/.test(imgRes.headers.get('content-type') ?? ''), 'a photo is served', `${imgRes.status}`);

  section('Photos in reviews: a reported review is hidden with its photos');
  a = await req(owner.sock, 'reviews:report', { id: rv.id, reason: 'The photo is not of our product' });
  ok(a.ok, 'the seller reports the review (and its photos)', a.error);
  const shopperPush = nextEvent(guest.sock, 'review:updated', (p) => p.id === rv.id);
  a = await req(mod.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'hidden', reason: 'Photo is not the product' });
  ok(a.ok && a.data.status === 'hidden', 'moderation hides it', a.error);
  const sp = await shopperPush;
  ok(sp && sp.status === 'hidden' && !('photos' in sp) && !('text' in sp), 'shoppers are told it is gone, with no photos and no text', JSON.stringify(sp));
  ok(!(await req(guest.sock, 'reviews:list', { productId: pA.id })).data.some((r) => r.id === rv.id), 'it is off the product page');
  ok(!(await req(owner.sock, 'reviews:seller')).data.some((r) => r.id === rv.id), "and out of the seller's list");
  ok((await req(mod.sock, 'reviews:admin', { status: 'hidden' })).data.find((r) => r.id === rv.id)?.photos.length === 4, 'moderators still have it with its photos');
  await req(mod.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'visible' });
  ok((await req(guest.sock, 'reviews:list', { productId: pA.id })).data.find((r) => r.id === rv.id)?.photos.length === 4, 'restored: the photos are back');

  // ═════════════════════════════════════════════════════════════════════════
  section('Return deadline');
  const old = await delivered(cust, [{ productId: pB.id, qty: 1 }], 9);
  a = await req(cust.sock, 'disputes:open', { orderId: old.id, type: 'return', reason: 'Changed my mind about it' });
  ok(!a.ok && /within 7 days/.test(a.error ?? ''), 'an order delivered 9 days ago is outside the 7-day window', a.error);
  // A later leg of the same order (a seller pickup, a return leg, a replacement) must not extend the window.
  await sql("UPDATE delivery_tasks SET status = 'delivered', deliveredAt = ? WHERE orderId = ? AND kind <> 'delivery'", [new Date(), old.id]);
  await sql("INSERT INTO delivery_tasks (id, orderId, orderReference, status, kind, deliveredAt, codAmountUsd, createdAt, updatedAt) VALUES (UUID(), ?, 'X', 'delivered', 'return_pickup', ?, 0, NOW(), NOW())", [old.id, new Date()]);
  a = await req(cust.sock, 'disputes:eligibility', { orderId: old.id });
  ok(a.ok && a.data.eligible === false && Math.abs(new Date(a.data.endsAt) - (Date.now() - 2 * 86400000)) < 120000, 'a pickup or return leg delivered today does not move the end of the window (it stays 9 days - 7 = 2 days ago)', JSON.stringify(a.data && { e: a.data.eligible, ends: a.data.endsAt }));
  const fresh = await delivered(cust, [{ productId: pB.id, qty: 1 }], 6);
  ok((await req(cust.sock, 'disputes:eligibility', { orderId: fresh.id })).data.eligible === true, 'delivered 6 days ago is still inside the window');
  await req(admin.sock, 'settings:set', { key: 'returnWindowDays', value: '3' });
  ok((await req(cust.sock, 'disputes:eligibility', { orderId: fresh.id })).data.eligible === false, 'the window follows the platform setting at once (3 days)');
  await req(admin.sock, 'settings:set', { key: 'returnWindowDays', value: '7' });

  // ═════════════════════════════════════════════════════════════════════════
  section('Response time: returns, disputes, replacements and exchanges are not left hanging');
  await req(admin.sock, 'settings:set', { key: 'sellerResponseHours', value: '0.001' });
  const oR = await delivered(cust, [{ productId: pC.id, qty: 3 }]);
  const oD = await delivered(cust2, [{ productId: pC.id, qty: 1 }]);
  const oX = await delivered(cust, [{ productId: pB.id, qty: 1 }]);
  const ret = (await req(cust.sock, 'disputes:open', { orderId: oR.id, type: 'return', reason: 'Wrong colour for me', items: [{ productId: pC.id, qty: 1 }] })).data;
  const dsp = (await req(cust2.sock, 'disputes:open', { orderId: oD.id, type: 'dispute', reason: 'The cable never arrived', category: 'missing' })).data;
  const rep = (await req(cust.sock, 'replacements:create', { orderId: oR.id, sku: pC.id, productName: pC.name, reason: 'One cable is cracked', qty: 1 })).data;
  const exc = (await req(cust.sock, 'exchanges:create', { orderId: oX.id, fromSku: pB.id, fromName: pB.name, toSku: pC.id, toName: pC.name, reason: 'Too small' }));
  await req(admin.sock, 'settings:set', { key: 'sellerResponseHours', value: '48' });
  ok(!!ret && !!dsp && !!rep, 'a return, a dispute and a replacement are opened with a 3.6 s response time', JSON.stringify({ r: !!ret, d: !!dsp, p: !!rep, e: exc.error }));
  const lapsed = await until(async () => { const d = (await req(cust.sock, 'disputes:get', { id: ret.id })).data; return d.stage === 'seller_timeout' ? d : null; }, 15000);
  ok(!!lapsed && lapsed.canEscalate, 'return: after the response time it moves to seller_timeout and can be escalated');
  ok(await hasNotice(cust, (n) => n.entityId === ret.id && n.title === 'Seller did not respond'), 'return: the customer is told');
  ok(await hasNotice(owner, (n) => n.entityId === ret.id && n.title === 'Seller did not respond'), 'return: the seller is told');
  a = await req(owner.sock, 'returns:respond', { id: ret.id, accept: true });
  ok(!a.ok && /response time has passed/.test(a.error ?? ''), 'return: the seller can no longer answer', a.error);
  ok(await hasNotice(cust2, (n) => n.entityId === dsp.id && n.title === 'Seller did not respond' && n.type === 'dispute', 15000), 'dispute: the customer is told when the seller does not reply');
  ok(await hasNotice(owner, (n) => n.entityId === dsp.id && n.title === 'Seller did not respond'), 'dispute: the seller is told');
  ok((await req(agent.sock, 'notifications:list')).data.some((n) => n.entityId === dsp.id && n.title === 'Seller did not respond'), 'dispute: support is told');
  ok(await hasNotice(cust, (n) => n.entityId === rep.id && n.title === 'Seller did not respond' && n.type === 'replacement', 15000), 'replacement: the customer is told');
  ok(await hasNotice(owner, (n) => n.entityId === rep.id && n.title === 'Seller did not respond'), 'replacement: the seller is told');
  if (exc.ok) ok(await hasNotice(cust, (n) => n.entityId === exc.data.id && n.title === 'Seller did not respond' && n.type === 'exchange', 15000), 'exchange: the customer is told');
  await sleep(4500); // several more sweeps: each notice must have been sent exactly once
  const noticeCount = async (u, id) => (await noticesOf(u)).filter((n) => n.entityId === id && n.title === 'Seller did not respond').length;
  ok((await noticeCount(cust, ret.id)) === 1 && (await noticeCount(cust2, dsp.id)) === 1 && (await noticeCount(cust, rep.id)) === 1, 'every notice was sent exactly once, however many sweeps ran');
  const lapseRows = await sql('SELECT sellerLapsedAt, stage, status FROM disputes WHERE id = ?', [dsp.id]);
  ok(lapseRows[0]?.sellerLapsedAt && lapseRows[0].stage === 'awaiting_seller' && lapseRows[0].status === 'open', 'the dispute keeps its stage (support was already on it) and records the lapse');
  a = await req(agent.sock, 'replacements:respond', { id: rep.id, approve: true });
  ok(a.ok && a.data.status === 'approved', 'support can still approve the replacement on the seller\'s behalf after the lapse', a.error);
  a = await req(owner.sock, 'disputes:reply', { id: dsp.id, text: 'Shipped Monday, here is the label' });
  ok(a.ok, 'and the seller may still reply to the dispute late', a.error);

  // ═════════════════════════════════════════════════════════════════════════
  section('Vacation mode: an open product page follows live, and the sweep reopens the store');
  const prodView = (await req(cust.sock, 'products:get', { id: pA.id })).data;
  ok(prodView.sellerOnVacation === false, 'the product says the store is open');
  const vacOn = nextEvent(guest.sock, 'store:vacation', (p) => p.sellerId === store.id && p.onVacation === true);
  const vacOnCust = nextEvent(cust.sock, 'store:vacation', (p) => p.sellerId === store.id && p.onVacation === true);
  a = await req(owner.sock, 'sellers:update', { vacationUntil: new Date(Date.now() + 5000).toISOString() });
  ok(a.ok && a.data.onVacation === true, 'the owner puts the store on vacation for 5 seconds', a.error);
  const von = await vacOn;
  ok(von && von.sellerIds.includes(store.id) && von.sellerIds.includes(owner.user.id) && /vacation/.test(von.notice.en) && /vacances/.test(von.notice.fr), 'a guest on the product page gets store:vacation live (both ids, EN + FR notice)', JSON.stringify(von));
  ok(!!(await vacOnCust), 'and so does a signed-in shopper');
  ok((await req(cust.sock, 'products:get', { id: pA.id })).data.sellerOnVacation === true, 'a reloaded product agrees');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: pA.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
  ok(!a.ok && /vacation/i.test(a.error ?? ''), 'nothing can be ordered from it meanwhile', a.error);
  const vacOff = nextEvent(guest.sock, 'store:vacation', (p) => p.sellerId === store.id && p.onVacation === false, 15000);
  const off = await vacOff;
  ok(off && off.notice === null && off.vacationUntil === null, 'when the date passes the sweep reopens the store and pushes it live', JSON.stringify(off));
  ok((await req(cust.sock, 'products:get', { id: pA.id })).data.sellerOnVacation === false, 'the product says open again');
  ok(await hasNotice(owner, (n) => n.title === 'Vacation mode ended'), 'the owner is told it ended');

  // ═════════════════════════════════════════════════════════════════════════
  section('Team roles: what a Support member can call (and what their menu leads to)');
  const staff = {};
  for (const role of ['support', 'orders', 'catalog', 'finance']) {
    const m = await register(`st${role}`, 'seller');
    const inv = await req(owner.sock, 'team:invite', { email: m.email, role });
    const acc = await req(m.sock, 'team:accept', { token: inv.data?.devToken });
    if (!acc.ok) throw new Error(`team:accept ${role}: ${acc.error}`);
    staff[role] = m;
  }
  const can = async (u, ev, body = {}) => (await req(u.sock, ev, body)).ok;
  const sup = staff.support;
  // allowed: what the pages in a Support member's menu use
  ok(await can(sup, 'reviews:seller'), 'support reads the reviews');
  ok(await can(sup, 'questions:seller', {}), 'support reads the product questions');
  ok(await can(sup, 'questions:unanswered'), 'support reads the unanswered count');
  ok(await can(sup, 'chat:list'), 'support reads the customer chat');
  ok(await can(sup, 'support:list'), 'support reads the platform support tickets');
  ok(await can(sup, 'products:list', {}), 'support may read product names (catalog_read)');
  ok(await can(sup, 'notifications:list'), 'support has a notification list');
  ok(await can(sup, 'sellers:mine'), 'support reads the store itself');
  // refused: everything behind pages that are not in their menu
  for (const [ev, body] of [
    ['payouts:available', {}], ['analytics:seller', { days: 7 }], ['finance:earnings', {}], ['finance:statements', {}],
    ['campaigns:create', { name: 'x' }], ['products:create', { name: 'No', price: 1, category: 'Electronics', stock: 1 }],
    ['products:update', { id: pA.id, patch: { price: 99 } }], ['sellers:update', { handlingDays: 2 }], ['team:list', {}],
    ['team:invite', { email: 'x@y.zz', role: 'orders' }], ['orders:sellerReady', { orderId: oR.id }],
  ]) ok(!(await can(sup, ev, body)), `support is refused ${ev}`);
  // the lists behind the Orders pages answer a team member without the right with nothing (never the store's cases)
  const seen = async (u, ev, body = {}) => { const r = await req(u.sock, ev, body); return r.ok ? (Array.isArray(r.data) ? r.data.length : 1) : 0; };
  for (const ev of ['disputes:list', 'returns:list', 'replacements:list', 'exchanges:list']) ok((await seen(sup, ev)) === 0, `support gets nothing from ${ev}`);
  ok((await seen(staff.orders, 'disputes:list')) > 0 && (await seen(staff.orders, 'replacements:list')) > 0, 'orders: the same lists show the store\'s cases');
  ok((await seen(sup, 'reviews:seller')) > 0 && (await seen(staff.orders, 'reviews:seller')) === 0 && (await seen(staff.finance, 'reviews:seller')) === 0, 'reviews: support sees them, orders and finance get nothing');
  // the other roles keep their own pages and are refused the rest
  ok(await can(staff.finance, 'finance:earnings', {}) && !(await can(staff.finance, 'products:update', { id: pA.id, patch: { price: 98 } })), 'finance: earnings yes, editing products no');
  ok(await can(staff.catalog, 'products:update', { id: pA.id, patch: { price: 21 } }) && !(await can(staff.catalog, 'finance:earnings', {})), 'catalog: products yes, finance no');
  const prefsPush = await req(sup.sock, 'me:prefs');
  ok(prefsPush.ok, 'support can read their own notification switches');
  const supNotices = await noticesOf(sup);
  ok(supNotices.every((n) => ['team', 'review', 'question', 'support', 'chat', 'security', 'system'].includes(n.type) || n.type === undefined), 'support is only sent notices their role handles (no orders, payouts, stock, promotions)', JSON.stringify([...new Set(supNotices.map((n) => n.type))]));

  // ═════════════════════════════════════════════════════════════════════════
  section('Help: contact options from the platform settings');
  a = await req(cust.sock, 'settings:set', { key: 'supportPhone', value: '+243 970 000 000' });
  ok(!a.ok, 'a customer cannot set them');
  const live2 = nextEvent(cust.sock, 'settings:updated', (p) => p.supportPhone === '+243 970 000 000');
  a = await req(admin.sock, 'settings:set', { key: 'supportPhone', value: ' +243 970 000 000 ' });
  ok(a.ok && a.data.supportPhone === '+243 970 000 000', 'the admin sets the support phone (trimmed)', a.error);
  ok(a.ok && (await req(admin.sock, 'settings:set', { key: 'supportEmail', value: 'help@somba.example' })).ok && (await req(admin.sock, 'settings:set', { key: 'supportWhatsapp', value: '+243 970 000 111' })).ok, 'and the e-mail and WhatsApp number');
  ok(!!(await live2), 'the apps get the new value live (settings:updated)');
  const shopperView = (await req(cust.sock, 'settings:get')).data;
  const guestView = (await req(guest.sock, 'settings:get')).data;
  ok(shopperView.supportPhone === '+243 970 000 000' && shopperView.supportEmail === 'help@somba.example' && shopperView.supportWhatsapp === '+243 970 000 111', 'a customer reads all three');
  ok(guestView.supportEmail === 'help@somba.example' && !('commissionPct' in guestView), 'a guest reads them too, and still not the private settings');
  ok(!(await req(admin.sock, 'settings:set', { key: 'supportPhone', value: 'call me' })).ok && !(await req(admin.sock, 'settings:set', { key: 'supportEmail', value: 'not an email' })).ok, 'a bad phone or e-mail is refused');
  a = await req(admin.sock, 'settings:set', { key: 'supportWhatsapp', value: '' });
  ok(a.ok && (await req(cust.sock, 'settings:get')).data.supportWhatsapp === '', 'a blank value switches an option off');
  for (const k of ['supportPhone', 'supportEmail']) await req(admin.sock, 'settings:set', { key: k, value: '' });

  // ═════════════════════════════════════════════════════════════════════════
  section('Cash on delivery stays off');
  ok((await req(cust.sock, 'settings:get')).data.codEnabled === 'false', 'the shopper settings say cash on delivery is off');
  a = await req(cust.sock, 'orders:create', { items: [{ productId: pC.id, qty: 1 }], paymentMethod: 'cod', shippingAddress: ADDRESS });
  ok(!a.ok, 'the server refuses an order paid on delivery', a.error);

  await db.end();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
