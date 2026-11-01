/* EN/FR multilingual suite (docs/MULTILINGUAL-PLAN.md). Runs against a RUNNING API that was seeded with `npm run seed`
 * and started with TRANSLATE_PROVIDER=fake (every machine translation reads "[fr] text" / "[en] text"):
 *
 *   TRANSLATE_PROVIDER=fake ... node dist/main.js
 *   API_URL=http://localhost:3014 node test/i18n-smoke.cjs        (or: npm run smoke:i18n)
 *
 * A seller writes in English and French appears; writes in French and English appears; edits a translation by hand and it
 * survives; categories keep their products; order lines carry French; reviews translate by id only.
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { toDelivery } = require('./journey.cjs');
const API = process.env.API_URL ?? process.env.SMOKE_API ?? 'http://localhost:3001';
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
// The API allows 30 sign-ins/registrations a minute per address; when the suites run back to back (CI), wait and retry.
const rest = async (path, body, token) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && /ThrottlerException/.test(json?.message ?? '') && attempt < 6) {
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
// Ask the API over the socket. The API allows 40 events a second per connection; a test that runs faster than
// that waits a second and asks again, as a well-behaved client would.
const req = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1100));
      continue;
    }
    return res;
  }
};
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@i18n.test`, password: 'I18n-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
/** Wait until a product has no translation pending, then return it. */
const settled = async (sock, id) => until(async () => {
  const p = (await req(sock, 'products:get', { id })).data;
  return p && p.translationStatus === 'done' ? p : null;
});

