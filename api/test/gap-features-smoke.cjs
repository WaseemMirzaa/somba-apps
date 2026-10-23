/* Gap features, end to end against a RUNNING dev API seeded with `npm run seed`:
 *   1 product search            4 delivery estimate (seller-set days per product)
 *   2 account cart (cart:get/set)  5 phone-code login
 *   3 product variants          6 "Call the rider": the customer sees the rider only while shipped / out for delivery
 *
 *   API_URL=http://localhost:3001 ADMIN_PW=... RIDER_PW=... node test/gap-features-smoke.cjs
 *
 * ADMIN_PW / RIDER_PW override the seed password when those accounts were changed (admin@somba.app and
 * rider@somba.app). CUSTOMER_PW is the verified demo customer's (customer@somba.app, phone +243900000001), used for
 * the cart and the phone-code login. productModeration / requireVerifiedForCheckout / codEnabled are toggled and
 * restored at the end (even when a check throws); the products and orders it creates are removed / cancelled.
 * Without a rider login the "Call the rider" section is skipped and reported as such.
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const NEW_PW = 'Gap-Pass-2026';
const CUSTOMER_PHONE = '+243900000001';
const tag = Date.now().toString().slice(-8);

let pass = 0;
let skipped = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const email = `${label}${tag}@gap.test`;
  const r = await rest('/api/v1/auth/register', { email, password: NEW_PW, name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email };
};
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });
/** The Kinshasa (UTC+1) calendar day `n` days from now, as the API computes the estimate. */
const dayPlus = (n) => new Date(Date.now() + 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const rider = await login('rider@somba.app', process.env.RIDER_PW ?? PW).catch(() => null);
  const saved = (await req(admin.sock, 'settings:get')).data ?? {};
  const setting = (key, value) => req(admin.sock, 'settings:set', { key, value });
  const restore = async () => {
    for (const k of ['productModeration', 'requireVerifiedForCheckout', 'codEnabled']) {
      if (saved[k] !== undefined) await setting(k, String(saved[k])).catch(() => undefined);
    }
  };
  const cleanupProducts = [];
  const cleanupOrders = [];
  let cartBackup = null;
  let customerAcct = null;

  try {
    await setting('productModeration', 'true');
    await setting('requireVerifiedForCheckout', 'false');
    await setting('codEnabled', 'true');

    // ---- actors -----------------------------------------------------------
    const seller = await (async () => {
      const u = await register('shop', 'seller');
      const store = (await req(u.sock, 'sellers:register', kyc(`Gap Store ${tag}`))).data;
      await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
      return { ...u, store };
    })();
    const buyer = await register('buyer');
    const buyerPushes = [];
    buyer.sock.on('order:updated', (o) => buyerPushes.push(o));
    const sellerPushes = [];
    seller.sock.on('order:updated', (o) => sellerPushes.push(o));
    const riderPushes = [];
    rider?.sock.on('order:updated', (o) => riderPushes.push(o));

    const approve = async (id) => req(admin.sock, 'products:update', { id, patch: { status: 'live' } });
    const listing = async (name, extra = {}) => {
      const r = await req(seller.sock, 'products:create', { name, price: 25, category: 'Electronics', stock: 10, ...extra });
      if (r.ok) cleanupProducts.push(r.data.id);
      return r;
    };
    const stockOf = async (id) => (await req(buyer.sock, 'products:get', { id })).data?.stock;
    const order = (items, extra = {}) => req(buyer.sock, 'orders:create', { items, paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: ADDRESS, ...extra });
    const trackOrder = (r) => { if (r.ok) cleanupOrders.push(r.data.id); return r; };

    // =======================================================================
    section('1. Product search');
    const word = `Zephyrkettle${tag}`;
    const searchable = await listing(`${word} deluxe`);
    ok(searchable.ok && searchable.data.status === 'pending', 'setup: a seller listing waits for moderation', searchable.error ?? searchable.data?.status);
    let hits = (await req(buyer.sock, 'products:search', { q: 'Zephyrkettle' + tag.slice(0, 3) })).data;
    ok(!hits?.ids?.includes(searchable.data.id), 'a listing that is not live is not found by shoppers');
    ok((await approve(searchable.data.id)).ok, 'admin approves it');
    hits = (await req(buyer.sock, 'products:search', { q: `zephyrkettle${tag.slice(0, 3)}` })).data;
    ok(hits?.ids?.includes(searchable.data.id), 'a live product is found by part of its name (case-insensitive)', JSON.stringify(hits));
    const guest = await connect();
    hits = (await req(guest, 'products:search', { q: 'deluxe ' + word.slice(0, 8) })).data;
    ok(hits?.ids?.includes(searchable.data.id), 'search is public (guests can search too)');
    guest.close();
    hits = (await req(buyer.sock, 'products:search', { q: 'q' })).data;
    ok(hits?.ids?.length === 0, 'a one-letter query returns nothing');

    // =======================================================================
    section('2. Account cart');
    customerAcct = await login('customer@somba.app', process.env.CUSTOMER_PW ?? PW);
    const c = customerAcct.sock;
    cartBackup = (await req(c, 'cart:get')).data;
    ok(Array.isArray(cartBackup?.lines) && Array.isArray(cartBackup?.saved), 'cart:get returns { lines, saved } for the customer', JSON.stringify(cartBackup));
    const pushed = [];
    c.on('cart:updated', (v) => pushed.push(v));
    const lines = [{ productId: searchable.data.id, variant: 'Default', qty: 2, priceWhenAdded: 25 }];
    const savedLater = [{ productId: searchable.data.id, variant: 'Size: 42', qty: 1 }];
    let r = await req(c, 'cart:set', { lines, saved: savedLater });
    ok(r.ok && r.data.lines.length === 1 && r.data.lines[0].qty === 2 && r.data.saved.length === 1, 'cart:set stores lines and saved-for-later', r.error ?? JSON.stringify(r.data));
    r = await req(c, 'cart:get');
    ok(r.ok && r.data.lines[0].productId === searchable.data.id && r.data.lines[0].qty === 2 && r.data.lines[0].priceWhenAdded === 25 && r.data.saved[0].variant === 'Size: 42', 'cart:get returns exactly what was set (qty, variant, price when added)', JSON.stringify(r.data));
    ok(!!(await until(() => pushed.length > 0)), 'the customer\'s devices are told with cart:updated');
    r = await req(c, 'cart:set', { lines: [{ productId: searchable.data.id, qty: 1 }, { productId: searchable.data.id, qty: 3 }], saved: [] });
    ok(r.ok && r.data.lines.length === 1 && r.data.lines[0].qty === 4 && r.data.saved.length === 0, 'duplicate lines are merged and the whole cart is replaced', JSON.stringify(r.data));
    r = await req(seller.sock, 'cart:get');
    ok(!r.ok, 'a seller has no cart (cart:get refused)', r.error ?? '');
    r = await req(seller.sock, 'cart:set', { lines });
    ok(!r.ok, 'a seller cannot set a cart (cart:set refused)', r.error ?? '');
    r = await req(await connect(), 'cart:get');
    ok(!r.ok, 'a guest has no cart');

    // =======================================================================
    section('3. Product variants');
    const bad = await listing(`Variant bad ${tag}`, { variants: [{ name: 'Size', options: [] }] });
    ok(!bad.ok && /at least one value/i.test(bad.error ?? ''), 'invalid options are refused with a readable message', bad.error ?? 'created');
    const garbage = await listing(`Variant garbage ${tag}`, { variants: 'not json' });
    ok(!garbage.ok, 'unparseable options are refused', garbage.error ?? 'created');
    const VARIANTS = [{ name: ' Size ', options: ['41', '42', ''] }, { name: 'Colour', options: ['Black', 'White'] }];
    const shoe = await listing(`Gap sneaker ${tag}`, { variants: VARIANTS });
    ok(shoe.ok, 'a seller can create a listing with options', shoe.error ?? '');
    const stored = JSON.parse(shoe.data.variants ?? 'null');
    ok(JSON.stringify(stored) === JSON.stringify([{ name: 'Size', options: ['41', '42'] }, { name: 'Colour', options: ['Black', 'White'] }]), 'options are normalised and stored as JSON text', shoe.data.variants);
    ok((await approve(shoe.data.id)).ok, 'admin approves the sneaker');
    const shown = (await req(buyer.sock, 'products:get', { id: shoe.data.id })).data;
    ok(shown?.variants === shoe.data.variants, 'shoppers receive product.variants', String(shown?.variants));
    ok((await req(buyer.sock, 'products:list', {})).data.find((p) => p.id === shoe.data.id)?.variants === shoe.data.variants, 'products:list carries variants too');
    ok((await req(seller.sock, 'products:list', {})).data.find((p) => p.id === shoe.data.id)?.variants === shoe.data.variants, 'and so does the seller\'s own list');

    // editing a live listing's options goes back to moderation
    r = await req(seller.sock, 'products:update', { id: shoe.data.id, patch: { stock: 12 } });
    ok(r.ok && r.data.status === 'live', 'a stock-only edit keeps the listing live', r.error ?? r.data?.status);
    r = await req(seller.sock, 'products:update', { id: shoe.data.id, patch: { variants: [{ name: 'Size', options: ['41', '42', '43'] }, { name: 'Colour', options: ['Black', 'White'] }] } });
    ok(r.ok && r.data.status === 'pending' && JSON.parse(r.data.variants)[0].options.length === 3, 'changing options on a live listing sends it back to moderation', r.error ?? r.data?.status);
    ok((await approve(shoe.data.id)).ok, 'admin approves again');
    r = await req(seller.sock, 'products:update', { id: shoe.data.id, patch: { variants: [{ name: 'Size', options: ['41', '42', '43'] }, { name: 'Colour', options: ['Black', 'White'] }] } });
    ok(r.ok && r.data.status === 'live', 'saving the same options again is not a change (stays live)', r.error ?? r.data?.status);
    r = await req(seller.sock, 'products:update', { id: shoe.data.id, patch: { variants: [{ name: 'Size', options: [] }] } });
    ok(!r.ok, 'invalid options on update are refused', r.error ?? 'updated');
    const plain = await listing(`Gap plain ${tag}`);
    await approve(plain.data.id);
    ok(plain.data.variants === null, 'a listing without options has variants null');
    r = await req(seller.sock, 'products:update', { id: shoe.data.id, patch: { variants: [] } });
    ok(r.ok && r.data.variants === null, 'an empty list clears the options', r.error ?? String(r.data?.variants));
    r = await req(seller.sock, 'products:update', { id: shoe.data.id, patch: { variants: VARIANTS } });
    await approve(shoe.data.id);
    ok(r.ok, 'options set again for the order checks', r.error ?? '');

    const sneaker = shoe.data.id;
    const s0 = await stockOf(sneaker);
    r = await order([{ productId: sneaker, qty: 1 }]);
    ok(!r.ok && r.error === 'Choose a size for "' + shoe.data.name + '".', 'an order line with no choice is refused with a readable message', r.error ?? 'order created');
    r = await order([{ productId: sneaker, qty: 1, variant: 'Default' }]);
    ok(!r.ok && /Choose a size/.test(r.error ?? ''), '"Default" is not a choice on a product that has options', r.error ?? '');
    r = await order([{ productId: sneaker, qty: 1, variant: 'Size: 42' }]);
    ok(!r.ok && r.error === 'Choose a colour for "' + shoe.data.name + '".', 'half a choice (size only) is refused', r.error ?? '');
    r = await order([{ productId: sneaker, qty: 1, variant: 'Size: 99 · Colour: Black' }]);
    ok(!r.ok && /Choose a size/.test(r.error ?? ''), 'a value the seller never offered is refused', r.error ?? '');
    ok((await stockOf(sneaker)) === s0, 'refused orders reserved no stock', `${s0} → ${await stockOf(sneaker)}`);
    const p0 = await stockOf(plain.data.id);
    r = await order([{ productId: plain.data.id, qty: 2 }, { productId: sneaker, qty: 1 }]);
    ok(!r.ok && (await stockOf(plain.data.id)) === p0 && (await stockOf(sneaker)) === s0, 'one bad line refuses the whole order and nothing is reserved for the good one', r.error ?? 'order created');
    r = trackOrder(await order([{ productId: sneaker, qty: 1, variant: 'colour: black ·  size:  42' }]));
    ok(r.ok && r.data.items[0].variant === 'Size: 42 · Colour: Black', 'a valid (sloppily typed) choice is accepted and stored in its canonical form', r.error ?? r.data?.items?.[0]?.variant);
    ok((await stockOf(sneaker)) === s0 - 1, 'and stock is reserved');
    const listed = (await req(buyer.sock, 'orders:list')).data.find((o) => o.id === r.data?.id);
    ok(listed?.items[0]?.variant === 'Size: 42 · Colour: Black', 'orders:list shows the canonical label');
    ok(!!(await req(admin.sock, 'orders:list')).data.find((o) => o.id === r.data?.id)?.items.some((i) => i.variant === 'Size: 42 · Colour: Black'), 'and so does the admin list');
    r = trackOrder(await order([{ productId: plain.data.id, qty: 1, variant: 'Whatever' }]));
    ok(r.ok && r.data.items[0].variant === 'Default', 'a product without options stores "Default" whatever the client sent', r.error ?? r.data?.items?.[0]?.variant);

    // =======================================================================
    section('4. Delivery estimate');
    let d = await req(seller.sock, 'products:update', { id: plain.data.id, patch: { deliveryDays: 4 } });
    ok(d.ok && d.data.deliveryDays === 4, 'the seller sets a product\'s delivery time (4 days)', d.error ?? String(d.data?.deliveryDays));
    ok(d.data?.status === 'live', 'changing only the delivery time keeps the listing live (no re-moderation)', d.data?.status);
    for (const bad of [0, 31, 1.5]) {
      d = await req(seller.sock, 'products:update', { id: plain.data.id, patch: { deliveryDays: bad } });
      ok(!d.ok && /delivery time/i.test(d.error ?? ''), `a delivery time of ${bad} days is refused`, d.error ?? 'accepted');
    }
    const quick = await listing(`Quick ${tag}`, { deliveryDays: 1 });
    ok(quick.ok && quick.data.deliveryDays === 1, 'a new listing can carry its delivery time', quick.error ?? '');
    await approve(quick.data.id);
    r = trackOrder(await order([{ productId: quick.data.id, qty: 1 }]));
    ok(r.ok && r.data.estimatedDeliveryDate === dayPlus(1), 'a 1-day product: expected tomorrow', r.error ?? String(r.data?.estimatedDeliveryDate));
    r = trackOrder(await order([{ productId: quick.data.id, qty: 1 }, { productId: plain.data.id, qty: 1 }], { deliverySlot: '2020-01-01 09:00-12:00' }));
    const expected = dayPlus(4);
    ok(r.ok && r.data.estimatedDeliveryDate === expected, 'mixed order: the slowest line decides (4 days)', r.error ?? String(r.data?.estimatedDeliveryDate));
    ok(r.ok && !('deliverySlot' in r.data), 'a date sent by the shopper is ignored (no choice on the client side)', JSON.stringify(r.data?.deliverySlot));
    const estOrder = r.data;
    ok((await req(buyer.sock, 'orders:list')).data.find((o) => o.id === estOrder.id)?.estimatedDeliveryDate === expected, 'the customer sees it in orders:list');
    ok((await req(admin.sock, 'orders:list')).data.find((o) => o.id === estOrder.id)?.estimatedDeliveryDate === expected, 'admin sees it');
    ok((await req(seller.sock, 'orders:list')).data.find((o) => o.id === estOrder.id)?.estimatedDeliveryDate === expected, 'the seller\'s order view shows it');
    if (rider) {
      const task = await until(async () => (await req(rider.sock, 'rider:tasks')).data?.find((t) => t.orderId === estOrder.id));
      ok(task?.order?.estimatedDeliveryDate === expected, 'the rider queue snapshot carries the estimate', JSON.stringify(task?.order && { est: task.order.estimatedDeliveryDate }));
    } else {
      skipped++; console.log('  ⏭  rider queue snapshot (no rider login)');
    }
    ok(!('deliverySlots' in ((await req(buyer.sock, 'settings:get')).data ?? {})), 'no delivery-slot setting is published any more');

    // =======================================================================
    section('5. Phone-code login');
    const send = async () => {
      let res = await rest('/api/v1/auth/phone/login/send', { phone: CUSTOMER_PHONE });
      if (res.status === 429) { console.log('  … code requested less than 30 s ago, waiting'); await sleep(31_000); res = await rest('/api/v1/auth/phone/login/send', { phone: CUSTOMER_PHONE }); }
      return res;
    };
    const sent = await send();
    ok(sent.status === 200 && sent.json?.sent === true && /^\d{6}$/.test(sent.json?.devToken ?? ''), 'the verified customer\'s number gets a code (devToken exposed in dev)', JSON.stringify(sent));
    const code = sent.json?.devToken ?? '000000';
    const wrong = await rest('/api/v1/auth/phone/login', { phone: CUSTOMER_PHONE, code: code === '123456' ? '654321' : '123456' });
    ok(wrong.status === 400 && /incorrect or expired/i.test(JSON.stringify(wrong.json)), 'a wrong code is refused', JSON.stringify(wrong));
    const good = await rest('/api/v1/auth/phone/login', { phone: CUSTOMER_PHONE, code });
    ok(good.status === 200 && !!good.json?.accessToken && !!good.json?.refreshToken && good.json?.user?.email === 'customer@somba.app', 'the right code returns tokens for that customer', JSON.stringify(good.json)?.slice(0, 160));
    const reuse = await rest('/api/v1/auth/phone/login', { phone: CUSTOMER_PHONE, code });
    ok(reuse.status === 400, 'a code works only once', JSON.stringify(reuse));
    const unknown = await rest('/api/v1/auth/phone/login/send', { phone: '+243911111999' });
    ok(unknown.status === 200 && unknown.json?.sent === true && !unknown.json?.devToken, 'an unknown number looks the same as a known one (no account hint, no code)', JSON.stringify(unknown));
    const nobody = await rest('/api/v1/auth/phone/login', { phone: '+243911111999', code: '123456' });
    ok(nobody.status === 400, 'and cannot sign in', JSON.stringify(nobody));
    if (good.json?.accessToken) {
      const s = await connect(good.json.accessToken);
      ok(((await req(s, 'orders:list')).ok), 'the phone-login token opens a working session');
      s.close();
    }

    // =======================================================================
    section('6. Call the rider');
    if (!rider) {
      skipped++; console.log('  ⏭  skipped: rider@somba.app could not log in (set RIDER_PW)');
    } else {
      const shipOrder = trackOrder(await order([{ productId: plain.data.id, qty: 1 }], {}));
      ok(shipOrder.ok, 'setup: a paid order', shipOrder.error ?? '');
      const oid = shipOrder.data.id;
      const mine = async () => (await req(buyer.sock, 'orders:list')).data.find((o) => o.id === oid);
      ok(!('rider' in (await mine())), 'confirmed: no rider field for the customer');
      const task = await until(async () => (await req(rider.sock, 'rider:tasks')).data?.find((t) => t.orderId === oid));
      ok(!!task, 'the delivery task is open');
      const dir = (await req(admin.sock, 'warehouse:riders')).data?.find((x) => x.id === rider.user.id);
      const accepted = await req(rider.sock, 'delivery:accept', { taskId: task.id });
      ok(accepted.ok, 'a rider accepts the delivery', accepted.error ?? '');
      let o = await mine();
      ok(o.status === 'processing' && o.riderId === rider.user.id && !('rider' in o), 'processing (rider assigned): the contact is not shared yet', JSON.stringify({ s: o.status, rider: o.rider }));

      const step = (status, code) => req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status, ...(code ? { code } : {}) });
      const sawPush = (status) => until(() => buyerPushes.find((p) => p.id === oid && p.status === status) ?? null);

      let s = await step('picked_up');
      ok(s.ok, 'the rider picks up the parcel (order: shipped)', s.error ?? '');
      o = await mine();
      ok(o.status === 'shipped' && o.rider?.name === rider.user.name, 'shipped: orders:list gives the customer rider.name', JSON.stringify({ s: o.status, rider: o.rider }));
      ok(o.rider && 'phone' in o.rider && (o.rider.phone ?? null) === (dir?.phone ?? null), 'shipped: rider.phone is the rider\'s decrypted number', JSON.stringify(o.rider));
      ok(typeof o.rider?.phone !== 'string' || !o.rider.phone.startsWith('enc::'), 'the phone is not the encrypted form');
      let push = await sawPush('shipped');
      ok(push?.rider?.name === rider.user.name, 'the order:updated push to the customer carries the rider too', JSON.stringify(push?.rider));
      ok(Object.keys(o.rider).sort().join() === 'name,phone', 'nothing else about the rider leaks (only name and phone)', Object.keys(o.rider).join());

      s = await step('in_transit');
      ok(s.ok, 'the parcel is out for delivery', s.error ?? '');
      o = await mine();
      ok(o.status === 'out_for_delivery' && o.rider?.name === rider.user.name, 'out_for_delivery: the customer still has the rider', JSON.stringify({ s: o.status, rider: o.rider }));
      push = await sawPush('out_for_delivery');
      ok(push?.rider?.name === rider.user.name, 'and its push carries the rider');

      const adminView = (await req(admin.sock, 'orders:list')).data.find((x) => x.id === oid);
      ok(!!adminView && !('rider' in adminView), 'admin\'s view of the same order has no rider field');
      const sellerView = (await req(seller.sock, 'orders:list')).data.find((x) => x.id === oid);
      ok(!!sellerView && !('rider' in sellerView) && !JSON.stringify(sellerView).includes(String(dir?.phone ?? '@@')), 'the seller\'s view has no rider and no phone');
      await sleep(300);
      ok(!sellerPushes.some((p) => p.id === oid && 'rider' in p), 'seller pushes never carry the rider');
      ok(riderPushes.every((p) => !('rider' in p)), 'the rider\'s own pushes carry no rider field');
      const other = await login('customer@somba.app', process.env.CUSTOMER_PW ?? PW);
      ok(!(await req(other.sock, 'orders:list')).data.some((x) => x.id === oid), 'another customer cannot see this order, so not its rider either');
      other.sock.close();

      const handover = (await req(buyer.sock, 'orders:deliveryCode', { orderId: oid })).data;
      s = await step('delivered', handover?.code);
      ok(s.ok, 'the rider delivers', s.error ?? '');
      o = await mine();
      ok(o.status === 'delivered' && !('rider' in o), 'delivered: the contact is withdrawn', JSON.stringify({ s: o.status, rider: o.rider }));
      push = await until(() => buyerPushes.find((p) => p.id === oid && p.status === 'delivered') ?? null);
      ok(!!push && !('rider' in push), 'and the delivered push has none');
    }
  } finally {
    // ---- clean up ---------------------------------------------------------
    if (customerAcct && cartBackup) {
      await req(customerAcct.sock, 'cart:set', { lines: cartBackup.lines, saved: cartBackup.saved }).catch(() => undefined);
    }
    for (const id of cleanupOrders) await req(admin.sock, 'orders:adminCancel', { orderId: id, reason: 'gap smoke cleanup' }).catch(() => undefined);
    for (const id of cleanupProducts) await req(admin.sock, 'products:delete', { id }).catch(() => undefined);
    await restore();
  }

  console.log(`\n${pass} passed, ${fails.length} failed${skipped ? `, ${skipped} skipped` : ''}`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
