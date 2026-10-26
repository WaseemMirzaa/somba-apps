/* Commerce, end to end against a RUNNING dev API seeded with `npm run seed` (port 3023 for the commerce builder):
 *   1 products: gallery, sku (unique per seller), brand, weight, image URL rules
 *   2 bulk import: dry run, per-row report, pending products, translation
 *   3 inventory: delta adjust, movement ledger, low-stock notices, per-option stock, concurrent orders, cart:validate
 *   4 promotions: campaign states and rejection reason, scheduled flip, budget, view/click tracking, flash sales
 *     (live prices, nomination), store coupons at checkout
 *   5 finance: clearance hold, earnings states, statements + CSV, transactions, payout notices, commission invoice
 *     PDF, finance version / changed event
 *   6 seller orders: paging, search, filters, CSV, city, tracking
 *
 *   API_URL=http://localhost:3023 node test/commerce-smoke.cjs
 *
 * Start the API with CAMPAIGN_SWEEP_MS=2000 FLASH_SWEEP_MS=2000 so the schedule sweeps are quick. The smoke toggles
 * commissionPct / productModeration / requireVerifiedForCheckout / minPayoutUsd / payoutClearanceHours and restores
 * them at the end (even when a check throws).
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3023';
const PW = 'Somba@2026';
const NEW_PW = 'Comm-Pass-2026';
const tag = Date.now().toString().slice(-8);

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b) => Math.abs(a - b) < 0.011;
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
// The gateway allows 40 events/second/socket; pace each socket so a fast local DB never trips it.
const nextSlot = new WeakMap();
const req = async (s, ev, b = {}) => {
  const at = Math.max(Date.now(), nextSlot.get(s) ?? 0);
  nextSlot.set(s, at + 30);
  if (at > Date.now()) await sleep(at - Date.now());
  return new Promise((r) => s.emit(ev, b, r));
};
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return track({ token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) });
};
const register = async (label, role = 'customer', locale) => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@comm.test`, password: NEW_PW, name: `${label} user`, role, ...(locale ? { locale } : {}) });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return track({ token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email: `${label}${tag}@comm.test` });
};
/** Every event a client socket receives is kept, so a check can look at what was pushed. */
function track(client) {
  client.events = [];
  client.sock.onAny((ev, payload) => client.events.push({ ev, payload, at: Date.now() }));
  return client;
}
const got = (client, ev, pred = () => true, since = 0) => client.events.find((e) => e.ev === ev && e.at >= since && pred(e.payload));
const waitFor = (client, ev, pred, since, ms = 8000) => until(async () => got(client, ev, pred, since), ms);
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;
const UP = () => `${API}/uploads/${require('crypto').randomUUID()}.png`;

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const saved = (await req(admin.sock, 'settings:get')).data ?? {};
  const setting = (key, value) => req(admin.sock, 'settings:set', { key, value });
  const plansBefore = (await req(admin.sock, 'sellers:plans')).data;
  const restore = async () => {
    if (plansBefore) await setting('sellerPlans', plansBefore).catch(() => undefined);
    for (const k of ['commissionPct', 'productModeration', 'requireVerifiedForCheckout', 'minPayoutUsd', 'payoutClearanceHours']) {
      if (saved[k] !== undefined) await setting(k, String(saved[k])).catch(() => undefined);
    }
  };

  try {
    await setting('productModeration', 'false');
    await setting('requireVerifiedForCheckout', 'false');
    await setting('minPayoutUsd', '1');
    await setting('payoutClearanceHours', '0');
    await setting('commissionPct', '10');

    // ---- actors -----------------------------------------------------------
    const promote = async (label, role) => {
      const u = await register(label);
      await req(admin.sock, 'roles:setRole', { id: u.user.id, role });
      u.sock.close();
      return login(u.email, NEW_PW);
    };
    const ops = await promote('ops', 'admin_operations');
    const marketing = await promote('mkt', 'admin_marketing');
    const makeSeller = async (label, locale) => {
      const u = await register(label, 'seller', locale);
      const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
      await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
      await req(u.sock, 'sellers:update', { pickupAddress: '7 Rue du Marché, Limete' });
      return { ...u, store };
    };
    const shop1 = await makeSeller('cone', 'fr');
    const shop2 = await makeSeller('ctwo');
    const cust = await register('buyer');
    const guest = track({ sock: await connect(null) });
    const categories = (await req(cust.sock, 'categories:list')).data;
    const category = categories[0].name;

    // The Free plan switches off bulk import, store coupons and flash-sale nominations: check the gate, then open the plans.
    section('0. Plan gate (seller platform)');
    let a = await req(shop1.sock, 'products:import', { csv: 'name,price,category\nx,1,x', dryRun: true });
    ok(!a.ok && /does not include bulk import/.test(a.error), 'bulk import needs a plan that includes it', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'coupons:create', { code: `GATE-${tag}`, type: 'percent', value: 5 });
    ok(!a.ok && /does not include seller coupons/.test(a.error), 'store coupons need a plan that includes them', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'flashsales:nominate', { productId: 'x', flashPrice: 1, endsAt: iso(DAY) });
    ok(!a.ok && /does not include flash-sale nominations/.test(a.error), 'flash-sale nominations need a plan that includes them', a.error ?? 'was allowed');
    a = await setting('sellerPlans', [{ id: 'free', name: 'Free', priceUsd: 0, months: 1, features: [] }]);
    ok(a.ok, 'a plan without perks allows everything', a.error ?? '');

    const mk = async (shop, over) => req(shop.sock, 'products:create', { name: `Item ${tag}`, price: 10, category, stock: 20, ...over });
    const order = async (items, promoCode, who = cust) => req(who.sock, 'orders:create', { items, paymentMethod: 'stripe_card', shippingAddress: ADDRESS, ...(promoCode ? { promoCode } : {}) });
    const walk = async (id, statuses = ['processing', 'shipped', 'out_for_delivery', 'delivered']) => { for (const s of statuses) { const r = await req(ops.sock, 'orders:updateStatus', { orderId: id, status: s }); if (!r.ok) return r; } return { ok: true }; };
    const prod = async (id) => (await req(cust.sock, 'products:get', { id })).data;
    const sellerNotes = async (shop) => (await req(shop.sock, 'notifications:list')).data ?? [];

    // =======================================================================
    section('1. Products: gallery, SKU, brand, weight');
    const img1 = UP();
    const img2 = 'https://images.example.com/phone-2.jpg';
    a = await mk(shop1, { name: `Gallery phone ${tag}`, images: [img1, img2], sku: `SKU-${tag}`, brand: 'Somba', weightKg: 0.35 });
    const p1 = a.data;
    ok(a.ok && JSON.stringify(p1.images) === JSON.stringify([img1, img2]) && p1.image === img1, 'a product keeps its gallery, the cover is the first picture', a.error ?? JSON.stringify(p1?.images));
    ok(p1.sku === `SKU-${tag}` && p1.brand === 'Somba' && p1.weightGrams === 350, 'sku, brand and weight (kg -> grams) are stored and served', JSON.stringify([p1.sku, p1.brand, p1.weightGrams]));
    ok(JSON.stringify((await prod(p1.id)).images) === JSON.stringify([img1, img2]), 'shoppers get the gallery too');
    a = await mk(shop1, { name: `Dup sku ${tag}`, sku: `sku-${tag}` });
    ok(!a.ok && /already used by another of your products/.test(a.error), 'a second product of the same seller cannot reuse the SKU (any case)', a.error ?? 'was allowed');
    a = await mk(shop2, { name: `Same sku other seller ${tag}`, sku: `SKU-${tag}` });
    ok(a.ok, 'another seller may use the same SKU', a.error ?? '');
    a = await mk(shop1, { name: `Bad img ${tag}`, images: ['http://insecure.example.com/x.png'] });
    ok(!a.ok && /upload or a secure/.test(a.error), 'an http picture is refused', a.error ?? 'was allowed');
    a = await mk(shop1, { name: `Bad img2 ${tag}`, image: 'javascript:alert(1)' });
    ok(!a.ok, 'javascript: is refused as a cover', a.error ?? 'was allowed');
    a = await mk(shop1, { name: `Many img ${tag}`, images: Array.from({ length: 9 }, (_, i) => `https://images.example.com/${i}.jpg`) });
    ok(!a.ok && /At most 8/.test(a.error), 'more than 8 pictures are refused', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'products:update', { id: p1.id, patch: { image: UP() } });
    ok(a.ok && a.data.images.length === 2 && a.data.images[1] === img2 && a.data.image === a.data.images[0] && a.data.image !== img1, 'changing only the cover keeps the other pictures', a.error ?? JSON.stringify(a.data?.images));
    a = await req(shop1.sock, 'products:update', { id: p1.id, patch: { images: [img2] } });
    ok(a.ok && a.data.image === img2 && a.data.images.length === 1, 'a new gallery replaces the old one', a.error ?? '');
    a = await req(shop2.sock, 'products:update', { id: p1.id, patch: { sku: 'HACK' } });
    ok(!a.ok, "another seller cannot edit the product's SKU", a.error ?? 'was allowed');

    // =======================================================================
    section('2. Bulk import');
    a = await req(shop1.sock, 'products:importTemplate');
    ok(a.ok && /^﻿name,nameFr,description/.test(a.data.csv) && a.data.columns.includes('sku'), 'a CSV template is offered', a.error ?? '');
    const csv = [
      'name,nameFr,description,price,category,stock,sku,brand,weightKg,images,variants',
      `Import tee ${tag},T-shirt import ${tag},Soft,12.50,${category},40,IMP-${tag}-1,Somba,0.2,https://images.example.com/a.jpg|https://images.example.com/b.jpg,Size=S|M;Colour=Black|White`,
      `Import case ${tag},,,6,${category},100,IMP-${tag}-2,,,,`,
      `,,,6,${category},1,IMP-${tag}-3,,,,`,
      `Import bad price ${tag},,,abc,${category},1,IMP-${tag}-4,,,,`,
      `Import bad cat ${tag},,,5,Nowhere-${tag},1,IMP-${tag}-5,,,,`,
      `Import dup sku ${tag},,,5,${category},1,imp-${tag}-1,,,,`,
    ].join('\n');
    a = await req(shop1.sock, 'products:import', { csv, dryRun: true });
    ok(a.ok && a.data.dryRun && a.data.total === 6 && a.data.created === 0 && a.data.failed === 4 && a.data.products.length === 2, 'a dry run reports 2 importable rows and 4 bad ones, creating nothing', a.error ?? JSON.stringify(a.data));
    a = await req(shop1.sock, 'products:import', { csv });
    const imp = a.data;
    ok(a.ok && imp.created === 2 && imp.failed === 4, 'the real import creates the 2 good rows', a.error ?? JSON.stringify(imp));
    const why = Object.fromEntries((imp?.errors ?? []).map((e) => [e.row, e.errors.join(' / ')]));
    ok(/title in English or French/.test(why[4]) && /Price/.test(why[5]) && /category/i.test(why[6]) && /appears twice/.test(why[7]), 'each bad row says why (line numbers count the header as 1)', JSON.stringify(why));
    const imported = (await req(shop1.sock, 'products:list')).data.filter((p) => p.name.startsWith(`Import `) && p.name.includes(tag));
    ok(imported.length === 2 && imported.every((p) => p.status === 'pending'), 'imported products wait for moderation (pending)', JSON.stringify(imported.map((p) => p.status)));
    const tee = imported.find((p) => p.name.includes('tee'));
    ok(tee && tee.sku === `IMP-${tag}-1` && tee.images.length === 2 && tee.weightGrams === 200 && tee.stock === 40 && /Size/.test(tee.variants), 'fields, gallery and options came through', JSON.stringify(tee));
    const caseP = imported.find((p) => p.name.includes('case'));
    const frDone = await until(async () => { const p = (await req(shop1.sock, 'products:get', { id: caseP.id })).data; return p?.nameFr === `[fr] ${caseP.name}` ? p : null; });
    ok(!!frDone, 'the missing French title is filled in by the translation pipeline');
    ok(tee.nameFr === `T-shirt import ${tag}`, 'a French title in the file is kept as written');
    a = await req(shop1.sock, 'products:import', { csv });
    ok(a.ok && a.data.created === 0 && a.data.errors.filter((e) => /already used/.test(e.errors.join())).length >= 2, 'importing the file again is refused row by row (SKUs already used)', a.error ?? JSON.stringify(a.data));
    a = await req(shop1.sock, 'products:import', { csvUrl: 'http://example.com/p.csv' });
    ok(!a.ok, 'a plain-http file link is refused', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'products:import', { csvUrl: 'https://127.0.0.1/p.csv' });
    ok(!a.ok, 'a private address is refused', a.error ?? 'was allowed');
    a = await req(cust.sock, 'products:import', { csv });
    ok(!a.ok, 'a customer cannot import', a.error ?? 'was allowed');
    const adminNote = (await req(admin.sock, 'notifications:list')).data.find((n) => n.title === 'Product awaiting review' && /2 products imported/.test(n.body));
    ok(!!adminNote && adminNote.titleFr === 'Produit en attente de modération', 'admins were told once, in French too', JSON.stringify(adminNote));

    // =======================================================================
    section('3. Inventory');
    a = await req(shop1.sock, 'inventory:settings', {});
    ok(a.ok && a.data.lowStockThreshold === 10, 'the default low-stock line is 10', a.error ?? '');
    a = await req(shop1.sock, 'inventory:settings', { lowStockThreshold: 5 });
    ok(a.ok && a.data.lowStockThreshold === 5, 'the seller sets their own line (5)', a.error ?? '');
    a = await req(shop1.sock, 'inventory:settings', { lowStockThreshold: -1 });
    ok(!a.ok, 'a negative line is refused', a.error ?? '');
    ok((await req(shop1.sock, 'sellers:mine')).data?.lowStockThreshold === 5, 'the store object carries the line');

    a = await mk(shop1, { name: `Stock thing ${tag}`, stock: 10 });
    const st = a.data;
    a = await req(shop1.sock, 'inventory:adjust', { productId: st.id, delta: 4, reason: 'return_restock', note: 'customer return' });
    ok(a.ok && a.data.stock === 14 && a.data.stockAfter === 14, 'adjust by +4 (a delta, not "set to")', a.error ?? JSON.stringify(a.data));
    a = await req(shop1.sock, 'inventory:adjust', { productId: st.id, delta: -2 });
    ok(a.ok && a.data.stock === 12, 'adjust by -2', a.error ?? '');
    a = await req(shop1.sock, 'inventory:adjust', { productId: st.id, delta: -50 });
    ok(!a.ok && /only 12 in stock/.test(a.error), 'removing more than there is is refused', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'inventory:adjust', { productId: st.id, delta: 0 });
    ok(!a.ok, 'a zero delta is refused', a.error ?? '');
    a = await req(shop2.sock, 'inventory:adjust', { productId: st.id, delta: 1 });
    ok(!a.ok, "another seller cannot adjust this seller's stock", a.error ?? 'was allowed');
    a = await req(shop1.sock, 'inventory:movements', { productId: st.id });
    const reasons = (a.data?.items ?? []).map((m) => m.reason);
    ok(a.ok && a.data.total === 3 && reasons.includes('initial') && reasons.includes('return_restock') && reasons.includes('manual_adjust'), 'the ledger lists initial, return_restock and manual_adjust lines', a.error ?? JSON.stringify(reasons));
    ok((a.data?.items ?? []).find((m) => m.reason === 'return_restock')?.note === 'customer return', 'with the note');

    // Low-stock notice: sell down to the line (12 -> 5), once.
    a = await order([{ productId: st.id, qty: 7 }]);
    ok(a.ok, 'an order takes 7 (12 -> 5, the line)', a.error ?? '');
    const lowEvent = await waitFor(shop1, 'stock:low', (p) => p.productId === st.id, 0);
    ok(lowEvent && lowEvent.payload.stock === 5 && lowEvent.payload.threshold === 5 && !lowEvent.payload.outOfStock, 'the seller gets a live stock:low event', JSON.stringify(lowEvent?.payload));
    const notes1 = await until(async () => { const n = (await sellerNotes(shop1)).filter((x) => x.title === 'Low stock'); return n.length ? n : null; });
    ok(notes1 && notes1.length === 1 && /down to 5 \(alert at 5\)/.test(notes1[0].body) && notes1[0].titleFr === 'Stock bas' && /plus que 5 en stock/.test(notes1[0].bodyFr), 'and a saved notice, in French too', JSON.stringify(notes1?.[0]));
    const adminLow = await until(async () => (await req(admin.sock, 'notifications:list')).data.find((n) => n.title === 'Low stock alert' && /down to 5/.test(n.body)));
    ok(!!adminLow, 'operations / admin get a low-stock alert');
    a = await order([{ productId: st.id, qty: 1 }]);
    await sleep(400);
    ok((await sellerNotes(shop1)).filter((x) => x.title === 'Low stock').length === 1, 'no second notice while it stays below the line');
    a = await order([{ productId: st.id, qty: 4 }]);
    const outN = await until(async () => (await sellerNotes(shop1)).find((x) => x.title === 'Out of stock'));
    ok(a.ok && !!outN && outN.titleFr === 'Rupture de stock', 'running out sends "Out of stock"', a.error ?? '');
    a = await order([{ productId: st.id, qty: 1 }]);
    ok(!a.ok && /out of stock/.test(a.error), 'a sold-out product cannot be bought', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'inventory:adjust', { productId: st.id, delta: 20 });
    a = await order([{ productId: st.id, qty: 18 }]); // 20 -> 2: crosses again
    await sleep(500);
    ok((await sellerNotes(shop1)).filter((x) => x.title === 'Low stock').length === 2, 'after a restock above the line, crossing it again notifies again');
    a = await req(shop1.sock, 'inventory:movements', { productId: st.id, limit: 100 });
    const sales = (a.data?.items ?? []).filter((m) => m.reason === 'sale');
    ok(sales.length === 4 && sales.every((m) => m.orderId && m.delta < 0), 'every sale is in the ledger with its order id', JSON.stringify(sales.map((m) => [m.delta, !!m.orderId])));

    // Per-option stock
    a = await mk(shop1, {
      name: `Option tee ${tag}`, stock: undefined, variants: [{ name: 'Size', options: ['S', 'M'] }, { name: 'Colour', options: ['Black'] }],
      variantStock: { 'Size: S · Colour: Black': 3, 'size: m · colour: black': 8 },
    });
    const tshirt = a.data;
    const S_BLACK = 'Size: S · Colour: Black';
    const M_BLACK = 'Size: M · Colour: Black';
    ok(a.ok && tshirt.stock === 11 && tshirt.variantStock?.[S_BLACK] === 3 && tshirt.variantStock?.[M_BLACK] === 8, 'stock set per option; the total follows', a.error ?? JSON.stringify(tshirt));
    a = await order([{ productId: tshirt.id, qty: 4, variant: S_BLACK }]);
    ok(!a.ok && a.error === 'Only 3 of "' + tshirt.name + '" (Size: S · Colour: Black) left in stock.', 'size S sells only its own 3, although the product has 11', a.error ?? 'was allowed');
    a = await order([{ productId: tshirt.id, qty: 2, variant: S_BLACK }]);
    const optOrder = a.data;
    ok(a.ok, 'size S x2 is bought', a.error ?? '');
    let t2 = await prod(tshirt.id);
    ok(t2.variantStock[S_BLACK] === 1 && t2.variantStock[M_BLACK] === 8 && t2.stock === 9, 'only the S count moved (3 -> 1), total 9', JSON.stringify(t2.variantStock));
    a = await req(cust.sock, 'cart:validate', { lines: [{ productId: tshirt.id, variant: S_BLACK, qty: 2 }, { productId: tshirt.id, variant: M_BLACK, qty: 2 }] });
    ok(a.ok && !a.data.ok && a.data.lines[0].available === 1 && !a.data.lines[0].ok && a.data.lines[1].ok, 'cart:validate flags the line that no longer fits, with what is available', a.error ?? JSON.stringify(a.data));
    a = await req(cust.sock, 'orders:cancel', { orderId: optOrder.id });
    ok(a.ok, 'the customer cancels it', a.error ?? '');
    t2 = await prod(tshirt.id);
    ok(t2.variantStock[S_BLACK] === 3 && t2.stock === 11, 'the cancelled units go back to size S', JSON.stringify(t2.variantStock));
    a = await req(shop1.sock, 'inventory:adjust', { productId: tshirt.id, variant: M_BLACK, delta: -3 });
    ok(a.ok && a.data.variantStock[M_BLACK] === 5 && a.data.stock === 8, 'a seller adjusts one option by its label', a.error ?? JSON.stringify(a.data));
    a = await req(shop1.sock, 'inventory:adjust', { productId: tshirt.id, variant: 'Size: XL · Colour: Black', delta: 1 });
    ok(!a.ok, 'an option that does not exist is refused', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'inventory:overview', { q: 'option tee' });
    ok(a.ok && a.data.items.length === 1 && a.data.items[0].variantStock[M_BLACK] === 5 && typeof a.data.summary.units === 'number' && a.data.lowStockThreshold === 5, 'the inventory overview shows per-option stock', a.error ?? JSON.stringify(a.data));

    // Concurrency: three units, eight buyers at once.
    a = await mk(shop1, { name: `Last three ${tag}`, stock: 3 });
    const last3 = a.data;
    const racers = await Promise.all(Array.from({ length: 8 }, () => order([{ productId: last3.id, qty: 1 }])));
    const won = racers.filter((r) => r.ok).length;
    const finalStock = (await prod(last3.id)).stock;
    ok(won === 3 && finalStock === 0, 'eight parallel orders for the last 3 units: exactly 3 succeed, stock ends at 0', `won=${won} stock=${finalStock}`);
    a = await req(shop1.sock, 'inventory:movements', { productId: last3.id, limit: 100 });
    ok(a.data.items.filter((m) => m.reason === 'sale').length === 3, 'and the ledger has exactly 3 sales');
    // Same on an option.
    a = await mk(shop1, { name: `Last two opt ${tag}`, stock: undefined, variants: [{ name: 'Size', options: ['S', 'M'] }], variantStock: { 'Size: S': 2, 'Size: M': 20 } });
    const last2 = a.data;
    const racers2 = await Promise.all(Array.from({ length: 6 }, () => order([{ productId: last2.id, qty: 1, variant: 'Size: S' }])));
    const t3 = await prod(last2.id);
    ok(racers2.filter((r) => r.ok).length === 2 && t3.variantStock['Size: S'] === 0 && t3.variantStock['Size: M'] === 20, 'six parallel orders for the last 2 units of one option: exactly 2 succeed, the other option is untouched', JSON.stringify([racers2.map((r) => r.ok), t3.variantStock]));
    // The admin dashboard alert counts per store line.
    const alerts = (await req(admin.sock, 'analytics:admin')).data?.alerts ?? [];
    ok(alerts.some((x) => x.kind === 'low_stock' || x.kind === 'out_of_stock'), 'the admin dashboard raises stock alerts', JSON.stringify(alerts.map((x) => x.kind)));

    // =======================================================================
    section('4a. Campaigns: states, rejection reason, scheduled flip');
    const camps = (await req(shop1.sock, 'products:list')).data;
    a = await mk(shop1, { name: `Campaign product ${tag}`, price: 100, stock: 100 });
    const cp = a.data;
    a = await req(shop1.sock, 'campaigns:create', { name: `Draft ${tag}`, discount: 10, draft: true });
    const draft = a.data;
    ok(a.ok && draft.status === 'draft', 'a campaign can be saved as a draft', a.error ?? '');
    a = await req(shop1.sock, 'campaigns:submit', { id: draft.id });
    ok(a.ok && a.data.status === 'pending', 'and sent to marketing', a.error ?? '');
    a = await req(shop2.sock, 'campaigns:submit', { id: draft.id });
    ok(!a.ok, 'another seller cannot submit it', a.error ?? 'was allowed');
    a = await req(marketing.sock, 'campaigns:setStatus', { id: draft.id, status: 'rejected' });
    ok(a.ok === false && /reason/.test(a.error), 'rejecting needs a reason', a.error ?? 'was allowed');
    a = await req(marketing.sock, 'campaigns:setStatus', { id: draft.id, status: 'rejected', reason: 'Discount too deep for this category' });
    ok(a.ok && a.data.status === 'rejected' && a.data.rejectReason === 'Discount too deep for this category', 'marketing rejects with a reason', a.error ?? '');
    ok(!!(await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Campaign rejected' && /Discount too deep/.test(n.body)))), 'the seller is told why (notice)');
    a = await req(marketing.sock, 'campaigns:setStatus', { id: draft.id, status: 'active' });
    ok(!a.ok && /cannot become/.test(a.error), 'a rejected campaign cannot be approved without the seller resending it', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'campaigns:submit', { id: draft.id });
    ok(a.ok && a.data.status === 'pending' && a.data.rejectReason === null, 'the seller resends it', a.error ?? '');

    a = await req(shop1.sock, 'campaigns:create', { name: `Scheduled ${tag}`, discount: 25, productIds: [cp.id], startDate: iso(4500), endDate: iso(DAY) });
    const sched = a.data;
    a = await req(marketing.sock, 'campaigns:setStatus', { id: sched.id, status: 'active' });
    ok(a.ok && a.data.status === 'scheduled', 'approving a campaign that starts later makes it scheduled', a.error ?? JSON.stringify(a.data));
    ok((await prod(cp.id)).price === 100, 'its discount is not live yet');
    const t0 = Date.now();
    const flip = await waitFor(cust, 'product:updated', (p) => p.id === cp.id && p.price === 75, t0, 15000);
    ok(!!flip && flip.payload.campaignPct === 25 && flip.payload.priceSource === 'campaign', 'at its start date shoppers receive the new price live (product:updated)', JSON.stringify(flip?.payload && { price: flip.payload.price }));
    ok(!!(await waitFor(guest, 'product:updated', (p) => p.id === cp.id && p.price === 75, t0, 5000)), 'guests too');
    const nowActive = (await req(shop1.sock, 'campaigns:list')).data.find((c) => c.id === sched.id);
    ok(nowActive?.status === 'active', 'the sweep moved it to active', nowActive?.status);
    ok(!!(await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Campaign started'))), 'and told the seller');
    const bigCampaign = null; void bigCampaign; void camps;

    // =======================================================================
    section('4b. Campaign budget and view / click tracking');
    a = await mk(shop1, { name: `Budget product ${tag}`, price: 100, stock: 50 });
    const bp = a.data;
    a = await req(shop1.sock, 'campaigns:create', { name: `Budget ${tag}`, discount: 20, productIds: [bp.id], budgetUsd: 30 });
    const bud = a.data;
    await req(marketing.sock, 'campaigns:setStatus', { id: bud.id, status: 'active' });
    ok((await prod(bp.id)).price === 80, 'the campaign discounts 20% while it has budget');
    a = await order([{ productId: bp.id, qty: 1 }]);
    ok(a.ok && a.data.items[0].priceUsd === 80 && a.data.items[0].campaignId === bud.id, 'order 1 pays the campaign price', a.error ?? '');
    let b1 = await until(async () => { const c = (await req(shop1.sock, 'campaigns:list')).data.find((x) => x.id === bud.id); return c?.orders === 1 ? c : null; });
    ok(b1 && near(b1.spentUsd, 20) && near(b1.budgetRemainingUsd, 10) && b1.status === 'active', 'it has spent 20 of 30 (10 left) and the seller sees it', JSON.stringify(b1 && [b1.spentUsd, b1.budgetRemainingUsd, b1.status]));
    ok(!!got(shop1, 'campaign:updated', (c) => c.id === bud.id && c.orders === 1), 'every sale pushes campaign:updated to the seller');
    a = await order([{ productId: bp.id, qty: 1 }]);
    ok(a.ok && a.data.items[0].priceUsd === 80, 'order 2 still gets the price (the budget is not yet spent when it is placed)', a.error ?? '');
    const ended = await until(async () => { const c = (await req(shop1.sock, 'campaigns:list')).data.find((x) => x.id === bud.id); return c?.status === 'ended' ? c : null; });
    ok(!!ended && ended.endedReason === 'budget' && near(ended.spentUsd, 40), 'once spent, the campaign ends by itself (reason: budget)', JSON.stringify(ended));
    ok((await prod(bp.id)).price === 100, 'the price is back to normal');
    a = await order([{ productId: bp.id, qty: 1 }]);
    ok(a.ok && a.data.items[0].priceUsd === 100, 'order 3 pays full price', a.error ?? '');
    const bn = await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Campaign budget used'));
    ok(!!bn && bn.titleFr === 'Budget de campagne épuisé' && /utilisé tout son budget de 30,00/.test(bn.bodyFr), 'the seller is told (in French too)', JSON.stringify(bn));

    a = await mk(shop1, { name: `Tracked product ${tag}`, price: 40, stock: 50 });
    const tp = a.data;
    a = await req(shop1.sock, 'campaigns:create', { name: `Tracked ${tag}`, discount: 10, productIds: [tp.id] });
    const trk = a.data;
    a = await req(cust.sock, 'campaigns:track', { campaignId: trk.id, kind: 'view' });
    ok(a.ok && a.data.counted === false, 'views of a campaign that is not live are not counted', a.error ?? '');
    await req(marketing.sock, 'campaigns:setStatus', { id: trk.id, status: 'active' });
    a = await req(cust.sock, 'campaigns:track', { campaignId: trk.id, kind: 'view' });
    ok(a.ok && a.data.counted === true, 'a shopper view is counted', a.error ?? '');
    a = await req(cust.sock, 'campaigns:track', { campaignId: trk.id, kind: 'view' });
    ok(a.ok && a.data.counted === false, 'the same view again within a few seconds is not', a.error ?? '');
    a = await req(cust.sock, 'campaigns:track', { campaignId: trk.id, kind: 'click' });
    ok(a.ok && a.data.counted === true, 'a click is counted', a.error ?? '');
    a = await req(guest.sock, 'campaigns:track', { campaignId: trk.id, kind: 'view' });
    ok(a.ok && a.data.counted === true, 'a guest view is counted', a.error ?? '');
    a = await req(shop1.sock, 'campaigns:track', { campaignId: trk.id, kind: 'view' });
    ok(a.ok && a.data.counted === false, 'the seller looking at their own campaign is not', a.error ?? '');
    a = await req(cust.sock, 'campaigns:track', { campaignId: trk.id, kind: 'bogus' });
    ok(!a.ok, 'a bad kind is refused', a.error ?? 'was allowed');
    const tc = (await req(shop1.sock, 'campaigns:list')).data.find((c) => c.id === trk.id);
    ok(tc.views === 2 && tc.clicks === 1, 'the campaign shows 2 views and 1 click', JSON.stringify([tc.views, tc.clicks]));
    const viewPush = await waitFor(shop1, 'campaign:updated', (c) => c.id === trk.id && c.views >= 2 && c.clicks >= 1, 0, 9000);
    ok(!!viewPush, 'views and clicks reach the seller live as campaign:updated (throttled)', JSON.stringify(shop1.events.filter((e) => e.ev === 'campaign:updated' && e.payload.id === trk.id).map((e) => [e.payload.views, e.payload.clicks])));
    ok(shop1.events.filter((e) => e.ev === 'campaign:updated' && e.payload.id === trk.id && e.at > Date.now() - 1000).length <= 1, 'a burst of events makes a single push');
    // Rate limit: one shopper cannot pump the counters.
    const spam = await register('spam');
    const spamCamps = [];
    for (let i = 0; i < 4; i++) {
      const c = (await req(shop1.sock, 'campaigns:create', { name: `Spam ${i} ${tag}`, discount: 5, productIds: [tp.id] })).data;
      await req(marketing.sock, 'campaigns:setStatus', { id: c.id, status: 'active' });
      spamCamps.push(c);
    }
    const results = [];
    for (let i = 0; i < 80; i++) results.push((await req(spam.sock, 'campaigns:track', { campaignId: spamCamps[i % 4].id, kind: i % 8 < 4 ? 'view' : 'click' })).data?.counted);
    const countedN = results.filter(Boolean).length;
    ok(countedN === 8, 'a shopper hammering the endpoint is counted once per campaign and kind (8 of 80)', `counted=${countedN}`);

    // =======================================================================
    section('4c. Flash sales: live prices, schedule, nomination');
    a = await mk(shop1, { name: `Flash product ${tag}`, price: 50, stock: 30 });
    const fp = a.data;
    const f0 = Date.now();
    a = await req(marketing.sock, 'flashsales:create', { productId: fp.id, flashPrice: 30, title: `Flash ${tag}`, startsAt: iso(-60_000), endsAt: iso(DAY) });
    const fs1 = a.data;
    ok(a.ok && fs1.phase === 'running' && fs1.status === 'approved' && fs1.endsInMs > 0 && fs1.productName === fp.name, 'a flash sale is created running, with a countdown', a.error ?? JSON.stringify(fs1));
    const live = await waitFor(cust, 'product:updated', (p) => p.id === fp.id && p.price === 30, f0, 5000);
    ok(!!live && live.payload.priceSource === 'flash', 'shoppers get the flash price live (product:updated)', JSON.stringify(live?.payload?.price));
    ok(!!(await waitFor(cust, 'flashsale:updated', (s) => s.id === fs1.id, f0, 3000)), 'and the sale itself (flashsale:updated)');
    ok((await req(guest.sock, 'flashsales:list')).data.some((s) => s.id === fs1.id), 'guests see it in flashsales:list');
    const sn = await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Flash sale started' && n.body.includes(fp.name)));
    ok(!!sn && sn.titleFr === 'Vente flash démarrée', 'the seller is told their product is on flash sale (French too)', JSON.stringify(sn));
    a = await order([{ productId: fp.id, qty: 1 }]);
    ok(a.ok && a.data.items[0].priceUsd === 30, 'checkout charges the flash price', a.error ?? '');
    const f1 = Date.now();
    a = await req(marketing.sock, 'flashsales:update', { id: fs1.id, patch: { flashPrice: 25 } });
    ok(a.ok && a.data.flashPrice === 25, 'marketing edits the flash price', a.error ?? '');
    ok(!!(await waitFor(cust, 'product:updated', (p) => p.id === fp.id && p.price === 25, f1, 5000)), 'the new price reaches shoppers at once');
    a = await req(marketing.sock, 'flashsales:update', { id: fs1.id, patch: { flashPrice: 60 } });
    ok(!a.ok && /below the normal price/.test(a.error), 'a flash price above the normal price is refused', a.error ?? 'was allowed');
    const f2 = Date.now();
    a = await req(marketing.sock, 'flashsales:end', { id: fs1.id });
    ok(a.ok && a.data.phase === 'ended', 'ending the sale', a.error ?? '');
    ok(!!(await waitFor(cust, 'product:updated', (p) => p.id === fp.id && p.price === 50, f2, 5000)), 'puts the normal price back for shoppers at once');
    ok(!(await req(guest.sock, 'flashsales:list')).data.some((s) => s.id === fs1.id), 'and it leaves the shoppers’ list');
    ok(!!(await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Flash sale ended'))), 'the seller is told it ended');

    // Scheduled: the sweep starts it.
    a = await mk(shop1, { name: `Scheduled flash ${tag}`, price: 80, stock: 30 });
    const sp = a.data;
    const f3 = Date.now();
    a = await req(marketing.sock, 'flashsales:create', { productId: sp.id, flashPrice: 40, title: `Soon ${tag}`, startsAt: iso(4000), endsAt: iso(DAY) });
    const fs2 = a.data;
    ok(a.ok && fs2.phase === 'scheduled' && fs2.startsInMs > 0, 'a scheduled sale is created', a.error ?? '');
    ok((await prod(sp.id)).price === 80, 'no price change before the start');
    ok(!(await req(guest.sock, 'flashsales:list')).data.some((s) => s.id === fs2.id) && (await req(guest.sock, 'flashsales:list', { upcoming: true })).data.some((s) => s.id === fs2.id), 'not in the running list, but in the upcoming list');
    const started = await waitFor(cust, 'product:updated', (p) => p.id === sp.id && p.price === 40, f3, 15000);
    ok(!!started, 'when it starts the sweep flips the price for shoppers');
    ok(!!(await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Flash sale scheduled'))), 'the seller got a "scheduled" notice at creation');
    a = await req(marketing.sock, 'flashsales:delete', { id: fs2.id });
    ok(a.ok, 'marketing deletes the sale', a.error ?? '');
    ok((await prod(sp.id)).price === 80 && !!got(cust, 'flashsale:removed', (p) => p.id === fs2.id), 'the price is back and shoppers are told it is gone');

    // Nomination
    a = await mk(shop1, { name: `Nominated ${tag}`, price: 60, stock: 30 });
    const np = a.data;
    a = await req(shop2.sock, 'flashsales:nominate', { productId: np.id, flashPrice: 30, endsAt: iso(DAY) });
    ok(!a.ok && /own products/.test(a.error), "a seller cannot nominate another seller's product", a.error ?? 'was allowed');
    a = await req(shop1.sock, 'flashsales:nominate', { productId: np.id, flashPrice: 30, endsAt: iso(DAY), startsAt: iso(-1000), title: `Our flash ${tag}` });
    const nom = a.data;
    ok(a.ok && nom.status === 'nominated' && nom.active === false, 'a seller nominates a flash sale', a.error ?? '');
    ok((await prod(np.id)).price === 60, 'it changes no price while waiting');
    ok(!(await req(guest.sock, 'flashsales:list')).data.some((s) => s.id === nom.id), 'shoppers do not see it');
    ok(!!(await until(async () => (await req(marketing.sock, 'notifications:list')).data.find((n) => n.title === 'Flash sale nominated' && n.body.includes(np.name)))), 'marketing is told');
    a = await req(shop1.sock, 'flashsales:nominate', { productId: np.id, flashPrice: 29, endsAt: iso(DAY) });
    ok(!a.ok && /already proposed/.test(a.error), 'only one open nomination per product', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'flashsales:approve', { id: nom.id });
    ok(!a.ok, 'a seller cannot approve their own nomination', a.error ?? 'was allowed');
    a = await req(marketing.sock, 'flashsales:decline', { id: nom.id });
    ok(!a.ok && /reason/.test(a.error), 'declining needs a reason', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'flashsales:mine');
    ok(a.ok && a.data.some((s) => s.id === nom.id && s.status === 'nominated'), 'the seller sees their nomination', a.error ?? '');
    const f4 = Date.now();
    a = await req(marketing.sock, 'flashsales:approve', { id: nom.id });
    ok(a.ok && a.data.status === 'approved' && a.data.phase === 'running', 'marketing approves it', a.error ?? '');
    ok(!!(await waitFor(cust, 'product:updated', (p) => p.id === np.id && p.price === 30, f4, 5000)), 'the price flips for shoppers');
    ok(!!(await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Flash sale approved'))), 'the seller is told it was approved');
    a = await mk(shop1, { name: `Declined ${tag}`, price: 60, stock: 30 });
    if (!a.ok) throw new Error(`could not create a product: ${a.error}`);
    a = await req(shop1.sock, 'flashsales:nominate', { productId: a.data.id, flashPrice: 55, endsAt: iso(DAY) });
    if (!a.ok) throw new Error(`second nomination failed: ${a.error}`);
    const nom2 = a.data;
    a = await req(marketing.sock, 'flashsales:decline', { id: nom2.id, reason: 'Too close to the normal price' });
    ok(a.ok && a.data.status === 'declined' && a.data.rejectReason === 'Too close to the normal price', 'a decline stores the reason', a.error ?? '');
    ok(!!(await until(async () => (await sellerNotes(shop1)).find((n) => n.title === 'Flash sale declined' && /Too close/.test(n.body)))), 'and tells the seller why');

    // =======================================================================
    section('4d. Store coupons at checkout');
    a = await req(shop2.sock, 'coupons:create', { code: `S2-${tag}`, type: 'percent', value: 50 });
    ok(a.ok, 'seller 2 has their own coupon', a.error ?? '');
    a = await req(shop1.sock, 'coupons:create', { code: `KT20-${tag}`, type: 'percent', value: 20, minOrder: 60, description: '20% off the store', isPublic: true });
    const cpn = a.data;
    ok(a.ok && cpn.sellerId === shop1.store.id && cpn.uses === 0, 'a seller issues a coupon for their store', a.error ?? JSON.stringify(cpn));
    a = await req(shop1.sock, 'coupons:create', { code: `kt20-${tag}`, type: 'percent', value: 5 });
    ok(!a.ok && /already exists/.test(a.error), 'codes are unique', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'coupons:create', { code: `BAD-${tag}`, type: 'percent', value: 95 });
    ok(!a.ok, 'a 95% coupon is refused', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'coupons:list');
    ok(a.ok && a.data.length === 1 && a.data[0].code === cpn.code, 'the seller lists only their own coupons', a.error ?? JSON.stringify(a.data?.map((c) => c.code)));
    a = await req(marketing.sock, 'coupons:list');
    ok(a.ok && a.data.length >= 2, 'marketing lists every store’s coupons', a.error ?? '');
    a = await req(guest.sock, 'coupons:store', { sellerId: shop1.store.id });
    ok(a.ok && a.data.length === 1 && a.data[0].code === cpn.code && a.data[0].uses === undefined && a.data[0].maxUses === undefined, 'shoppers see the store’s public coupons without internals', a.error ?? JSON.stringify(a.data));
    const promoList = (await req(cust.sock, 'promos:list')).data ?? [];
    ok(!promoList.some((p) => p.code === cpn.code), "store coupons are not in the platform's promo list");
    a = await mk(shop1, { name: `Coupon mine ${tag}`, price: 50, stock: 30 });
    const cm = a.data;
    a = await mk(shop2, { name: `Coupon theirs ${tag}`, price: 100, stock: 30 });
    const ct = a.data;
    a = await req(cust.sock, 'promos:validate', { code: cpn.code, subtotalUsd: 200 });
    ok(a.ok && !a.data.ok && /one store/.test(a.data.reason), 'validating a store coupon without the cart explains it needs the items', a.error ?? JSON.stringify(a.data));
    a = await req(cust.sock, 'promos:validate', { code: cpn.code, subtotalUsd: 250, items: [{ productId: cm.id, qty: 2 }, { productId: ct.id, qty: 1 }] });
    ok(a.ok && a.data.ok && near(a.data.discount, 20), 'with the cart: 20% of the store’s lines only (100) = 20', a.error ?? JSON.stringify(a.data));
    a = await req(cust.sock, 'promos:validate', { code: cpn.code, subtotalUsd: 100, items: [{ productId: ct.id, qty: 1 }] });
    ok(a.ok && !a.data.ok && /only applies to products from/.test(a.data.reason), 'a cart without the store’s products is refused', a.error ?? JSON.stringify(a.data));
    a = await req(cust.sock, 'promos:validate', { code: cpn.code, subtotalUsd: 20, items: [{ productId: cm.id, qty: 1 }] });
    ok(a.ok && !a.data.ok && /Minimum order \$60/.test(a.data.reason), 'its minimum order is measured on the store’s lines', a.error ?? JSON.stringify(a.data));
    a = await order([{ productId: cm.id, qty: 2 }, { productId: ct.id, qty: 1 }], cpn.code);
    const cOrder = a.data;
    ok(a.ok && near(cOrder.discountUsd, 20) && near(cOrder.totalUsd, cOrder.subtotalUsd - 20 + cOrder.deliveryFeeUsd) && cOrder.promoCode === cpn.code, 'checkout applies the coupon', a.error ?? JSON.stringify(cOrder));
    const mineLine = cOrder?.items?.find((i) => i.productId === cm.id);
    const theirLine = cOrder?.items?.find((i) => i.productId === ct.id);
    ok(mineLine && near(mineLine.couponDiscountUsd, 20) && near(mineLine.commissionUsd, 8) && theirLine && near(theirLine.couponDiscountUsd, 0) && near(theirLine.commissionUsd, 10), 'the store pays: its line carries 20 off and 10% commission on 80; the other store’s line is untouched', JSON.stringify([mineLine?.couponDiscountUsd, mineLine?.commissionUsd, theirLine?.couponDiscountUsd]));
    const usePush = await waitFor(shop1, 'coupon:updated', (c) => c.code === cpn.code && c.uses >= 1, 0, 8000);
    ok(!!usePush, 'the first use of the coupon reaches the seller live (coupon:updated with the new count)', JSON.stringify(shop1.events.filter((e) => e.ev === 'coupon:updated').map((e) => [e.payload.code, e.payload.uses])));
    a = await req(cust.sock, 'promos:validate', { code: cpn.code, subtotalUsd: 250, items: [{ productId: cm.id, qty: 2 }, { productId: ct.id, qty: 1 }] });
    ok(a.ok && a.data.sellerName === shop1.store.name, 'promos:validate names the store behind a store coupon', a.error ?? JSON.stringify(a.data));
    a = await req(guest.sock, 'coupons:store', { sellerId: shop1.user.id });
    ok(a.ok && a.data.length === 1 && a.data[0].sellerId === shop1.store.id, 'coupons:store takes the owner\'s user id as well as the store id', a.error ?? JSON.stringify(a.data));
    const myView = (await req(shop1.sock, 'orders:list')).data.find((o) => o.id === cOrder.id);
    ok(myView && near(myView.items[0].couponDiscountUsd, 20), "the seller's own order view shows the coupon share", JSON.stringify(myView?.items?.[0]?.couponDiscountUsd));
    a = await walk(cOrder.id);
    ok(a.ok, 'the order is delivered', a.error ?? '');
    const cOrders = await req(shop1.sock, 'finance:earnings', { q: cOrder.reference });
    const eLine = cOrders.data?.items?.[0];
    ok(cOrders.ok && eLine && near(eLine.grossUsd, 80) && near(eLine.couponUsd, 20) && near(eLine.commissionUsd, 8) && near(eLine.netUsd, 72), 'the seller’s earning is 100 - 20 coupon - 8 commission = 72', cOrders.error ?? JSON.stringify(eLine));
    a = await req(shop1.sock, 'coupons:list');
    ok(a.data[0].uses === 1, 'the coupon shows 1 use');
    a = await req(shop1.sock, 'coupons:delete', { id: cpn.id });
    ok(a.ok && a.data.deleted === false && a.data.coupon.active === false, 'a used coupon is switched off, not deleted', a.error ?? JSON.stringify(a.data));
    a = await order([{ productId: cm.id, qty: 2 }], cpn.code);
    ok(!a.ok && /Invalid code/.test(a.error), 'a switched-off coupon no longer works', a.error ?? 'was allowed');
    a = await req(shop2.sock, 'coupons:update', { id: cpn.id, patch: { value: 99 } });
    ok(!a.ok, "another seller cannot change this seller's coupon", a.error ?? 'was allowed');
    a = await req(cust.sock, 'coupons:create', { code: `CUST-${tag}`, type: 'percent', value: 5 });
    ok(!a.ok, 'a customer cannot issue coupons', a.error ?? 'was allowed');

    // =======================================================================
    section('5a. Finance: the clearance hold and earnings states');
    a = await req(cust.sock, 'finance:earnings');
    ok(!a.ok, 'a customer cannot read finance', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'finance:settings');
    ok(a.ok && a.data.commissionPct === 10 && a.data.minPayoutUsd === 1 && a.data.payoutClearanceHours === 0 && a.data.currency === 'USD', 'the seller can read commission %, minimum payout and hold hours', a.error ?? JSON.stringify(a.data));
    await setting('payoutClearanceHours', '48');
    a = await req(shop1.sock, 'finance:settings');
    ok(a.data.payoutClearanceHours === 48, 'a changed hold is what the seller sees');
    a = await mk(shop1, { name: `Finance product ${tag}`, price: 100, stock: 30 });
    const fin = a.data;
    a = await order([{ productId: fin.id, qty: 2 }]); // 200, commission 20 -> net 180
    const fo = a.data;
    let e = (await req(shop1.sock, 'finance:earnings', { q: fo.reference })).data;
    ok(e.items[0].state === 'in_progress' && e.items[0].clearanceEndsAt === null, 'before delivery the sale is in progress', JSON.stringify(e.items[0]));
    await walk(fo.id);
    e = (await req(shop1.sock, 'finance:earnings', { q: fo.reference })).data;
    const eLine2 = e.items[0];
    ok(eLine2.state === 'clearing' && near(eLine2.netUsd, 180), 'delivered: the money is "clearing" under a 48 h hold', JSON.stringify(eLine2));
    const clearsIn = new Date(eLine2.clearanceEndsAt).getTime() - Date.now();
    ok(clearsIn > 47.9 * 3_600_000 && clearsIn < 48.1 * 3_600_000, 'it clears 48 hours after delivery (clearanceEndsAt)', String(clearsIn / 3_600_000));
    let bal = (await req(shop1.sock, 'payouts:available')).data;
    // 180 from this order + 72 from the coupon order delivered a moment ago, both inside the hold.
    ok(bal.holdHours === 48 && near(bal.clearingUsd, 252) && bal.nextClearanceAt && bal.minPayoutUsd === 1, 'payouts:available shows the clearing money, hold hours, minimum and next clearance', JSON.stringify(bal));
    const availBefore = bal.available;
    const clearingBefore = bal.clearingUsd;
    a = await req(shop1.sock, 'payouts:request', { amountUsd: availBefore + 50, method: 'wallet' });
    ok(!a.ok, 'money still on hold cannot be withdrawn', a.error ?? 'was allowed');
    ok(near(e.totals.clearingUsd, 180), 'the totals (for this search) count it as clearing', JSON.stringify(e.totals));
    await setting('payoutClearanceHours', '0');
    e = (await req(shop1.sock, 'finance:earnings', { q: fo.reference })).data;
    ok(e.items[0].state === 'available', 'with no hold the same line is available', e.items[0].state);
    bal = (await req(shop1.sock, 'payouts:available')).data;
    ok(near(bal.available, availBefore + clearingBefore) && near(bal.clearingUsd, 0), 'and withdrawable (together with the other delivered orders)', JSON.stringify(bal));

    section('5b. Finance: payouts, notices, paid_out, version');
    const since = Date.now();
    a = await req(shop1.sock, 'payouts:request', { amountUsd: 50, method: 'wallet' });
    const po = a.data;
    ok(a.ok, 'the seller requests 50', a.error ?? '');
    const adminReq = await until(async () => (await req(admin.sock, 'notifications:list')).data.find((n) => n.title === 'Payout requested' && n.body.includes(po.reference)));
    ok(!!adminReq && adminReq.role === 'admin', 'the super admin gets a "Payout requested" notice', JSON.stringify(adminReq));
    const fchanged = await waitFor(admin, 'finance:changed', () => true, since, 5000);
    ok(!!fchanged && /^[0-9a-f]{12}$/.test(fchanged.payload.version) && !!fchanged.payload.updatedAt, 'admins receive finance:changed with a version', JSON.stringify(fchanged?.payload));
    e = (await req(shop1.sock, 'finance:earnings', { q: fo.reference })).data;
    ok(e.items[0].state === 'in_payout' && e.items[0].payout?.reference === po.reference && e.items[0].paidOutAt === null, 'the line is now on a payout', JSON.stringify(e.items[0]));
    const v1 = (await req(admin.sock, 'analytics:finance')).data;
    ok(/^[0-9a-f]{12}$/.test(v1.version) && v1.updatedAt, 'analytics:finance carries version and updatedAt', JSON.stringify([v1.version, v1.updatedAt]));
    ok((await req(admin.sock, 'finance:version')).data.version === v1.version, 'finance:version answers the same fingerprint');
    a = await req(shop1.sock, 'finance:version');
    ok(!a.ok, 'a seller cannot read the admin finance version', a.error ?? 'was allowed');
    a = await req(admin.sock, 'payouts:approve', { payoutId: po.id });
    ok(a.ok && a.data.status === 'paid', 'finance pays it', a.error ?? '');
    e = (await req(shop1.sock, 'finance:earnings', { q: fo.reference })).data;
    ok(e.items[0].state === 'paid_out' && !!e.items[0].paidOutAt, 'the line is paid_out with its date', JSON.stringify(e.items[0]));
    const settled = await until(async () => (await req(admin.sock, 'notifications:list')).data.find((n) => n.title === 'Payout settled' && n.body.includes(po.reference)));
    ok(!!settled && settled.titleFr === 'Versement réglé' && /réglé\.$/.test(settled.bodyFr), 'the super admin is told it was paid (French too)', JSON.stringify(settled));
    const v2 = (await req(admin.sock, 'analytics:finance')).data;
    ok(v2.version !== v1.version, 'the finance version changed with the payout', `${v1.version} -> ${v2.version}`);
    a = await req(shop1.sock, 'payouts:request', { amountUsd: 20, method: 'wallet' });
    const po2 = a.data;
    a = await req(admin.sock, 'payouts:reject', { payoutId: po2.id, note: 'Check account' });
    ok(a.ok, 'a second payout is rejected', a.error ?? '');
    ok(!!(await until(async () => (await req(admin.sock, 'notifications:list')).data.find((n) => n.title === 'Payout declined' && n.body.includes(po2.reference)))), 'the super admin hears about the rejection too');

    section('5c. Finance: earnings paging, statements, transactions, invoice');
    a = await mk(shop1, { name: `Finance product 2 ${tag}`, price: 30, stock: 30 });
    for (let i = 0; i < 2; i++) { const o = (await order([{ productId: a.data.id, qty: 1 }])).data; await walk(o.id); }
    e = (await req(shop1.sock, 'finance:earnings', { limit: 2, offset: 0 })).data;
    const total = e.total;
    const e2 = (await req(shop1.sock, 'finance:earnings', { limit: 2, offset: 2 })).data;
    ok(total >= 5 && e.items.length === 2 && e2.items.length >= 1 && e.items[0].itemId !== e2.items[0].itemId, 'earnings are paged by the server (total, limit, offset)', JSON.stringify([total, e.items.length, e2.items.length]));
    e = (await req(shop1.sock, 'finance:earnings', { state: 'paid_out' })).data;
    ok(e.items.length >= 1 && e.items.every((i) => i.state === 'paid_out'), 'filter by state');
    e = (await req(shop1.sock, 'finance:earnings', { from: iso(-DAY), to: iso(DAY) })).data;
    ok(e.total >= 5, 'filter by date range');
    e = (await req(shop1.sock, 'finance:earnings', { from: iso(-10 * DAY), to: iso(-5 * DAY) })).data;
    ok(e.total === 0, 'an old range is empty');
    a = await req(shop1.sock, 'finance:earnings', { state: 'nonsense' });
    ok(!a.ok && /State must be one of/.test(a.error), 'a bad state is refused', a.error ?? 'was allowed');

    const month = new Date().toISOString().slice(0, 7);
    a = await req(shop1.sock, 'finance:statements', { month });
    const stm = a.data;
    const sumNet = stm?.lines?.reduce((t, l) => t + l.netUsd, 0) ?? 0;
    ok(a.ok && stm.lines.length >= 4 && stm.totals.orders >= 4 && near(sumNet, stm.totals.netUsd) && stm.payouts.some((p) => p.reference === po.reference), 'the monthly statement lists the month’s sales, totals add up, payouts of the month included', a.error ?? JSON.stringify(stm?.totals));
    a = await req(shop1.sock, 'finance:statements', { month, format: 'csv' });
    ok(a.ok && a.data.filename === `statement-${month}.csv` && /^﻿(Statement|Relevé),/.test(a.data.csv) && a.data.csv.includes('Net USD'), 'the statement as CSV', a.error ?? '');
    a = await req(shop1.sock, 'finance:statements', {});
    ok(a.ok && a.data.months.length === 12 && a.data.months[0].month === month && a.data.months[0].orders >= 4, 'the last 12 months with totals', a.error ?? '');
    a = await req(shop1.sock, 'finance:statements', { month: '2026-13' });
    ok(!a.ok, 'a bad month is refused', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'finance:transactions', { limit: 3 });
    ok(a.ok && a.data.items.length === 3 && a.data.total >= 5 && a.data.items.every((t, i, arr) => i === 0 || new Date(arr[i - 1].at) >= new Date(t.at)), 'transactions: newest first and paged', a.error ?? '');
    const allTx = (await req(shop1.sock, 'finance:transactions', { limit: 200 })).data;
    ok(allTx.items.some((t) => t.kind === 'sale') && allTx.items.some((t) => t.kind === 'payout' && t.status === 'paid' && t.amountUsd === -50) && allTx.items.some((t) => t.kind === 'payout' && t.status === 'rejected' && t.counts === false), 'sales and payouts (a rejected one counts for nothing)');
    a = await req(shop1.sock, 'finance:transactions', { format: 'csv' });
    ok(a.ok && /Kind|Type/.test(a.data.csv.split('\r\n')[0]) && a.data.csv.split('\r\n').filter(Boolean).length === allTx.total + 1, 'transactions as CSV', a.error ?? '');
    a = await req(shop2.sock, 'finance:transactions', { limit: 200 });
    ok(a.ok && !a.data.items.some((t) => t.reference === po.reference), 'another seller does not see these payouts');

    a = await req(shop1.sock, 'finance:taxDocument', { period: month });
    const doc = a.data;
    ok(a.ok && /^CI-\d{6}-[0-9A-F]{8}$/.test(doc.number) && doc.locale === 'fr' && doc.orders >= 4 && doc.commissionUsd > 0, 'a commission invoice is issued in the seller’s language (shop 1 is French)', a.error ?? JSON.stringify(doc));
    const pdf = await fetch(doc.url);
    const buf = Buffer.from(await pdf.arrayBuffer());
    ok(pdf.status === 200 && buf.subarray(0, 8).toString() === '%PDF-1.4' && /pdf/.test(pdf.headers.get('content-type') ?? ''), 'the PDF downloads', `${pdf.status} ${pdf.headers.get('content-type')}`);
    const pdfStrings = [...buf.toString('latin1').matchAll(/<([0-9a-f]*)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join(' | ');
    ok(pdfStrings.includes('FACTURE DE COMMISSION') && pdfStrings.includes(doc.number), 'and is in French with its number', pdfStrings.slice(0, 120));
    a = await req(shop1.sock, 'finance:taxDocument', { period: month });
    ok(a.ok && a.data.number === doc.number, 'asking again keeps the same invoice number', a.error ?? '');
    a = await req(shop1.sock, 'finance:taxDocument', { period: month, locale: 'en' });
    ok(a.ok && a.data.locale === 'en', 'a language can be chosen', a.error ?? '');
    a = await req(shop1.sock, 'finance:taxDocuments', {});
    ok(a.ok && a.data.items.length === 1 && a.data.months[0].documentId === doc.id, 'the invoices are listed', a.error ?? '');
    a = await req(shop2.sock, 'finance:taxDocument', { period: '2025-01' });
    ok(a.ok === false && /nothing to invoice/.test(a.error), 'a month with no sales is told there is nothing to invoice', a.error ?? 'was allowed');
    a = await req(admin.sock, 'finance:taxDocuments', { sellerId: shop1.store.id });
    ok(a.ok && a.data.items.length === 1, 'finance staff can read a store’s invoices (sellerId)', a.error ?? '');

    // =======================================================================
    section('6. Seller order list: paging, search, filters, CSV, city, tracking');
    a = await req(shop1.sock, 'orders:sellerList', { limit: 3 });
    ok(a.ok && a.data.items.length === 3 && a.data.total >= 8 && a.data.limit === 3, 'a server page with the total', a.error ?? JSON.stringify([a.data?.items?.length, a.data?.total]));
    const first = a.data.items[0];
    ok(first.city === 'Kinshasa' && first.customerName === 'buyer' && !('shippingAddress' in first) && !JSON.stringify(first).includes('1 Test'), 'each order shows the city and the customer’s first name, never the address', JSON.stringify({ c: first.city, n: first.customerName }));
    const p2s = (await req(shop1.sock, 'orders:sellerList', { limit: 3, offset: 3 })).data;
    ok(p2s.items.length > 0 && !p2s.items.some((o) => a.data.items.some((x) => x.id === o.id)), 'the next page has other orders');
    a = await req(shop1.sock, 'orders:sellerList', { q: fo.reference.toLowerCase() });
    ok(a.ok && a.data.total === 1 && a.data.items[0].id === fo.id, 'search by order reference', a.error ?? '');
    a = await req(shop1.sock, 'orders:sellerList', { q: `finance product 2 ${tag}` });
    ok(a.ok && a.data.total === 2, 'search by product name', a.error ?? JSON.stringify(a.data?.total));
    a = await req(shop1.sock, 'orders:sellerList', { q: 'buyer' });
    ok(a.ok && a.data.total >= 8, 'search by the customer’s first name', a.error ?? '');
    a = await req(shop1.sock, 'orders:sellerList', { q: 'user' });
    ok(a.ok && a.data.total === 0, 'but not by the surname', a.error ?? JSON.stringify(a.data?.total));
    a = await req(shop1.sock, 'orders:sellerList', { status: 'delivered' });
    ok(a.ok && a.data.total >= 4 && a.data.items.every((o) => o.status === 'delivered'), 'filter by status', a.error ?? JSON.stringify(a.data?.total));
    a = await req(shop1.sock, 'orders:sellerList', { status: 'cancelled' });
    ok(a.ok && a.data.items.every((o) => o.status === 'cancelled') && a.data.total >= 1, 'filter by cancelled', a.error ?? '');
    a = await req(shop1.sock, 'orders:sellerList', { from: iso(-DAY), to: iso(DAY) });
    ok(a.ok && a.data.total >= 8, 'filter by date', a.error ?? '');
    a = await req(shop1.sock, 'orders:sellerList', { from: iso(-10 * DAY), to: iso(-5 * DAY) });
    ok(a.ok && a.data.total === 0, 'an old range is empty');
    a = await req(shop1.sock, 'orders:sellerList', { format: 'csv', status: 'delivered' });
    ok(a.ok && a.data.filename === 'orders.csv' && a.data.csv.split('\r\n')[0].includes('Commission USD') && a.data.csv.includes(fo.reference), 'CSV export of the filtered orders', a.error ?? '');
    ok(!a.data.csv.includes(' user') && !a.data.csv.includes('1 Test'), 'the CSV has no surname or address');
    ok(a.data.csv.split('\r\n')[0].includes('Commande,Date,Statut,Colis') && a.data.csv.includes(',livrée,'), 'a French-speaking seller gets the orders CSV in French (headings and status words)', a.data.csv.split('\r\n').slice(0, 2).join(' | '));
    a = await req(shop1.sock, 'orders:sellerList', { format: 'csv', status: 'delivered', locale: 'en' });
    ok(a.ok && a.data.csv.split('\r\n')[0].includes('Order,Date,Status,Package'), 'and can ask for English', a.error ?? '');
    a = await req(shop2.sock, 'orders:list', { format: 'csv' });
    ok(a.ok && a.data.csv.split('\r\n')[0].startsWith('\uFEFFOrder,Date'), 'an English-speaking seller gets English (the plain orders:list takes the same switch)', a.error ?? '');
    a = await req(shop1.sock, 'finance:statements', { month: new Date().toISOString().slice(0, 7), format: 'csv' });
    ok(a.ok && a.data.csv.startsWith('\uFEFFRelevé,') && a.data.csv.includes('Ventes USD'), 'the statement CSV is French for a French caller', a.error ?? '');
    a = await req(shop1.sock, 'finance:transactions', { format: 'csv' });
    ok(a.ok && a.data.csv.split('\r\n')[0].includes('Type,Référence'), 'and so is the transactions CSV', a.error ?? '');
    a = await req(shop2.sock, 'finance:transactions', { format: 'csv' });
    ok(a.ok && a.data.csv.split('\r\n')[0].includes('Kind,Reference'), 'while an English seller keeps English', a.error ?? '');
    a = await req(shop1.sock, 'orders:list', { limit: 2, q: fo.reference });
    ok(a.ok && Array.isArray(a.data) && a.data.length === 1, 'the old orders:list (plain array) takes the same filters', a.error ?? '');
    a = await req(shop1.sock, 'orders:list');
    ok(a.ok && Array.isArray(a.data) && a.data.length >= 8, 'and still returns everything by default');
    a = await req(shop2.sock, 'orders:sellerList', { q: fo.reference });
    ok(a.ok && a.data.total === 0, 'another seller does not see this order');
    a = await req(cust.sock, 'orders:sellerList');
    ok(!a.ok, 'a customer cannot use the seller list', a.error ?? 'was allowed');
    const view = (await req(shop1.sock, 'orders:sellerList', { q: fo.reference })).data.items[0];
    ok(view.tracking && view.tracking.carrier === 'Somba&Teka' && Array.isArray(view.tracking.legs) && view.tracking.legs.length >= 1, 'a delivered order carries its tracking (legs from the delivery tasks)', JSON.stringify(view.tracking));
    ok(view.tracking.legs.every((l) => 'kind' in l && 'status' in l && !('address' in l) && !('proofCode' in l)), 'with no address or code in it');
    const live2 = (await order([{ productId: fin.id, qty: 1 }])).data;
    const fresh = await waitFor(shop1, 'order:created', (o) => o.id === live2.id, 0, 4000);
    ok(!!fresh && fresh.payload.city === 'Kinshasa' && 'tracking' in fresh.payload, 'a new order pushed to the seller carries city and tracking too', JSON.stringify(fresh?.payload && { c: fresh.payload.city }));

    // =======================================================================
    section('7. Team members work through the same events (seller context)');
    const member = async (label, role) => {
      const email = `${label}${tag}@comm.test`;
      const inv = await req(shop1.sock, 'team:invite', { email, role, name: `${label} member` });
      if (!inv.ok) throw new Error(`team:invite ${role}: ${inv.error}`);
      const u = await register(label, 'seller');
      const acc = await req(u.sock, 'team:accept', { token: inv.data.devToken });
      if (!acc.ok) throw new Error(`team:accept ${role}: ${acc.error}`);
      return u;
    };
    const catalogStaff = await member('tcat', 'catalog');
    const financeStaff = await member('tfin', 'finance');
    const ordersStaff = await member('tord', 'orders');
    a = await mk(shop1, { name: `Team product ${tag}`, price: 20, stock: 10 });
    const teamP = a.data;
    a = await req(catalogStaff.sock, 'inventory:adjust', { productId: teamP.id, delta: 5 });
    ok(a.ok && a.data.stock === 15, 'a catalog team member adjusts the store’s stock', a.error ?? '');
    a = await req(catalogStaff.sock, 'inventory:movements', { productId: teamP.id });
    ok(a.ok && a.data.items.some((m) => m.reason === 'manual_adjust' && m.actorId === catalogStaff.user.id), 'the ledger names the member who acted', a.error ?? JSON.stringify(a.data?.items?.[0]));
    a = await req(catalogStaff.sock, 'inventory:settings', { lowStockThreshold: 6 });
    ok(a.ok && a.data.lowStockThreshold === 6, 'and sets the low-stock line', a.error ?? '');
    a = await req(catalogStaff.sock, 'products:import', { rows: [{ name: `Team import ${tag}`, price: 3, category, sku: `TEAM-${tag}` }] });
    ok(a.ok && a.data.created === 1, 'and imports products into the store', a.error ?? JSON.stringify(a.data));
    a = await req(catalogStaff.sock, 'coupons:create', { code: `TEAM-${tag}`, type: 'percent', value: 5 });
    ok(a.ok && a.data.sellerId === shop1.store.id, 'and issues a store coupon', a.error ?? '');
    a = await req(catalogStaff.sock, 'finance:earnings');
    ok(!a.ok && /team role \(catalog\)/.test(a.error), 'but cannot read finance', a.error ?? 'was allowed');
    a = await req(financeStaff.sock, 'finance:earnings', { limit: 2 });
    ok(a.ok && a.data.total >= 1, 'a finance team member reads the earnings', a.error ?? '');
    a = await req(financeStaff.sock, 'finance:statements', { month: new Date().toISOString().slice(0, 7) });
    ok(a.ok && a.data.store === shop1.store.name, 'and the monthly statement of the store', a.error ?? '');
    a = await req(financeStaff.sock, 'inventory:adjust', { productId: teamP.id, delta: 1 });
    ok(!a.ok && /team role \(finance\)/.test(a.error), 'but cannot touch stock', a.error ?? 'was allowed');
    a = await req(financeStaff.sock, 'coupons:create', { code: `NOPE-${tag}`, type: 'percent', value: 5 });
    ok(!a.ok, 'or coupons', a.error ?? 'was allowed');
    a = await req(ordersStaff.sock, 'orders:sellerList', { limit: 2 });
    ok(a.ok && a.data.total >= 8, 'an orders team member reads the store’s orders', a.error ?? '');
    a = await req(ordersStaff.sock, 'finance:earnings');
    ok(!a.ok, 'but not its earnings', a.error ?? 'was allowed');
    a = await req(catalogStaff.sock, 'orders:sellerList');
    ok(!a.ok, 'and a catalog member not its orders', a.error ?? 'was allowed');

    // =======================================================================
    section('8. Integration fixes: scoped catalogue, read access, order links, import errors');
    const names1 = ((await req(shop1.sock, 'products:list', {})).data ?? []).map((p) => p.sellerId);
    const names2 = ((await req(shop2.sock, 'products:list', {})).data ?? []).map((p) => p.sellerId);
    ok(names1.length > 0 && names1.every((id) => id === shop1.store.id || id === shop1.user.id), 'products:list for a seller returns only their own store\'s products', JSON.stringify([...new Set(names1)]));
    ok(names2.length > 0 && names2.every((id) => id === shop2.store.id || id === shop2.user.id) && !names2.includes(shop1.store.id), 'and the other store sees only its own', JSON.stringify([...new Set(names2)]));
    const teamList = ((await req(catalogStaff.sock, 'products:list', {})).data ?? []).map((p) => p.sellerId);
    ok(teamList.length === names1.length && teamList.every((id) => id === shop1.store.id || id === shop1.user.id), 'a team member sees the store\'s catalogue, not the marketplace', `${teamList.length} vs ${names1.length}`);
    const custList = (await req(cust.sock, 'products:list', {})).data ?? [];
    ok(new Set(custList.map((p) => p.sellerId)).size >= 2, 'a shopper still sees every store\'s live products');
    a = await req(ordersStaff.sock, 'campaigns:list');
    ok(a.ok && Array.isArray(a.data), 'a team role with catalog_read (orders) can READ campaigns', a.error ?? '');
    a = await req(financeStaff.sock, 'campaigns:list');
    ok(!a.ok, 'a role without catalog_read (finance) cannot', a.error ?? 'was allowed');
    a = await req(ordersStaff.sock, 'campaigns:create', { name: `Nope ${tag}`, discount: 5 });
    ok(!a.ok, 'and reading is all it gets (creating needs catalog)', a.error ?? 'was allowed');

    a = await req(shop2.sock, 'support:open', { subject: 'Order that is not mine', message: 'hello there', orderId: fo.id });
    ok(!a.ok && /Order not found/.test(a.error ?? ''), 'a seller cannot link an order that has none of their products', a.error ?? 'was allowed');
    a = await req(shop1.sock, 'support:open', { subject: 'My own sale', message: 'hello there', orderId: fo.id });
    ok(a.ok && a.data.orderId === fo.id, 'but can link their own order', a.error ?? '');
    a = await req(ordersStaff.sock, 'support:open', { subject: 'Team question', message: 'hello there', orderId: fo.id });
    ok(a.ok && a.data.orderId === fo.id, 'and so can a team member of that store', a.error ?? '');
    a = await req(cust.sock, 'support:open', { subject: 'Not my order', message: 'hello there', orderId: cOrder.id.replace(/.$/, '0') });
    ok(!a.ok, 'a customer cannot link an unknown order', a.error ?? 'was allowed');
    const tk = (await req(cust.sock, 'support:open', { subject: 'Closed soon', message: 'hello there' })).data;
    await req(admin.sock, 'support:setStatus', { id: tk.id, status: 'closed' });
    a = await req(cust.sock, 'support:reply', { id: tk.id, text: 'Still there?' });
    ok(!a.ok && /closed/.test(a.error ?? ''), 'a customer cannot reply on a closed ticket (it must stay closed)', a.error ?? 'was allowed');

    a = await req(shop1.sock, 'products:import', { csv: `name,price,category,sku\n,abc,Nowhere,bad sku!`, dryRun: true });
    const rowErr = a.ok ? a.data.errors?.[0]?.errors ?? [] : [];
    ok(a.ok && rowErr.length >= 4 && rowErr.some((m) => /title/.test(m)) && rowErr.some((m) => /Price/.test(m)) && rowErr.some((m) => /categor/i.test(m)) && rowErr.some((m) => /SKU/.test(m)), 'an import row reports EVERY problem (title, price, category, SKU), not only the first', a.error ?? JSON.stringify(rowErr));

    a = await req(shop1.sock, 'flashsales:nominate', { productId: cm.id, flashPrice: 30, endsAt: iso(DAY) });
    ok(a.ok && a.data.discount === 40, 'a flash sale made without a percent gets it from the prices (50 -> 30 = 40%)', a.error ?? JSON.stringify(a.data?.discount));
    const nominated = a.data;
    ok(nominated.ended === false && nominated.endsAt && nominated.phase === 'ended', 'a nomination waiting for marketing is not `ended`, and keeps its `endsAt`', JSON.stringify([nominated.ended, nominated.endsAt]));
  } finally {
    await restore();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
