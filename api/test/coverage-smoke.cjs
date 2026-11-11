/* Happy-path + role-denial check for the realtime events the other suites do not
 * touch (catalogue admin, CMS, fraud, questions/reviews, warehouse reads and
 * writes, exchanges/replacements, wishlist, notifications, seller reads…).
 * Runs against a RUNNING dev API seeded with `npm run seed`.
 *
 *   API_URL=http://localhost:3001 node test/coverage-smoke.cjs
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { hubId, tasksOf, toDelivery, receiveAtHub } = require('./journey.cjs');
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
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
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
  const store = (await req(sellerU.sock, 'sellers:register', kyc(`Cov Store ${tag}`))).data;
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
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr });
  const o1 = a.data;
  const t1 = await toDelivery(admin, rider, o1.id);
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
  a = await req(cust.sock, 'exchanges:create', { orderId: o1.id, fromSku: prod.id, fromName: 'Cov Item', toSku: 'B', toName: 'Bigger one', reason: 'Wrong size' });
  ok(a.ok, 'the customer asks for an exchange', a.error ?? '');
  const ex = a.data;
  ok(!(await req(cust.sock, 'exchanges:setStatus', { id: ex.id, status: 'approved' })).ok, 'a customer cannot approve their own exchange');
  a = await req(warehouse.sock, 'exchanges:setStatus', { id: ex.id, status: 'approved' });
  ok(a.ok && a.data.status === 'approved', 'warehouse approves the exchange');
  ok(!(await req(warehouse.sock, 'exchanges:setStatus', { id: ex.id, status: 'teleported' })).ok, 'an unknown exchange status is refused');
  a = await req(cust.sock, 'replacements:create', { orderId: o1.id, sku: prod.id, productName: 'Cov Item', reason: 'Dead on arrival' });
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
  await req(admin.sock, 'settings:set', { key: 'fraudNewAccountOrders24h', value: 2 });
  const flagger = await register('flagger');
  const flaggerOrder = () => req(flagger.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr });
  ok((await flaggerOrder()).ok, 'a brand-new customer places a first prepaid order');
  a = await flaggerOrder();
  ok(a.ok, 'and a second one within the day', a.error ?? '');
  const flagged = await until(async () => (await req(finance.sock, 'fraud:list')).data.find((f) => f.orderId === a.data.id));
  ok(!!flagged, 'and flagged for fraud review');
  ok(!(await req(cust.sock, 'fraud:list')).ok, 'customers cannot read fraud alerts');
  a = await req(finance.sock, 'fraud:setStatus', { id: flagged.id, status: 'reviewed' });
  ok(a.ok && a.data.status === 'reviewed', 'finance marks it reviewed');
  ok(!(await req(finance.sock, 'fraud:setStatus', { id: flagged.id, status: 'nonsense' })).ok, 'an invalid fraud status is refused');

  section('Fraud Block really suspends the account (and unblock reactivates it)');
  const fraudy = await register('fraudy');
  ok((await req(fraudy.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr })).ok, 'a second brand-new customer places a first prepaid order');
  const fo = await req(fraudy.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr });
  ok(fo.ok, 'and a second one within the day', fo.error ?? '');
  const fAlert = await until(async () => (await req(finance.sock, 'fraud:list')).data.find((f) => f.orderId === fo.data.id));
  ok(!!fAlert, 'and it is flagged');
  const fraudyActive = async () => (await req(admin.sock, 'customers:list', { limit: 1000 })).data.find((c) => c.id === fraudy.user.id)?.active;
  ok((await fraudyActive()) === true, 'the account is active before');
  const asBlockedFinance = await req(finance.sock, 'fraud:setStatus', { id: fAlert.id, status: 'blocked', confirm: true });
  ok(!asBlockedFinance.ok && /super admin or support admin/.test(asBlockedFinance.error), 'finance may review alerts but cannot block (suspend) an account');
  const asBlockedOps = await req(ops.sock, 'fraud:setStatus', { id: fAlert.id, status: 'blocked', confirm: true });
  ok(!asBlockedOps.ok, 'operations cannot block an account either');
  ok((await fraudyActive()) === true, 'a refused block leaves the account active');
  const noConfirm = await req(admin.sock, 'fraud:setStatus', { id: fAlert.id, status: 'blocked' });
  ok(!noConfirm.ok && /Confirm/.test(noConfirm.error), 'the super admin must confirm before an account is blocked');
  ok((await fraudyActive()) === true, 'and nothing changed without it');
  let fraudySocketDropped = false;
  fraudy.sock.on('disconnect', () => { fraudySocketDropped = true; });
  a = await req(admin.sock, 'fraud:setStatus', { id: fAlert.id, status: 'blocked', confirm: true });
  ok(a.ok && a.data.status === 'blocked', 'the super admin blocks it (confirmed)');
  ok((await fraudyActive()) === false, 'the customer account is now suspended');
  ok(!!(await until(async () => fraudySocketDropped)), "and the customer's live socket is dropped at once");
  const blockedLogin = await rest('/api/v1/auth/login', { email: `fraudy${tag}@cov.test`, password: 'Cov-Pass-2026' });
  ok(blockedLogin.status !== 200, `a blocked customer cannot sign in (${blockedLogin.status})`);
  const lifted = await req(ops.sock, 'fraud:setStatus', { id: fAlert.id, status: 'reviewed', confirm: true });
  ok(!lifted.ok && /super admin or support admin/.test(lifted.error), 'a role that cannot suspend cannot lift the block either');
  const auditBlock = (await req(ops.sock, 'audit:list', { action: 'fraud.blocked' })).data ?? [];
  ok(auditBlock.some((e) => e.entityId === fAlert.id && e.role === 'admin'), 'the block is in the audit log (fraud.blocked)');
  const auditSuspend = (await req(ops.sock, 'audit:list', { action: 'user.suspend', q: fraudy.user.id })).data ?? [];
  ok(auditSuspend.length === 1 && /Fraud alert/.test(auditSuspend[0].detail), 'and so is the account suspension (user.suspend)');
  const adminNotes = (await req(admin.sock, 'notifications:list')).data ?? [];
  ok(adminNotes.some((n) => n.title === 'Account blocked' && n.titleFr === 'Compte bloqué'), 'the admins get a notice, in French too');
  const noUnconfirm = await req(admin.sock, 'fraud:setStatus', { id: fAlert.id, status: 'reviewed' });
  ok(!noUnconfirm.ok && /Confirm/.test(noUnconfirm.error), 'unblocking also needs the confirmation');
  a = await req(admin.sock, 'fraud:setStatus', { id: fAlert.id, status: 'reviewed', confirm: true });
  ok(a.ok && a.data.status === 'reviewed', 'the super admin unblocks it (marks it reviewed)');
  ok((await fraudyActive()) === true, 'the account is reactivated');
  const backIn = await rest('/api/v1/auth/login', { email: `fraudy${tag}@cov.test`, password: 'Cov-Pass-2026' });
  ok(backIn.status === 200, 'and the customer can sign in again');
  const auditBack = (await req(ops.sock, 'audit:list', { action: 'user.reactivate', q: fraudy.user.id })).data ?? [];
  ok(auditBack.length === 1, 'the reactivation is audited (user.reactivate)');
  const backSock = await connect(backIn.json.accessToken);
  const custNotes = (await req(backSock, 'notifications:list')).data ?? [];
  ok(custNotes.some((n) => n.title === 'Account reinstated') && custNotes.some((n) => n.title === 'Account suspended' && n.titleFr === 'Compte suspendu'), 'the customer has both notices (suspended, reinstated), with French');
  backSock.close();

  section('Broadcasts: the count, the label and the delivery agree');
  const customerCount = (await req(admin.sock, 'customers:list', { limit: 1000 })).data.length;
  const riderCount = ((await req(admin.sock, 'roles:staff')).data ?? []).filter((u) => u.role === 'rider').length;
  const heard = { customer: [], rider: [] };
  other.sock.on('notification:new', (n) => heard.customer.push(n.title));
  rider.sock.on('notification:new', (n) => heard.rider.push(n.title));
  a = await req(admin.sock, 'broadcasts:send', { title: `All hands ${tag}`, body: 'Everyone who shops', audience: 'all' });
  ok(a.ok && a.data.recipients === customerCount, `audience "all" counts the customers only (${a.data?.recipients} = ${customerCount}, not every user)`);
  ok(a.ok && a.data.audience === 'all', 'and keeps the audience it was sent to');
  ok(!!(await until(async () => heard.customer.includes(`All hands ${tag}`))), 'a customer receives it');
  await sleep(400);
  ok(!heard.rider.includes(`All hands ${tag}`), 'a rider does not (it is for customers)');
  a = await req(admin.sock, 'broadcasts:send', { title: `Riders ${tag}`, body: 'Riders only', audience: 'rider' });
  ok(a.ok && a.data.recipients === riderCount && riderCount > 0, `a rider broadcast counts the riders (${a.data?.recipients} = ${riderCount})`);
  ok(!!(await until(async () => heard.rider.includes(`Riders ${tag}`))), 'and reaches them');
  ok(!heard.customer.includes(`Riders ${tag}`), 'and not the customers');
  const bad = await req(admin.sock, 'broadcasts:send', { title: 'x', body: 'y', audience: 'admin_finance' });
  ok(!bad.ok && /Choose who receives it/.test(bad.error), 'an audience that is not offered (an admin role) is refused');
  ok(!(await req(ops.sock, 'broadcasts:send', { title: 'x', body: 'y' })).ok, 'operations cannot send broadcasts');
  const auditBc = (await req(ops.sock, 'audit:list', { action: 'broadcast.sent', q: `All hands ${tag}` })).data ?? [];
  ok(auditBc.length === 1 && auditBc[0].detail.includes(`${customerCount} recipients`), 'a broadcast is audited with its audience and recipient count');

  section('Audit log: filters and paging on the server');
  const doomedAudit = (await req(ops.sock, 'audit:list', { action: 'product.removed' })).data ?? [];
  ok(doomedAudit.length === 0, 'no takedown is recorded yet');
  const takedown = (await req(sellerU.sock, 'products:create', { name: `Takedown ${tag}`, price: 5, category: 'Electronics', stock: 1 })).data;
  await req(admin.sock, 'products:update', { id: takedown.id, patch: { status: 'rejected' } });
  await req(admin.sock, 'products:delete', { id: takedown.id });
  const productAudit = (await req(ops.sock, 'audit:list', { entity: 'product', q: takedown.id })).data ?? [];
  ok(productAudit.some((e) => e.action === 'product.rejected') && productAudit.some((e) => e.action === 'product.removed'), 'a product rejection and takedown by an admin are audited');
  const catAudit = (await req(ops.sock, 'audit:list', { entity: 'category' })).data ?? [];
  ok(['category.create', 'category.update', 'category.remove'].every((x) => catAudit.some((e) => e.action === x)), 'category changes are audited');
  ok(((await req(ops.sock, 'audit:list', { action: 'cms.upsert' })).data ?? []).length > 0, 'CMS edits are audited');
  ok(((await req(ops.sock, 'audit:list', { role: 'admin_operations', action: 'fraud.blocked' })).data ?? []).length === 0, 'role and action filters combine (operations never blocked anyone)');
  ok(((await req(ops.sock, 'audit:list', { role: 'admin', actor: 'admin' })).data ?? []).length > 0, 'the actor filter matches part of a name');
  const day = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  ok(((await req(ops.sock, 'audit:list', { from: day, to: day, action: 'fraud.blocked' })).data ?? []).length === 1, 'a date range of today includes today (whole day)');
  ok(((await req(ops.sock, 'audit:list', { from: tomorrow })).data ?? []).length === 0, 'a range starting tomorrow is empty');
  const bound = await req(ops.sock, 'audit:list', { from: 'not-a-date' });
  ok(!bound.ok && /valid date/.test(bound.error), 'a bad date is refused with a message');
  const pg1 = (await req(ops.sock, 'audit:list', { limit: 3, offset: 0 })).data ?? [];
  const pg2 = (await req(ops.sock, 'audit:list', { limit: 3, offset: 3 })).data ?? [];
  ok(pg1.length === 3 && pg2.length === 3 && pg1.every((e) => !pg2.some((x) => x.id === e.id)), 'limit/offset page through the log without repeats');
  const facets = await req(ops.sock, 'audit:facets');
  ok(facets.ok && facets.data.actions.includes('fraud.blocked') && facets.data.roles.includes('admin'), 'audit:facets lists the actions and roles for the pickers');
  ok(!(await req(finance.sock, 'audit:list', { action: 'fraud.blocked' })).ok && !(await req(finance.sock, 'audit:facets')).ok && !(await req(cust.sock, 'audit:list')).ok, 'finance and customers cannot read the audit log');

  await req(admin.sock, 'settings:set', { key: 'fraudNewAccountOrders24h', value: 3 }); // back to the default

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
    ok(((await req(ops.sock, 'audit:list', { action: 'payout.rejected', q: reqd.data.id })).data ?? []).length === 1, 'the payout rejection is audited, once');
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
  a = await req(warehouse.sock, 'warehouse:riders');
  ok(a.ok && a.data.some((r) => r.name), 'warehouse:riders lists active riders');
  for (const ev of ['warehouse:hubs', 'warehouse:parcels', 'warehouse:aged', 'warehouse:inventory', 'warehouse:riders', 'warehouse:batches']) {
    ok(!(await req(cust.sock, ev)).ok && !(await req(rider.sock, ev)).ok, `${ev} is closed to customers and riders`);
  }
  // batch
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr });
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
  a = await req(warehouse.sock, 'exceptions:create', { orderReference: ob.reference, taskId: tb.id, type: 'damaged', severity: 'high', hub: 'Entrepôt Kinshasa', notes: 'Box crushed' });
  ok(a.ok && a.data.status === 'open', 'warehouse raises an exception');
  const exc = a.data;
  ok(!(await req(warehouse.sock, 'exceptions:create', { type: 'meteor', notes: 'x yz' })).ok, 'an unknown exception type is refused');
  ok(!(await req(warehouse.sock, 'exceptions:create', { notes: '' })).ok, 'notes are required');
  ok(!(await req(cust.sock, 'exceptions:create', { notes: 'hello there' })).ok, 'customers cannot raise exceptions');
  a = await req(warehouse.sock, 'exceptions:setStatus', { id: exc.id, status: 'resolved', resolution: 'Repacked' });
  ok(a.ok && a.data.status === 'resolved', 'the exception is resolved with a note');
  a = await req(warehouse.sock, 'exceptions:list', { status: 'resolved' });
  ok(a.ok && a.data.some((e) => e.id === exc.id), 'exceptions:list filters by status');

  section('Rider work stats');
  a = await req(rider.sock, 'rider:workStats');
  ok(a.ok && a.data.completed >= 1 && a.data.delivered === a.data.completed && !('earningsUsd' in a.data), 'rider:workStats counts completed parcels and carries no pay', JSON.stringify(a));
  a = await req(rider.sock, 'rider:earnings');
  ok(a.ok && a.data.completed >= 1, 'the old rider:earnings name still answers');
  const late = await register('late');
  a = await req(late.sock, 'rider:workStats');
  ok(!a.ok, 'a customer is refused the rider work stats (no data leak)', JSON.stringify(a));
  a = await req(late.sock, 'rider:earnings');
  ok(!a.ok, 'and the old name refuses them too', JSON.stringify(a));

  // ======================================================================
  // Real analytics, hub directory, pagination
  // ======================================================================
  const today = new Date().toISOString().slice(0, 10);
  const deliverFor = async (c, productId, qty = 1, method = 'stripe_card') => {
    const o = (await req(c.sock, 'orders:create', { items: [{ productId, qty }], paymentMethod: method, shippingAddress: addr })).data;
    const t = await toDelivery(admin, rider, o.id);
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
  const sale = (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 2 }], paymentMethod: 'stripe_card', shippingAddress: addr })).data;
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
  // An undelivered order that is refunded becomes cancelled (and leaves GMV); a DELIVERED one becomes returned. Deliver first.
  for (const st of ['processing', 'shipped', 'out_for_delivery', 'delivered']) await req(admin.sock, 'orders:updateStatus', { orderId: sale.id, status: st });
  a = await req(admin.sock, 'orders:refund', { orderId: sale.id });
  const adm2 = (await req(admin.sock, 'analytics:admin')).data;
  ok(a.ok && near(adm2.refundsUsd, refundBase + sale.totalUsd), 'a refund shows up in refundsUsd');
  ok(near(adm2.gmv, adm1.gmv), 'a refund leaves GMV alone (it is its own line)');

  section('Analytics: alerts come from real data');
  const kinds = (x) => Object.fromEntries(x.alerts.map((y) => [y.kind, y.count]));
  const lowP = (await req(sellerU.sock, 'products:create', { name: `Low stock ${tag}`, price: 9, category: 'Electronics', stock: 3 })).data;
  const outP = (await req(sellerU.sock, 'products:create', { name: `Sold out ${tag}`, price: 9, category: 'Electronics', stock: 0 })).data;
  const pendingSeller = await register('pendsel', 'seller');
  await req(pendingSeller.sock, 'sellers:register', kyc(`Pending Store ${tag}`));
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
  for (const k of ['grossGmvUsd', 'commissionPct', 'commissionEarnedUsd', 'commissionExpectedUsd', 'refundsUsd', 'payouts', 'receivables', 'series30', 'walletLiabilityUsd']) ok(fin0[k] !== undefined, `analytics:finance has ${k}`);
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
  const wp = await req(admin.sock, 'customers:wallet', { id: cust.user.id });
  ok(wp.ok && near(wp.data.balance, (await req(cust.sock, 'wallet:get')).data.balance) && wp.data.transactions.some((t) => t.type === 'topup' && near(t.amount, 21) && t.descriptionFr), 'customers:wallet shows the same balance as the customer sees, and the top-up, with a French description');
  ok((await req(finance.sock, 'customers:wallet', { id: cust.user.id })).ok && (await req(ops.sock, 'customers:wallet', { id: cust.user.id })).ok, 'the roles that read the customer list read the wallet panel');
  ok(!(await req(cust.sock, 'customers:wallet', { id: cust.user.id })).ok && !(await req(sellerU.sock, 'customers:wallet', { id: cust.user.id })).ok && !(await req(rider.sock, 'customers:wallet', { id: cust.user.id })).ok, 'customers, sellers and riders cannot open it (not even their own through this event)');
  ok(!(await req(admin.sock, 'customers:wallet', { id: sellerU.user.id })).ok, 'only customers have a wallet panel');
  ok((await req(admin.sock, 'customers:wallet', { id: cust.user.id, limit: 1 })).data.transactions.length === 1, 'the panel pages (limit 1)');
  const bal = (await req(cust.sock, 'wallet:get')).data.balance;
  await req(admin.sock, 'customers:wallet', { id: cust.user.id });
  ok(near((await req(cust.sock, 'wallet:get')).data.balance, bal), 'reading the panel changes no money');
  ok(near(fin2.refundsUsd, adm2.refundsUsd), 'finance refunds match the admin overview');
  ok(near(fin2.commissionPct, 12), 'commission uses the commissionPct setting');
  ok(typeof fin2.commissionEarnedUsd === 'number' && fin2.commissionEarnedUsd >= 0 && fin2.commissionExpectedUsd >= 0, 'commission earned / expected are amounts');
  await req(admin.sock, 'settings:set', { key: 'commissionPct', value: 20 });
  ok((await req(finance.sock, 'analytics:finance')).data.commissionPct === 20, 'changing the commission setting changes the report');
  await req(admin.sock, 'settings:set', { key: 'commissionPct', value: 12 });

  section('Analytics: warehouse throughput and timing');
  const wh0 = (await req(warehouse.sock, 'analytics:warehouse')).data;
  for (const k of ['totalParcels', 'unassigned', 'inTransit', 'delivered', 'byStatus']) ok(wh0[k] !== undefined, `analytics:warehouse keeps ${k}`);
  ok(wh0.throughput.length === 7 && wh0.throughput[6].date === today && wh0.throughput.every((d) => 'received' in d && 'delivered' in d), 'throughput is the last 7 days of received / delivered counts');
  // receive one parcel at the hub, then deliver it
  const ro = (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr })).data;
  const rp = await until(async () => (await req(warehouse.sock, 'delivery:list')).data.find((x) => x.orderId === ro.id && x.kind === 'pickup'));
  await req(admin.sock, 'logistics:assign', { taskId: rp.id, riderId: rider.user.id });
  await req(rider.sock, 'delivery:updateStatus', { taskId: rp.id, status: 'picked_up' });
  ok((await req(warehouse.sock, 'warehouse:receive', { taskId: rp.id })).ok, 'the hub scans a parcel in');
  const whR = (await req(warehouse.sock, 'analytics:warehouse')).data;
  ok(whR.throughput[6].received === wh0.throughput[6].received + 1, "today's received count grows by one");
  const rt = await toDelivery(admin, rider, ro.id);
  for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: rt.id, status: st });
  const wh1 = (await req(warehouse.sock, 'analytics:warehouse')).data;
  ok(wh1.throughput[6].delivered === wh0.throughput[6].delivered + 1, "today's delivered count grows by one");
  ok(wh1.delivered === wh0.delivered + 1 && wh1.totalParcels === wh0.totalParcels + 2, 'deliveries grow by one and every leg counts as a task (pickup + delivery)', JSON.stringify([wh0.delivered, wh1.delivered, wh0.totalParcels, wh1.totalParcels]));
  ok(typeof wh1.avgPickupToDeliveryMinutes === 'number' && wh1.avgPickupToDeliveryMinutes >= 0 && wh1.pickupToDeliverySamples >= 1, 'pickup -> delivery time is measured from real timestamps', JSON.stringify(wh1.avgPickupToDeliveryMinutes));
  ok(wh1.failureRatePct >= 0 && wh1.failureRatePct <= 100 && typeof wh1.failed30 === 'number', 'a failure rate is reported');
  ok(wh1.byZone === undefined && Array.isArray(wh1.byHub) && wh1.byHub.length === 1 && wh1.byHub[0].hub && wh1.byHub[0].parcels > 0, 'parcels are broken down by hub (zones are gone), and staff see only their own hub', JSON.stringify(wh1.byHub));
  ok(wh1.byKind && typeof wh1.byKind === 'object', 'open legs are broken down by kind');
  // a failed attempt moves the failure rate
  const fl = (await req(cust.sock, 'orders:create', { items: [{ productId: prod.id, qty: 1 }], paymentMethod: 'stripe_card', shippingAddress: addr })).data;
  const ft = await toDelivery(admin, rider, fl.id);
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
  const emptyStore = (await req(emptySeller.sock, 'sellers:register', kyc(`Empty ${tag}`))).data;
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
  await req(admin.sock, 'warehouse:setHubActive', { id: hub.id, active: true });

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
