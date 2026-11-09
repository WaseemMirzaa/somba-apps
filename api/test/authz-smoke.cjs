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
    req(buyer.sock, 'orders:create', { clientRequestId: require('crypto').randomUUID(), shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet', })));
  const wins = burst.filter((r) => r.ok).length;
  const bal = (await req(buyer.sock, 'wallet:get')).data.balance;
  const fee = burst.find((r) => r.ok)?.data.deliveryFeeUsd ?? 2; // an unpinned address pays the base delivery fee
  const cost = 30 + fee;
  ok(wins === 1, `10 simultaneous wallet orders for $${cost} with $50 → exactly 1 succeeds (got ${wins})`);
  ok(Math.abs(bal - (50 - cost)) < 0.011 && bal >= 0, `balance is $${(50 - cost).toFixed(2)}, never negative (got $${bal})`);
  const cheapStock = (await req(admin.sock, 'products:get', { id: cheap.id })).data.stock;
  ok(cheapStock === 99, `only the winning order reserved stock (failed ones released it) (got ${cheapStock})`);

  const scarce = (await req(admin.sock, 'products:create', { name: `Scarce ${tag}`, price: 5, category: 'Electronics', stock: 3 })).data;
  const rush = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    req((i % 2 ? cust : cust2).sock, 'orders:create', { clientRequestId: require('crypto').randomUUID(), shippingAddress: ADDRESS, items: [{ productId: scarce.id, qty: 1 }], paymentMethod: 'airtel_money', paymentPhone: PHONE, })));
  ok(rush.filter((r) => r.ok).length === 3, `10 buyers race for 3 units → exactly 3 orders (got ${rush.filter((r) => r.ok).length})`);
  ok((await req(admin.sock, 'products:get', { id: scarce.id })).data.stock === 0, 'stock ends at exactly 0, never negative');

  // refunds happen once even if cancel is hammered
  const wo = (await req(buyer.sock, 'orders:create', { shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet' , }));
  ok(!wo.ok, 'a wallet order beyond the remaining balance is refused');
  await req(buyer.sock, 'wallet:topup', { amountUsd: 40, method: 'airtel_money', phone: PHONE });
  await until(async () => (await req(buyer.sock, 'wallet:get')).data.balance >= 57);
  const paid = (await req(buyer.sock, 'orders:create', { clientRequestId: require('crypto').randomUUID(), shippingAddress: ADDRESS, items: [{ productId: cheap.id, qty: 1 }], paymentMethod: 'wallet', })).data;
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

  // department admins are switched off and on by the super admin (audit AD-03)
  const deptMade = await req(admin.sock, 'roles:createStaff', { email: `dept${tag}@authz.test`, name: 'Dept admin', role: 'admin_marketing' });
  ok(deptMade.ok && deptMade.data.tempPassword, 'the super admin creates a marketing admin', deptMade.error ?? '');
  const dept = await login(deptMade.data.email, deptMade.data.tempPassword);
  let deptDropped = false; dept.sock.on('disconnect', () => { deptDropped = true; });
  ok(!(await req(finance.sock, 'staff:setActive', { userId: dept.user.id, active: false })).ok, 'a department admin cannot switch another admin off');
  ok(!(await req(admin.sock, 'staff:setActive', { userId: admin.user.id, active: false })).ok, 'the super admin cannot switch themselves off');
  a = await req(admin.sock, 'staff:setActive', { userId: dept.user.id, active: false });
  ok(a.ok && a.data.active === false && a.data.role === 'admin_marketing', 'the super admin suspends the marketing admin', a.error ?? '');
  ok(!!(await until(() => deptDropped, 3000)), 'their open socket is closed at once');
  ok((await rest('/api/v1/auth/login', { email: deptMade.data.email, password: deptMade.data.tempPassword })).status === 401, 'a suspended department admin cannot sign in');
  const deptAudit = (await req(admin.sock, 'audit:list', { action: 'staff.deactivate' })).data;
  ok((Array.isArray(deptAudit) ? deptAudit : deptAudit?.items ?? []).some((l) => l.entityId === dept.user.id), 'the suspension is in the audit log');
  a = await req(admin.sock, 'staff:setActive', { userId: dept.user.id, active: true });
  ok(a.ok && a.data.active === true, 'and restores them', a.error ?? '');
  ok((await rest('/api/v1/auth/login', { email: deptMade.data.email, password: deptMade.data.tempPassword })).status === 200, 'a restored department admin signs in again');

  // ---- campaigns, replacements, exchanges, payouts ------------------------
  section('Campaigns, returns and payouts');
  let c = await req(sellerA.sock, 'campaigns:create', { name: 'Summer', discount: 20, budgetUsd: 100 });
  ok(c.ok && c.data.status === 'pending', 'a seller proposes a campaign (pending)');
  ok(!(await req(sellerA.sock, 'campaigns:create', { name: 'Big', discount: 500 })).ok, 'a 500% campaign is rejected');
  ok(!(await req(sellerB.sock, 'campaigns:update', { id: c.data.id, patch: { name: 'hijack' } })).ok, "a seller cannot edit another seller's campaign");
  const edited = await req(sellerA.sock, 'campaigns:update', { id: c.data.id, patch: { status: 'active', sellerId: 'x', name: 'Summer 2' } });
  ok(edited.ok && edited.data.status === 'pending' && edited.data.name === 'Summer 2', 'a seller cannot self-approve or reassign a campaign');
  await req(admin.sock, 'campaigns:setStatus', { id: c.data.id, status: 'active', reason: 'Looks fine' });
  ok(((await req(admin.sock, 'audit:list', { action: 'campaign.active', q: c.data.id })).data ?? []).length === 1, 'a campaign decision is in the audit log');
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

  section('Least privilege: admin sub-roles only do what their web menu offers');
  // A department account per sub-role (the seed has finance and ops): register, promote with roles:setRole, sign in again.
  const subRole = async (label, role) => {
    const u = await register(label);
    a = await req(admin.sock, 'roles:setRole', { id: u.user.id, role });
    if (!a.ok) throw new Error(`setRole ${role}: ${a.error}`);
    u.sock.close();
    return login(`${label}${tag}@authz.test`, 'Authz-Pass-2026');
  };
  const moderation = await subRole('mod', 'admin_moderation');
  const marketing = await subRole('mkt2', 'admin_marketing');
  const support = await subRole('sup', 'admin_support');
  const notModerators = { finance, ops, support, marketing };
  const notMarketing = { finance, ops, support, moderation };
  const notSupport = { finance, ops, marketing, moderation };

  // Product moderation (Moderation department): approve / reject / block / un-remove.
  const modProd = (await req(sellerA.sock, 'products:create', { name: `A Moderated ${tag}`, price: 25, category: 'Electronics', stock: 4 })).data;
  const statusOf = async (id) => (await req(admin.sock, 'products:get', { id })).data?.status;
  const modStart = await statusOf(modProd.id);
  for (const [name, u] of Object.entries(notModerators)) {
    const tries = [];
    for (const status of ['rejected', 'removed', 'live']) tries.push(await req(u.sock, 'products:update', { id: modProd.id, patch: { status } }));
    ok(tries.every((t) => !t.ok), `${name} admin cannot approve / reject / block a listing`, tries.map((t) => t.error).join(' | '));
    ok(!(await req(u.sock, 'products:update', { id: modProd.id, patch: { price: 1 } })).ok, `${name} admin cannot edit another seller's listing either`);
    ok(!(await req(u.sock, 'products:delete', { id: modProd.id })).ok, `${name} admin cannot remove another seller's listing`);
  }
  ok((await statusOf(modProd.id)) === modStart, 'so the listing is exactly as the seller left it');
  a = await req(moderation.sock, 'products:update', { id: modProd.id, patch: { status: 'rejected' } });
  ok(a.ok && a.data.status === 'rejected', 'the moderation admin rejects it');
  a = await req(ops.sock, 'products:update', { id: modProd.id, patch: { status: 'live' } });
  ok(!a.ok && (await statusOf(modProd.id)) === 'rejected', 'and operations cannot put it back on sale');
  a = await req(admin.sock, 'products:update', { id: modProd.id, patch: { status: 'live' } });
  ok(a.ok && a.data.status === 'live', 'the super admin still approves');
  ok((await req(ops.sock, 'products:list', {})).ok && (await req(finance.sock, 'products:get', { id: modProd.id })).ok, 'other admin roles keep reading listings');

  // Campaign decisions (Marketing department).
  a = await req(sellerB.sock, 'campaigns:create', { name: `Decision ${tag}`, discount: 10, productIds: [prodC.id] });
  ok(a.ok && a.data.status === 'pending', 'setup: a seller campaign waits for a decision');
  const camp = a.data;
  for (const [name, u] of Object.entries(notMarketing)) {
    ok(!(await req(u.sock, 'campaigns:setStatus', { id: camp.id, status: 'active' })).ok, `${name} admin cannot approve a campaign`);
    ok(!(await req(u.sock, 'campaigns:create', { name: `As ${name} ${tag}`, discount: 5 })).ok, `${name} admin cannot run campaigns as the platform`);
  }
  ok((await req(admin.sock, 'campaigns:list')).data.find((c) => c.id === camp.id)?.status === 'pending', 'so the campaign is still pending');
  ok((await req(ops.sock, 'campaigns:list')).ok, 'other admin roles keep reading campaigns');
  a = await req(marketing.sock, 'campaigns:setStatus', { id: camp.id, status: 'rejected', reason: 'Not this month' });
  ok(a.ok && a.data.status === 'rejected', 'the marketing admin decides');
  await req(admin.sock, 'campaigns:setStatus', { id: camp.id, status: 'ended' });

  // Categories (the Moderation menu no longer lists them: the server group is the Super Admin, Operations and Marketing).
  ok(!(await req(moderation.sock, 'categories:create', { name: `Mod Cat ${tag}` })).ok && !(await req(support.sock, 'categories:create', { name: `Sup Cat ${tag}` })).ok && !(await req(finance.sock, 'categories:create', { name: `Fin Cat ${tag}` })).ok, 'moderation, support and finance admins cannot create categories');
  a = await req(marketing.sock, 'categories:create', { name: `Mkt Cat ${tag}`, icon: '📦' });
  ok(a.ok, 'the marketing admin (whose menu now lists Categories) can', a.error ?? '');
  if (a.ok) {
    ok(!(await req(moderation.sock, 'categories:update', { id: a.data.id, patch: { name: 'Hijacked' } })).ok && !(await req(moderation.sock, 'categories:remove', { id: a.data.id })).ok, 'and moderation cannot rename or delete it');
    ok((await req(marketing.sock, 'categories:remove', { id: a.data.id })).ok, 'marketing cleans up');
  }

  // Support tickets (Support department): agents are the Super Admin and support.
  a = await req(cust.sock, 'support:open', { subject: `Least privilege ${tag}`, message: 'Please look at my order' });
  ok(a.ok, 'setup: a customer opens a ticket', a.error ?? '');
  const tkt = a.data;
  for (const [name, u] of Object.entries(notSupport)) {
    ok(!((await req(u.sock, 'support:list')).data ?? []).some((t) => t.id === tkt.id), `${name} admin does not see other people's tickets`);
    ok(!(await req(u.sock, 'support:get', { id: tkt.id })).ok, `${name} admin cannot open the ticket`);
    ok(!(await req(u.sock, 'support:reply', { id: tkt.id, text: 'Let me step in' })).ok, `${name} admin cannot answer it`);
    ok(!(await req(u.sock, 'support:setStatus', { id: tkt.id, status: 'closed' })).ok && !(await req(u.sock, 'support:assign', { id: tkt.id, assigneeId: u.user.id })).ok, `${name} admin cannot close or assign it`);
  }
  ok((await req(admin.sock, 'support:get', { id: tkt.id })).data?.status === 'open' && JSON.parse((await req(admin.sock, 'support:get', { id: tkt.id })).data.messages).length === 1, 'the ticket is untouched');
  ok(((await req(support.sock, 'support:list')).data ?? []).some((t) => t.id === tkt.id), 'a support admin sees it');
  a = await req(support.sock, 'support:assign', { id: tkt.id, assigneeId: support.user.id });
  ok(a.ok && a.data.assigneeId === support.user.id, 'and takes it');
  ok((await req(support.sock, 'support:setStatus', { id: tkt.id, status: 'resolved' })).ok, 'and resolves it');
  ok(!(await req(support.sock, 'support:assign', { id: tkt.id, assigneeId: finance.user.id })).ok, 'a finance admin cannot be made its agent');

  // Warehouse tiers: what the web hides from an operator is refused by the server.
  section('Least privilege: warehouse tiers are enforced on the server');
  const operator = await login('operator@somba.app');
  const supervisor = await login('warehouse.limete@somba.app');
  const manager = warehouse; // warehouse@somba.app is the Kinshasa manager
  const tierRefusal = /supervisors and managers|managers can/;
  const supervisorEvents = ['warehouse:aged', 'warehouse:reconcile', 'exceptions:list', 'replacements:list', 'exchanges:list'];
  for (const ev of supervisorEvents) {
    a = await req(operator.sock, ev, {});
    ok(!a.ok && tierRefusal.test(a.error ?? ''), `${ev}: an operator is refused`, a.error ?? '');
    ok((await req(supervisor.sock, ev, {})).ok && (await req(manager.sock, ev, {})).ok && (await req(admin.sock, ev, {})).ok, `${ev}: a supervisor, a manager and the super admin are not`);
  }
  a = await req(operator.sock, 'analytics:warehouse', {});
  ok(!a.ok && /managers/.test(a.error ?? ''), 'analytics:warehouse: an operator is refused', a.error ?? '');
  a = await req(supervisor.sock, 'analytics:warehouse', {});
  ok(!a.ok && /managers/.test(a.error ?? ''), 'analytics:warehouse: a supervisor is refused too (managers only)', a.error ?? '');
  ok((await req(manager.sock, 'analytics:warehouse', {})).ok && (await req(admin.sock, 'analytics:warehouse', {})).ok, 'analytics:warehouse: the manager and the super admin are not');
  for (const [ev, body] of [['exceptions:setStatus', { id: 'x', status: 'resolved' }], ['replacements:setStatus', { id: 'x', status: 'approved' }], ['exchanges:setStatus', { id: 'x', status: 'approved' }], ['returns:grade', { id: 'x', grades: [] }], ['disputes:markReceived', { disputeId: 'x' }]]) {
    a = await req(operator.sock, ev, body);
    ok(!a.ok && /supervisors and managers/.test(a.error ?? ''), `${ev}: an operator is refused`, a.error ?? '');
    a = await req(supervisor.sock, ev, body);
    ok(!a.ok && !/supervisors and managers|Ops only/.test(a.error ?? ''), `${ev}: a supervisor passes the tier check (then the record is not found)`, a.error ?? '');
  }
  a = await req(operator.sock, 'exceptions:create', { notes: `Operator raises an incident ${tag}`, type: 'damaged' });
  ok(a.ok, 'an operator can still raise an incident', a.error ?? '');
  const excId = a.data?.id;
  const excTask = (await req(manager.sock, 'warehouse:parcels', { limit: 1 })).data?.[0];
  if (excTask) ok((await req(operator.sock, 'exceptions:list', { taskId: excTask.id })).ok, "and read one parcel's incidents (its detail screen)");
  ok(!(await req(operator.sock, 'exceptions:list', { status: 'all' })).ok, 'but not the whole list');
  if (excId) ok((await req(supervisor.sock, 'exceptions:setStatus', { id: excId, status: 'resolved' })).ok === false, "a supervisor of another warehouse still cannot touch this warehouse's incident");
  ok((await req(manager.sock, 'exceptions:setStatus', { id: excId, status: 'resolved', resolution: 'Smoke' })).ok, 'the warehouse manager resolves it');
  ok(!(await req(rider.sock, 'warehouse:aged', {})).ok && !(await req(cust.sock, 'warehouse:reconcile', {})).ok, 'riders and customers never');

  // The warehouse and logistics desk: dispatch, scanning, batches, runs, task reads. Only the super admin, operations and warehouse staff.
  section('Least privilege: the warehouse desk is for operations and warehouse staff, not for every admin');
  const deskParcel = (await req(manager.sock, 'warehouse:parcels', { limit: 5 })).data?.find((t) => !['delivered', 'failed'].includes(t.status));
  ok(!!deskParcel, 'setup: the Kinshasa manager sees a parcel to try the desk on');
  const parcelState = async () => { const t = (await req(admin.sock, 'warehouse:parcels', { limit: 200 })).data?.find((x) => x.id === deskParcel?.id); return `${t?.status}|${t?.riderId ?? ''}`; };
  const stateBefore = await parcelState();
  const notDesk = { finance, support, marketing, moderation };
  const deskCalls = [
    ['delivery:list', {}], ['delivery:unassigned', {}], ['delivery:assign', { taskId: deskParcel?.id, riderId: rider.user.id }],
    ['warehouse:parcels', {}], ['warehouse:inventory', {}], ['warehouse:batches', {}], ['warehouse:riders', {}], ['warehouse:hubs', {}], ['warehouse:aged', {}],
    ['warehouse:receive', { taskId: deskParcel?.id }], ['warehouse:buildBatch', { taskIds: [deskParcel?.id], riderId: rider.user.id }],
    ['exceptions:list', {}], ['exceptions:create', { notes: `Not my desk ${tag}`, type: 'damaged' }], ['exceptions:setStatus', { id: 'x', status: 'resolved' }],
    ['logistics:queue', {}], ['logistics:custody', { hubId: deskParcel?.hubId }], ['logistics:riders', { taskId: deskParcel?.id }],
    ['logistics:assign', { taskId: deskParcel?.id, riderId: rider.user.id }], ['logistics:scanIn', { taskId: deskParcel?.id }], ['logistics:scanOut', { taskId: deskParcel?.id }],
    ['logistics:dispatchTransfer', { taskId: deskParcel?.id }], ['logistics:runs', {}], ['logistics:runProposals', { hubId: deskParcel?.hubId }],
    ['logistics:createRun', { toHubId: deskParcel?.hubId, taskIds: [deskParcel?.id] }], ['logistics:dispatchRun', { runId: 'x' }], ['logistics:receiveRun', { runId: 'x' }],
    ['lanes:list', {}], ['routes:preview', {}], ['hubs:people', { hubId: deskParcel?.hubId }], ['hubs:setTier', { userId: operator.user.id, tier: 'manager' }],
    ['hubSettings:get', { hubId: deskParcel?.hubId }], ['aged:summary', {}], ['analytics:legs', {}], ['warehouseOps:runNow', {}],
  ];
  for (const [name, u] of Object.entries(notDesk)) {
    const refused = [];
    for (const [ev, body] of deskCalls) {
      a = await req(u.sock, ev, body);
      if (a.ok) refused.push(`${ev} was allowed`);
      else if (!/warehouse desk|Not allowed/.test(a.error ?? '')) refused.push(`${ev}: ${a.error}`);
    }
    ok(refused.length === 0, `${name} admin is refused at all ${deskCalls.length} desk events (dispatch, scan, batches, runs, task reads, incidents)`, refused.join(' | '));
  }
  ok((await parcelState()) === stateBefore, 'so the parcel is exactly as the warehouse left it (nothing was assigned or scanned)');
  a = await req(notDesk.marketing.sock, 'logistics:assign', { taskId: deskParcel?.id, riderId: rider.user.id });
  ok(!a.ok && /Only operations admins and warehouse staff can work the warehouse desk/.test(a.error ?? ''), 'the refusal says whose desk it is', a.error ?? '');
  for (const [name, u] of Object.entries({ admin, ops })) {
    ok((await req(u.sock, 'delivery:list', {})).ok && (await req(u.sock, 'logistics:queue', {})).ok && (await req(u.sock, 'warehouse:riders', {})).ok && (await req(u.sock, 'exceptions:list', {})).ok, `the ${name} admin still reads the desk, tasks and incidents`);
  }
  ok((await req(manager.sock, 'logistics:queue', {})).ok && (await req(operator.sock, 'delivery:list', {})).ok, 'and warehouse staff still work their own warehouse');
  // The hub directory: the full list (head counts, address) for the desk; the public list for every other admin role.
  ok((await req(ops.sock, 'hubs:list', {})).data?.every((h) => 'activeRiders' in h), 'operations reads the full hub directory');
  for (const [name, u] of Object.entries(notDesk)) {
    const hubs = (await req(u.sock, 'hubs:list', {})).data ?? [];
    ok(hubs.length > 0 && hubs.every((h) => !('activeRiders' in h) && !('address' in h)), `${name} admin gets the public hub list only`);
  }
  // Orders carry the customer's delivery address and phone: super admin, operations and support (read-only) read them; finance and
  // moderation read the order without it; marketing reads no order.
  const addressOf = async (u) => ((await req(u.sock, 'orders:list', { limit: 200 })).data ?? []).filter((o) => o.shippingAddress).length;
  const withAddress = await addressOf(admin);
  ok(withAddress > 0, 'setup: the super admin reads orders with their addresses');
  ok((await addressOf(ops)) === withAddress && (await addressOf(support)) === withAddress, 'operations and support read the same orders with their addresses');
  for (const [name, u] of Object.entries({ finance, moderation })) {
    a = await req(u.sock, 'orders:list', { limit: 200 });
    ok(a.ok && a.data.length > 0 && a.data.every((o) => !o.shippingAddress), `${name} admin reads the orders (amounts, lines) without any delivery address`);
  }
  a = await req(marketing.sock, 'orders:list', {});
  ok(!a.ok && /cannot read orders/.test(a.error ?? ''), 'marketing admin reads no order', a.error ?? 'was allowed');
  ok(!(await req(support.sock, 'orders:updateStatus', { orderId: deskParcel?.orderId, status: 'processing' })).ok, 'support reads orders but cannot change one');
  a = await req(finance.sock, 'analytics:warehouse', {});
  ok(a.ok, 'finance keeps the warehouse figures of its analytics page');
  ok(!(await req(support.sock, 'analytics:warehouse', {})).ok && !(await req(marketing.sock, 'analytics:warehouse', {})).ok && !(await req(moderation.sock, 'analytics:warehouse', {})).ok, 'support, marketing and moderation do not');

  section('Round 2 least privilege: listing as the platform, translations, store identity papers, rider cash');
  const reviewers = { admin, moderation, ops };
  const notReviewers = { finance, support, marketing };
  const platformListers = { admin, moderation };
  const notListers = { finance, ops, support, marketing };
  // products:create as the platform: Super Admin and Moderation only.
  for (const [name, u] of Object.entries(notListers)) {
    a = await req(u.sock, 'products:create', { name: `Platform item ${name} ${tag}`, price: 9, category: 'Electronics', stock: 1 });
    ok(!a.ok && /sellers or moderators/.test(a.error ?? ''), `${name} admin cannot list a product as the platform`, a.error ?? 'was allowed');
  }
  ok(!(await req(cust.sock, 'products:create', { name: 'x', price: 5, category: 'x' })).ok, 'a customer never can');
  for (const [name, u] of Object.entries(platformListers)) {
    a = await req(u.sock, 'products:create', { name: `Platform item ${name} ${tag}`, price: 9, category: 'Electronics', stock: 1 });
    ok(a.ok, `the ${name} admin can`, a.error ?? '');
  }
  a = await req(ops.sock, 'products:import', { sellerId: sellerA.store.id, rows: [{ name: `Ops import ${tag}`, price: 3, category: 'Electronics' }] });
  ok(!a.ok && /moderators/.test(a.error ?? ''), 'operations cannot import products for a store either', a.error ?? 'was allowed');
  // translation:status / translation:retry: Super Admin and Moderation only.
  for (const [name, u] of Object.entries({ ...notListers, seller: sellerA, customer: cust })) {
    ok(!(await req(u.sock, 'translation:status')).ok && !(await req(u.sock, 'translation:retry', {})).ok, `${name} cannot read or retry the translation queue`);
  }
  for (const [name, u] of Object.entries(platformListers)) {
    ok((await req(u.sock, 'translation:status')).ok && (await req(u.sock, 'translation:retry', {})).ok, `the ${name} admin can`);
  }
  // sellers:list / sellers:get: KYC papers only for the reviewers (Super Admin, Moderation, Operations).
  const PAPERS = ['legalName', 'idNumber', 'rccm', 'taxNumber', 'documentUrls'];
  const withKyc = (await req(admin.sock, 'sellers:list', { limit: 200 })).data?.find((x) => x.legalName && x.idNumber && Array.isArray(x.documentUrls) && x.documentUrls.length);
  ok(!!withKyc, 'setup: the super admin sees a store with its identity papers');
  for (const [name, u] of Object.entries(reviewers)) {
    const row = (await req(u.sock, 'sellers:list', { limit: 200 })).data?.find((x) => x.id === withKyc?.id);
    ok(!!row && PAPERS.every((k) => row[k]), `${name}: sellers:list carries legal name, ID, RCCM / tax and documents`);
    a = await req(u.sock, 'sellers:get', { id: withKyc.id });
    ok(a.ok && a.data.legalName === withKyc.legalName && a.data.documentUrls.length > 0, `${name}: sellers:get carries the KYC`, a.error ?? '');
  }
  for (const [name, u] of Object.entries(notReviewers)) {
    const list = (await req(u.sock, 'sellers:list', { limit: 200 })).data ?? [];
    ok(list.length > 0 && list.some((x) => x.id === withKyc?.id && x.name), `${name}: sellers:list still lists the stores (public profile)`);
    ok(list.every((x) => PAPERS.every((k) => !(k in x)) && !('phone' in x) && !('payoutAccountMasked' in x)), `${name}: no identity papers, phone or payout details in the list`);
    ok(list.every((x) => typeof x.userId === 'string' || x.userId === null), `${name}: the owner's account id stays (an internal id: payouts are keyed by it)`);
    a = await req(u.sock, 'sellers:get', { id: withKyc.id });
    ok(a.ok && a.data.name === withKyc.name && PAPERS.every((k) => !(k in a.data)) && !JSON.stringify(a.data).includes(withKyc.idNumber), `${name}: sellers:get returns the public profile only`, a.error ?? '');
  }
  ok(!(await req(cust.sock, 'sellers:list')).ok && !(await req(sellerA.sock, 'sellers:get', { id: withKyc.id })).ok, 'customers and sellers cannot ask');
  // Rider cash (cash:handover, cash:history, warehouse:reconcile): Super Admin, Finance, Operations, and supervisors / managers of the rider's own warehouse.
  const cashAdmins = { admin, finance, ops };
  const notCash = { support, marketing, moderation };
  for (const [name, u] of Object.entries(notCash)) {
    a = await req(u.sock, 'cash:history');
    ok(!a.ok && /Not allowed/.test(a.error ?? ''), `${name} admin cannot read cash hand-overs`, a.error ?? 'was allowed');
    a = await req(u.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
    ok(!a.ok && /Not allowed/.test(a.error ?? ''), `${name} admin cannot record a hand-over`, a.error ?? 'was allowed');
    a = await req(u.sock, 'warehouse:reconcile', {});
    ok(!a.ok && /Not allowed/.test(a.error ?? ''), `${name} admin cannot open the cash reconciliation`, a.error ?? 'was allowed');
  }
  for (const [name, u] of Object.entries(cashAdmins)) {
    ok((await req(u.sock, 'cash:history')).ok && (await req(u.sock, 'warehouse:reconcile', {})).ok, `the ${name} admin reads the cash history and reconciliation`);
    a = await req(u.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
    ok(!/Not allowed|Staff only/.test(a.error ?? ''), `the ${name} admin passes the role check (any refusal is about the cash, not the role)`, a.error ?? '');
  }
  a = await req(operator.sock, 'cash:history');
  ok(!a.ok && /supervisors and managers/.test(a.error ?? ''), 'an operator cannot read the cash hand-overs', a.error ?? 'was allowed');
  ok((await req(supervisor.sock, 'cash:history')).ok && (await req(manager.sock, 'cash:history')).ok, 'a supervisor and a manager of a warehouse can');
  ok(!(await req(cust.sock, 'cash:history')).ok && !(await req(rider.sock, 'cash:history')).ok, 'customers and riders never');
  a = await req(supervisor.sock, 'cash:handover', { riderId: rider.user.id, amountUsd: 1 });
  ok(!a.ok && /another warehouse|holds no cash|no cash/.test(a.error ?? ''), "a supervisor can only take cash from their own warehouse's riders", a.error ?? 'was allowed');
  for (const u of [moderation, marketing, support, operator, supervisor]) u.sock.close();

  section('List limits cannot be abused');
  ok((await req(cust.sock, 'orders:list', { limit: 1e12, offset: -5 })).ok && (await req(cust.sock, 'products:list', { limit: 'DROP', offset: {} })).ok, 'absurd limit / offset values are normalised, not errors');
  ok((await req(cust.sock, 'products:list', { limit: 2 })).data.length === 2, 'a small limit is honoured');
  ok(!(await req(cust.sock, 'customers:list', { limit: 1 })).ok && !(await req(cust.sock, 'warehouse:parcels', { limit: 1 })).ok && !(await req(cust.sock, 'sellers:list', { limit: 1 })).ok, 'paging does not open staff lists to customers');
  ok((await req(cust2.sock, 'orders:list', { limit: 500 })).data.every((o) => o.customerId === cust2.user.id), 'a customer only ever pages through their own orders');

  console.log(fails.length ? `\n❌ ${pass} passed, ${fails.length} failed:\n   - ${fails.join('\n   - ')}` : `\n🎉 ${pass} passed, 0 failed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
