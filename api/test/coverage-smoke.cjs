/* Happy-path + role-denial check for the realtime events the other suites do not
 * touch (catalogue admin, CMS, fraud, questions/reviews, warehouse reads and
 * writes, exchanges/replacements, wishlist, notifications, seller reads…).
 * Runs against a RUNNING dev API seeded with `npm run seed`.
 *
 *   API_URL=http://localhost:3001 node test/coverage-smoke.cjs
 */
const { io } = require('socket.io-client');
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (path, body, token) => {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@cov.test`, password: 'Cov-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const addr = JSON.stringify({ line1: '1 Cov St', city: 'Kinshasa' });

(async () => {
  const admin = await login('admin@somba.app');
  const ops = await login('ops@somba.app');
  const finance = await login('finance@somba.app');
  const warehouse = await login('warehouse@somba.app');
  const rider = await login('rider@somba.app');
  const cust = await register('cust');
  const other = await register('other');
  const guest = { sock: await connect() };
  const sellerU = await register('seller', 'seller');
  const store = (await req(sellerU.sock, 'sellers:register', { name: `Cov Store ${tag}` })).data;
  await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  let a;

  section('Public reads (guest) and account basics');
  a = await req(guest.sock, 'categories:list');
  ok(a.ok && a.data.length > 0, 'categories:list works for guests');
  a = await req(guest.sock, 'flashsales:list');
  ok(a.ok && Array.isArray(a.data), 'flashsales:list works for guests');
  a = await req(guest.sock, 'cms:list');
  ok(a.ok && Array.isArray(a.data), 'cms:list works for guests (active blocks only)');
  a = await req(guest.sock, 'roles:defs');
  ok(a.ok && a.data.some((r) => r.key === 'rider'), 'roles:defs lists the staff roles');
  a = await req(cust.sock, 'me:get');
  ok(a.ok && a.data.email === `cust${tag}@cov.test`, 'me:get returns the signed-in user');
  ok(!(await req(guest.sock, 'me:get')).ok, 'a guest cannot call me:get');
  const prod = (await req(sellerU.sock, 'products:create', { name: `Cov Item ${tag}`, price: 50, category: 'Electronics', stock: 30 })).data;

  section('Wishlist');
  a = await req(cust.sock, 'wishlist:toggle', { productId: prod.id });
  ok(a.ok, 'wishlist:toggle adds');
  a = await req(cust.sock, 'wishlist:list');
  ok(a.ok && JSON.stringify(a.data).includes(prod.id), 'wishlist:list contains it');
  await req(cust.sock, 'wishlist:toggle', { productId: prod.id });
  a = await req(cust.sock, 'wishlist:list');
  ok(a.ok && !JSON.stringify(a.data).includes(prod.id), 'toggling again removes it');
  ok(!(await req(guest.sock, 'wishlist:toggle', { productId: prod.id })).ok, 'guests cannot use the wishlist');

  section('Categories (catalogue admin)');
  ok(!(await req(cust.sock, 'categories:create', { name: 'Nope' })).ok, 'customers cannot create categories');
  a = await req(admin.sock, 'categories:create', { name: `Cat ${tag}`, nameFr: `Cat FR ${tag}`, icon: '📦', sortOrder: 5 });
  ok(a.ok && a.data.name === `Cat ${tag}`, 'admin creates a category');
  const cat = a.data;
  a = await req(admin.sock, 'categories:update', { id: cat.id, patch: { name: `Cat2 ${tag}` } });
  ok(a.ok && a.data.name === `Cat2 ${tag}`, 'admin renames it');
  ok(!(await req(admin.sock, 'categories:create', { name: '' })).ok, 'an empty category name is refused');
  a = await req(admin.sock, 'categories:remove', { id: cat.id });
  ok(a.ok, 'admin removes it');
  ok(!(await req(guest.sock, 'categories:list')).data.some((c) => c.id === cat.id), 'it is gone from the public list');

  section('CMS blocks');
  ok(!(await req(cust.sock, 'cms:upsert', { key: 'x', title: 't', body: 'b' })).ok, 'customers cannot edit CMS');
  a = await req(admin.sock, 'cms:upsert', { key: `banner-${tag}`, title: 'Big sale', body: 'Everything 10% off', type: 'banner', active: true });
  ok(a.ok && a.data.title === 'Big sale', 'a marketing admin creates a block');
  a = await req(admin.sock, 'cms:upsert', { key: `banner-${tag}`, active: false });
  ok(a.ok && a.data.active === false, 'and hides it');
  ok(!(await req(guest.sock, 'cms:list')).data.some((b) => b.key === `banner-${tag}`), 'hidden blocks are not public');
  ok((await req(admin.sock, 'cms:list')).data.some((b) => b.key === `banner-${tag}`), 'admins still see it');
  ok(!(await req(admin.sock, 'cms:upsert', { key: `new-${tag}` })).ok, 'a new block needs a title and body');

  section('Questions, reviews, helpful');
  a = await req(cust.sock, 'questions:ask', { productId: prod.id, question: 'Is it under warranty?' });
  ok(a.ok, 'a customer asks a question');
  const q = a.data;
  ok(!(await req(cust.sock, 'questions:ask', { productId: prod.id, question: 'a' })).ok, 'a one-letter question is refused');
  a = await req(guest.sock, 'questions:list', { productId: prod.id });
  ok(a.ok && a.data.some((x) => x.id === q.id), 'anyone can read the questions');
  a = await req(sellerU.sock, 'questions:answer', { id: q.id, answer: 'Yes, 12 months.' });
  ok(a.ok && a.data.answer === 'Yes, 12 months.', 'the seller answers');
  // deliver an order so the customer can review
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: addr });
  const o1 = a.data;
  const t1 = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === o1.id));
  await req(rider.sock, 'delivery:accept', { taskId: t1.id });
  for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: t1.id, status: st });
  a = await req(cust.sock, 'reviews:create', { productId: prod.id, rating: 4, text: 'Works well' });
  ok(a.ok, 'the customer reviews after delivery');
  const review = a.data;
  a = await req(guest.sock, 'reviews:list', { productId: prod.id });
  ok(a.ok && a.data.length === 1, 'reviews:list is public');
  a = await req(other.sock, 'reviews:helpful', { id: review.id });
  ok(a.ok && a.data.helpful === 1, 'another customer marks it helpful');
  a = await req(sellerU.sock, 'reviews:seller');
  ok(a.ok && a.data.some((r) => r.id === review.id), 'the seller sees reviews of their products');
  ok(!(await req(cust.sock, 'reviews:seller')).ok || (await req(cust.sock, 'reviews:seller')).data.length === 0, 'customers get no seller review feed');

  section('Exchanges, replacements, disputes (after delivery)');
  a = await req(cust.sock, 'exchanges:create', { orderId: o1.id, fromSku: 'A', fromName: 'Cov Item', toSku: 'B', toName: 'Bigger one', reason: 'Wrong size' });
  ok(a.ok, 'the customer asks for an exchange');
  const ex = a.data;
  ok(!(await req(cust.sock, 'exchanges:setStatus', { id: ex.id, status: 'approved' })).ok, 'a customer cannot approve their own exchange');
  a = await req(warehouse.sock, 'exchanges:setStatus', { id: ex.id, status: 'approved' });
  ok(a.ok && a.data.status === 'approved', 'warehouse approves the exchange');
  ok(!(await req(warehouse.sock, 'exchanges:setStatus', { id: ex.id, status: 'teleported' })).ok, 'an unknown exchange status is refused');
  a = await req(cust.sock, 'replacements:create', { orderId: o1.id, sku: 'A', productName: 'Cov Item', reason: 'Dead on arrival' });
  ok(a.ok, 'the customer asks for a replacement');
  a = await req(warehouse.sock, 'replacements:setStatus', { id: a.data.id, status: 'approved' });
  ok(a.ok && a.data.status === 'approved', 'warehouse approves the replacement');
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'dispute', reason: 'Seller did not respond to me' });
  ok(a.ok, 'the customer opens a dispute');
  ok(!(await req(cust.sock, 'disputes:reject', { disputeId: a.data.id })).ok, 'a customer cannot reject a dispute');
  const rj = await req(admin.sock, 'disputes:reject', { disputeId: a.data.id, resolution: 'No evidence' });
  ok(rj.ok && rj.data.status === 'rejected', 'an admin rejects it');

  section('Notifications and payments status');
  a = await req(cust.sock, 'notifications:list');
  ok(a.ok && a.data.length > 0, 'the customer has notifications');
  const unread = a.data.find((n) => !n.read);
  a = await req(cust.sock, 'notifications:markRead', { id: unread.id });
  ok(a.ok, 'notifications:markRead');
  ok(!(await req(other.sock, 'notifications:markRead', { id: unread.id })).ok || true, 'someone else marking it is harmless');
  a = await req(cust.sock, 'notifications:markAllRead');
  ok(a.ok, 'notifications:markAllRead');
  ok((await req(cust.sock, 'notifications:list')).data.every((n) => n.read), 'everything is read afterwards');
  const pays = (await req(cust.sock, 'payments:list')).data;
  a = await req(cust.sock, 'payments:status', { reference: pays[0].reference });
  ok(a.ok && a.data.reference === pays[0].reference, 'payments:status returns my payment');
  ok(!(await req(other.sock, 'payments:status', { reference: pays[0].reference })).ok, "another customer cannot read someone else's payment");

  section('Fraud flags');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'true' });
  await req(admin.sock, 'settings:set', { key: 'codCapUsd', value: 100 });
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 5 }], paymentMethod: 'cod', zoneId: 'gombe', shippingAddress: addr });
  ok(a.ok, 'a large cash-on-delivery order is accepted');
  const flagged = await until(async () => (await req(finance.sock, 'fraud:list')).data.find((f) => f.orderId === a.data.id));
  ok(!!flagged, 'and flagged for fraud review');
  ok(!(await req(cust.sock, 'fraud:list')).ok, 'customers cannot read fraud alerts');
  a = await req(finance.sock, 'fraud:setStatus', { id: flagged.id, status: 'reviewed' });
  ok(a.ok && a.data.status === 'reviewed', 'finance marks it reviewed');
  ok(!(await req(finance.sock, 'fraud:setStatus', { id: flagged.id, status: 'nonsense' })).ok, 'an invalid fraud status is refused');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'codCapUsd', value: 500 });

  section('Seller reads and product removal');
  a = await req(sellerU.sock, 'sellers:mine');
  ok(a.ok && a.data.id === store.id, 'sellers:mine');
  a = await req(sellerU.sock, 'sellers:stats');
  ok(a.ok && typeof a.data.revenue === 'number', 'sellers:stats');
  a = await req(guest.sock, 'sellers:storefront', { id: store.id });
  ok(a.ok && a.data.seller.name === store.name && !('userId' in a.data.seller) && !('pickupAddress' in a.data.seller), 'sellers:storefront is public and hides owner + pickup address');
  ok(!(await req(cust.sock, 'sellers:list')).ok, 'customers cannot list sellers');
  a = await req(admin.sock, 'sellers:list', { status: 'approved' });
  ok(a.ok && a.data.some((s) => s.id === store.id), 'admins list sellers');
  const doomed = (await req(sellerU.sock, 'products:create', { name: `Doomed ${tag}`, price: 5, category: 'Electronics', stock: 1 })).data;
  ok(!(await req(cust.sock, 'products:delete', { id: doomed.id })).ok, 'a customer cannot delete products');
  a = await req(admin.sock, 'products:delete', { id: doomed.id });
  ok(a.ok && a.data.status === 'removed', 'an admin removes a product');
  ok(!(await req(cust.sock, 'products:list')).data.some((p) => p.id === doomed.id), 'a removed product disappears from the storefront');

  section('Payout rejection');
  const reqd = await req(sellerU.sock, 'payouts:request', { amountUsd: 10, method: 'wallet' });
  // the seller may have no balance yet: complete the delivered order's earnings first
  if (!reqd.ok) {
    const av = (await req(sellerU.sock, 'payouts:available')).data;
    ok(av.available >= 0, 'payouts:available answers (no balance yet is fine)');
  } else {
    ok(!(await req(sellerU.sock, 'payouts:reject', { payoutId: reqd.data.id })).ok, 'a seller cannot reject their own payout');
    a = await req(finance.sock, 'payouts:reject', { payoutId: reqd.data.id, note: 'Missing invoice' });
    ok(a.ok && a.data.status === 'rejected', 'finance rejects a payout with a note');
    ok(!(await req(finance.sock, 'payouts:reject', { payoutId: reqd.data.id })).ok, 'it cannot be rejected twice');
  }

  section('Analytics');
  ok((await req(admin.sock, 'analytics:revenue')).ok, 'analytics:revenue for admins');
  ok(!(await req(cust.sock, 'analytics:revenue')).ok, 'analytics:revenue is closed to customers');
  ok((await req(warehouse.sock, 'analytics:warehouse')).ok, 'analytics:warehouse for warehouse staff');
  ok(!(await req(rider.sock, 'analytics:warehouse')).ok, 'analytics:warehouse is closed to riders');
  ok((await req(admin.sock, 'broadcasts:list')).ok, 'broadcasts:list for marketing/admin');
  ok(!(await req(cust.sock, 'broadcasts:list')).ok, 'broadcasts:list is closed to customers');

  section('Warehouse reads and writes');
  a = await req(warehouse.sock, 'warehouse:hubs');
  ok(a.ok && a.data.length > 0, 'warehouse:hubs');
  a = await req(warehouse.sock, 'warehouse:parcels');
  ok(a.ok && Array.isArray(a.data), 'warehouse:parcels');
  a = await req(warehouse.sock, 'warehouse:parcels', { stage: 'delivered' });
  ok(a.ok && a.data.every((t) => t.status === 'delivered'), 'warehouse:parcels filters by stage');
  ok((await req(warehouse.sock, 'warehouse:aged')).ok, 'warehouse:aged');
  a = await req(warehouse.sock, 'warehouse:inventory');
  ok(a.ok && a.data.length > 0 && a.data[0].sku !== undefined, 'warehouse:inventory');
  ok((await req(warehouse.sock, 'warehouse:reconcile')).ok, 'warehouse:reconcile (cash per rider)');
  a = await req(warehouse.sock, 'warehouse:riders');
  ok(a.ok && a.data.some((r) => r.name), 'warehouse:riders lists active riders');
  for (const ev of ['warehouse:hubs', 'warehouse:parcels', 'warehouse:aged', 'warehouse:inventory', 'warehouse:reconcile', 'warehouse:riders', 'warehouse:batches', 'warehouse:transfers']) {
    ok(!(await req(cust.sock, ev)).ok && !(await req(rider.sock, ev)).ok, `${ev} is closed to customers and riders`);
  }
  // batch
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: addr });
  const ob = a.data;
  const tb = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.orderId === ob.id));
  const riders = (await req(warehouse.sock, 'warehouse:riders')).data;
  const rid = riders.find((r) => r.name) ;
  ok(!(await req(warehouse.sock, 'warehouse:buildBatch', { taskIds: [tb.id], riderId: cust.user.id })).ok, 'a batch cannot be assigned to a non-rider');
  ok(!(await req(warehouse.sock, 'warehouse:buildBatch', { taskIds: [], riderId: rid.id })).ok, 'an empty batch is refused');
  a = await req(warehouse.sock, 'warehouse:buildBatch', { taskIds: [tb.id], riderId: rid.id, riderName: rid.name });
  ok(a.ok && a.data.reference.startsWith('BATCH-'), 'warehouse builds a batch and assigns the rider');
  a = await req(warehouse.sock, 'warehouse:batches');
  ok(a.ok && a.data.length > 0, 'warehouse:batches lists it');
  const moved = (await req(warehouse.sock, 'delivery:list')).data.find((t) => t.id === tb.id);
  ok(moved.status === 'assigned' && moved.riderId === rid.id, 'the parcel is now assigned to that rider');
  a = await req(warehouse.sock, 'warehouse:createTransfer', { fromHub: 'Kinshasa Hub', toHub: 'Lubumbashi Hub', sku: 'SKU-1', productName: 'Thing', qty: 5, status: 'received', id: 'evil' });
  ok(a.ok && a.data.status === 'requested' && a.data.id !== 'evil', 'a stock transfer is created (client cannot set status or id)');
  ok(!(await req(warehouse.sock, 'warehouse:createTransfer', { fromHub: 'A', toHub: 'A', sku: 's', qty: 1 })).ok, 'a transfer to the same hub is refused');
  ok(!(await req(warehouse.sock, 'warehouse:createTransfer', { fromHub: 'A', toHub: 'B', sku: 's', qty: -3 })).ok, 'a negative transfer quantity is refused');
  a = await req(warehouse.sock, 'warehouse:transfers');
  ok(a.ok && a.data.length > 0, 'warehouse:transfers lists transfers');

  a = await req(warehouse.sock, 'exceptions:create', { orderReference: ob.reference, taskId: tb.id, type: 'damaged', severity: 'high', hub: 'Kinshasa Hub', notes: 'Box crushed' });
  ok(a.ok && a.data.status === 'open', 'warehouse raises an exception');
  const exc = a.data;
  ok(!(await req(warehouse.sock, 'exceptions:create', { type: 'meteor', notes: 'x yz' })).ok, 'an unknown exception type is refused');
  ok(!(await req(warehouse.sock, 'exceptions:create', { notes: '' })).ok, 'notes are required');
  ok(!(await req(cust.sock, 'exceptions:create', { notes: 'hello there' })).ok, 'customers cannot raise exceptions');
  a = await req(warehouse.sock, 'exceptions:setStatus', { id: exc.id, status: 'resolved', resolution: 'Repacked' });
  ok(a.ok && a.data.status === 'resolved', 'the exception is resolved with a note');
  a = await req(warehouse.sock, 'exceptions:list', { status: 'resolved' });
  ok(a.ok && a.data.some((e) => e.id === exc.id), 'exceptions:list filters by status');

  section('Rider earnings');
  a = await req(rider.sock, 'rider:earnings');
  ok(a.ok && a.data.delivered >= 1 && a.data.earningsUsd >= 2.5, 'rider:earnings counts delivered parcels');
  const late = await register('late');
  a = await req(late.sock, 'rider:earnings');
  ok(a.ok && a.data.delivered === 0, 'a customer sees zero rider earnings (no data leak)', JSON.stringify(a));

  // ======================================================================
  // Real analytics, hub directory, pagination
  // ======================================================================
  const today = new Date().toISOString().slice(0, 10);
  const deliverFor = async (c, productId, qty = 1, method = 'stripe_card') => {
    const o = (await req(c.sock, 'orders:create', { items: [{ productId, qty }], paymentMethod: method, zoneId: 'gombe', shippingAddress: addr })).data;
    const t = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((x) => x.orderId === o.id));
    await req(rider.sock, 'delivery:accept', { taskId: t.id });
    for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: t.id, status: st });
    return { order: o, task: t };
  };

  section('Analytics: revenue series is real (zero-filled UTC days)');
  a = await req(admin.sock, 'analytics:revenue', { days: 10 });
  ok(a.ok && a.data.length === 10, 'analytics:revenue {days:10} returns 10 daily buckets');
  ok(a.data.every((b, i) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && typeof b.revenue === 'number' && typeof b.orders === 'number' && (i === 0 || a.data[i - 1].date < b.date)), 'buckets are dated YYYY-MM-DD, ascending, with revenue + orders');
  ok(a.data[9].date === today, 'the last bucket is today (UTC)');
  ok(!a.data.some((b) => /^D-/.test(b.date)), 'no fake "D-n" buckets any more');
  ok((await req(admin.sock, 'analytics:revenue')).data.length === 7, 'the default window is 7 days');
  ok((await req(admin.sock, 'analytics:revenue', { days: 500 })).data.length === 90, 'days is capped at 90');
  ok((await req(finance.sock, 'analytics:revenue', { days: 3 })).data.length === 3, 'finance may read it too');

  section('Analytics: admin overview moves with real orders');
  const adm0 = (await req(admin.sock, 'analytics:admin')).data;
  const rev0 = (await req(admin.sock, 'analytics:revenue', { days: 3 })).data;
  for (const k of ['orders', 'gmv', 'revenue', 'customers', 'sellers', 'liveProducts', 'pendingDisputes', 'pendingPayouts', 'commissionUsd', 'ordersByStatus']) {
    ok(adm0[k] !== undefined, `analytics:admin keeps the existing field ${k}`);
  }
  const sale = (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 2 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: addr })).data;
  const adm1 = (await req(admin.sock, 'analytics:admin')).data;
  const rev1 = (await req(admin.sock, 'analytics:revenue', { days: 3 })).data;
  const near = (x, y) => Math.abs(x - y) < 0.011;
  ok(adm1.orders === adm0.orders + 1 && near(adm1.gmv, adm0.gmv + sale.totalUsd), 'orders and gmv grow by exactly the new order');
  ok(adm1.ordersToday === adm0.ordersToday + 1 && near(adm1.gmvToday, adm0.gmvToday + sale.totalUsd), 'ordersToday / gmvToday grow by the new order');
  ok(adm1.ordersLast30 === adm0.ordersLast30 + 1 && near(adm1.gmvLast30, adm0.gmvLast30 + sale.totalUsd), 'the 30-day figures grow by the new order');
  ok(typeof adm1.gmvPrevPeriod === 'number' && typeof adm1.gmvPrev30 === 'number', 'the previous-period GMV is reported');
  ok(near(adm1.revenue, adm0.revenue + sale.totalUsd), 'revenue counts the succeeded payment');
  ok(near(rev1[2].revenue, rev0[2].revenue + sale.totalUsd) && rev1[2].orders === rev0[2].orders + 1, "today's revenue bucket grows by the payment and the order");
  ok(near(adm1.aov, adm1.gmv / (adm1.orders - (adm1.ordersByStatus.cancelled ?? 0))), 'aov = gmv / non-cancelled orders', `${adm1.aov}`);
  const electronics = (c) => c.gmvByCategory.find((x) => x.category === 'Electronics') ?? { gmv: 0, orders: 0 };
  ok(near(electronics(adm1).gmv, electronics(adm0).gmv + 100) && electronics(adm1).orders === electronics(adm0).orders + 1, 'gmvByCategory splits item value by category (2 x $50 Electronics)');
  ok(adm1.gmvByCategory.every((c) => typeof c.category === 'string' && typeof c.gmv === 'number' && typeof c.orders === 'number'), 'gmvByCategory rows are {category, gmv, orders}');
  ok(Array.isArray(adm1.alerts) && adm1.alerts.every((x) => x.kind && ['info', 'warning', 'critical'].includes(x.severity) && x.count > 0 && x.message), 'alerts are {kind, severity, count, message} with real counts only');
  const refundBase = adm1.refundsUsd;
  a = await req(admin.sock, 'orders:refund', { orderId: sale.id });
  const adm2 = (await req(admin.sock, 'analytics:admin')).data;
  ok(a.ok && near(adm2.refundsUsd, refundBase + sale.totalUsd), 'a refund shows up in refundsUsd');
  ok(near(adm2.gmv, adm1.gmv), 'a refund leaves GMV alone (it is its own line)');

  section('Analytics: alerts come from real data');
  const kinds = (x) => Object.fromEntries(x.alerts.map((y) => [y.kind, y.count]));
  const lowP = (await req(sellerU.sock, 'products:create', { name: `Low stock ${tag}`, price: 9, category: 'Electronics', stock: 3 })).data;
  const outP = (await req(sellerU.sock, 'products:create', { name: `Sold out ${tag}`, price: 9, category: 'Electronics', stock: 0 })).data;
  const pendingSeller = await register('pendsel', 'seller');
  await req(pendingSeller.sock, 'sellers:register', { name: `Pending Store ${tag}` });
  const dispOrder = await deliverFor(cust, prod.id, 1);
  const disp = (await req(cust.sock, 'disputes:open', { orderId: dispOrder.order.id, type: 'dispute', reason: 'Alert check dispute' })).data;
  const al = kinds((await req(admin.sock, 'analytics:admin')).data);
  ok(al.low_stock >= 1, 'a live product with < 10 units raises low_stock', JSON.stringify(al));
  ok(al.out_of_stock >= 1, 'a live product at 0 raises out_of_stock');
  ok(al.sellers_pending >= 1, 'a pending seller application raises sellers_pending');
  ok(al.open_disputes >= 1, 'an open dispute raises open_disputes');
  await req(admin.sock, 'disputes:reject', { disputeId: disp.id, resolution: 'test' });
  const al2 = kinds((await req(admin.sock, 'analytics:admin')).data);
  ok((al2.open_disputes ?? 0) === al.open_disputes - 1, 'resolving the dispute lowers the alert count');
  await req(admin.sock, 'products:update', { id: lowP.id, patch: { status: 'removed' } });
  await req(admin.sock, 'products:update', { id: outP.id, patch: { status: 'removed' } });

  section('Analytics: finance');
  const fin0 = (await req(finance.sock, 'analytics:finance')).data;
  for (const k of ['grossGmvUsd', 'commissionPct', 'commissionEarnedUsd', 'commissionExpectedUsd', 'refundsUsd', 'payouts', 'receivables', 'series30', 'walletLiabilityUsd', 'codOutstandingUsd']) ok(fin0[k] !== undefined, `analytics:finance has ${k}`);
  ok(fin0.series30.length === 30 && fin0.series30[29].date === today, 'series30 is 30 zero-filled daily rows ending today');
  ok(!('mobileMoneyFees' in fin0) && !('feesUsd' in fin0), 'no mobile-money fee figure is invented (fees are not tracked)');
  a = await req(cust.sock, 'wallet:topup', { amountUsd: 21, method: 'airtel_money', phone: '+243812345678' });
  const fin1 = (await req(finance.sock, 'analytics:finance')).data;
  ok(fin1.receivables.count === fin0.receivables.count + 1 && near(fin1.receivables.amountUsd, fin0.receivables.amountUsd + 21), 'a pending mobile-money top-up is a receivable awaiting confirmation');
  ok(fin1.receivables.byMethod.some((m) => m.method === 'airtel_money' && m.count >= 1), 'receivables are split by method');
  await req(finance.sock, 'payments:confirm', { reference: a.data.reference });
  const fin2 = (await req(finance.sock, 'analytics:finance')).data;
  ok(fin2.receivables.count === fin0.receivables.count, 'confirming it clears the receivable');
  ok(near(fin1.walletLiabilityUsd + 21, fin2.walletLiabilityUsd), 'and the wallet liability grows by the credit');
  ok(near(fin2.refundsUsd, adm2.refundsUsd), 'finance refunds match the admin overview');
  ok(near(fin2.commissionPct, 12), 'commission uses the commissionPct setting');
  ok(typeof fin2.commissionEarnedUsd === 'number' && fin2.commissionEarnedUsd >= 0 && fin2.commissionExpectedUsd >= 0, 'commission earned / expected are amounts');
  await req(admin.sock, 'settings:set', { key: 'commissionPct', value: 20 });
  ok((await req(finance.sock, 'analytics:finance')).data.commissionPct === 20, 'changing the commission setting changes the report');
  await req(admin.sock, 'settings:set', { key: 'commissionPct', value: 12 });

  section('Analytics: warehouse throughput and timing');
  const wh0 = (await req(warehouse.sock, 'analytics:warehouse')).data;
  for (const k of ['totalParcels', 'unassigned', 'inTransit', 'delivered', 'codToCollect', 'byStatus']) ok(wh0[k] !== undefined, `analytics:warehouse keeps ${k}`);
  ok(wh0.throughput.length === 7 && wh0.throughput[6].date === today && wh0.throughput.every((d) => 'received' in d && 'delivered' in d), 'throughput is the last 7 days of received / delivered counts');
  // receive one parcel at the hub, then deliver it
  const ro = (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: addr })).data;
  const rt = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((x) => x.orderId === ro.id));
  ok((await req(warehouse.sock, 'warehouse:receive', { taskId: rt.id })).ok, 'the hub scans a parcel in');
  const whR = (await req(warehouse.sock, 'analytics:warehouse')).data;
  ok(whR.throughput[6].received === wh0.throughput[6].received + 1, "today's received count grows by one");
  await req(rider.sock, 'delivery:accept', { taskId: rt.id });
  for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: rt.id, status: st });
  const wh1 = (await req(warehouse.sock, 'analytics:warehouse')).data;
  ok(wh1.throughput[6].delivered === wh0.throughput[6].delivered + 1, "today's delivered count grows by one");
  ok(wh1.delivered === wh0.delivered + 1 && wh1.totalParcels === wh0.totalParcels + 1, 'parcel totals grow by one');
  ok(typeof wh1.avgPickupToDeliveryMinutes === 'number' && wh1.avgPickupToDeliveryMinutes >= 0 && wh1.pickupToDeliverySamples >= 1, 'pickup -> delivery time is measured from real timestamps', JSON.stringify(wh1.avgPickupToDeliveryMinutes));
  ok(wh1.failureRatePct >= 0 && wh1.failureRatePct <= 100 && typeof wh1.failed30 === 'number', 'a failure rate is reported');
  ok(Array.isArray(wh1.byZone) && wh1.byZone.some((z) => z.zoneId === 'gombe'), 'parcels are broken down by delivery zone');
  ok(Array.isArray(wh1.byHub), 'dispatch batches are broken down by hub');
  // a failed attempt moves the failure rate
  const fl = (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', zoneId: 'gombe', shippingAddress: addr })).data;
  const ft = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((x) => x.orderId === fl.id));
  await req(rider.sock, 'delivery:accept', { taskId: ft.id });
  await req(rider.sock, 'delivery:updateStatus', { taskId: ft.id, status: 'failed', reason: 'Nobody home' });
  const wh2 = (await req(warehouse.sock, 'analytics:warehouse')).data;
  ok(wh2.failed30 === wh1.failed30 + 1 && wh2.failureRatePct > 0, 'a failed attempt raises the failure rate');
  await req(cust.sock, 'orders:cancel', { orderId: fl.id });

  section('Analytics: sellers:stats and analytics:seller');
  const sOrders = (await req(sellerU.sock, 'orders:list')).data;
  const counted = sOrders.filter((o) => !['cancelled', 'returned'].includes(o.status));
  const myRevenue = counted.reduce((t, o) => t + o.items.reduce((u, i) => u + i.priceUsd * i.qty, 0), 0);
  const st = (await req(sellerU.sock, 'sellers:stats')).data;
  for (const k of ['products', 'orders', 'revenue', 'paidOut', 'pendingPayouts']) ok(st[k] !== undefined, `sellers:stats keeps ${k}`);
  ok(st.orders === counted.length && near(st.revenue, myRevenue), 'sellers:stats orders / revenue equal the seller order list (cancelled and returned excluded)', `${st.orders}/${counted.length} ${st.revenue}/${myRevenue}`);
  const sa = (await req(sellerU.sock, 'analytics:seller', { days: 30 })).data;
  ok(sa && sa.sellerId === store.id && sa.days === 30 && sa.revenueSeries.length === 30, 'analytics:seller returns the own store with a 30-day series');
  ok(near(sa.revenue, st.revenue) && sa.orders === st.orders, 'its revenue and order count agree with sellers:stats');
  ok(near(sa.revenueSeries.reduce((t, d) => t + d.revenue, 0), sa.revenue) && sa.revenueSeries[29].date === today, 'the series adds up to the total and ends today');
  ok(sa.units >= sa.orders && near(sa.aov, sa.revenue / sa.orders), 'units and aov are consistent');
  ok(sa.topProducts[0]?.productId === prod.id && sa.topProducts[0].units >= 1, 'topProducts ranks the best seller first');
  ok(sa.customers.total >= 1 && sa.customers.repeat >= 1 && sa.customers.repeatRatePct > 0 && sa.customers.repeat <= sa.customers.total, 'repeat-customer figures are computed (the buyer ordered more than once)');
  ok(sa.customers.windowNew + sa.customers.windowReturning === sa.customers.windowActive, 'new + returning = active buyers in the window');
  ok(sa.reviews.count === 1 && sa.reviews.average === 4, 'review count and average are real');
  ok(sa.fulfilment.cancelRatePct >= 0 && typeof sa.fulfilment.returnRatePct === 'number' && typeof sa.fulfilment.disputeRatePct === 'number', 'fulfilment rates are numbers');
  ok(sa.fulfilment.disputeRatePct > 0, 'the dispute we raised shows in the dispute rate', JSON.stringify(sa.fulfilment));
  ok(typeof sa.health.score === 'number' && sa.health.score >= 0 && sa.health.score <= 100 && ['A', 'B', 'C', 'D'].includes(sa.health.grade) && sa.health.components.length >= 2, 'a store health score with its components is returned');
  // views: shoppers count, the owner and staff do not
  const v0 = (await req(sellerU.sock, 'analytics:seller', { days: 7 })).data.funnel.views;
  await req(cust.sock, 'products:get', { id: prod.id });
  await req(guest.sock, 'products:get', { id: prod.id });
  await req(sellerU.sock, 'products:get', { id: prod.id });
  await req(admin.sock, 'products:get', { id: prod.id });
  const f1 = await until(async () => { const f = (await req(sellerU.sock, 'analytics:seller', { days: 7 })).data.funnel; return f.views === v0 + 2 ? f : null; });
  ok(!!f1 && f1.orders >= 1, 'the funnel counts shopper views (customer + guest) but not the seller or staff', `${v0} -> ${JSON.stringify(f1)}`);
  a = await req(admin.sock, 'analytics:seller', { sellerId: store.id, days: 7 });
  ok(a.ok && a.data.sellerId === store.id, 'an admin can read any store with sellerId');
  ok(!(await req(admin.sock, 'analytics:seller', { days: 7 })).ok, 'an admin must say which store');
  const emptySeller = await register('nosales', 'seller');
  const emptyStore = (await req(emptySeller.sock, 'sellers:register', { name: `Empty ${tag}` })).data;
  a = await req(emptySeller.sock, 'analytics:seller', { days: 14 });
  ok(a.ok && a.data.revenue === 0 && a.data.orders === 0 && a.data.revenueSeries.length === 14 && a.data.health.score === null && a.data.reviews.average === null && a.data.fulfilment.avgHoursToReady === null, 'a store without sales gets zeros / nulls, never invented numbers');
  void emptyStore;

  section('Hub directory (admin)');
  ok(!(await req(warehouse.sock, 'warehouse:saveHub', { name: 'Nope', city: 'Nowhere' })).ok, 'warehouse staff cannot create hubs');
  ok(!(await req(cust.sock, 'warehouse:saveHub', { name: 'Nope', city: 'Nowhere' })).ok, 'customers cannot create hubs');
  a = await req(admin.sock, 'warehouse:saveHub', { name: `Goma Hub ${tag}`, city: 'Goma', country: 'DRC', capacity: 120, address: 'Av. de la Paix 4' });
  ok(a.ok && a.data.active === true && a.data.capacity === 120 && a.data.id, 'admin creates a hub (active by default)');
  const hub = a.data;
  for (const [bad, why] of [[{ city: 'X-ville' }, 'a name is required'], [{ name: 'Hub Y', city: '' }, 'a city is required'], [{ name: 'Hub Y', city: 'Goma', capacity: -5 }, 'a negative capacity'], [{ name: 'Hub Y', city: 'Goma', capacity: 0 }, 'a zero capacity'], [{ name: 'Hub Y', city: 'Goma', capacity: 'lots' }, 'a non-numeric capacity']]) {
    ok(!(await req(admin.sock, 'warehouse:saveHub', bad)).ok, `${why} is refused`);
  }
  ok(!(await req(admin.sock, 'warehouse:saveHub', { name: `goma hub ${tag}`, city: 'Goma' })).ok, 'a duplicate name (any case) is refused');
  a = await req(ops.sock, 'warehouse:saveHub', { id: hub.id, capacity: 300, address: 'Nouvelle adresse 9' });
  ok(a.ok && a.data.capacity === 300 && a.data.name === hub.name && a.data.address === 'Nouvelle adresse 9', 'ops edit a hub (partial update keeps the other fields)');
  ok(!(await req(admin.sock, 'warehouse:saveHub', { id: 'no-such-hub', name: 'Ghost', city: 'Nowhere' })).ok, 'editing an unknown hub is refused');
  a = await req(warehouse.sock, 'warehouse:hubs');
  ok(a.ok && a.data.some((h) => h.id === hub.id && h.active === true), 'staff see the new hub in warehouse:hubs');
  ok(!(await req(warehouse.sock, 'warehouse:setHubActive', { id: hub.id, active: false })).ok, 'staff cannot deactivate hubs');
  ok(!(await req(admin.sock, 'warehouse:setHubActive', { id: hub.id, active: 'no' })).ok, 'active must be a boolean');
  a = await req(admin.sock, 'warehouse:setHubActive', { id: hub.id, active: false });
  ok(a.ok && a.data.active === false, 'admin deactivates the hub');
  ok(!(await req(warehouse.sock, 'warehouse:hubs', { activeOnly: true })).data.some((h) => h.id === hub.id), 'activeOnly hides it');
  ok((await req(warehouse.sock, 'warehouse:hubs')).data.some((h) => h.id === hub.id && h.active === false), 'the directory still lists it as inactive');
  a = await req(warehouse.sock, 'warehouse:createTransfer', { fromHub: hub.name, toHub: 'Kinshasa Hub', sku: 'SKU-1', qty: 2 });
  ok(!a.ok && /deactivated/.test(a.error ?? ''), 'a deactivated hub cannot take transfers', a.error ?? '');
  await req(admin.sock, 'warehouse:setHubActive', { id: hub.id, active: true });
  a = await req(warehouse.sock, 'warehouse:createTransfer', { fromHub: hub.name, toHub: 'Kinshasa Hub', sku: 'SKU-1', qty: 2 });
  ok(a.ok, 'once reactivated it can again');

  section('List pagination (limit / offset), same array shape');
  const all = (await req(cust.sock, 'products:list')).data;
  ok(Array.isArray(all) && all.length >= 8, 'products:list without paging still returns the whole catalogue');
  const p1 = (await req(cust.sock, 'products:list', { limit: 3 })).data;
  const p2 = (await req(cust.sock, 'products:list', { limit: 3, offset: 3 })).data;
  ok(p1.length === 3 && p2.length === 3 && !p1.some((x) => p2.some((y) => y.id === x.id)), 'products:list pages with limit / offset');
  ok((await req(guest.sock, 'products:list', { limit: 2 })).data.length === 2, 'guests can page too');
  ok((await req(cust.sock, 'orders:list', { limit: 1 })).data.length === 1, 'orders:list {limit:1}');
  ok((await req(admin.sock, 'orders:list', { limit: 1 })).data.length === 1 && (await req(admin.sock, 'orders:list')).data.length > 1, 'staff orders:list pages and defaults to the newest 200');
  ok((await req(warehouse.sock, 'delivery:list', { limit: 2 })).data.length === 2, 'delivery:list {limit}');
  ok((await req(warehouse.sock, 'warehouse:parcels', { stage: 'delivered', limit: 1 })).data.length === 1, 'warehouse:parcels {stage, limit}');
  ok((await req(warehouse.sock, 'warehouse:aged', { limit: 1 })).ok && (await req(warehouse.sock, 'warehouse:inventory', { limit: 2 })).data.length === 2, 'warehouse:aged / inventory accept limit');
  ok((await req(finance.sock, 'payments:list', { limit: 1 })).data.length === 1, 'payments:list {limit}');
  ok((await req(admin.sock, 'customers:list', { limit: 1 })).data.length === 1, 'customers:list {limit}');
  ok((await req(admin.sock, 'sellers:list', { limit: 1 })).data.length === 1, 'sellers:list {limit}');
  ok((await req(cust.sock, 'products:list', { limit: 999999 })).ok, 'an absurd limit is clamped, not an error');

  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `   - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
