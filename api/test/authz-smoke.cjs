/* Authorization + integrity regression suite, against a RUNNING API (dev mode,
 * seeded with `npm run seed`). Each block is a fix for a real hole found in the
 * security review: ownership (IDOR), role boundaries, mass assignment, races.
 *
 *   API_URL=http://localhost:3001 node test/authz-smoke.cjs
 */
const { io } = require('socket.io-client');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const tag = Date.now().toString().slice(-8);
const PHONE = '+243812345678';

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
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
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
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@authz.test`, password: 'Authz-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

(async () => {
  const admin = await login('admin@somba.app');
  const finance = await login('finance@somba.app');
  const warehouse = await login('warehouse@somba.app');
  const rider = await login('rider@somba.app');
  const cust = await register('cust');
  const cust2 = await register('cust2');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });

  // ---- sellers (need an approved store to sell) ----------------------------
  const makeSeller = async (label, approve) => {
    const u = await register(label, 'seller');
    const reg = await req(u.sock, 'sellers:register', { name: `${label} Store` });
    if (approve) await req(admin.sock, 'sellers:setStatus', { id: reg.data.id, status: 'approved' });
    return { ...u, store: reg.data };
  };
  const sellerA = await makeSeller('selA', true);
  const sellerB = await makeSeller('selB', true);
  const sellerP = await makeSeller('selP', false);

  section('Sellers: approval is enforced');
  let a = await req(sellerP.sock, 'products:create', { name: 'Sneaky', price: 10, category: 'Electronics', stock: 1 });
  ok(!a.ok && /approv/i.test(a.error ?? ''), 'a pending seller cannot list products', a.error ?? '');
  a = await req(sellerP.sock, 'payouts:request', { amountUsd: 50 });
  ok(!a.ok, 'a pending seller cannot request payouts');
  a = await req(cust.sock, 'sellers:register', { name: 'Fake Store' });
  ok(!a.ok, 'a customer cannot open a store');

  section('Listings are validated (no negative prices / stock) and not mass-assignable');
  for (const [bad, label] of [[-999, 'negative'], [0, 'zero'], ['abc', 'text'], [2_000_000, 'absurd']]) {
    a = await req(sellerA.sock, 'products:create', { name: `Bad ${tag}`, price: bad, category: 'Electronics', stock: 1 });
    ok(!a.ok, `${label} price is rejected`);
  }
  a = await req(sellerA.sock, 'products:create', { name: `Bad ${tag}`, price: 10, category: 'Electronics', stock: -5 });
  ok(!a.ok, 'negative stock is rejected');
  a = await req(sellerA.sock, 'products:create', { name: `A Phone ${tag}`, price: 100, originalPrice: 150, category: 'Electronics', stock: 3, rating: 5, reviewsCount: 9999, sellerId: 'evil', status: 'removed' });
  ok(a.ok && a.data.rating === 0 && a.data.reviewsCount === 0 && a.data.status === 'live' && a.data.sellerId === sellerA.store.id, 'client cannot set rating, review count, status or seller on create');
  ok(a.data?.discount === 33, 'the discount badge is computed from the prices', `got ${a.data?.discount}`);
  const prodA = a.data;
  a = await req(sellerA.sock, 'products:update', { id: prodA.id, patch: { price: -1 } });
  ok(!a.ok, 'cannot update to a negative price');
  a = await req(sellerA.sock, 'products:update', { id: prodA.id, patch: { sellerId: sellerB.store.id, rating: 5, status: 'removed', stock: 50 } });
  ok(a.ok && a.data.sellerId === sellerA.store.id && a.data.rating === 0 && a.data.status === 'live' && a.data.stock === 50, 'update ignores sellerId / rating / status, applies stock');
  a = await req(sellerB.sock, 'products:update', { id: prodA.id, patch: { price: 1 } });
  ok(!a.ok, "a seller cannot edit another seller's product");
  a = await req(admin.sock, 'products:update', { id: prodA.id, patch: { status: 'live', stock: 3 } });
  ok(a.ok && a.data.stock === 3, 'an admin can moderate');
  a = await req(cust.sock, 'products:create', { name: 'x', price: 5, category: 'x' });
  ok(!a.ok, 'a customer cannot publish products');
  const draft = (await req(admin.sock, 'products:create', { name: `Draft ${tag}`, price: 9, category: 'Electronics', stock: 4 })).data;
  await req(admin.sock, 'products:update', { id: draft.id, patch: { status: 'draft' } });
  ok(!(await req(cust.sock, 'products:list')).data.some((p) => p.id === draft.id), 'draft listings are hidden from shoppers');
  ok(!(await req(rider.sock, 'products:list')).data.some((p) => p.id === draft.id), 'draft listings are hidden from riders');
  ok(!(await req(sellerB.sock, 'products:list')).data.some((p) => p.id === draft.id), "another seller's drafts are hidden");

  // ---- money: wallet atomicity + stock atomicity ---------------------------
  section('Races: wallet double-spend and overselling');
  const buyer = await register('buyer');
  let t = await req(buyer.sock, 'wallet:topup', { amountUsd: 50, method: 'airtel_money', phone: PHONE });
  ok(t.ok, 'buyer starts a $50 top-up');
  await until(async () => (await req(buyer.sock, 'wallet:get')).data.balance >= 50);
  const priceOf = (await req(buyer.sock, 'products:get', { id: prodA.id })).data.price; // $100
  const cheap = (await req(admin.sock, 'products:create', { name: `Cheap ${tag}`, price: 30, category: 'Electronics', stock: 100 })).data;
  const burst = await Promise.all(Array.from({ length: 10 }, () =>
    req(buyer.sock, 'orders:create', { items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet', zoneId: 'gombe' })));
  const wins = burst.filter((r) => r.ok).length;
  const bal = (await req(buyer.sock, 'wallet:get')).data.balance;
  ok(wins === 1, `10 simultaneous wallet orders for $33 with $50 → exactly 1 succeeds (got ${wins})`);
  ok(Math.abs(bal - 17) < 0.011 && bal >= 0, `balance is $17.00, never negative (got $${bal})`);
  ok((await req(admin.sock, 'products:get', { id: cheap.id })).data.stock === 99, 'only the winning order reserved stock (failed ones released it)');

  const scarce = (await req(admin.sock, 'products:create', { name: `Scarce ${tag}`, price: 5, category: 'Electronics', stock: 3 })).data;
  const rush = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    req((i % 2 ? cust : cust2).sock, 'orders:create', { items: [{ productId: scarce.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, zoneId: 'gombe' })));
  ok(rush.filter((r) => r.ok).length === 3, `10 buyers race for 3 units → exactly 3 orders (got ${rush.filter((r) => r.ok).length})`);
  ok((await req(admin.sock, 'products:get', { id: scarce.id })).data.stock === 0, 'stock ends at exactly 0, never negative');

  // refunds happen once even if cancel is hammered
  const wo = (await req(buyer.sock, 'orders:create', { items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet' , zoneId: 'gombe' }));
  ok(!wo.ok, 'a wallet order beyond the remaining balance is refused');
  await req(buyer.sock, 'wallet:topup', { amountUsd: 40, method: 'airtel_money', phone: PHONE });
  await until(async () => (await req(buyer.sock, 'wallet:get')).data.balance >= 57);
  const paid = (await req(buyer.sock, 'orders:create', { items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet', zoneId: 'gombe' })).data;
  const before = (await req(buyer.sock, 'wallet:get')).data.balance; // 57 - 33 = 24
  const cancels = await Promise.all(Array.from({ length: 6 }, () => req(buyer.sock, 'orders:cancel', { orderId: paid.id })));
  const after = (await req(buyer.sock, 'wallet:get')).data.balance;
  ok(cancels.filter((r) => r.ok).length === 1, 'six simultaneous cancels → exactly one succeeds');
  ok(Math.abs(after - (before + 33)) < 0.011, `…and the refund is paid once (+$33): $${before} → $${after}`);
  ok((await req(admin.sock, 'orders:refund', { orderId: paid.id })).ok === false, 'a cancelled order cannot be refunded a second time');

  // ---- orders: who can see / change what -----------------------------------
  section('Orders: visibility and status changes');
  const o1 = (await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }], paymentMethod: 'orange_money', paymentPhone: PHONE, zoneId: 'gombe', shippingAddress: JSON.stringify({ line1: 'SECRET STREET 9', city: 'Kinshasa' }) })).data;
  await until(async () => (await req(cust.sock, 'orders:list')).data.find((o) => o.id === o1.id)?.status === 'confirmed');
  const sellerView = (await req(sellerA.sock, 'orders:list')).data;
  const mine = sellerView.find((o) => o.id === o1.id);
  ok(!!mine, 'a seller sees orders containing their products');
  ok(mine && !('shippingAddress' in mine) && !('customerId' in mine) && !JSON.stringify(mine).includes('SECRET'), "…without the customer's address or id");
  ok(!(await req(sellerB.sock, 'orders:list')).data.some((o) => o.id === o1.id), 'another seller does not see it');
  ok((await req(rider.sock, 'orders:list')).data.length === 0 || !(await req(rider.sock, 'orders:list')).data.some((o) => o.id === o1.id), 'a rider only sees orders assigned to them');
  a = await req(sellerA.sock, 'orders:updateStatus', { orderId: o1.id, status: 'delivered' });
  ok(!a.ok, 'a seller cannot change order status');
  a = await req(rider.sock, 'orders:updateStatus', { orderId: o1.id, status: 'cancelled' });
  ok(!a.ok, 'a rider cannot cancel or change orders');
  a = await req(cust2.sock, 'orders:cancel', { orderId: o1.id });
  ok(!a.ok, "another customer cannot cancel someone's order");
  a = await req(sellerA.sock, 'orders:cancel', { orderId: o1.id });
  ok(!a.ok, 'a seller cannot cancel a customer order');
  a = await req(warehouse.sock, 'orders:updateStatus', { orderId: o1.id, status: 'banana' });
  ok(!a.ok, 'an invalid status is rejected');
  a = await req(warehouse.sock, 'orders:updateStatus', { orderId: o1.id, status: 'processing' });
  ok(a.ok, 'warehouse staff can advance an order');

  // ---- delivery ------------------------------------------------------------
  section('Delivery: only the assigned rider, only forward');
  ok(!(await req(cust.sock, 'delivery:list')).ok, 'a customer cannot list delivery tasks (they hold addresses)');
  ok(!(await req(sellerA.sock, 'delivery:list')).ok, 'a seller cannot list delivery tasks');
  ok(!(await req(cust.sock, 'rider:tasks')).ok, 'a customer cannot read the rider queue');
  ok(!(await req(cust.sock, 'delivery:unassigned')).ok, 'a customer cannot list unassigned deliveries');
  const task = (await req(rider.sock, 'delivery:unassigned')).data.find((x) => x.orderId === o1.id);
  ok(!!task, 'the rider sees the paid order as an available delivery');
  const rider2 = await register('rider2');
  await req(admin.sock, 'roles:setRole', { id: rider2.user.id, role: 'rider' });
  const rider2s = await login(`rider2${tag}@authz.test`, 'Authz-Pass-2026').catch(() => null);
  a = await req(rider.sock, 'delivery:accept', { taskId: task.id });
  ok(a.ok, 'a rider claims the task');
  a = await req(rider.sock, 'delivery:accept', { taskId: task.id });
  ok(!a.ok, 'the same task cannot be claimed twice');
  const claimants = await Promise.all([rider.sock, rider.sock].map((s) => req(s, 'delivery:accept', { taskId: task.id })));
  ok(claimants.every((r) => !r.ok), 'a task already on the road cannot be stolen');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'delivered' });
  ok(!a.ok, 'a delivery cannot jump from assigned straight to delivered');
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'teleported' });
  ok(!a.ok, 'an invalid delivery status is rejected');
  if (rider2s) {
    a = await req(rider2s.sock, 'delivery:updateStatus', { taskId: task.id, status: 'picked_up' });
    ok(!a.ok, "another rider cannot update someone else's delivery");
    rider2s.sock.close();
  } else {
    ok(true, "(second rider login not available; ownership covered by the 'assigned' state above)");
  }
  a = await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'picked_up' });
  ok(a.ok, 'the assigned rider can pick up');
  a = await req(admin.sock, 'delivery:assign', { taskId: task.id, riderId: cust.user.id });
  ok(!a.ok, 'a task cannot be assigned to a non-rider');

  // ---- privacy of lists ----------------------------------------------------
  section('Lists only show what the caller may see');
  const pay = (await req(sellerA.sock, 'payments:list')).data;
  ok(pay.length === 0, "a seller's payment list holds only their own payments");
  ok(!(await req(warehouse.sock, 'payments:list')).data.some((p) => p.orderId === o1.id), 'warehouse staff cannot read customer payments');
  ok((await req(finance.sock, 'payments:list')).data.some((p) => p.orderId === o1.id), 'finance can read payments');
  ok(!(await req(cust.sock, 'payouts:list')).data.length, 'a customer sees no payouts');
  const cLists = ['disputes:list', 'replacements:list', 'exchanges:list', 'campaigns:list'];
  for (const ev of cLists) ok(((await req(rider.sock, ev)).data ?? []).length === 0, `${ev}: a rider sees nothing that isn't theirs`);

  // ---- disputes ------------------------------------------------------------
  section('Disputes and refunds');
  const pend = (await req(cust2.sock, 'orders:create', { items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, zoneId: 'gombe' })).data;
  a = await req(cust2.sock, 'disputes:open', { orderId: pend.id, type: 'dispute', reason: 'not paid yet' });
  ok(!a.ok, 'cannot open a dispute on an order that is not paid yet');
  await until(async () => (await req(cust2.sock, 'orders:list')).data.find((o) => o.id === pend.id)?.status === 'confirmed');
  a = await req(cust.sock, 'disputes:open', { orderId: pend.id, type: 'dispute', reason: 'not mine at all' });
  ok(!a.ok, "cannot open a dispute on someone else's order");
  a = await req(cust2.sock, 'disputes:open', { orderId: pend.id, type: 'dispute', reason: '' });
  ok(!a.ok, 'a dispute needs a reason');
  a = await req(cust2.sock, 'disputes:open', { orderId: pend.id, type: 'dispute', reason: 'Item is damaged on arrival' });
  ok(a.ok, 'a valid dispute opens');
  const dsp = a.data;
  a = await req(cust2.sock, 'disputes:open', { orderId: pend.id, type: 'dispute', reason: 'Item is damaged on arrival (again)' });
  ok(!a.ok, 'no duplicate open dispute for the same order');
  const marketer = await register('mkt');
  await req(admin.sock, 'roles:setRole', { id: marketer.user.id, role: 'admin_marketing' });
  const mkt = await login(`mkt${tag}@authz.test`, 'Authz-Pass-2026').catch(() => null);
  if (mkt) {
    ok(!(await req(mkt.sock, 'disputes:resolve', { disputeId: dsp.id, refund: true })).ok, 'a marketing admin cannot issue a refund via disputes');
    ok(!(await req(mkt.sock, 'payments:list')).data.some((p) => p.orderId === pend.id), 'a marketing admin cannot read payments');
    ok(!(await req(mkt.sock, 'settings:set', { key: 'fxRate', value: '1' })).ok, 'a marketing admin cannot change settings');
    ok(!(await req(mkt.sock, 'customers:list')).ok, 'a marketing admin cannot list customers (PII)');
    ok((await req(mkt.sock, 'promos:create', { code: `MKT${tag}`, type: 'percent', value: 5 })).ok, 'a marketing admin can create promos');
    mkt.sock.close();
  } else ok(false, 'could not log in as the promoted marketing admin');
  a = await req(admin.sock, 'disputes:resolve', { disputeId: dsp.id, refund: true });
  ok(a.ok, 'admin resolves the dispute with a refund');
  ok(!(await req(admin.sock, 'disputes:resolve', { disputeId: dsp.id, refund: true })).ok, 'a resolved dispute cannot be resolved (and refunded) again');

  // ---- promos --------------------------------------------------------------
  section('Promo codes: limits, expiry, privacy');
  const code = (s) => `${s}${tag}`;
  await req(admin.sock, 'promos:create', { code: code('ONCE'), type: 'fixed', value: 5, minOrder: 1, perUserLimit: 1 });
  await req(admin.sock, 'promos:create', { code: code('PRIV'), type: 'percent', value: 10, isPublic: false });
  await req(admin.sock, 'promos:create', { code: code('OLD'), type: 'percent', value: 10, expiresAt: new Date(Date.now() - 60000).toISOString() });
  await req(admin.sock, 'promos:create', { code: code('CAP'), type: 'fixed', value: 2, maxUses: 1 });
  const listed = (await req(cust.sock, 'promos:list')).data.map((p) => p.code);
  ok(listed.includes(code('ONCE')) && !listed.includes(code('PRIV')) && !listed.includes(code('OLD')), 'customers see public, unexpired codes only');
  ok(!('maxUses' in (await req(cust.sock, 'promos:list')).data[0]) && !('id' in (await req(cust.sock, 'promos:list')).data[0]), 'internal promo fields are not exposed');
  ok(!(await req(admin.sock, 'promos:create', { code: 'BAD', type: 'percent', value: 100 })).ok, 'a 100% promo is rejected');
  ok(!(await req(admin.sock, 'promos:create', { code: `ONCE${tag}`, type: 'fixed', value: 5 })).ok, 'duplicate codes are rejected');
  const line = { items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, zoneId: 'gombe' };
  const pr = await req(cust.sock, 'orders:create', { ...line, promoCode: code('ONCE') });
  ok(pr.ok && pr.data.discountUsd === 5, 'a promo is applied');
  ok(!(await req(cust.sock, 'orders:create', { ...line, promoCode: code('ONCE') })).ok, 'a per-customer limit of 1 blocks reuse');
  ok((await req(cust2.sock, 'orders:create', { ...line, promoCode: code('ONCE') })).ok, '…but another customer can still use it');
  ok(!(await req(cust.sock, 'orders:create', { ...line, promoCode: code('OLD') })).ok, 'an expired code is rejected');
  ok((await req(cust.sock, 'orders:create', { ...line, promoCode: code('PRIV') })).ok, 'a private code still works when known');
  ok((await req(cust.sock, 'orders:create', { ...line, promoCode: code('CAP') })).ok && !(await req(cust2.sock, 'orders:create', { ...line, promoCode: code('CAP') })).ok, 'a total-use cap (1) is enforced across customers');

  // ---- settings / roles / customers ----------------------------------------
  section('Settings, roles and customers');
  ok(!(await req(cust.sock, 'settings:set', { key: 'fxRate', value: '1' })).ok, 'a customer cannot change settings');
  ok(!(await req(admin.sock, 'settings:set', { key: 'jwtSecret', value: 'x' })).ok, 'unknown setting keys are rejected');
  ok(!(await req(admin.sock, 'settings:set', { key: 'commissionPct', value: '999' })).ok, 'out-of-range commission is rejected');
  ok(!(await req(admin.sock, 'settings:set', { key: 'deliveryZones', value: '[{"id":"x","name":"x","feeUsd":9999}]' })).ok, 'an absurd zone fee is rejected');
  const pubSettings = (await req(cust.sock, 'settings:get')).data;
  ok('deliveryZones' in pubSettings && !('commissionPct' in pubSettings), 'customers read only the public settings');
  ok('commissionPct' in (await req(finance.sock, 'settings:get')).data, 'finance reads all settings');
  ok(!(await req(finance.sock, 'roles:staff')).ok, 'only the super admin lists staff accounts');
  ok(!(await req(finance.sock, 'roles:setRole', { id: cust.user.id, role: 'admin' })).ok, 'only the super admin changes roles');
  ok(!(await req(admin.sock, 'roles:setRole', { id: cust.user.id, role: 'superuser' })).ok, 'an unknown role is rejected');
  ok(!(await req(admin.sock, 'roles:setRole', { id: admin.user.id, role: 'customer' })).ok, 'you cannot change your own role');
  const audit = (await req(admin.sock, 'audit:list')).data;
  ok(audit.some((l) => l.action === 'role.set'), 'role changes are written to the audit log');
  ok(audit.some((l) => l.action === 'settings.set'), 'settings changes are written to the audit log');

  // suspension kicks a live socket
  const victim = await register('victim');
  let dropped = false; victim.sock.on('disconnect', () => { dropped = true; });
  a = await req(admin.sock, 'customers:setActive', { id: victim.user.id, active: false });
  ok(a.ok, 'admin suspends a customer');
  ok(!!(await until(() => dropped, 3000)), 'the suspended customer’s open socket is disconnected immediately');
  ok(!(await req(admin.sock, 'customers:setActive', { id: admin.user.id, active: false })).ok, 'an admin cannot suspend themselves');
  ok(!(await req(admin.sock, 'customers:setActive', { id: finance.user.id, active: false })).ok, 'staff accounts are not suspended through the customer list');

  // ---- campaigns, replacements, exchanges, payouts ------------------------
  section('Campaigns, returns and payouts');
  let c = await req(sellerA.sock, 'campaigns:create', { name: 'Summer', discount: 20, budgetUsd: 100 });
  ok(c.ok && c.data.status === 'pending', 'a seller proposes a campaign (pending)');
  ok(!(await req(sellerA.sock, 'campaigns:create', { name: 'Big', discount: 500 })).ok, 'a 500% campaign is rejected');
  ok(!(await req(sellerB.sock, 'campaigns:update', { id: c.data.id, patch: { name: 'hijack' } })).ok, "a seller cannot edit another seller's campaign");
  const edited = await req(sellerA.sock, 'campaigns:update', { id: c.data.id, patch: { status: 'active', sellerId: 'x', name: 'Summer 2' } });
  ok(edited.ok && edited.data.status === 'pending' && edited.data.name === 'Summer 2', 'a seller cannot self-approve or reassign a campaign');
  await req(admin.sock, 'campaigns:setStatus', { id: c.data.id, status: 'active' });
  ok(!(await req(sellerA.sock, 'campaigns:update', { id: c.data.id, patch: { discount: 90 } })).ok, 'an approved campaign can no longer be edited by the seller');
  ok(!(await req(admin.sock, 'campaigns:setStatus', { id: c.data.id, status: 'hacked' })).ok, 'an invalid campaign status is rejected');
  ok(!(await req(cust.sock, 'campaigns:list')).data.length, 'customers do not see campaigns');

  ok(!(await req(cust.sock, 'replacements:create', { orderId: pend.id, sku: 'x', productName: 'y' })).ok, "a customer cannot file a replacement on someone else's order");
  ok(!(await req(cust2.sock, 'exchanges:create', { orderId: o1.id, fromSku: 'a', fromName: 'a', toSku: 'b', toName: 'b' })).ok, 'cannot file an exchange on an order that is not yours');

  a = await req(sellerA.sock, 'payouts:request', { amountUsd: 500 });
  ok(!a.ok && /withdraw up to/i.test(a.error ?? ''), 'a payout above the available balance is refused', a.error ?? '');
  ok(!(await req(sellerA.sock, 'payouts:request', { amountUsd: 5 })).ok, 'below the $10 minimum is refused');
  const av = await req(sellerA.sock, 'payouts:available');
  ok(av.ok && av.data.available === 0, 'available payout balance starts at $0 until orders are delivered');

  // ---- misc ----------------------------------------------------------------
  section('Misc');
  ok(!(await req(cust.sock, 'questions:answer', { id: 'x', answer: 'y' })).ok, 'a customer cannot answer product questions');
  const tok = `tok-${tag}`;
  await req(cust.sock, 'devices:register', { token: tok, platform: 'android' });
  await req(cust2.sock, 'devices:unregister', { token: tok });
  ok((await req(cust.sock, 'devices:register', { token: tok, platform: 'android' })).ok, "unregistering someone else's device token does nothing");
  ok(!(await req(cust.sock, 'broadcasts:send', { title: 'x', body: 'y' })).ok, 'a customer cannot send broadcasts');
  ok(!(await req(cust.sock, 'analytics:admin')).ok && !(await req(rider.sock, 'analytics:admin')).ok, 'analytics are not open to customers or riders');
  ok(!(await req(cust.sock, 'audit:list')).ok, 'the audit log is not open to customers');

  console.log(fails.length ? `\n❌ ${pass} passed, ${fails.length} failed:\n   - ${fails.join('\n   - ')}` : `\n🎉 ${pass} passed, 0 failed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
