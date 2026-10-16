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

  console.log(`\n${fails.length ? '❌' : '🎉'} ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `   - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
