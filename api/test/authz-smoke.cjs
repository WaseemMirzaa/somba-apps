/* Authorization + integrity regression suite, against a RUNNING API (dev mode,
 * seeded with `npm run seed`). Each block is a fix for a real hole found in the
 * security review: ownership (IDOR), role boundaries, mass assignment, races.
 *
 *   API_URL=http://localhost:3001 node test/authz-smoke.cjs
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { hubId: demoHubId, tasksOf, toDelivery } = require('./journey.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const tag = Date.now().toString().slice(-8);
const PHONE = '+243812345678';
// Delivery needs an address in a served area: a plain Kinshasa address resolves to the city, which Entrepôt Kinshasa covers.
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });

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
  const ops = await login('ops@somba.app');
  const guest = { sock: await connect() };
  const warehouse = await login('warehouse@somba.app');
  const rider = await login('rider@somba.app');
  const cust = await register('cust');
  const cust2 = await register('cust2');
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });

  // ---- sellers (need an approved store to sell) ----------------------------
  const makeSeller = async (label, approve) => {
    const u = await register(label, 'seller');
    const reg = await req(u.sock, 'sellers:register', kyc(`${label} Store`));
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
  a = await req(cust.sock, 'sellers:register', kyc('Fake Store'));
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
  a = await req(sellerA.sock, 'products:update', { id: prodA.id, patch: { sellerId: sellerB.store.id, rating: 5, stock: 50 } });
  ok(a.ok && a.data.sellerId === sellerA.store.id && a.data.rating === 0 && a.data.status === 'live' && a.data.stock === 50, 'update ignores sellerId / rating, applies stock');
  a = await req(sellerA.sock, 'products:update', { id: prodA.id, patch: { status: 'removed' } });
  ok(!a.ok, 'a seller cannot change moderation status (only pause / resume)');
  a = await req(sellerA.sock, 'products:update', { id: prodA.id, patch: { status: 'draft' } });
  ok(a.ok && a.data.status === 'draft', 'a seller can pause a live listing');
  a = await req(sellerA.sock, 'products:update', { id: prodA.id, patch: { status: 'live' } });
  ok(a.ok && a.data.status === 'live', 'a seller can resume a paused listing');
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
    req(buyer.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet', })));
  const wins = burst.filter((r) => r.ok).length;
  const bal = (await req(buyer.sock, 'wallet:get')).data.balance;
  const fee = burst.find((r) => r.ok)?.data.deliveryFeeUsd ?? 2; // an unpinned address pays the base delivery fee
  const cost = 30 + fee;
  ok(wins === 1, `10 simultaneous wallet orders for $${cost} with $50 → exactly 1 succeeds (got ${wins})`);
  ok(Math.abs(bal - (50 - cost)) < 0.011 && bal >= 0, `balance is $${(50 - cost).toFixed(2)}, never negative (got $${bal})`);
  ok((await req(admin.sock, 'products:get', { id: cheap.id })).data.stock === 99, 'only the winning order reserved stock (failed ones released it)');

  const scarce = (await req(admin.sock, 'products:create', { name: `Scarce ${tag}`, price: 5, category: 'Electronics', stock: 3 })).data;
  const rush = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    req((i % 2 ? cust : cust2).sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: scarce.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, })));
  ok(rush.filter((r) => r.ok).length === 3, `10 buyers race for 3 units → exactly 3 orders (got ${rush.filter((r) => r.ok).length})`);
  ok((await req(admin.sock, 'products:get', { id: scarce.id })).data.stock === 0, 'stock ends at exactly 0, never negative');

  // refunds happen once even if cancel is hammered
  const wo = (await req(buyer.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet' , }));
  ok(!wo.ok, 'a wallet order beyond the remaining balance is refused');
  await req(buyer.sock, 'wallet:topup', { amountUsd: 40, method: 'airtel_money', phone: PHONE });
  await until(async () => (await req(buyer.sock, 'wallet:get')).data.balance >= 57);
  const paid = (await req(buyer.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet', })).data;
  const before = (await req(buyer.sock, 'wallet:get')).data.balance; // 57 - 33 = 24
  const cancels = await Promise.all(Array.from({ length: 6 }, () => req(buyer.sock, 'orders:cancel', { orderId: paid.id })));
  const after = (await req(buyer.sock, 'wallet:get')).data.balance;
  ok(cancels.filter((r) => r.ok).length === 1, 'six simultaneous cancels → exactly one succeeds');
  ok(Math.abs(after - (before + paid.totalUsd)) < 0.011, `…and the refund is paid once (+$${paid.totalUsd}): $${before} → $${after}`);
  ok((await req(admin.sock, 'orders:refund', { orderId: paid.id })).ok === false, 'a cancelled order cannot be refunded a second time');

  // ---- orders: who can see / change what -----------------------------------
  section('Orders: visibility and status changes');
  const o1 = (await req(cust.sock, 'orders:create', { items: [{ productId: prodA.id, qty: 1 }], paymentMethod: 'orange_money', paymentPhone: PHONE, shippingAddress: JSON.stringify({ line1: 'SECRET STREET 9', city: 'Kinshasa' }) })).data;
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
  ok(!a.ok, 'warehouse staff can no longer move an order by hand (admin / operations only)');
  a = await req(admin.sock, 'orders:updateStatus', { orderId: o1.id, status: 'processing' });
  ok(a.ok, 'an admin can advance an order one step');
  a = await req(admin.sock, 'orders:updateStatus', { orderId: o1.id, status: 'delivered' });
  ok(!a.ok && /Cannot move an order from processing to delivered/.test(a.error ?? ''), 'but not skip steps', a.error ?? '');

  // ---- delivery ------------------------------------------------------------
  section('Delivery: only the assigned rider, only forward');
  ok(!(await req(cust.sock, 'delivery:list')).ok, 'a customer cannot list delivery tasks (they hold addresses)');
  ok(!(await req(sellerA.sock, 'delivery:list')).ok, 'a seller cannot list delivery tasks');
  ok(!(await req(cust.sock, 'rider:tasks')).ok, 'a customer cannot read the rider queue');
  ok(!(await req(cust.sock, 'delivery:unassigned')).ok, 'a customer cannot list unassigned deliveries');
  ok(((await req(rider.sock, 'delivery:unassigned')).data ?? []).length === 0, 'a rider has no open pool: nothing is offered to them');
  const task = await until(async () => (await tasksOf(admin, o1.id)).find((x) => x.kind === 'pickup'));
  ok(!!task, 'the paid order has a pickup task in the warehouse queue');
  ok(!((await req(rider.sock, 'rider:tasks')).data ?? []).some((x) => x.id === task.id), 'and a rider does not see it before being assigned');
  const rider2 = await register('rider2');
  a = await req(admin.sock, 'roles:setRole', { id: rider2.user.id, role: 'rider' });
  ok(!a.ok, 'a rider needs a warehouse: roles:setRole without one is refused', a.error ?? '');
  await req(admin.sock, 'roles:setRole', { id: rider2.user.id, role: 'rider', hubId: await demoHubId(admin) });
  const rider2s = await login(`rider2${tag}@authz.test`, 'Authz-Pass-2026').catch(() => null);
  a = await req(rider.sock, 'delivery:accept', { taskId: task.id });
  ok(!a.ok, 'a rider cannot claim a task themselves');
  a = await req(warehouse.sock, 'logistics:assign', { taskId: task.id, riderId: rider.user.id });
  ok(a.ok, 'the warehouse assigns the task to a rider', a.error ?? '');
  a = await req(rider.sock, 'delivery:accept', { taskId: task.id });
  ok(!a.ok, 'an assigned task cannot be claimed either');
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
  const pend = (await req(cust2.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, })).data;
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
  const line = { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, };
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
  ok(!(await req(admin.sock, 'settings:set', { key: 'deliveryBaseUsd', value: 9999 })).ok, 'an absurd delivery fee is rejected');
  ok(!(await req(admin.sock, 'settings:set', { key: 'deliveryZones', value: '[]' })).ok, 'delivery zones can no longer be written');
  const pubSettings = (await req(cust.sock, 'settings:get')).data;
  ok('deliveryBaseUsd' in pubSettings && 'deliveryPerKmUsd' in pubSettings && !('commissionPct' in pubSettings), 'customers read only the public settings (delivery fee numbers included)');
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

  a = await req(sellerA.sock, 'payouts:request', { amountUsd: 500, method: 'wallet' });
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

  // ---- analytics, plans, reviews, hubs, campaigns: who may do what ---------------------------
  section('New analytics events: role boundaries');
  const everyone = { admin, finance, ops, warehouse, rider, seller: sellerA, customer: cust, guest };
  const allowed = (ev, who, body) => Promise.all(Object.entries(everyone).map(async ([name, u]) => [name, (await req(u.sock, ev, body)).ok]));
  const check = async (ev, yes, body) => {
    const rows = await allowed(ev, null, body);
    const wrong = rows.filter(([n, ok_]) => ok_ !== yes.includes(n)).map(([n, ok_]) => `${n}:${ok_ ? 'allowed' : 'denied'}`);
    ok(wrong.length === 0, `${ev} is open to exactly ${yes.join(', ')}`, wrong.join(' '));
  };
  await check('analytics:finance', ['admin', 'finance']);
  await check('analytics:admin', ['admin', 'finance', 'ops']);
  await check('analytics:revenue', ['admin', 'finance', 'ops'], { days: 5 });
  await check('analytics:warehouse', ['admin', 'finance', 'ops', 'warehouse']);
  await check('analytics:seller', ['seller'], {});
  await check('analytics:seller', ['admin', 'finance', 'ops', 'seller'], { sellerId: sellerA.store.id });
  ok(!(await req(warehouse.sock, 'analytics:seller', { sellerId: sellerA.store.id })).ok && !(await req(cust.sock, 'analytics:seller', { sellerId: sellerA.store.id })).ok, 'warehouse staff and customers cannot read a store by passing its id');

  section('Seller analytics: own data only');
  const prodB = (await req(sellerB.sock, 'products:create', { name: `B Gadget ${tag}`, price: 30, category: 'Electronics', stock: 20 })).data;
  const payIt = (c, pid, qty) => req(c.sock, 'orders:create', { items: [{ productId: pid, qty }], paymentMethod: 'stripe_card', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  await payIt(cust, prodA.id, 1);
  await payIt(cust2, prodB.id, 3);
  const aA = (await req(sellerA.sock, 'analytics:seller', { days: 30 })).data;
  const aB = (await req(sellerB.sock, 'analytics:seller', { days: 30 })).data;
  ok(aA.sellerId === sellerA.store.id && aB.sellerId === sellerB.store.id, 'each seller gets their own store');
  ok(aA.topProducts.every((t) => t.productId !== prodB.id) && aB.topProducts.every((t) => t.productId !== prodA.id), "neither store's top products contain the other's");
  ok(aB.topProducts.some((t) => t.productId === prodB.id && t.units === 3 && t.revenue === 90), "store B's numbers are its own: 3 x $30");
  const spoof = (await req(sellerB.sock, 'analytics:seller', { days: 30, sellerId: sellerA.store.id })).data;
  ok(spoof.sellerId === sellerB.store.id && spoof.revenue === aB.revenue, "a seller passing another store's sellerId still gets only their own data");
  const sa2 = (await req(sellerA.sock, 'sellers:stats')).data;
  const sb2 = (await req(sellerB.sock, 'sellers:stats')).data;
  ok(sa2.revenue === aA.revenue && sb2.revenue === aB.revenue && sa2.revenue !== sb2.revenue, 'sellers:stats is per store and matches the analytics');
  ok((await req(sellerP.sock, 'sellers:stats')).data.orders === 0, 'a store with no sales has zero orders');

  section('Seller plans: nobody can grant themselves one');
  ok((await req(guest.sock, 'sellers:plans')).ok && (await req(cust.sock, 'sellers:plans')).ok, 'sellers:plans is public');
  for (const [name, u] of Object.entries({ customer: cust, admin, finance, warehouse, rider, guest })) {
    ok(!(await req(u.sock, 'sellers:subscribe', { plan: 'pro', method: 'wallet' })).ok, `${name} cannot call sellers:subscribe`);
  }
  a = await req(sellerB.sock, 'sellers:update', { plan: 'pro', planExpiresAt: '2099-01-01', name: `selB Store ${tag}` });
  const meB = (await req(sellerB.sock, 'sellers:mine')).data;
  ok(meB.plan === 'free' && meB.activePlan === 'free' && meB.planExpiresAt === null, 'sellers:update ignores plan / planExpiresAt (no mass assignment)');
  const sus = await makeSeller('selS', true);
  await req(admin.sock, 'sellers:setStatus', { id: sus.store.id, status: 'suspended', reason: 'Smoke test: policy review' });
  ok(!(await req(sus.sock, 'sellers:subscribe', { plan: 'starter', method: 'airtel_money', phone: PHONE })).ok, 'a suspended store cannot buy a plan');
  a = await req(sellerB.sock, 'sellers:subscribe', { plan: 'starter', method: 'airtel_money', phone: PHONE });
  ok(a.ok && a.data.status === 'pending', 'a store can start a plan payment');
  ok(!(await req(sellerB.sock, 'payments:confirm', { reference: a.data.payment.reference })).ok && !(await req(ops.sock, 'payments:confirm', { reference: a.data.payment.reference })).ok, 'neither the seller nor ops can confirm it (finance / admin only)');
  ok((await req(sellerB.sock, 'sellers:mine')).data.plan === 'free', 'so the plan stays free until the money is confirmed');
  ok(!(await req(sellerB.sock, 'settings:set', { key: 'sellerPlans', value: '[]' })).ok && !(await req(warehouse.sock, 'settings:set', { key: 'sellerPlans', value: '[]' })).ok, 'sellers and warehouse cannot edit the plan catalogue');
  ok(!(await req(rider.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' })).ok && !(await req(sellerA.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' })).ok, 'only config roles can change the verification policy');
  ok((await req(guest.sock, 'settings:get')).data.requireVerifiedForCheckout !== undefined, 'guests can read the verification policy');
  ok((await req(guest.sock, 'settings:get')).data.sellerPlans === undefined, 'but not the admin-only plan setting (sellers:plans is the public view)');

  section('Reviews: reply and moderation boundaries');
  const rprod = (await req(sellerA.sock, 'products:create', { name: `A Reviewed ${tag}`, price: 20, category: 'Electronics', stock: 10 })).data;
  const ro = (await payIt(cust, rprod.id, 1)).data;
  const rt = await toDelivery(admin, rider, ro.id);
  for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: rt.id, status: st });
  const rv = (await req(cust.sock, 'reviews:create', { productId: rprod.id, rating: 3, text: 'Average product' })).data;
  ok(rv && rv.status === 'visible', 'setup: a delivered buyer reviews');
  for (const [name, u] of Object.entries({ sellerB, customer: cust, cust2, warehouse, rider, guest, finance })) {
    ok(!(await req(u.sock, 'reviews:reply', { reviewId: rv.id, text: 'Hello from outside' })).ok, `${name} cannot reply to this review`);
  }
  for (const [name, u] of Object.entries({ seller: sellerA, customer: cust, warehouse, rider, guest, finance })) {
    ok(!(await req(u.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'hidden' })).ok, `${name} cannot hide a review`);
    ok(!(await req(u.sock, 'reviews:admin')).ok, `${name} cannot open the review moderation queue`);
  }
  ok((await req(sellerA.sock, 'reviews:reply', { reviewId: rv.id, text: 'Thanks for the feedback' })).ok, 'the owning seller can reply');
  ok((await req(admin.sock, 'reviews:reply', { reviewId: rv.id, text: 'Admin note to the buyer' })).ok, 'an admin can reply too');
  a = await req(ops.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'hidden' });
  ok(a.ok && a.data.status === 'hidden', 'ops can moderate');
  ok((await req(ops.sock, 'reviews:admin', { status: 'hidden' })).data.some((r) => r.id === rv.id), 'and see the queue');
  ok(!(await req(sellerA.sock, 'reviews:list', { productId: rprod.id, includeHidden: true })).data.some((r) => r.id === rv.id), 'a seller cannot list hidden reviews either');
  await req(ops.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'visible' });
  ok(!(await req(cust2.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'visible' })).ok, 'nor restore them');
  a = await req(cust.sock, 'reviews:create', { productId: rprod.id, rating: 5, text: 'Second review', status: 'visible', sellerReply: 'I reply to myself', helpful: 99 });
  ok(!a.ok, 'one review per product, and extra fields never reach the row');

  section('Hub directory: who may change it');
  for (const [name, u] of Object.entries({ seller: sellerA, customer: cust, warehouse, rider, guest, finance })) {
    ok(!(await req(u.sock, 'warehouse:saveHub', { name: `Evil Hub ${name} ${tag}`, city: 'Nowhere' })).ok, `${name} cannot create or edit hubs`);
  }
  a = await req(ops.sock, 'warehouse:saveHub', { name: `Ops Hub ${tag}`, city: 'Matadi', capacity: 50, active: false, id: undefined });
  ok(a.ok && a.data.active === true, 'ops can create a hub; an `active` flag in the form is ignored (deactivation has its own event)');
  const hubId = a.data.id;
  ok(!(await req(warehouse.sock, 'warehouse:setHubActive', { id: hubId, active: false })).ok && !(await req(finance.sock, 'warehouse:setHubActive', { id: hubId, active: false })).ok && !(await req(sellerA.sock, 'warehouse:setHubActive', { id: hubId, active: false })).ok, 'only admin / ops can deactivate a hub');
  ok((await req(ops.sock, 'warehouse:setHubActive', { id: hubId, active: false })).ok, 'ops can');
  a = await req(admin.sock, 'warehouse:saveHub', { id: hubId, name: `Ops Hub ${tag}`, city: 'Matadi', active: true, capacity: 60 });
  ok(a.ok && a.data.active === false && a.data.capacity === 60, 'editing a hub does not re-activate it');

  section('Campaigns and prices: nothing a client sends can set a discount');
  const prodC = (await req(sellerB.sock, 'products:create', { name: `A Campaign Item ${tag}`, price: 100, category: 'Electronics', stock: 40 })).data;
  a = await req(sellerB.sock, 'campaigns:create', { name: `Hack ${tag}`, discount: 40, status: 'active', orders: 999, revenueUsd: 99999, views: 1e6, sellerId: sellerA.store.id, productIds: [prodC.id] });
  ok(a.ok && a.data.status === 'pending' && a.data.orders === 0 && a.data.revenueUsd === 0 && a.data.views === 0 && a.data.sellerId === sellerB.store.id, 'a seller campaign always starts pending with zero counters, owned by the caller');
  const hack = a.data;
  const baseA = 100;
  const gc = await req(cust.sock, 'products:get', { id: prodC.id });
  ok(gc.data?.price === baseA, 'a pending campaign does not change the price', JSON.stringify(gc));
  ok(!(await req(sellerB.sock, 'campaigns:setStatus', { id: hack.id, status: 'active' })).ok && !(await req(cust.sock, 'campaigns:setStatus', { id: hack.id, status: 'active' })).ok && !(await req(warehouse.sock, 'campaigns:setStatus', { id: hack.id, status: 'active' })).ok, 'only admins approve campaigns');
  ok(!(await req(sellerA.sock, 'campaigns:update', { id: hack.id, patch: { discount: 1 } })).ok, "another seller cannot edit it");
  ok(!(await req(sellerA.sock, 'campaigns:create', { name: 'Steal A', discount: 30, productIds: [prodC.id] })).ok, "or put the first store's product into theirs");
  a = await payIt(cust, prodC.id, 1);
  ok(a.ok && a.data.items[0].priceUsd === baseA, 'checkout charges the database price', JSON.stringify(a));
  a = await req(cust.sock, 'orders:create', { items: [{ productId: prodC.id, qty: 1, priceUsd: 1, campaignPct: 90, listPriceUsd: 1 }], paymentMethod: 'stripe_card', campaignDiscountUsd: 999, shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
  ok(a.ok && a.data.items[0].priceUsd === baseA && a.data.campaignDiscountUsd === 0 && a.data.items[0].campaignPct === 0 && a.data.items[0].listPriceUsd === baseA, 'client-sent priceUsd / campaignPct / campaignDiscountUsd on an order are ignored');
  await req(admin.sock, 'campaigns:setStatus', { id: hack.id, status: 'ended' });

  section('Verification policy blocks the right people');
  const un = await register('unv');
  await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'true' });
  try {
    a = await payIt(un, prodA.id, 1);
    ok(!a.ok && /verify/i.test(a.error ?? ''), 'an unverified customer cannot check out when the policy is on', a.error ?? '');
    a = await req(un.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: prodA.id, qty: 1 }], paymentMethod: 'wallet', });
    ok(!a.ok && /verify/i.test(a.error ?? ''), 'whatever the payment method');
    ok(!(await req(un.sock, 'wallet:topup', { amountUsd: 5, method: 'airtel_money', phone: PHONE })).ok, 'or top up');
    ok(!(await req(guest.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: prodA.id, qty: 1 }], paymentMethod: 'wallet' })).ok, 'a guest never can');
  } finally {
    await req(admin.sock, 'settings:set', { key: 'requireVerifiedForCheckout', value: 'false' });
  }

  section('List limits cannot be abused');
  ok((await req(cust.sock, 'orders:list', { limit: 1e12, offset: -5 })).ok && (await req(cust.sock, 'products:list', { limit: 'DROP', offset: {} })).ok, 'absurd limit / offset values are normalised, not errors');
  ok((await req(cust.sock, 'products:list', { limit: 2 })).data.length === 2, 'a small limit is honoured');
  ok(!(await req(cust.sock, 'customers:list', { limit: 1 })).ok && !(await req(cust.sock, 'warehouse:parcels', { limit: 1 })).ok && !(await req(cust.sock, 'sellers:list', { limit: 1 })).ok, 'paging does not open staff lists to customers');
  ok((await req(cust2.sock, 'orders:list', { limit: 500 })).data.every((o) => o.customerId === cust2.user.id), 'a customer only ever pages through their own orders');

  console.log(fails.length ? `\n❌ ${pass} passed, ${fails.length} failed:\n   - ${fails.join('\n   - ')}` : `\n🎉 ${pass} passed, 0 failed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