(async () => {
  const admin = await login('admin@somba.app');
  const demo = await login('customer@somba.app');
  const rider = await login('rider@somba.app');
  const guest = { sock: await connect() };
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });

  // an approved seller
  const sellerU = await register('shop', 'seller');
  const store = (await req(sellerU.sock, 'sellers:register', kyc(`I18n Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  const other = await register('rival', 'seller');
  const store2 = (await req(other.sock, 'sellers:register', kyc(`Rival Store ${tag}`))).data;
  await req(admin.sock, 'sellers:setStatus', { id: store2.id, status: 'approved' });

  const cats = (await req(guest.sock, 'categories:list')).data;
  const electronics = cats.find((c) => c.name === 'Electronics');
  const fashion = cats.find((c) => c.name === 'Fashion');
  ok(cats.length >= 6 && cats.every((c) => 'nameFr' in c && 'productCount' in c && c.sourceLang), 'categories:list serves nameFr, productCount and sourceLang');
  ok(electronics?.nameFr === 'Électronique', 'the seeded French category name is an author row, served as nameFr');

  // ---- 1. English in, French out ---------------------------------------------------------------------
  section('A seller writes in English: French appears');
  const fresh = new Promise((res) => { sellerU.sock.on('product:updated', (p) => { if (p.name === `Wireless Earbuds ${tag}` && p.translationStatus === 'done') res(p); }); setTimeout(() => res(null), 9000); });
  let a = await req(sellerU.sock, 'products:create', {
    name: `Wireless Earbuds ${tag}`, description: 'Noise reduction and 24 hours of battery.', price: 40, stock: 20, categoryId: electronics.id,
    variants: [{ name: 'Colour', options: ['Black', 'White'] }, { name: 'Size', options: ['XL', 'M'] }],
  });
  ok(a.ok && a.data.sourceLang === 'en' && a.data.name === `Wireless Earbuds ${tag}`, 'created as an English listing (sourceLang en)', JSON.stringify(a));
  const en1 = a.data;
  ok(en1.category === 'Electronics' && en1.categoryFr === 'Électronique' && en1.categoryId === electronics.id, 'category, categoryFr and categoryId are composed from the categories table');
  ok(typeof en1.sellerName === 'string' && en1.sellerName.includes('I18n Store'), 'sellerName is joined from the store');
  ok(typeof en1.variants === 'string' && JSON.parse(en1.variants)[0].name === 'Colour', 'variants stay the canonical option groups (JSON text)');
  ok(en1.variantLabels && typeof en1.variantLabels === 'object' && Array.isArray(en1.variantLabels.fr), 'variantLabels is a real object { en, fr }');
  const pushed = await fresh;
  ok(!!pushed, 'the finished machine translation is pushed to the seller as product:updated');
  const en = await settled(sellerU.sock, en1.id);
  ok(en && en.nameFr === `[fr] Wireless Earbuds ${tag}`, 'the French title appears after the job', en?.nameFr);
  ok(en.descriptionFr === '[fr] Noise reduction and 24 hours of battery.' && en.description === 'Noise reduction and 24 hours of battery.', 'the French description appears, the English one is untouched');
  ok(en.machineTranslated.includes('nameFr') && en.machineTranslated.includes('descriptionFr') && !en.machineTranslated.includes('name'), 'machineTranslated lists the served fields that came from a machine', JSON.stringify(en.machineTranslated));
  const labelsFr = en.variantLabels.fr;
  ok(labelsFr.length === 2 && labelsFr[0].name === '[fr] Colour' && labelsFr[0].options.join() === '[fr] Black,[fr] White', 'variant names and options are translated, index-aligned', JSON.stringify(labelsFr));
  ok(labelsFr[1].options.join() === 'XL,M', 'sizes (XL, M) are never sent to the translator: copied as they are', JSON.stringify(labelsFr[1]));
  ok(en.variants === en1.variants && en.variantLabels.en[0].name === 'Colour', 'the canonical variants (the purchase key) did not change; the English labels are the canonical ones');
  const asShopper = (await req(guest.sock, 'products:get', { id: en1.id })).data;
  ok(asShopper.nameFr === en.nameFr, 'shoppers read the same composed product');

  // ---- 2. French in, English out ---------------------------------------------------------------------
  section('A seller writes in French: English appears');
  a = await req(sellerU.sock, 'products:create', { nameFr: `Chaussures de sport ${tag}`, descriptionFr: 'Légères et confortables.', price: 55, stock: 8, category: 'Mode' });
  ok(a.ok && a.data.sourceLang === 'fr', 'created as a French listing (sourceLang fr)', JSON.stringify(a));
  ok(a.data.categoryId === fashion.id && a.data.category === 'Fashion', 'the category was found by its French name');
  const fr1 = a.data;
  ok(fr1.nameFr === `Chaussures de sport ${tag}`, 'the French title is served as typed');
  const fr = await settled(sellerU.sock, fr1.id);
  ok(fr && fr.name === `[en] Chaussures de sport ${tag}` && fr.nameFr === `Chaussures de sport ${tag}`, 'the English title appears after the job', fr?.name);
  ok(fr.description === '[en] Légères et confortables.' && fr.descriptionFr === 'Légères et confortables.', 'the English description appears');
  ok(fr.machineTranslated.includes('name') && !fr.machineTranslated.includes('nameFr'), 'name is marked machine-made, nameFr is not', JSON.stringify(fr.machineTranslated));
  a = await req(sellerU.sock, 'products:create', { price: 5, stock: 1, categoryId: fashion.id });
  ok(!a.ok && a.error === 'Enter a product title in English or French.', 'C-I1: a listing needs a title in at least one language', a.error);
  a = await req(sellerU.sock, 'products:create', { name: 'x', price: 5, categoryId: 'no-such-category' });
  ok(!a.ok, 'a listing must point at a real category');

  // ---- 3. Hand edits survive -------------------------------------------------------------------------
  section('A seller edits a translation by hand');
  a = await req(sellerU.sock, 'products:update', { id: en1.id, patch: { nameFr: `Écouteurs maison ${tag}` } });
  ok(a.ok && a.data.nameFr === `Écouteurs maison ${tag}` && !a.data.machineTranslated.includes('nameFr'), 'an edited French title is served and no longer marked machine-made', JSON.stringify(a));
  a = await req(sellerU.sock, 'products:retranslate', { id: en1.id });
  ok(a.ok, 'products:retranslate by the owner works');
  const again = await until(async () => { const p = (await req(sellerU.sock, 'products:get', { id: en1.id })).data; return p.translationStatus === 'done' && p.variantLabels.fr[0].name === '[fr] Colour' ? p : null; });
  ok(again && again.nameFr === `Écouteurs maison ${tag}`, 'C-I6: a retranslation never overwrites the author row', again?.nameFr);
  ok(again.descriptionFr === '[fr] Noise reduction and 24 hours of battery.', 'but the machine rows are rebuilt');
  a = await req(sellerU.sock, 'products:update', { id: en1.id, patch: { name: `Wireless Earbuds Pro ${tag}` } });
  ok(a.ok && a.data.name === `Wireless Earbuds Pro ${tag}` && a.data.nameFr === `Écouteurs maison ${tag}`, 'editing the English source keeps the hand-written French', JSON.stringify(a.data && [a.data.name, a.data.nameFr]));
  const redone = await until(async () => { const p = (await req(sellerU.sock, 'products:get', { id: en1.id })).data; return p.translationStatus === 'done' && p.descriptionFr ? p : null; });
  ok(redone && redone.nameFr === `Écouteurs maison ${tag}`, 'and the job that follows leaves it alone');
  a = await req(sellerU.sock, 'products:update', { id: en1.id, patch: { description: 'Brand new description.' } });
  const redesc = await until(async () => { const p = (await req(sellerU.sock, 'products:get', { id: en1.id })).data; return p.descriptionFr === '[fr] Brand new description.' ? p : null; });
  ok(!!redesc, 'changing the source text re-translates the stale machine row');
  a = await req(sellerU.sock, 'products:update', { id: en1.id, patch: { nameFr: '' } });
  ok(a.ok, 'clearing a translated field is accepted');
  const refilled = await until(async () => { const p = (await req(sellerU.sock, 'products:get', { id: en1.id })).data; return p.nameFr === `[fr] Wireless Earbuds Pro ${tag}` ? p : null; });
  ok(!!refilled && refilled.machineTranslated.includes('nameFr'), 'clearing it deletes the row and the machine fills it again');
  ok(!(await req(other.sock, 'products:retranslate', { id: en1.id })).ok, 'another seller cannot retranslate my product');
  ok(!(await req(other.sock, 'products:update', { id: en1.id, patch: { nameFr: 'hack' } })).ok, 'nor edit it');

  // ---- 4. Variant labels ------------------------------------------------------------------------------
  section('Variant labels (C-I4)');
  a = await req(sellerU.sock, 'products:create', {
    name: `Shirt ${tag}`, price: 12, stock: 3, categoryId: fashion.id,
    variants: [{ name: 'Colour', options: ['Red', 'Blue'] }],
    variantLabels: { fr: [{ name: 'Couleur', options: ['Rouge'] }] }, // wrong shape (1 option, canonical has 2)
  });
  const shirt = await settled(sellerU.sock, a.data.id);
  ok(shirt.variantLabels.fr[0].options.length === 2 && shirt.variantLabels.fr[0].name === '[fr] Colour', 'labels of the wrong shape are dropped and re-translated', JSON.stringify(shirt.variantLabels.fr));
  a = await req(sellerU.sock, 'products:create', {
    name: `Hat ${tag}`, price: 12, stock: 3, categoryId: fashion.id,
    variants: [{ name: 'Colour', options: ['Red', 'Blue'] }],
    variantLabels: { fr: [{ name: 'Couleur', options: ['Rouge', 'Bleu'] }] },
  });
  const hat = await settled(sellerU.sock, a.data.id);
  ok(hat.variantLabels.fr[0].name === 'Couleur' && hat.variantLabels.fr[0].options.join() === 'Rouge,Bleu', 'labels of the right shape are kept as the seller wrote them', JSON.stringify(hat.variantLabels.fr));
  ok(hat.machineTranslated.every((f) => f !== 'variantLabels.fr'), 'and are not marked machine-made');

  // ---- 5. Categories ----------------------------------------------------------------------------------
  section('Categories keep their products');
  a = await req(admin.sock, 'categories:create', { name: `Gadgets Corner ${tag}`, icon: '🔧' });
  ok(a.ok, 'an admin creates a category with only the English name');
  const gadgets = a.data;
  const catFr = await until(async () => { const c = (await req(guest.sock, 'categories:list')).data.find((x) => x.id === gadgets.id); return c?.nameFr === `[fr] Gadgets Corner ${tag}` ? c : null; });
  ok(!!catFr, 'the French name of the category is filled in (the admin form no longer copies EN into FR)');
  a = await req(admin.sock, 'categories:create', { nameFr: `Outils ${tag}` });
  ok(a.ok && a.data.sourceLang === 'fr', 'a category named only in French has sourceLang fr');
  const outils = a.data;
  ok(!(await req(admin.sock, 'categories:create', { name: '', nameFr: '' })).ok, 'a category needs a name in one language');
  a = await req(sellerU.sock, 'products:create', { name: `Gizmo ${tag}`, price: 9, stock: 2, categoryId: gadgets.id });
  const gizmo = a.data;
  a = await req(admin.sock, 'categories:update', { id: gadgets.id, patch: { name: `Gadgets Corner Renamed ${tag}` } });
  ok(a.ok && a.data.name === `Gadgets Corner Renamed ${tag}`, 'C-I3: an admin renames the category');
  const gz = (await req(guest.sock, 'products:get', { id: gizmo.id })).data;
  ok(gz.category === `Gadgets Corner Renamed ${tag}` && gz.categoryId === gadgets.id, 'the product followed the rename (it points at categoryId)');
  const byId = (await req(guest.sock, 'products:list', { categoryId: gadgets.id })).data;
  ok(byId.length === 1 && byId[0].id === gizmo.id, 'products:list filters by categoryId');
  const byName = (await req(guest.sock, 'products:list', { category: `Gadgets Corner Renamed ${tag}` })).data;
  ok(byName.length === 1, 'and still by the (new) name, for older apps');
  a = await req(admin.sock, 'categories:remove', { id: gadgets.id });
  ok(!a.ok && /1 product uses this category\. Move it? ?|1 product uses this category\. Move them to another category first\./.test(a.error ?? ''), 'C-I2: a category in use cannot be deleted', a.error);
  a = await req(sellerU.sock, 'products:update', { id: gizmo.id, patch: { categoryId: outils.id } });
  ok(a.ok && a.data.categoryId === outils.id, 'the seller moves the product to another category');
  a = await req(admin.sock, 'categories:remove', { id: gadgets.id });
  ok(a.ok, 'now the empty category can be deleted', a.error);
  ok(!(await req(guest.sock, 'categories:list')).data.some((c) => c.id === gadgets.id), 'and is gone from the list');
  ok(!(await req(sellerU.sock, 'categories:remove', { id: outils.id })).ok, 'sellers cannot delete categories');

  // ---- 6. Moderation ----------------------------------------------------------------------------------
  section('Moderation: French edits count, machine writes do not');
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'true' });
  a = await req(sellerU.sock, 'products:create', { name: `Moderated ${tag}`, price: 20, stock: 5, categoryId: electronics.id });
  const mod = a.data;
  ok(mod.status === 'pending', 'with moderation on, a new listing waits');
  await req(admin.sock, 'products:update', { id: mod.id, patch: { status: 'live' } });
  await settled(sellerU.sock, mod.id);
  a = await req(sellerU.sock, 'products:update', { id: mod.id, patch: { nameFr: `Modéré ${tag}` } });
  ok(a.ok && a.data.status === 'pending', 'a French edit by the seller sends a live listing back to moderation', a.data?.status);
  await req(admin.sock, 'products:update', { id: mod.id, patch: { status: 'live' } });
  a = await req(sellerU.sock, 'products:retranslate', { id: mod.id });
  await settled(sellerU.sock, mod.id);
  const afterMachine = (await req(sellerU.sock, 'products:get', { id: mod.id })).data;
  ok(afterMachine.status === 'live', 'a machine translation never sends it back to moderation', afterMachine.status);
  a = await req(sellerU.sock, 'products:update', { id: mod.id, patch: { nameFr: afterMachine.nameFr } });
  ok(a.ok && a.data.status === 'live', 'sending the served French back unchanged is not a change');
  const adminView = (await req(admin.sock, 'products:get', { id: mod.id })).data;
  ok(Array.isArray(adminView.machineTranslated) && adminView.sourceLang === 'en', 'admins see machineTranslated and sourceLang for moderation');
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });

  // ---- 7. Search ---------------------------------------------------------------------------------------
  section('Search reads the French text');
  await sleep(300);
  a = await req(guest.sock, 'products:search', { q: 'Légères' });
  ok(a.ok && a.data.ids.includes(fr1.id), 'the French description is searched (accent-insensitive)', JSON.stringify(a.data));
  a = await req(guest.sock, 'products:search', { q: 'legeres confortables' });
  ok(a.ok && a.data.ids.includes(fr1.id), 'accents fold in the query');

  // ---- 8. Order lines ----------------------------------------------------------------------------------
  section('Order lines carry the other language');
  const prod = (await settled(sellerU.sock, en1.id));
  const wallet = await req(demo.sock, 'wallet:get');
  void wallet;
  const placed = await req(demo.sock, 'orders:create', {
    items: [{ productId: prod.id, qty: 1, variant: 'Colour: Black · Size: XL' }],
    paymentMethod: 'wallet',
    shippingAddress: JSON.stringify({ line1: '12 Ave. du Commerce', city: 'Kinshasa', commune: 'Gombe' }),
  });
  ok(placed.ok, 'the customer orders the product with options', placed.error);
  const line = placed.data?.items?.[0];
  ok(line && line.productName === prod.name && line.productNameFr === prod.nameFr, 'the order line carries productName and productNameFr', JSON.stringify(line));
  ok(line && line.variant === 'Colour: Black · Size: XL' && line.variantFr === '[fr] Colour: [fr] Black · [fr] Size: XL', 'and variant (canonical) with variantFr', JSON.stringify(line && [line.variant, line.variantFr]));
  const mine = (await req(demo.sock, 'orders:list')).data.find((o) => o.id === placed.data.id);
  ok(mine?.items[0].productNameFr === prod.nameFr && mine.items[0].variantFr === line.variantFr, 'orders:list serves the same fields');
  await req(sellerU.sock, 'products:update', { id: en1.id, patch: { nameFr: `Renommé ${tag}` } });
  const frozen = (await req(demo.sock, 'orders:list')).data.find((o) => o.id === placed.data.id);
  ok(frozen.items[0].productNameFr === prod.nameFr, 'a later rename never rewrites the order (snapshot)', frozen.items[0].productNameFr);
  const sellerOrders = (await req(sellerU.sock, 'orders:list')).data.find((o) => o.id === placed.data.id);
  ok(sellerOrders?.items[0].productNameFr === prod.nameFr, "the seller's redacted order view carries it too");
  await toDelivery(admin, rider, placed.data.id); // the warehouse gives the journey to the rider
  const tasks = (await req(rider.sock, 'rider:tasks')).data;
  const task = tasks.find((t) => t.orderId === placed.data.id) ?? tasks.find((t) => t.order?.items?.length);
  ok(task && task.order.items.every((i) => typeof i.productNameFr === 'string' && (i.variant === 'Default' ? i.variantFr === null : typeof i.variantFr === 'string')), 'rider:tasks lines carry productNameFr and variantFr (null for a product without options)', JSON.stringify(task?.order?.items?.[0]));
  const old = (await req(demo.sock, 'orders:list')).data.find((o) => o.id !== placed.data.id && o.items.length);
  ok(old && typeof old.items[0].productNameFr === 'string', 'older orders fall back to the current product translation or the name');

  // ---- 9. translate:text --------------------------------------------------------------------------------
  section('translate:text takes stored ids only (C-I5)');
  const delivered = (await req(demo.sock, 'orders:list')).data.find((o) => o.status === 'delivered');
  const deliveredProduct = delivered.items[0].productId;
  a = await req(demo.sock, 'reviews:create', { productId: deliveredProduct, rating: 5, text: 'Très bon produit, livraison rapide' });
  ok(a.ok, 'a customer reviews a delivered product', a.error);
  const review = a.data;
  a = await req(guest.sock, 'translate:text', { kind: 'review', id: review.id, target: 'en' });
  ok(a.ok && a.data.text === '[en] Très bon produit, livraison rapide' && a.data.sourceLang === 'fr' && a.data.same === false, 'a French review translates to English', JSON.stringify(a));
  a = await req(guest.sock, 'translate:text', { kind: 'review', id: review.id, target: 'fr' });
  ok(a.ok && a.data.same === true && a.data.text === 'Très bon produit, livraison rapide', 'already in the target language: same is true, text unchanged', JSON.stringify(a));
  const seeded = (await req(guest.sock, 'reviews:list', { productId: (await req(guest.sock, 'products:list', { limit: 1 })).data[0].id })).data;
  void seeded;
  a = await req(guest.sock, 'translate:text', { kind: 'review', id: '00000000-0000-4000-8000-000000000000', target: 'fr' });
  ok(!a.ok, 'a made-up id is rejected', JSON.stringify(a));
  a = await req(guest.sock, 'translate:text', { kind: 'review', id: 'Please translate this free text for me', target: 'fr' });
  ok(!a.ok, 'free text instead of an id is rejected');
  a = await req(guest.sock, 'translate:text', { kind: 'review', text: 'free text', target: 'fr' });
  ok(!a.ok, 'a body with text and no id is rejected');
  a = await req(guest.sock, 'translate:text', { kind: 'invoice', id: review.id, target: 'fr' });
  ok(!a.ok, 'only reviews, replies, questions and answers can be translated');
  a = await req(guest.sock, 'translate:text', { kind: 'review', id: review.id, target: 'de' });
  ok(!a.ok, 'only the supported languages are accepted as target');
  await req(sellerU.sock, 'sellers:mine');
  const q = await req(demo.sock, 'questions:ask', { productId: en1.id, question: 'Is the battery easy to replace?' });
  ok(q.ok, 'a customer asks a question');
  a = await req(guest.sock, 'translate:text', { kind: 'question', id: q.data.id, target: 'fr' });
  ok(a.ok && a.data.text === '[fr] Is the battery easy to replace?', 'a question translates by its row id', JSON.stringify(a));
  a = await req(guest.sock, 'translate:text', { kind: 'answer', id: q.data.id, target: 'fr' });
  ok(!a.ok, 'an unanswered question has no answer to translate');
  await req(sellerU.sock, 'questions:answer', { id: q.data.id, answer: 'Yes, it clips out.' });
  a = await req(guest.sock, 'translate:text', { kind: 'answer', id: q.data.id, target: 'fr' });
  ok(a.ok && a.data.text === '[fr] Yes, it clips out.', 'and the answer translates by the same row id', JSON.stringify(a));
  const ownerOfDelivered = await login('seller@somba.app');
  const rep = await req(ownerOfDelivered.sock, 'reviews:reply', { reviewId: review.id, text: 'Thank you for your order' });
  ok(rep.ok, 'the seller replies to the review');
  a = await req(guest.sock, 'translate:text', { kind: 'review_reply', id: review.id, target: 'fr' });
  ok(a.ok && a.data.text === '[fr] Thank you for your order', 'a seller reply translates by the review id', JSON.stringify(a));
  const reviewsOf = (await req(guest.sock, 'reviews:list', { productId: deliveredProduct })).data;
  ok(reviewsOf.some((r) => r.id === review.id), 'reviews:list is unchanged');

  // ---- 10. Admin: status, retry, other texts -------------------------------------------------------------
  section('Admin: translation status, campaigns, flash sales, CMS, broadcasts');
  a = await req(admin.sock, 'translation:status');
  ok(a.ok && a.data.provider === 'fake' && typeof a.data.pending === 'number' && typeof a.data.charsToday === 'number' && a.data.charLimit > 0, 'translation:status reports provider, counts and today\'s characters', JSON.stringify(a));
  ok(!(await req(demo.sock, 'translation:status')).ok && !(await req(sellerU.sock, 'translation:retry', {})).ok, 'customers and sellers cannot read or retry the queue');
  a = await req(admin.sock, 'translation:retry', {});
  ok(a.ok && typeof a.data.queued === 'number', 'translation:retry re-queues failed jobs', JSON.stringify(a));
  a = await req(admin.sock, 'translation:retry', { entityType: 'product', entityId: en1.id });
  ok(a.ok && a.data.queued === 1, 'or one record');

  a = await req(sellerU.sock, 'campaigns:create', { name: `Spring Sale ${tag}`, discount: 15, budgetUsd: 50, startDate: '2026-11-01', endDate: '2026-11-30' });
  ok(a.ok && a.data.nameFr, 'a campaign is created with name and nameFr', JSON.stringify(a));
  const camp = a.data;
  ok(typeof camp.sellerName === 'string' && camp.sellerName.includes('I18n Store'), 'campaign sellerName is joined from the store');
  const campFr = await until(async () => (await req(admin.sock, 'campaigns:list')).data.find((c) => c.id === camp.id && c.nameFr === `[fr] Spring Sale ${tag}`));
  ok(!!campFr, 'the French campaign name appears');
  a = await req(admin.sock, 'flashsales:create', { title: `Flash ${tag}`, titleFr: `Vente éclair ${tag}`, productId: en1.id, flashPrice: 10, discount: 60 });
  ok(a.ok && a.data.titleFr === `Vente éclair ${tag}` && a.data.title === `Flash ${tag}` && a.data.productName && a.data.productNameFr, 'a flash sale serves title, titleFr, productName and productNameFr', JSON.stringify(a));
  const flashList = (await req(guest.sock, 'flashsales:list')).data;
  ok(flashList.some((f) => f.id === a.data.id && f.productNameFr), 'flashsales:list composes the product name');
  await req(admin.sock, 'flashsales:end', { id: a.data.id });
  a = await req(admin.sock, 'cms:upsert', { key: `banner-${tag}`, title: 'Big sale', body: 'Everything must go', type: 'banner' });
  ok(a.ok, 'a CMS block is created');
  const cmsFr = await until(async () => (await req(guest.sock, 'cms:list')).data.find((b) => b.key === `banner-${tag}` && b.titleFr === '[fr] Big sale' && b.bodyFr === '[fr] Everything must go'));
  ok(!!cmsFr, 'cms:list serves titleFr and bodyFr');
  a = await req(admin.sock, 'cms:upsert', { key: `banner-${tag}`, titleFr: 'Grande vente' });
  const cmsAuthor = (await req(guest.sock, 'cms:list')).data.find((b) => b.key === `banner-${tag}`);
  ok(a.ok && cmsAuthor.titleFr === 'Grande vente' && cmsAuthor.title === 'Big sale', 'an admin writes the French by hand');

  const noticeEn = new Promise((res) => { demo.sock.on('notification:new', (n) => { if (n.title === `Weekend Special ${tag}`) res(n); }); setTimeout(() => res(null), 6000); });
  a = await req(admin.sock, 'broadcasts:send', { title: `Weekend Special ${tag}`, body: 'Free delivery this weekend', audience: 'customer' });
  ok(a.ok && a.data.titleFr === `[fr] Weekend Special ${tag}` && a.data.bodyFr === '[fr] Free delivery this weekend', 'a broadcast is translated while it is sent', JSON.stringify(a));
  const gotEn = await noticeEn;
  ok(gotEn && gotEn.titleFr === `[fr] Weekend Special ${tag}` && gotEn.bodyFr === '[fr] Free delivery this weekend', 'customers receive titleFr / bodyFr on the live notice', JSON.stringify(gotEn));
  const list = (await req(demo.sock, 'notifications:list')).data.find((n) => n.title === `Weekend Special ${tag}`);
  ok(list && list.titleFr === `[fr] Weekend Special ${tag}`, 'and in notifications:list');
  const noticeFr = new Promise((res) => { demo.sock.on('notification:new', (n) => { if (n.titleFr === `Grands soldes ${tag}`) res(n); }); setTimeout(() => res(null), 6000); });
  a = await req(admin.sock, 'broadcasts:send', { titleFr: `Grands soldes ${tag}`, bodyFr: 'Livraison gratuite', audience: 'customer' });
  ok(a.ok && a.data.sourceLang === 'fr' && a.data.title === `[en] Grands soldes ${tag}` && a.data.titleFr === `Grands soldes ${tag}`, 'a broadcast written in French gets its English version', JSON.stringify(a));
  const gotFr = await noticeFr;
  ok(gotFr && gotFr.title === `[en] Grands soldes ${tag}` && gotFr.bodyFr === 'Livraison gratuite', 'and the notice carries both', JSON.stringify(gotFr));
  a = await req(admin.sock, 'broadcasts:list');
  ok(a.ok && a.data[0].titleFr, 'broadcasts:list serves titleFr / bodyFr');

  // ---- 11. Store description -----------------------------------------------------------------------------
  section('Store description');
  a = await req(sellerU.sock, 'sellers:update', { description: 'We sell the best gadgets in town.' });
  ok(a.ok && a.data.description === 'We sell the best gadgets in town.' && 'descriptionFr' in a.data && 'productCount' in a.data, 'sellers:update serves description, descriptionFr and productCount');
  const sf = await until(async () => { const s = (await req(guest.sock, 'sellers:storefront', { id: store.id })).data; return s?.seller.descriptionFr === '[fr] We sell the best gadgets in town.' ? s : null; });
  ok(!!sf, 'the storefront shows descriptionFr once translated');
  ok(sf.seller.productCount >= 1 && sf.seller.machineTranslated.includes('descriptionFr'), 'productCount is counted from live listings; machineTranslated lists descriptionFr');
  ok(!('pickupAddress' in sf.seller) && !('userId' in sf.seller), 'the storefront still hides private fields');

  // ---- 12. Gaps found by the bilingual audit ----------------------------------------------------------------
  const NBSP = ' ';
  const PHONE = '+243 81 234 5678';

  section('categories:remove words the refusal for one product and for several');
  a = await req(admin.sock, 'categories:create', { name: `Spare ${tag}`, nameFr: `Pièces ${tag}` });
  ok(a.ok, 'an admin creates a category', JSON.stringify(a));
  const spare = a.data;
  await req(sellerU.sock, 'products:create', { name: `Spare Part A ${tag}`, price: 5, stock: 3, categoryId: spare.id });
  a = await req(admin.sock, 'categories:remove', { id: spare.id });
  ok(!a.ok && a.error === '1 product uses this category. Move it to another category first.', 'one product: "1 product uses this category. Move it to another category first."', a.error);
  await req(sellerU.sock, 'products:create', { name: `Spare Part B ${tag}`, price: 5, stock: 3, categoryId: spare.id });
  a = await req(admin.sock, 'categories:remove', { id: spare.id });
  ok(!a.ok && a.error === '2 products use this category. Move them to another category first.', 'two products: "2 products use this category. Move them to another category first."', a.error);

  section('roles:defs serves a French scope for every role');
  a = await req(guest.sock, 'roles:defs');
  ok(a.ok && a.data.length >= 8 && a.data.every((d) => typeof d.scopeFr === 'string' && d.scopeFr.trim() && d.scopeFr !== d.scope), 'every role definition has scope and scopeFr', JSON.stringify(a.data?.[0]));
  ok(a.data.find((d) => d.key === 'rider')?.scopeFr === 'Livraisons, GPS, gains', 'with proper French ("Livraisons, GPS, gains")');

  section('Analytics lists carry French names');
  const mine12 = (await req(sellerU.sock, 'analytics:seller', { days: 30 })).data;
  const topEarbuds = mine12?.topProducts?.find((t) => t.productId === en1.id);
  ok(mine12?.topProducts?.length >= 1 && mine12.topProducts.every((t) => typeof t.name === 'string' && typeof t.nameFr === 'string' && t.nameFr), 'analytics:seller topProducts[] have name and nameFr', JSON.stringify(mine12?.topProducts));
  const nowEarbuds = (await req(guest.sock, 'products:get', { id: en1.id })).data;
  ok(topEarbuds?.nameFr === `Renommé ${tag}` && topEarbuds.nameFr === nowEarbuds.nameFr && topEarbuds.name === nowEarbuds.name, 'and name / nameFr are the listing\'s current titles in each language', JSON.stringify([topEarbuds, nowEarbuds.name, nowEarbuds.nameFr]));
  const asAdmin12 = (await req(admin.sock, 'analytics:seller', { sellerId: store.id, days: 30 })).data;
  ok(asAdmin12?.topProducts?.find((t) => t.productId === en1.id)?.nameFr === `Renommé ${tag}`, "an admin reading a store's analytics gets nameFr too");
  const seededOwner = (await req(ownerOfDelivered.sock, 'analytics:seller', { days: 90 })).data;
  ok(seededOwner?.topProducts?.every((t) => typeof t.nameFr === 'string' && t.nameFr), "the seeded store's best sellers all have nameFr", JSON.stringify(seededOwner?.topProducts));
  const adm12 = (await req(admin.sock, 'analytics:admin')).data;
  ok(adm12?.gmvByCategory?.length >= 1 && adm12.gmvByCategory.every((g) => typeof g.category === 'string' && typeof g.categoryFr === 'string' && g.categoryFr), 'analytics:admin gmvByCategory[] have category and categoryFr', JSON.stringify(adm12?.gmvByCategory?.[0]));
  ok(adm12.gmvByCategory.find((g) => g.category === 'Electronics')?.categoryFr === 'Électronique', 'with the category\'s French name (Électronique)');

  section('Order lines of a product without options: variantFr is null');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'true' });
  const plain = await settled(sellerU.sock, fr1.id);
  const airtel = await req(demo.sock, 'orders:create', {
    items: [{ productId: plain.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE,
    shippingAddress: JSON.stringify({ line1: '12 Ave. du Commerce', city: 'Kinshasa', commune: 'Gombe' }),
  });
  ok(airtel.ok, 'the customer orders a product that has no options (Airtel Money)', airtel.error);
  const plainLine = airtel.data?.items?.[0];
  ok(plainLine && plainLine.variant === 'Default' && plainLine.variantFr === null, 'the new order serves variant "Default" and variantFr null', JSON.stringify(plainLine));
  const plainListed = (await req(demo.sock, 'orders:list')).data.find((o) => o.id === airtel.data.id)?.items[0];
  ok(plainListed && plainListed.variant === 'Default' && plainListed.variantFr === null && plainListed.productNameFr === plain.nameFr, 'orders:list serves the same (productNameFr still translated)', JSON.stringify(plainListed));
  const withOptions = (await req(demo.sock, 'orders:list')).data.find((o) => o.id === placed.data.id)?.items[0];
  ok(withOptions?.variantFr === '[fr] Colour: [fr] Black · [fr] Size: XL', 'a line with options keeps its French label', JSON.stringify(withOptions));

  section('Notice text: payment method names, French money');
  const approve = await until(async () => (await req(demo.sock, 'notifications:list')).data.find((n) => n.title === 'Approve your payment' && n.body.includes(airtel.data.reference)));
  ok(approve && approve.body === `Approve the Airtel Money request on your phone to confirm ${airtel.data.reference}.`, 'the English notice says "Airtel Money", not the raw id', approve?.body);
  ok(approve && approve.bodyFr === `Validez la demande Airtel Money sur votre téléphone pour confirmer ${airtel.data.reference}.`, 'and the French one matches', approve?.bodyFr);
  a = await req(demo.sock, 'wallet:topup', { amountUsd: 25, method: 'orange_money', phone: PHONE });
  ok(a.ok, 'the customer tops up the wallet by Orange Money', a.error);
  const credited = await until(async () => (await req(demo.sock, 'notifications:list')).data.find((n) => n.title === 'Payment received' && n.body === '$25.00 added to your wallet.' && n.bodyFr));
  ok(credited && credited.bodyFr === `25,00${NBSP}$ ajoutés à votre portefeuille.`, 'French money is "25,00 $" (comma, non-breaking space)', JSON.stringify(credited?.bodyFr));
  const txs = (await req(demo.sock, 'wallet:transactions')).data;
  const topup = txs.find((t) => /^Wallet top-up via Orange Money$/.test(t.description));
  ok(topup && topup.descriptionFr === 'Recharge du portefeuille via Orange Money', 'the wallet line names the method ("Orange Money") in both languages', JSON.stringify(txs.slice(0, 2)));
  const cod = await req(demo.sock, 'orders:create', {
    items: [{ productId: plain.id, qty: 1 }], paymentMethod: 'cod',
    shippingAddress: JSON.stringify({ line1: '12 Ave. du Commerce', city: 'Kinshasa', commune: 'Gombe' }),
  });
  ok(cod.ok, 'the customer places a cash-on-delivery order', cod.error);
  await toDelivery(admin, rider, cod.data.id); // the warehouse gives the pickup, then the delivery, to the rider
  const taskNotes = await until(async () => {
    const all = (await req(rider.sock, 'notifications:list')).data.filter((n) => n.title === 'New task assigned to you' && n.body.startsWith(`${cod.data.reference}:`));
    return all.length >= 2 ? all : null;
  }, 8000);
  ok(taskNotes && taskNotes.some((n) => n.body === `${cod.data.reference}: pickup is now in your tasks.` && n.bodyFr === `${cod.data.reference} : tâche « enlèvement » ajoutée à vos tâches.`) && taskNotes.some((n) => n.bodyFr === `${cod.data.reference} : tâche « livraison » ajoutée à vos tâches.` && n.titleFr === 'Nouvelle tâche qui vous est assignée'), "the rider's task notices come in French (\"tâche « livraison » ajoutée à vos tâches\")", JSON.stringify(taskNotes?.map((n) => n.bodyFr)));
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });

  section('Replacements and exchanges carry French names');
  const seenRep = new Promise((res) => { admin.sock.on('replacement:updated', (r) => { if (r.reason === `Cracked ${tag}`) res(r); }); setTimeout(() => res(null), 6000); });
  a = await req(admin.sock, 'replacements:create', { orderId: placed.data.id, sku: prod.id, productName: prod.name, reason: `Cracked ${tag}`, condition: 'customer_reported' });
  ok(a.ok && a.data.productName === prod.name && a.data.productNameFr === prod.nameFr, 'replacements:create returns productNameFr (the order line snapshot)', JSON.stringify(a));
  const repId = a.data?.id;
  const pushedRep = await seenRep;
  ok(pushedRep && pushedRep.productNameFr === prod.nameFr, 'replacement:updated carries it', JSON.stringify(pushedRep));
  ok(a.data.reason === `Cracked ${tag}` && a.data.condition === 'customer_reported', 'the customer\'s own words (reason, condition) are left alone');
  const repList = (await req(admin.sock, 'replacements:list')).data.find((r) => r.id === repId);
  ok(repList?.productNameFr === prod.nameFr, 'replacements:list carries it');
  const mineReps = (await req(demo.sock, 'replacements:list')).data;
  ok(mineReps.every((r) => 'productNameFr' in r), "and so does the customer's list");
  a = await req(admin.sock, 'replacements:create', { orderId: placed.data.id, sku: 'NO-SUCH-SKU', productName: 'Mystery item' });
  ok(a.ok && a.data.productNameFr === null, 'an item that cannot be matched has productNameFr null', JSON.stringify(a.data));
  a = await req(admin.sock, 'exchanges:create', { orderId: placed.data.id, fromSku: prod.id, fromName: prod.name, toSku: prod.id, toName: `${prod.name} (other size)`, reason: 'Too small' });
  ok(a.ok && a.data.fromNameFr === prod.nameFr && a.data.toNameFr === null, 'exchanges:create returns fromNameFr; toName typed by a person has no toNameFr', JSON.stringify(a));
  const exId = a.data?.id;
  a = await req(admin.sock, 'exchanges:setStatus', { id: exId, status: 'approved' });
  ok(a.ok && a.data.status === 'approved' && a.data.fromNameFr === prod.nameFr, 'a status change returns them too');
  const exList = (await req(admin.sock, 'exchanges:list')).data.find((x) => x.id === exId);
  ok(exList && exList.fromNameFr === prod.nameFr && 'toNameFr' in exList, 'exchanges:list carries fromNameFr and toNameFr', JSON.stringify(exList));

  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `   - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
