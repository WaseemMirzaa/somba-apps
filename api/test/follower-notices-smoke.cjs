/* Follower notices: a store's followers hear (bell + push, English or French per their language) when the store
 * publishes a product, a flash sale (deal) starts, a seller campaign goes live, or a public coupon is published.
 * The owner and non-followers hear nothing; the promo push switch is respected (the bell still has the notice);
 * a sweep that runs again never repeats a notice, and a deal or promotion that is live at creation and one that
 * becomes live later (by the sweep) each notify exactly once.
 *
 * Runs against a RUNNING API seeded with `npm run seed:demo` (fake translator), with short sweeps, and reads/writes
 * the same MySQL database to move a campaign's start date:
 *
 *   API_URL=http://localhost:3055 DB_DATABASE=somba_w3 FLASH_SWEEP_MS=1000 CAMPAIGN_SWEEP_MS=1000 node test/follower-notices-smoke.cjs
 */
const { io } = require('socket.io-client');
const mysql = require('mysql2/promise');
const { kyc } = require('./kyc.cjs');
const { settlePassword } = require('./temp-password.cjs');
const API = process.env.API_URL ?? 'http://localhost:3055';
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
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@w3.test`, password: 'W3-Pass-2026', name: `${label} User`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const noticesOf = async (u, type) => ((await req(u.sock, 'notifications:list')).data ?? []).filter((n) => !type || n.type === type);

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USERNAME ?? 'root', password: process.env.DB_PASSWORD ?? '', database: process.env.DB_DATABASE ?? 'somba_w3', timezone: 'Z' });
  const sql = async (q, p = []) => (await db.query(q, p))[0];
  // The bootstrap admin starts with a temporary password: settle it (and keep the same one working).
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@somba.app';
  const adminPw = process.env.ADMIN_PASSWORD ?? PW;
  await settlePassword(API, adminEmail, adminPw, { keep: true });
  const admin = await login(adminEmail, adminPw);
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  const plansNow = (await req(admin.sock, 'settings:get')).data.sellerPlans;
  const plans = (plansNow ? JSON.parse(plansNow) : []).map((p) => (p.id === 'free' ? { ...p, perks: { ...(p.perks ?? {}), promotions: true, flashNomination: true, coupons: true } } : p));
  if (plans.length) await req(admin.sock, 'settings:set', { key: 'sellerPlans', value: JSON.stringify(plans) });

  const owner = await register('owner', 'seller');
  const store = (await req(owner.sock, 'sellers:register', kyc(`W3 Étoile ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  await req(owner.sock, 'sellers:update', { pickupAddress: '14 Avenue du Commerce, Gombe', pickupLat: -4.3031, pickupLng: 15.3033 });
  const en = await register('fan-en'); // follows, English
  const fr = await register('fan-fr'); // follows, French
  const muted = await register('fan-muted'); // follows, promo push switched off
  const stranger = await register('stranger'); // follows nobody
  const otherFan = await register('other-fan'); // follows another store
  await req(fr.sock, 'me:update', { locale: 'fr' });
  await req(muted.sock, 'me:setPrefs', { notify: { promo: false } });
  const prefs = (await req(muted.sock, 'me:prefs')).data;
  ok(prefs?.notify?.promo === false, 'a follower can switch the promo push category off');

  const other = await register('owner2', 'seller');
  const otherStore = (await req(other.sock, 'sellers:register', kyc(`W3 Other ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: otherStore.id, status: 'approved' });
  for (const f of [en, fr, muted]) ok((await req(f.sock, 'follows:toggle', { sellerId: store.id })).data?.following === true, 'a customer follows the store');
  await req(otherFan.sock, 'follows:toggle', { sellerId: otherStore.id });
  ok(!(await req(owner.sock, 'follows:toggle', { sellerId: store.id })).ok, 'the owner cannot follow their own store');

  const mk = async (name, price) => {
    const r = await req(owner.sock, 'products:create', { name: `${name} ${tag}`, price, category: 'Electronics', stock: 50 });
    if (!r.ok) throw new Error(`product ${name}: ${r.error}`);
    return r.data;
  };
  const everyone = [en, fr, muted, stranger, otherFan, owner];
  const hasNone = async (type, pred, who) => {
    for (const u of who) if ((await noticesOf(u, type)).some(pred)) return false;
    return true;
  };

  // ═════════════════════════════════════════════════════════════════════════
  section('A product goes live (existing behaviour, unchanged)');
  const p0 = await mk('Radio', 30);
  ok(!!(await until(async () => (await noticesOf(en, 'store')).find((n) => n.entityId === p0.id))), 'a follower hears of the new product');
  ok((await noticesOf(stranger, 'store')).length === 0 && (await noticesOf(owner, 'store')).length === 0, 'a stranger and the owner do not');

  // ═════════════════════════════════════════════════════════════════════════
  section('A deal: flash sale created already running');
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  const pDeal = await mk('Lamp', 40);
  let a = await req(admin.sock, 'flashsales:create', { title: `Lamp deal ${tag}`, productId: pDeal.id, flashPrice: 25, startsAt: past, endsAt: future });
  ok(a.ok, 'marketing creates a running flash sale on the store\'s product', a.error);
  const sale1 = a.data;
  const dealOf = (id) => (n) => n.entityId === id && /New deal from/.test(n.title);
  const saleOf = (id) => (n) => n.entityId === id;
  const got = await until(async () => (await noticesOf(en, 'flash')).find(dealOf(sale1.id)));
  ok(!!got && got.title === `New deal from W3 Étoile ${tag}`, 'the English follower gets "New deal from <store>"', JSON.stringify(got?.title));
  ok(got?.titleFr === `Nouvelle offre d’W3 Étoile ${tag}` || got?.titleFr?.startsWith('Nouvelle offre d'), 'the notice carries its French title', JSON.stringify(got?.titleFr));
  ok(/\$25\.00 instead of \$40\.00/.test(got?.body ?? '') && /25,00 \$ au lieu de 40,00 \$/.test(got?.bodyFr ?? ''), 'the body gives the prices in English and in French', JSON.stringify([got?.body, got?.bodyFr]));
  ok(got?.link === '/shop/deals', 'it opens the deals page', got?.link);
  const gotFr = (await noticesOf(fr, 'flash')).find(dealOf(sale1.id));
  ok(!!gotFr?.titleFr && /^Nouvelle offre d/.test(gotFr.titleFr), 'the French-speaking follower has the French title for their app');
  ok(!!(await noticesOf(muted, 'flash')).find(dealOf(sale1.id)), 'a follower who muted promo push still has the notice in the bell');
  ok(await hasNone('flash', dealOf(sale1.id), [stranger, otherFan, owner]), 'a stranger, another store\'s follower and the owner do not hear of it');
  await sleep(3500); // a few sweeps pass
  ok((await noticesOf(en, 'flash')).filter(dealOf(sale1.id)).length === 1, 'sweeps that run again do not repeat it');
  // an edit that leaves it running notifies nobody again
  await req(admin.sock, 'flashsales:update', { id: sale1.id, patch: { flashPrice: 24 } });
  await sleep(500);
  ok((await noticesOf(en, 'flash')).filter(dealOf(sale1.id)).length === 1, 'editing the running sale does not repeat it');

  // ═════════════════════════════════════════════════════════════════════════
  section('A deal: flash sale that starts later (the sweep)');
  const pLater = await mk('Kettle', 60);
  const startsIn = new Date(Date.now() + 4000).toISOString();
  a = await req(admin.sock, 'flashsales:create', { title: `Kettle deal ${tag}`, productId: pLater.id, flashPrice: 30, startsAt: startsIn, endsAt: future });
  const sale2 = a.data;
  ok(a.ok && sale2.phase === 'scheduled', 'a scheduled sale is created');
  await sleep(1500);
  ok(!(await noticesOf(en, 'flash')).some(dealOf(sale2.id)), 'followers hear nothing while it is only scheduled');
  const later = await until(async () => (await noticesOf(en, 'flash')).find(dealOf(sale2.id)), 12000);
  ok(!!later, 'when the sweep starts it, followers are told');
  await sleep(3000);
  ok((await noticesOf(en, 'flash')).filter(dealOf(sale2.id)).length === 1 && (await noticesOf(fr, 'flash')).filter(dealOf(sale2.id)).length === 1, 'and told once, not on every sweep');

  // ═════════════════════════════════════════════════════════════════════════
  section('A deal: the seller nominates, marketing approves');
  const pNom = await mk('Fan', 20);
  a = await req(owner.sock, 'flashsales:nominate', { productId: pNom.id, flashPrice: 12, endsAt: future });
  ok(a.ok && a.data.status === 'nominated', 'the seller nominates a flash sale', a.error);
  const nom = a.data;
  await sleep(800);
  ok(await hasNone('flash', dealOf(nom.id), [en, fr, muted]), 'followers hear nothing about a nomination');
  a = await req(admin.sock, 'flashsales:approve', { id: nom.id });
  ok(a.ok, 'marketing approves it', a.error);
  ok(!!(await until(async () => (await noticesOf(en, 'flash')).find(dealOf(nom.id)))), 'once it is live, followers are told');
  ok((await noticesOf(owner, 'flash')).filter(saleOf(nom.id)).every((n) => !/New deal from/.test(n.title)), 'the owner only gets their own sale notices, never the follower one');

  // ═════════════════════════════════════════════════════════════════════════
  section('A promotion: seller campaign goes live');
  const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const pCamp = await mk('Camp item', 100);
  a = await req(owner.sock, 'campaigns:create', { name: `Spring ${tag}`, discount: 25, productIds: [pCamp.id], startDate: day(-1), endDate: day(3) });
  ok(a.ok && a.data.status === 'pending', 'the seller proposes a campaign');
  const camp = a.data;
  await sleep(500);
  const campOf = (id) => (n) => n.entityId === `${store.id}:${id}`;
  ok(await hasNone('campaign', campOf(camp.id), [en, fr, muted]), 'followers hear nothing while it is pending');
  a = await req(admin.sock, 'campaigns:setStatus', { id: camp.id, status: 'active' });
  ok(a.ok && a.data.status === 'active', 'marketing approves it (starts today: live at once)');
  const cn = await until(async () => (await noticesOf(en, 'campaign')).find(campOf(camp.id)));
  ok(!!cn && cn.title === `New promotion from W3 Étoile ${tag}` && /25% off/.test(cn.body), 'the follower gets "New promotion from <store>" with the discount', JSON.stringify(cn && [cn.title, cn.body]));
  ok(/^Nouvelle promotion d/.test(cn?.titleFr ?? '') && /25 % de réduction/.test(cn?.bodyFr ?? ''), 'and the French version', JSON.stringify(cn && [cn.titleFr, cn.bodyFr]));
  ok(cn?.link === `/shop/stores/${store.id}`, 'it opens the store', cn?.link);
  ok(!!(await noticesOf(fr, 'campaign')).find(campOf(camp.id)) && !!(await noticesOf(muted, 'campaign')).find(campOf(camp.id)), 'the French follower and the muted follower (bell) have it');
  ok(await hasNone('campaign', (n) => /New promotion from/.test(n.title), [stranger, otherFan, owner]), 'a stranger, another store\'s follower and the owner do not');
  await sleep(2500);
  ok((await noticesOf(en, 'campaign')).filter(campOf(camp.id)).length === 1, 'sweeps that run again do not repeat it');

  section('A promotion: campaign that starts later (the sweep)');
  a = await req(owner.sock, 'campaigns:create', { name: `Summer ${tag}`, discount: 15, productIds: [pCamp.id], startDate: day(2), endDate: day(5) });
  const camp2 = a.data;
  a = await req(admin.sock, 'campaigns:setStatus', { id: camp2.id, status: 'scheduled' });
  ok(a.ok && a.data.status === 'scheduled', 'a campaign starting in two days is approved as scheduled');
  await sleep(2500);
  ok(!(await noticesOf(en, 'campaign')).some(campOf(camp2.id)), 'followers hear nothing while it is scheduled');
  await sql('UPDATE campaigns SET startDate = ? WHERE id = ?', [day(-1), camp2.id]);
  ok(!!(await until(async () => (await noticesOf(en, 'campaign')).find(campOf(camp2.id)), 12000)), 'when the sweep starts it, followers are told');
  await sleep(3000);
  ok((await noticesOf(en, 'campaign')).filter(campOf(camp2.id)).length === 1 && (await noticesOf(fr, 'campaign')).filter(campOf(camp2.id)).length === 1, 'once only');

  // ═════════════════════════════════════════════════════════════════════════
  section('A promotion: public store coupon');
  const couponOf = (id) => (n) => n.entityId === `${store.id}:${id}`;
  a = await req(owner.sock, 'coupons:create', { code: `PRIV${tag}`, type: 'percent', value: 10, isPublic: false });
  ok(a.ok, 'the seller creates a private coupon', a.error);
  const priv = a.data;
  await sleep(600);
  ok(await hasNone('promo', couponOf(priv.id), [en, fr, muted]), 'a private coupon tells nobody');
  a = await req(owner.sock, 'coupons:create', { code: `PUB${tag}`, type: 'percent', value: 15, isPublic: true });
  ok(a.ok, 'the seller publishes a public coupon', a.error);
  const pub = a.data;
  const coupon = await until(async () => (await noticesOf(en, 'promo')).find(couponOf(pub.id)));
  ok(!!coupon && coupon.title === `New promotion from W3 Étoile ${tag}` && coupon.body === `Code PUB${tag}: 15% off`, 'the follower hears of it', JSON.stringify(coupon && [coupon.title, coupon.body]));
  ok(coupon?.bodyFr === `Code PUB${tag} : 15 % de réduction` && /^Nouvelle promotion d/.test(coupon?.titleFr ?? ''), 'in French too', JSON.stringify(coupon && [coupon.titleFr, coupon.bodyFr]));
  ok(coupon?.link === `/shop/stores/${store.id}`, 'it opens the store', coupon?.link);
  ok(!!(await noticesOf(fr, 'promo')).find(couponOf(pub.id)) && !!(await noticesOf(muted, 'promo')).find(couponOf(pub.id)), 'the French and the muted follower have it in the bell');
  ok(await hasNone('promo', couponOf(pub.id), [stranger, otherFan, owner]), 'a stranger, another store\'s follower and the owner do not');
  // switching the private coupon public later is its publication; switching a public one off and on again is not a new one
  a = await req(owner.sock, 'coupons:update', { id: priv.id, patch: { isPublic: true } });
  ok(a.ok && !!(await until(async () => (await noticesOf(en, 'promo')).find(couponOf(priv.id)))), 'a private coupon made public tells followers then');
  await req(owner.sock, 'coupons:setActive', { id: pub.id, active: false });
  await req(owner.sock, 'coupons:setActive', { id: pub.id, active: true });
  await req(owner.sock, 'coupons:update', { id: pub.id, patch: { description: 'x' } });
  await sleep(600);
  ok((await noticesOf(en, 'promo')).filter(couponOf(pub.id)).length === 1, 'switching it off and on, or editing it, does not repeat the notice');

  // ═════════════════════════════════════════════════════════════════════════
  section('Not followers / not approved');
  await req(en.sock, 'follows:toggle', { sellerId: store.id, following: false });
  const pAfter = await mk('Mug', 10);
  a = await req(admin.sock, 'flashsales:create', { title: `Mug deal ${tag}`, productId: pAfter.id, flashPrice: 5, startsAt: past, endsAt: future });
  await sleep(1500);
  ok(!(await noticesOf(en, 'flash')).some(dealOf(a.data?.id)) && !!(await until(async () => (await noticesOf(fr, 'flash')).find(dealOf(a.data?.id)))), 'someone who unfollowed hears nothing; a follower still does');

  await db.end();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
