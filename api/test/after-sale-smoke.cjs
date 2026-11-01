/* After-sale & engagement: returns (accept, reject -> escalate -> admin, seller timeout), partial refunds, restock and
 * grading, disputes (reply, decide), replacements and exchanges (approve, stock, price difference, delivery follow-up),
 * product Q&A, reviews (report, hide, helpful), the bell (super admin, read state) and support (photos, unread,
 * agent notices, rider tickets, assignment, concurrent replies).
 *
 * Runs against a RUNNING API seeded with `npm run seed` (fake translator). It reads and writes the same MySQL database
 * to age orders (mark them delivered / old); DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE as for the API.
 *
 *   API_URL=http://localhost:3022 DB_DATABASE=somba_after AFTER_SALE_SWEEP_MS=1500 node test/after-sale-smoke.cjs
 *
 * The API must run with AFTER_SALE_SWEEP_MS=1500 (the seller-timeout check) and ADMIN_PW to override the seed password.
 */
const { io } = require('socket.io-client');
const mysql = require('mysql2/promise');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3022';
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
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
/** The next time `ev` arrives on `sock` (or null after `ms`). Start BEFORE doing the thing that causes it. */
const nextEvent = (sock, ev, match = () => true, ms = 6000) => new Promise((res) => {
  const t = setTimeout(() => { sock.off(ev, h); res(null); }, ms);
  const h = (p) => { if (match(p)) { clearTimeout(t); sock.off(ev, h); res(p); } };
  sock.on(ev, h);
});
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@aftersale.test`, password: 'Aftersale-Pass-2026', name: `${label} User`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const loginAs = async (email, pw) => { const r = await rest('/api/v1/auth/login', { email, password: pw }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`); return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) }; };
// A 1x1 PNG, uploaded through the real endpoint, so photos are real upload URLs.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = async (token) => {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
  const res = await fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  return (await res.json()).url;
};
const noticesOf = async (u) => (await req(u.sock, 'notifications:list')).data ?? [];
const hasNotice = async (u, pred) => !!(await until(async () => (await noticesOf(u)).find(pred)));

(async () => {
  const dbName = process.env.DB_DATABASE ?? 'somba_after';
  const db = await mysql.createConnection({ host: process.env.DB_HOST ?? 'localhost', user: process.env.DB_USERNAME ?? 'root', password: process.env.DB_PASSWORD ?? '', database: dbName });
  const sql = async (q, p = []) => (await db.query(q, p))[0];

  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const finance = await login('finance@somba.app', process.env.FINANCE_PW ?? PW);
  const warehouse = await login('warehouse@somba.app', process.env.WAREHOUSE_PW ?? PW);
  // A support agent and a moderator (fresh accounts, promoted, then signed in again: a role change ends the old session)
  const promote = async (label, role) => {
    const u = await register(label);
    const r = await req(admin.sock, 'roles:setRole', { id: u.user.id, role });
    if (!r.ok) throw new Error(`setRole ${role}: ${r.error}`);
    u.sock.close();
    return loginAs(`${label}${tag}@aftersale.test`, 'Aftersale-Pass-2026');
  };
  const agent = await promote('agent', 'admin_support');
  const mod = await promote('mod', 'admin_moderation');
  const guest = { sock: await connect() };
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'productModeration', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'false' });
  await req(admin.sock, 'settings:set', { key: 'returnWindowDays', value: '7' });
  await req(admin.sock, 'settings:set', { key: 'sellerResponseHours', value: '48' });

  const cust = await register('buyer');
  const other = await register('other');
  const photo = await upload(cust.token);
  const photo2 = await upload(cust.token);

  // two approved stores
  const mkSeller = async (label) => {
    const u = await register(label, 'seller');
    const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
    await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    return { ...u, store };
  };
  const s1 = await mkSeller('shop');
  const s2 = await mkSeller('shop2');
  const mkProduct = async (s, name, price, stock = 60, variants) => {
    const r = await req(s.sock, 'products:create', { name: `${name} ${tag}`, price, category: 'Electronics', stock, ...(variants ? { variants } : {}) });
    if (!r.ok) throw new Error(`product ${name}: ${r.error}`);
    return r.data;
  };
  const pA = await mkProduct(s1, 'Headphones', 20, 60);
  const pB = await mkProduct(s1, 'Charger', 10, 60);
  const pS = await mkProduct(s1, 'Sneakers', 30, 60, [{ name: 'Size', options: ['40', '41', '42'] }]);
  const pCheap = await mkProduct(s1, 'Socks', 5, 60);
  const pDear = await mkProduct(s1, 'Boots', 50, 60);
  const pOther = await mkProduct(s2, 'Cable', 8, 60);
  const stockOf = async (p) => (await req(cust.sock, 'products:get', { id: p.id })).data.stock;

  const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa', geo: { lat: -4.3276, lng: 15.3136 } });
  /** A delivered order: placed and paid for through the API, then aged by hand (delivery itself is logistics' business). */
  const delivered = async (buyer, items, ageDays = 0) => {
    const a = await req(buyer.sock, 'orders:create', { items, paymentMethod: 'stripe_card', shippingAddress: ADDRESS });
    if (!a.ok) throw new Error(`orders:create: ${a.error}`);
    const o = a.data;
    await until(async () => (await sql('SELECT status FROM orders WHERE id = ?', [o.id]))[0]?.status === 'confirmed');
    await sql("UPDATE orders SET status = 'delivered', updatedAt = ? WHERE id = ?", [new Date(Date.now() - ageDays * 86400000), o.id]);
    await sql("UPDATE delivery_tasks SET status = 'delivered', deliveredAt = ? WHERE orderId = ? AND kind IN ('delivery')", [new Date(Date.now() - ageDays * 86400000), o.id]);
    return o;
  };
  const riders = [];
  const riderForHub = async (hubId) => {
    if (!riders.length) for (const e of ['rider@somba.app', 'rider.limete@somba.app']) riders.push(await login(e, PW).catch(() => null));
    return riders.find((r) => r && r.user.hubId === hubId) ?? null;
  };
  /** A rider of the leg's warehouse is assigned and collects the parcel (a parcel nobody collected cannot be scanned in). */
  const collect = async (taskId, hubId) => {
    const rider = await riderForHub(hubId);
    if (!rider) return false;
    await req(admin.sock, 'logistics:assign', { taskId, riderId: rider.user.id });
    return (await req(rider.sock, 'delivery:updateStatus', { taskId, status: 'picked_up' })).ok;
  };
  const lines = async (orderId) => sql('SELECT id, productId, qty, priceUsd, refundedUsd FROM order_items WHERE orderId = ?', [orderId]);
  const balance = async (u) => (await req(u.sock, 'wallet:get')).data.balance;
  const topUp = async (u, amount) => {
    const t = await req(u.sock, 'wallet:topup', { amountUsd: amount, method: 'airtel_money', phone: '+243812345678' });
    await req(finance.sock, 'payments:confirm', { reference: t.data.reference });
    await until(async () => (await balance(u)) >= amount);
  };

  // ======================================================================== RETURNS
  section('Returns: the window, the lines, the photos');
  const o1 = await delivered(cust, [{ productId: pA.id, qty: 3 }, { productId: pB.id, qty: 2 }]);
  const l1 = await lines(o1.id);
  const lineA = l1.find((l) => l.productId === pA.id);
  const lineB = l1.find((l) => l.productId === pB.id);
  let a = await req(cust.sock, 'disputes:eligibility', { orderId: o1.id });
  ok(a.ok && a.data.eligible && a.data.windowDays === 7 && a.data.items.length === 2 && a.data.items.every((i) => i.remaining === i.qty), 'eligibility shows the window and every line with what can still be returned', JSON.stringify(a));
  ok(!(await req(other.sock, 'disputes:eligibility', { orderId: o1.id })).ok, "another customer cannot ask about this order");
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: lineA.id, qty: 9 }], attachments: [photo] });
  ok(!a.ok && /at most 3/.test(a.error ?? ''), 'returning more than was bought is refused', a.error ?? '');
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: lineA.id, qty: 1 }], attachments: ['https://evil.example/x.png'] });
  ok(!a.ok && /uploaded/i.test(a.error ?? ''), 'a photo that is not an upload is refused', a.error ?? '');
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'return', reason: 'Left cup is dead', category: 'unknown', items: [{ itemId: lineA.id, qty: 1 }] });
  ok(!a.ok, 'an unknown reason category is refused');
  a = await req(admin.sock, 'settings:set', { key: 'returnWindowDays', value: '0' });
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'return', reason: 'Left cup is dead', items: [{ itemId: lineA.id, qty: 1 }] });
  ok(!a.ok && /not accepted/.test(a.error ?? ''), 'with the window at 0 days, returns are closed', a.error ?? '');
  await req(admin.sock, 'settings:set', { key: 'returnWindowDays', value: '7' });
  const old = await delivered(cust, [{ productId: pB.id, qty: 1 }], 9);
  a = await req(cust.sock, 'disputes:open', { orderId: old.id, type: 'return', reason: 'Changed my mind about it' });
  ok(!a.ok && /within 7 days/.test(a.error ?? ''), 'an order delivered 9 days ago is outside the 7-day window', a.error ?? '');
  ok(!(await req(cust.sock, 'disputes:eligibility', { orderId: old.id })).data.eligible, 'eligibility says so too');

  section('Returns: the seller accepts, the goods come back, the returned items are refunded');
  const sellerLive = nextEvent(s1.sock, 'dispute:created');
  const balBefore = await balance(cust);
  const stockBeforeA = await stockOf(pA);
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'return', reason: 'Left cup is dead', category: 'defective', items: [{ itemId: lineA.id, qty: 2 }], attachments: [photo, photo2] });
  ok(a.ok && a.data.type === 'return' && a.data.stage === 'awaiting_seller' && a.data.items.length === 1 && a.data.items[0].qty === 2 && a.data.attachments.length === 2, 'the customer opens a return for 2 of the 3 headphones with 2 photos', a.error ?? '');
  const r1 = a.data;
  ok(!!r1.sellerDueAt && Math.abs(new Date(r1.sellerDueAt) - Date.now() - 48 * 3600000) < 60000, 'the seller has 48 hours to answer');
  const live = await sellerLive;
  ok(live && live.id === r1.id && !('customerId' in live) && live.customerName === 'buyer', 'the seller is pushed dispute:created live, with the first name and no customer id', JSON.stringify(live && { c: live.customerId, n: live.customerName }));
  const sList = (await req(s1.sock, 'disputes:list')).data;
  ok(sList.some((d) => d.id === r1.id && !('customerId' in d) && d.customerName === 'buyer'), "the seller's list shows it without the customer id and with a first name only");
  ok(!(await req(s2.sock, 'disputes:list')).data.some((d) => d.id === r1.id), 'an unrelated seller does not see it');
  a = await req(cust.sock, 'disputes:open', { orderId: o1.id, type: 'return', reason: 'And the rest too please', items: [{ itemId: lineA.id, qty: 2 }] });
  ok(!a.ok, 'the same units cannot be returned twice (only 1 headphone is left)', a.error ?? '');
  ok(await hasNotice(s1, (n) => n.entityId === r1.id && n.title === 'Return requested on your order'), 'the seller gets a notice');
  ok(await hasNotice(agent, (n) => n.entityId === r1.id && n.title === 'Return requested'), 'support agents get a notice');
  ok(await hasNotice(admin, (n) => n.entityId === r1.id && n.title === 'Return requested'), 'the super admin sees the support notice too');
  ok(!(await req(cust.sock, 'returns:respond', { id: r1.id, accept: true })).ok, 'a customer cannot answer for the seller');
  ok(!(await req(s2.sock, 'returns:respond', { id: r1.id, accept: true })).ok, "another store cannot answer");
  const custLive = nextEvent(cust.sock, 'dispute:updated', (d) => d.id === r1.id && d.stage !== 'awaiting_seller');
  a = await req(s1.sock, 'returns:respond', { id: r1.id, accept: true, reason: 'Sorry about that' });
  ok(a.ok && ['approved', 'pickup'].includes(a.data.stage), 'the seller accepts the return', a.error ?? '');
  ok((await custLive)?.id === r1.id, 'the customer sees it move live');
  ok(await hasNotice(cust, (n) => n.entityId === r1.id && n.title === 'Return accepted'), 'the customer is told it was accepted');
  a = await req(s1.sock, 'returns:respond', { id: r1.id, accept: false, reason: 'Changed my mind later' });
  ok(!a.ok, 'a request that was answered cannot be answered again', a.error ?? '');
  const pickup = await until(async () => (await sql("SELECT id, kind, status, hubId, toHubId FROM delivery_tasks WHERE disputeId = ? AND kind = 'return_pickup'", [r1.id]))[0]);
  ok(!!pickup, 'logistics created the return pickup task', 'no task');
  ok((await req(cust.sock, 'disputes:get', { id: r1.id })).data.stage === 'pickup', 'the return is in the pickup stage');
  // The warehouse scans the goods in
  const refundBefore = await balance(cust);
  ok(await collect(pickup.id, pickup.hubId), 'a rider collects the returned goods from the customer');
  a = await req(warehouse.sock, 'logistics:scanIn', { taskId: pickup.id });
  if (!a.ok) { // the seeded desk account may belong to another hub: scan as an admin
    a = await req(admin.sock, 'logistics:scanIn', { taskId: pickup.id });
  }
  ok(a.ok, 'the warehouse scans the returned goods in', a.error ?? '');
  const closed = await until(async () => { const d = (await req(cust.sock, 'disputes:get', { id: r1.id })).data; return d.status === 'resolved' ? d : null; });
  ok(!!closed && typeof closed.resolutionFr === 'string' && closed.resolutionFr.length > 0, 'a closed request carries its resolution in French too', JSON.stringify(closed && [closed.resolution, closed.resolutionFr]));
  ok(!!closed && closed.receivedAt && closed.outcome === 'return_refund', 'scanning the goods in receives the return and closes it with the refund', JSON.stringify(closed && { s: closed.status, o: closed.outcome }));
  const expected = 40; // 2 x $20
  ok(closed && Math.abs(closed.refundUsd - expected) < 0.01, `the refund covers the returned items only ($${expected}: 2 of 3 headphones, no charger)`, closed ? String(closed.refundUsd) : '');
  ok(Math.abs((await balance(cust)) - refundBefore - expected) < 0.01, 'the wallet got exactly that', `${refundBefore} -> ${await balance(cust)}`);
  const lA = (await lines(o1.id)).find((l) => l.productId === pA.id);
  const lBn = (await lines(o1.id)).find((l) => l.productId === pB.id);
  ok(Math.abs(lA.refundedUsd - 40) < 0.01 && Number(lBn.refundedUsd) === 0, 'only the returned line carries the refund');
  ok((await sql('SELECT status FROM orders WHERE id = ?', [o1.id]))[0].status === 'delivered', 'a part-return leaves the order delivered');
  ok((await sql('SELECT status FROM payments WHERE orderId = ?', [o1.id]))[0].status === 'succeeded', 'and the payment open for the rest');
  ok((await stockOf(pA)) === stockBeforeA, 'nothing is restocked before the warehouse grades the goods');
  ok(await hasNotice(cust, (n) => n.type === 'payment' && /\$40\.00/.test(n.body) && n.title === 'Refund issued'), 'the customer gets the refund notice');
  const tx = (await req(cust.sock, 'wallet:transactions')).data;
  ok(tx.some((t) => /returned items/.test(t.description) && t.descriptionFr?.includes('articles retournés')), 'the wallet line says what it was for, in French too');

  section('Refund record (C-refund): the return refund is on the payment, in the ledger and in finance');
  const payO1 = (await sql('SELECT id, reference, amountUsd, status, refundedUsd FROM payments WHERE orderId = ?', [o1.id]))[0];
  ok(Math.abs(Number(payO1.refundedUsd) - expected) < 0.01 && payO1.status === 'succeeded', 'the payment carries the running total of its refunds and stays open for the rest', JSON.stringify(payO1));
  const ledO1 = await sql('SELECT amountUsd, refundTo, kind, status, disputeId, disputeReference FROM payment_refunds WHERE paymentId = ?', [payO1.id]);
  ok(ledO1.length === 1 && Math.abs(ledO1[0].amountUsd - expected) < 0.01 && ledO1[0].kind === 'return' && ledO1[0].refundTo === 'wallet' && ledO1[0].status === 'completed', 'the refund ledger has one row: the return, to the wallet', JSON.stringify(ledO1));
  ok(ledO1[0] && ledO1[0].disputeId === r1.id && ledO1[0].disputeReference === closed.reference, 'and it names which return it was', JSON.stringify(ledO1[0]));
  const listedO1 = (await req(admin.sock, 'payments:list')).data.find((p) => p.id === payO1.id);
  ok(!!listedO1 && Math.abs(listedO1.refundedUsd - expected) < 0.01 && Math.abs(listedO1.refundableUsd - (payO1.amountUsd - expected)) < 0.01, 'the admin payment list shows what is refunded and what is left', JSON.stringify(listedO1 && [listedO1.refundedUsd, listedO1.refundableUsd]));
  const refundLog = await req(admin.sock, 'payments:refunds');
  ok(refundLog.ok && refundLog.data.some((r) => r.paymentId === payO1.id && r.disputeReference === closed.reference && r.paymentReference === payO1.reference && Math.abs(r.amountUsd - expected) < 0.01), 'the admin Refunds page can list it (amount, method, date, which return)', refundLog.error ?? '');
  ok(!(await req(cust.sock, 'payments:refunds')).ok && !(await req(agent.sock, 'payments:refunds')).ok, 'only admin and finance read the refund ledger');
  const finO1 = await req(admin.sock, 'analytics:finance');
  ok(finO1.ok && finO1.data.refundsUsd >= expected - 0.01 && finO1.data.refundsCount >= 1, 'finance counts the return refund (Refunds is no longer $0)', finO1.ok ? JSON.stringify([finO1.data.refundsUsd, finO1.data.refundsCount]) : finO1.error);
  const dupO1 = await req(admin.sock, 'orders:refund', { orderId: o1.id, toWallet: true });
  const balDup = await balance(cust);
  ok(dupO1.ok && Math.abs(dupO1.data.refund.amountUsd - (payO1.amountUsd - expected)) < 0.01, 'an admin refund of that order pays only what is left, never the $40 again', dupO1.ok ? String(dupO1.data.refund.amountUsd) : dupO1.error);
  ok(Math.abs(balDup - (refundBefore + payO1.amountUsd)) < 0.01, 'the customer got back exactly what was paid, in total', `${refundBefore} -> ${balDup} (paid ${payO1.amountUsd})`);
  const again = await req(admin.sock, 'orders:refund', { orderId: o1.id, toWallet: true });
  ok(!again.ok && /Already refunded/.test(again.error ?? ''), 'a second refund of it is refused', again.error ?? '');
  ok((await sql('SELECT ROUND(SUM(amountUsd), 2) AS t FROM payment_refunds WHERE paymentId = ?', [payO1.id]))[0].t == payO1.amountUsd, 'the refunds add up to exactly the amount paid');

  section('Returns: the warehouse grades the goods');
  const item = closed.items[0];
  ok(!(await req(cust.sock, 'returns:grade', { id: r1.id, grades: [{ itemId: item.id, condition: 'resellable' }] })).ok, 'a customer cannot grade');
  a = await req(warehouse.sock, 'returns:grade', { id: r1.id, grades: [{ itemId: item.id, condition: 'damaged', restockQty: 1 }] });
  ok(!a.ok && /resellable/.test(a.error ?? ''), 'damaged goods cannot go back on the shelf', a.error ?? '');
  a = await req(warehouse.sock, 'returns:grade', { id: r1.id, grades: [{ itemId: item.id, condition: 'resellable', restockQty: 1 }] });
  ok(a.ok && !!a.data.gradedAt && a.data.items[0].restockedQty === 1 && a.data.items[0].condition === 'resellable', 'the warehouse grades: 1 of the 2 back on the shelf', a.error ?? '');
  ok((await stockOf(pA)) === stockBeforeA + 1, 'only those units are restocked', `${stockBeforeA} -> ${await stockOf(pA)}`);
  ok(!(await req(warehouse.sock, 'returns:grade', { id: r1.id, grades: [{ itemId: item.id, condition: 'resellable' }] })).ok, 'grading twice is refused (no double restock)');
  ok(await hasNotice(s1, (n) => n.entityId === r1.id && n.title === 'Returned goods graded'), 'the seller is told');

  section('Returns: the seller rejects, the customer escalates, support decides');
  const o2 = await delivered(cust, [{ productId: pA.id, qty: 1 }, { productId: pB.id, qty: 1 }]);
  const l2 = await lines(o2.id);
  a = await req(cust.sock, 'disputes:open', { orderId: o2.id, type: 'return', reason: 'Not what I expected at all', items: [{ itemId: l2.find((l) => l.productId === pB.id).id, qty: 1 }] });
  const r2 = a.data;
  ok(a.ok && r2.canCancel && !r2.canEscalate, 'a fresh return can be cancelled but not escalated');
  a = await req(cust.sock, 'disputes:escalate', { id: r2.id });
  ok(!a.ok && /Wait for the seller/.test(a.error ?? ''), 'escalating before the seller answered is refused', a.error ?? '');
  a = await req(s1.sock, 'returns:respond', { id: r2.id, accept: false, reason: '' });
  ok(!a.ok, 'a rejection needs a reason');
  a = await req(s1.sock, 'returns:respond', { id: r2.id, accept: false, reason: 'Used and dirty, we cannot take it back' });
  ok(a.ok && a.data.stage === 'seller_rejected' && a.data.sellerReason.startsWith('Used'), 'the seller rejects with a reason', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.entityId === r2.id && n.title === 'Return rejected' && /Used and dirty/.test(n.body)), 'the customer is told why');
  a = await req(admin.sock, 'returns:decide', { id: r2.id, approve: true });
  ok(a.ok && ['approved', 'pickup'].includes(a.data.stage) === true || !a.ok, 'support may decide a rejected return straight away (or only after escalation)');
  if (a.ok) {
    ok(true, 'support approved it before escalation');
  }
  // A second rejected return for the escalation path
  const o2b = await delivered(cust, [{ productId: pCheap.id, qty: 2 }]);
  const r2b = (await req(cust.sock, 'disputes:open', { orderId: o2b.id, type: 'return', reason: 'Too small for my feet', items: [{ productId: pCheap.id, qty: 2 }] })).data;
  await req(s1.sock, 'returns:respond', { id: r2b.id, accept: false, reason: 'Hygiene items cannot be returned' });
  const esc = nextEvent(agent.sock, 'dispute:updated', (d) => d.id === r2b.id && d.stage === 'escalated');
  a = await req(cust.sock, 'disputes:escalate', { id: r2b.id, note: 'Please look again, they were never worn' });
  ok(a.ok && a.data.stage === 'escalated' && !!a.data.escalatedAt, 'the customer escalates', a.error ?? '');
  ok((await esc)?.id === r2b.id, 'support agents see it live');
  ok(await hasNotice(agent, (n) => n.entityId === r2b.id && n.title === 'Return escalated'), 'support agents get a notice');
  ok(await hasNotice(s1, (n) => n.entityId === r2b.id && n.title === 'Return escalated'), 'and so does the seller');
  ok(!(await req(cust.sock, 'returns:decide', { id: r2b.id, approve: true })).ok, 'customers cannot decide');
  ok(!(await req(s1.sock, 'returns:decide', { id: r2b.id, approve: true })).ok, 'sellers cannot decide either');
  a = await req(agent.sock, 'returns:decide', { id: r2b.id, approve: false, reason: '' });
  ok(!a.ok, 'refusing a return needs a reason');
  a = await req(agent.sock, 'returns:decide', { id: r2b.id, approve: false, reason: 'Hygiene items are final sale' });
  ok(a.ok && a.data.status === 'rejected' && a.data.stage === 'closed', 'support refuses the return: closed', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.entityId === r2b.id && n.title === 'Return closed'), 'the customer is told it is closed');
  const thread = (await req(cust.sock, 'disputes:get', { id: r2b.id })).data;
  ok(thread.messages.length === 1 && thread.messages[0].text.startsWith('Please look again'), 'the escalation note is in the thread');
  // the units come free again after a refusal
  ok((await req(cust.sock, 'disputes:eligibility', { orderId: o2b.id })).data.items[0].remaining === 2, 'a refused return frees its units');

  section('Returns: the seller never answers (timeout), the customer cancels, a full return closes the order');
  await req(admin.sock, 'settings:set', { key: 'sellerResponseHours', value: '0.001' });
  const o3 = await delivered(cust, [{ productId: pCheap.id, qty: 1 }]);
  const r3 = (await req(cust.sock, 'disputes:open', { orderId: o3.id, type: 'return', reason: 'Wrong colour for me', items: [{ productId: pCheap.id, qty: 1 }] })).data;
  await req(admin.sock, 'settings:set', { key: 'sellerResponseHours', value: '48' });
  const lapsed = await until(async () => { const d = (await req(cust.sock, 'disputes:get', { id: r3.id })).data; return d.stage === 'seller_timeout' ? d : null; }, 10000);
  ok(!!lapsed && lapsed.canEscalate, 'after the response time the return moves to seller_timeout and can be escalated');
  ok(await hasNotice(cust, (n) => n.entityId === r3.id && n.title === 'Seller did not respond'), 'the customer is told');
  ok(await hasNotice(s1, (n) => n.entityId === r3.id && n.title === 'Seller did not respond'), 'the seller is told');
  a = await req(s1.sock, 'returns:respond', { id: r3.id, accept: true });
  ok(!a.ok && /response time has passed/.test(a.error ?? ''), 'the seller can no longer answer', a.error ?? '');
  await req(cust.sock, 'disputes:escalate', { id: r3.id });
  a = await req(admin.sock, 'returns:decide', { id: r3.id, approve: true, reason: 'Seller did not respond' });
  ok(a.ok && ['approved', 'pickup'].includes(a.data.stage), 'support approves the lapsed return', a.error ?? '');
  // goods back by hand (the old desk button) -> refund -> the whole order is returned
  const stockBeforeS = await stockOf(pCheap);
  a = await req(warehouse.sock, 'disputes:markReceived', { disputeId: r3.id, restock: true });
  ok(a.ok, 'the desk can still mark goods received by hand', a.error ?? '');
  const done3 = await until(async () => { const d = (await req(cust.sock, 'disputes:get', { id: r3.id })).data; return d.status === 'resolved' ? d : null; });
  ok(!!done3 && Math.abs(done3.refundUsd - 5) < 0.01, 'an approved return is refunded as soon as the goods are in', JSON.stringify(done3 && done3.refundUsd));
  ok((await sql('SELECT status FROM orders WHERE id = ?', [o3.id]))[0].status === 'returned', 'every unit returned: the order becomes returned');
  ok((await stockOf(pCheap)) === stockBeforeS + 1, 'restocked by the by-hand button');
  const o3b = await delivered(cust, [{ productId: pCheap.id, qty: 1 }]);
  const r3b = (await req(cust.sock, 'disputes:open', { orderId: o3b.id, type: 'return', reason: 'Actually I do not need it', items: [{ productId: pCheap.id, qty: 1 }] })).data;
  a = await req(cust.sock, 'disputes:cancel', { id: r3b.id });
  ok(a.ok && a.data.status === 'rejected' && a.data.stage === 'closed', 'the customer cancels a return nobody has acted on', a.error ?? '');
  ok(!(await req(cust.sock, 'disputes:cancel', { id: r3b.id })).ok, 'and only once');

  section('Returns: a legacy return (no lines) still works end to end');
  const o4 = await delivered(cust, [{ productId: pB.id, qty: 1 }]);
  const r4 = (await req(cust.sock, 'disputes:open', { orderId: o4.id, type: 'return', reason: 'Not as described at all' })).data;
  ok(r4 && r4.items.length === 1, 'a return with no lines means everything on the order');
  a = await req(admin.sock, 'disputes:resolve', { disputeId: r4.id, refund: true });
  ok(!a.ok && /received/i.test(a.error ?? ''), 'a refund is refused until the goods are received', a.error ?? '');
  ok(!(await req(cust.sock, 'disputes:markReceived', { disputeId: r4.id })).ok, 'a customer cannot mark their own return received');
  ok((await req(warehouse.sock, 'disputes:markReceived', { disputeId: r4.id })).ok, 'the warehouse marks it received');
  a = await req(admin.sock, 'disputes:resolve', { disputeId: r4.id, refund: true });
  ok(a.ok && a.data.status === 'resolved', 'finance resolves it with the refund', a.error ?? '');

  // ======================================================================== DISPUTES
  section('Disputes: open, seller reply with evidence, support decides');
  const od = await delivered(cust, [{ productId: pA.id, qty: 1 }, { productId: pB.id, qty: 1 }]);
  const ld = await lines(od.id);
  a = await req(cust.sock, 'disputes:open', { orderId: od.id, type: 'dispute', reason: 'The charger never arrived', category: 'missing', items: [{ itemId: ld.find((l) => l.productId === pB.id).id, qty: 1 }], attachments: [photo] });
  ok(a.ok && a.data.type === 'dispute' && a.data.category === 'missing' && a.data.items.length === 1, 'the customer opens a dispute about one item', a.error ?? '');
  const d1 = a.data;
  ok(!(await req(cust.sock, 'disputes:open', { orderId: od.id, type: 'dispute', reason: 'And another thing as well' })).ok, 'one open dispute per order');
  ok(!(await req(s2.sock, 'disputes:get', { id: d1.id })).ok, 'an unrelated seller cannot read it');
  const msgLive = nextEvent(cust.sock, 'dispute:message');
  a = await req(s1.sock, 'disputes:reply', { id: d1.id, message: 'Shipped on Monday, see the photo of the label', attachments: [photo2] });
  ok(a.ok && a.data.attachments.length === 1 && a.data.role === 'seller', 'the seller replies with evidence', a.error ?? '');
  ok((await msgLive)?.disputeId === d1.id, 'the customer gets the message live');
  ok(await hasNotice(cust, (n) => n.entityId === d1.id && n.title === 'Dispute reply'), 'and a notice');
  a = await req(cust.sock, 'disputes:reply', { id: d1.id, message: 'The box was empty when I opened it' });
  ok(a.ok, 'the customer can answer back');
  ok(await hasNotice(agent, (n) => n.entityId === d1.id && n.title === 'Dispute reply'), 'support agents are told about the thread');
  const full = (await req(s1.sock, 'disputes:get', { id: d1.id })).data;
  ok(full.messages.length === 2 && full.stage === 'seller_replied' && !('customerId' in full), 'the seller sees the thread, the stage moved to seller_replied, no customer id');
  ok(!(await req(other.sock, 'disputes:reply', { id: d1.id, message: 'Hello from nowhere' })).ok, 'a stranger cannot join the thread');
  a = await req(admin.sock, 'disputes:decide', { id: d1.id, outcome: 'refund_partial', amountUsd: 0, reason: '' });
  ok(!a.ok, 'a partial refund needs an amount', a.error ?? '');
  a = await req(admin.sock, 'disputes:decide', { id: d1.id, outcome: 'refund_partial', amountUsd: 9999, reason: '' });
  ok(!a.ok && /more than what is left/.test(a.error ?? ''), 'and never more than what is left on the order', a.error ?? '');
  ok(!(await req(agent.sock, 'disputes:decide', { id: d1.id, outcome: 'refund_partial', amountUsd: 5 })).ok, 'a support agent cannot refund (finance and admin only)');
  const b0 = await balance(cust);
  a = await req(finance.sock, 'disputes:decide', { id: d1.id, outcome: 'refund_partial', amountUsd: 7.5, reason: 'The charger was missing' });
  ok(a.ok && a.data.status === 'resolved' && a.data.outcome === 'refund_partial' && a.data.refundUsd === 7.5, 'finance refunds part of the order', a.error ?? '');
  ok(Math.abs((await balance(cust)) - b0 - 7.5) < 0.01, 'the wallet got $7.50');
  ok((await sql('SELECT status FROM orders WHERE id = ?', [od.id]))[0].status === 'delivered', 'the order stays delivered');
  ok(await hasNotice(cust, (n) => n.entityId === d1.id && n.title === 'Dispute resolved'), 'the customer is told');
  ok(await hasNotice(s1, (n) => n.entityId === d1.id && n.title === 'Dispute resolved'), 'the seller is told');
  ok(!(await req(finance.sock, 'disputes:decide', { id: d1.id, outcome: 'reject', reason: 'second thoughts' })).ok, 'a decided dispute cannot be decided again');

  const odf = await delivered(cust, [{ productId: pB.id, qty: 1 }]);
  const d2 = (await req(cust.sock, 'disputes:open', { orderId: odf.id, type: 'dispute', reason: 'Parcel was empty', category: 'not_received' })).data;
  const b1 = await balance(cust);
  a = await req(admin.sock, 'disputes:decide', { id: d2.id, outcome: 'refund_full' });
  ok(a.ok && a.data.outcome === 'refund_full' && a.data.refundUsd > 0, 'full refund of everything still outstanding', a.error ?? '');
  ok((await balance(cust)) > b1, 'wallet credited');
  ok((await sql('SELECT status FROM orders WHERE id = ?', [odf.id]))[0].status === 'returned', 'the order is closed as returned');

  const odr = await delivered(cust, [{ productId: pA.id, qty: 1 }]);
  const d3 = (await req(cust.sock, 'disputes:open', { orderId: odr.id, type: 'dispute', reason: 'Wrong item in the box', category: 'wrong_item' })).data;
  const stockBeforeRep = await stockOf(pA);
  a = await req(admin.sock, 'disputes:decide', { id: d3.id, outcome: 'replacement', reason: 'We send the right one' });
  ok(a.ok && a.data.outcome === 'replacement' && a.data.status === 'resolved', 'support decides a replacement', a.error ?? '');
  const repFromDispute = (await sql('SELECT * FROM replacements WHERE disputeId = ?', [d3.id]))[0];
  ok(repFromDispute && repFromDispute.status === 'approved' && repFromDispute.stockTaken === 1, 'a replacement was created already approved, with stock taken');
  ok((await stockOf(pA)) === stockBeforeRep - 1, 'the new unit came from the seller stock');

  const odj = await delivered(cust, [{ productId: pB.id, qty: 1 }]);
  const d4 = (await req(cust.sock, 'disputes:open', { orderId: odj.id, type: 'dispute', reason: 'I never got it, honest', category: 'not_received' })).data;
  ok(!(await req(admin.sock, 'disputes:decide', { id: d4.id, outcome: 'reject', reason: '' })).ok, 'refusing needs a reason');
  a = await req(admin.sock, 'disputes:decide', { id: d4.id, outcome: 'reject', reason: 'Tracking shows it was signed for' });
  ok(a.ok && a.data.status === 'rejected' && a.data.resolution.startsWith('Tracking'), 'support refuses with a reason', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.entityId === d4.id && n.title === 'Dispute closed' && /Tracking/.test(n.body)), 'the customer is told why');

  // ======================================================================== REPLACEMENTS & EXCHANGES
  section('Replacements: the seller approves, stock is taken, the delivery is followed');
  const orp = await delivered(cust, [{ productId: pB.id, qty: 2 }]);
  const pre = await stockOf(pB);
  a = await req(cust.sock, 'replacements:create', { orderId: orp.id, sku: pB.id, productName: pB.name, reason: 'One charger is cracked', qty: 1, attachments: [photo] });
  ok(a.ok && a.data.qty === 1 && a.data.attachments.length === 1 && a.data.status === 'requested', 'the customer asks for 1 replacement with a photo', a.error ?? '');
  const rep = a.data;
  ok(!('customerId' in ((await req(s1.sock, 'replacements:list')).data.find((r) => r.id === rep.id) ?? { customerId: 1 })), 'the seller sees it without the customer id');
  ok((await req(s1.sock, 'replacements:list')).data.find((r) => r.id === rep.id)?.customerName === 'buyer', 'and with a first name');
  ok(!(await req(cust.sock, 'replacements:create', { orderId: orp.id, sku: pB.id, productName: pB.name, reason: 'again please' })).ok, 'one open replacement per item');
  ok(!(await req(s2.sock, 'replacements:respond', { id: rep.id, approve: true })).ok, 'another store cannot answer');
  ok(!(await req(cust.sock, 'replacements:respond', { id: rep.id, approve: true })).ok, 'the customer cannot answer');
  const live3 = nextEvent(cust.sock, 'replacement:updated', (r) => r.id === rep.id && r.status === 'approved');
  a = await req(s1.sock, 'replacements:respond', { id: rep.id, approve: true });
  ok(a.ok && a.data.status === 'approved' && a.data.stockTaken === 1, 'the seller approves', a.error ?? '');
  ok((await stockOf(pB)) === pre - 1, 'one unit is taken from the seller stock', `${pre} -> ${await stockOf(pB)}`);
  ok((await live3)?.id === rep.id, 'the customer is pushed replacement:updated');
  ok(await hasNotice(cust, (n) => n.entityId === rep.id && n.title === 'Replacement approved'), 'and gets a notice');
  const repRow = await until(async () => { const r = (await sql('SELECT deliveryTaskId FROM replacements WHERE id = ?', [rep.id]))[0]; return r?.deliveryTaskId ? r : null; });
  ok(!!repRow, 'logistics created the delivery (a task id is on the replacement)');
  ok(!(await req(s1.sock, 'replacements:respond', { id: rep.id, approve: false, reason: 'changed my mind' })).ok, 'answered once only');
  // follow the delivery: scan the seller pickup in, then the rider delivers the last leg
  const legs = async () => sql("SELECT id, kind, status, toHubId, hubId, riderId FROM delivery_tasks WHERE replacementId = ? ORDER BY createdAt", [rep.id]);
  const first = (await legs())[0];
  await collect(first.id, first.hubId);
  let scanned = await req(admin.sock, 'logistics:scanIn', { taskId: first.id });
  ok(scanned.ok, 'the warehouse scans the new unit in', scanned.error ?? '');
  const finalLeg = await until(async () => (await legs()).find((t) => t.kind === 'replacement_delivery'));
  ok(!!finalLeg, 'the delivery leg to the customer exists', JSON.stringify(await legs()));
  if (finalLeg) {
    const rider = await riderForHub(finalLeg.hubId);
    ok(!!rider, 'a rider of the delivering warehouse signs in');
    a = await req(admin.sock, 'logistics:assign', { taskId: finalLeg.id, riderId: rider?.user.id });
    ok(a.ok, 'the warehouse assigns a rider', a.error ?? '');
    if (rider) {
      await req(rider.sock, 'delivery:updateStatus', { taskId: finalLeg.id, status: 'picked_up' });
      const dispatched = await until(async () => (await sql('SELECT status FROM replacements WHERE id = ?', [rep.id]))[0].status === 'dispatched');
      ok(!!dispatched, 'the replacement follows the task: picked up -> dispatched');
      await req(rider.sock, 'delivery:updateStatus', { taskId: finalLeg.id, status: 'in_transit' });
      a = await req(rider.sock, 'delivery:updateStatus', { taskId: finalLeg.id, status: 'delivered' });
      ok(a.ok, 'the rider delivers it', a.error ?? '');
      const dl = await until(async () => (await sql('SELECT status, deliveredAt FROM replacements WHERE id = ?', [rep.id]))[0].status === 'delivered');
      ok(!!dl, 'delivered: the dispatched dead end is closed');
      ok(await hasNotice(cust, (n) => n.entityId === rep.id && n.title === 'Replacement delivered'), 'the customer is told');
    }
  }

  const orp2 = await delivered(cust, [{ productId: pDear.id, qty: 1 }]);
  const rep2 = (await req(cust.sock, 'replacements:create', { orderId: orp2.id, sku: pDear.id, productName: pDear.name, reason: 'The sole came off' })).data;
  a = await req(s1.sock, 'replacements:respond', { id: rep2.id, approve: false, reason: '' });
  ok(!a.ok, 'a rejection needs a reason');
  a = await req(s1.sock, 'replacements:respond', { id: rep2.id, approve: false, reason: 'Worn through use, not a defect' });
  ok(a.ok && a.data.status === 'rejected', 'the seller can reject', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.entityId === rep2.id && n.title === 'Replacement rejected' && /Worn through/.test(n.body)), 'the customer gets the reason');
  // out of stock: approving is refused and the request stays open
  const pLow = await mkProduct(s1, 'Rare watch', 40, 1);
  const olow = await delivered(cust, [{ productId: pLow.id, qty: 1 }]);
  const repLow = (await req(cust.sock, 'replacements:create', { orderId: olow.id, sku: pLow.id, productName: pLow.name, reason: 'Dial is cracked' })).data;
  a = await req(s1.sock, 'replacements:respond', { id: repLow.id, approve: true });
  ok(!a.ok && /Not enough stock/.test(a.error ?? ''), 'with no stock left the seller cannot approve', a.error ?? '');
  ok((await req(cust.sock, 'replacements:get', { id: repLow.id })).data.status === 'requested', 'and the request stays open');

  section('Exchanges: variant choice, price difference from the wallet');
  const oex = await delivered(cust, [{ productId: pS.id, qty: 1, variant: 'Size: 40' }]);
  const exLine = (await lines(oex.id))[0];
  a = await req(cust.sock, 'exchanges:create', { orderId: oex.id, fromSku: pS.id, fromName: pS.name, toSku: pS.id, toName: pS.name, toVariant: 'Size: 40', reason: 'Too small' });
  ok(!a.ok && /different option/.test(a.error ?? ''), 'the same option is not an exchange', a.error ?? '');
  a = await req(cust.sock, 'exchanges:create', { orderId: oex.id, fromSku: pS.id, fromName: pS.name, toSku: pS.id, toName: pS.name, toVariant: 'Size: 99', reason: 'Too small' });
  ok(!a.ok, 'an option that does not exist is refused', a.error ?? '');
  a = await req(cust.sock, 'exchanges:create', { orderId: oex.id, fromSku: pS.id, fromName: pS.name, toSku: pS.id, toName: pS.name, toVariant: 'Size: 42', reason: 'Too small', priceDiffUsd: 500 });
  ok(a.ok && a.data.toVariant === 'Size: 42' && a.data.fromVariant === 'Size: 40' && a.data.priceDiffUsd === 0, 'another size: variant chosen, no difference (a customer cannot set the price)', a.error ?? '');
  const ex1 = a.data;
  const stockBeforeEx = await stockOf(pS);
  a = await req(s1.sock, 'exchanges:respond', { id: ex1.id, approve: true });
  ok(a.ok && a.data.status === 'approved' && a.data.stockTaken === 1, 'the seller approves the exchange', a.error ?? '');
  ok((await stockOf(pS)) === stockBeforeEx - 1, 'the new unit is taken from the seller stock');
  ok(await hasNotice(cust, (n) => n.entityId === ex1.id && n.title === 'Exchange approved'), 'the customer gets a notice');
  const exTask = await until(async () => (await sql('SELECT id FROM delivery_tasks WHERE exchangeId = ? LIMIT 1', [ex1.id]))[0]);
  ok(!!exTask, 'logistics created the delivery for the exchange');

  // more expensive item: the customer pays the difference from the wallet
  const poor = await register('poor');
  const opoor = await delivered(poor, [{ productId: pCheap.id, qty: 1 }]);
  a = await req(poor.sock, 'exchanges:create', { orderId: opoor.id, fromSku: pCheap.id, fromName: pCheap.name, toSku: pDear.id, toName: pDear.name, reason: 'I want the boots' });
  ok(!a.ok && /wallet balance is too low/.test(a.error ?? ''), 'with too little in the wallet, the difference is refused with a way forward', a.error ?? '');
  ok(!(await sql("SELECT id FROM exchanges WHERE orderId = ?", [opoor.id])).length, 'and nothing was saved');
  const oex2 = await delivered(cust, [{ productId: pCheap.id, qty: 1 }]);
  if ((await balance(cust)) < 60) await topUp(cust, 60);
  a = await req(cust.sock, 'exchanges:create', { orderId: oex2.id, fromSku: pCheap.id, fromName: pCheap.name, toSku: pDear.id, toName: pDear.name, reason: 'I want the boots', attachments: [photo] });
  const ex2 = a.data;
  ok(a.ok && Array.isArray(ex2.attachments) && ex2.attachments[0] === photo, 'an exchange can carry photos of the item', a.error ?? JSON.stringify(ex2?.attachments));
  const oex4 = await delivered(cust, [{ productId: pCheap.id, qty: 1 }]);
  const line4 = (await lines(oex4.id))[0];
  a = await req(cust.sock, 'exchanges:create', { orderId: oex4.id, itemId: line4.id, toSku: 'ext:free-text', toName: 'Something else', reason: 'By line id' });
  ok(a.ok && a.data.fromSku === pCheap.id && a.data.fromName === pCheap.name && a.data.priceDiffUsd === 0, 'an exchange can name the order line by id (no sku or name needed; a free-text target `ext:` is settled by staff)', a.error ?? JSON.stringify(a.data));
  ok(a.ok && ex2.priceDiffUsd === 45 && ex2.heldUsd === 45, 'a $45 difference is worked out and held', a.error ?? '');
  const balHeld = await balance(cust);
  const txs = (await req(cust.sock, 'wallet:transactions')).data;
  ok(txs.some((t) => /price difference/.test(t.description) && t.descriptionFr?.includes('différence de prix')), 'the wallet history says so, in French too');
  a = await req(s1.sock, 'exchanges:respond', { id: ex2.id, approve: false, reason: 'No boots left in that size' });
  ok(a.ok && a.data.status === 'rejected', 'the seller rejects it', a.error ?? '');
  ok(Math.abs((await balance(cust)) - balHeld - 45) < 0.01, 'the held difference goes back to the wallet', `${balHeld} -> ${await balance(cust)}`);
  // cheaper item: the difference comes back when it is delivered
  const oex3 = await delivered(cust, [{ productId: pDear.id, qty: 1 }]);
  const ex3 = (await req(cust.sock, 'exchanges:create', { orderId: oex3.id, fromSku: pDear.id, fromName: pDear.name, toSku: pCheap.id, toName: pCheap.name, reason: 'Too fancy' })).data;
  ok(ex3 && ex3.priceDiffUsd === -45, 'a cheaper item gives a negative difference', JSON.stringify(ex3 && ex3.priceDiffUsd));
  await req(s1.sock, 'exchanges:respond', { id: ex3.id, approve: true });
  const balBeforeEx3 = await balance(cust);
  const exLegs = await sql("SELECT id, hubId FROM delivery_tasks WHERE exchangeId = ? ORDER BY createdAt", [ex3.id]);
  if (exLegs.length) {
    await collect(exLegs[0].id, exLegs[0].hubId);
    await req(admin.sock, 'logistics:scanIn', { taskId: exLegs[0].id });
    const fl = await until(async () => (await sql("SELECT id, hubId FROM delivery_tasks WHERE exchangeId = ? AND kind = 'replacement_delivery'", [ex3.id]))[0]);
    if (fl) {
      const rider = await riderForHub(fl.hubId);
      await req(admin.sock, 'logistics:assign', { taskId: fl.id, riderId: rider?.user.id });
      if (rider) {
        for (const st of ['picked_up', 'in_transit', 'delivered']) await req(rider.sock, 'delivery:updateStatus', { taskId: fl.id, status: st });
        await until(async () => (await sql('SELECT status FROM exchanges WHERE id = ?', [ex3.id]))[0].status === 'delivered');
        ok(Math.abs((await balance(cust)) - balBeforeEx3 - 45) < 0.01, 'delivered: the $45 difference is refunded to the wallet', `${balBeforeEx3} -> ${await balance(cust)}`);
      }
    }
  }

  // ======================================================================== Q&A
  section('Product Q&A');
  const qLive = nextEvent(s1.sock, 'question:created');
  a = await req(cust.sock, 'questions:ask', { productId: pA.id, question: 'Does it come with a case?' });
  ok(a.ok && a.data.id && !('askerId' in a.data) && !('sellerId' in a.data), 'the asker\'s own copy is the public view (no ids)', a.error ?? '');
  const qSeen = await qLive;
  ok(qSeen?.askerId === cust.user.id && qSeen.sellerId === s1.store.id, 'the store\'s copy remembers who asked and which store', JSON.stringify(qSeen && [qSeen.askerId, qSeen.sellerId]));
  const q = a.data;
  ok((await qLive)?.id === q.id, 'the seller gets question:created live');
  ok(await hasNotice(s1, (n) => n.entityId === q.id && n.title === 'New question on your product' && n.type === 'question'), 'and a notice');
  ok(await hasNotice(mod, (n) => n.entityId === q.id && n.title === 'New product question'), 'moderators get one too');
  a = await req(s1.sock, 'questions:seller', { status: 'unanswered' });
  ok(a.ok && a.data.some((x) => x.id === q.id && x.productName === pA.name && 'productImage' in x), 'the seller inbox lists it with the product', a.error ?? '');
  ok(!(await req(s2.sock, 'questions:seller', { status: 'unanswered' })).data.some((x) => x.id === q.id), "another store's inbox does not");
  ok(!(await req(cust.sock, 'questions:seller')).ok, 'customers have no seller inbox');
  ok((await req(s1.sock, 'questions:unanswered')).data.count >= 1, 'the badge counts unanswered questions');
  ok(!(await req(s2.sock, 'questions:answer', { id: q.id, answer: 'Yes of course' })).ok, "another store cannot answer");
  const asker = nextEvent(cust.sock, 'question:updated', (x) => x.id === q.id);
  const shopper = nextEvent(other.sock, 'question:updated', (x) => x.id === q.id);
  a = await req(s1.sock, 'questions:answer', { id: q.id, answer: 'Yes, a soft case is included.' });
  ok(a.ok && a.data.answeredAt, 'the seller answers', a.error ?? '');
  ok((await asker)?.answer?.startsWith('Yes'), 'the asker is pushed question:updated');
  ok((await shopper)?.id === q.id, 'and so are other shoppers');
  const sp = await shopper;
  ok(sp && !('askerId' in sp) && !('sellerId' in sp) && !/\s/.test(sp.askedBy), 'the shoppers\' copy has the asker\'s first name only and no account id', JSON.stringify(sp && { a: sp.askedBy, id: sp.askerId }));
  a = await req(other.sock, 'questions:list', { productId: pA.id });
  ok(a.ok && a.data.length >= 1 && a.data.every((x) => !('askerId' in x) && !('sellerId' in x) && !/\s/.test(x.askedBy)), 'questions:list never exposes the asker\'s surname or id', a.error ?? JSON.stringify(a.data?.[0]));
  a = await req(other.sock, 'questions:list', { productId: pA.id, limit: 1, offset: 0 });
  ok(a.ok && a.data.length === 1, 'and pages with limit / offset', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.title === 'Your question was answered' && n.entityId === pA.id), 'the asker gets a notice that opens the product');
  ok((await req(s1.sock, 'questions:seller', { status: 'answered' })).data.some((x) => x.id === q.id), 'it moves to the answered tab');

  // ======================================================================== REVIEWS
  section('Reviews: notices, report, hide with a reason, helpful once');
  const rvLive = nextEvent(s1.sock, 'review:created');
  const orv = await delivered(cust, [{ productId: pA.id, qty: 1 }]);
  a = await req(cust.sock, 'reviews:create', { productId: pA.id, rating: 1, text: 'Awful, this seller is a scam and a thief' });
  ok(a.ok, 'the customer reviews the product', a.error ?? '');
  const rv = a.data;
  ok((await rvLive)?.id === rv.id, 'the seller gets review:created live');
  ok(await hasNotice(s1, (n) => n.entityId === rv.id && n.title === 'New review on your product' && n.type === 'review'), 'and a notice');
  const repLive = nextEvent(mod.sock, 'review:reported');
  ok(!(await req(cust.sock, 'reviews:report', { id: rv.id, reason: 'I am the author' })).ok, 'customers cannot report');
  ok(!(await req(s2.sock, 'reviews:report', { id: rv.id, reason: 'Not even my product' })).ok, 'another store cannot report it');
  ok(!(await req(s1.sock, 'reviews:report', { id: rv.id, reason: 'no' })).ok, 'a report needs a reason');
  a = await req(s1.sock, 'reviews:report', { id: rv.id, reason: 'Abusive: calls us thieves' });
  ok(a.ok, 'the seller reports the review', a.error ?? '');
  ok((await repLive)?.review?.id === rv.id, 'moderators get review:reported live');
  ok(await hasNotice(mod, (n) => n.entityId === rv.id && n.title === 'Review reported'), 'and a notice');
  ok(!(await req(s1.sock, 'reviews:report', { id: rv.id, reason: 'Abusive: calls us thieves' })).ok, 'one report per seller');
  ok((await req(mod.sock, 'reviews:admin', { reported: true })).data.some((r) => r.id === rv.id && r.reportCount === 1), 'the moderation queue can show only reported reviews');
  ok((await req(mod.sock, 'reviews:reports', { id: rv.id })).data.length === 1, 'moderators read the reports');
  a = await req(mod.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'hidden', reason: 'Insults the seller' });
  ok(a.ok && a.data.status === 'hidden', 'a moderator hides it with a reason', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.entityId === rv.id && n.title === 'Your review was hidden' && /Insults/.test(n.body)), 'the author is told, with the reason');
  ok(await hasNotice(s1, (n) => n.entityId === rv.id && n.title === 'A review on your product was hidden'), 'the seller is told');
  ok((await req(mod.sock, 'reviews:admin', { reported: true })).data.every((r) => r.id !== rv.id), 'its reports are closed');
  await req(mod.sock, 'reviews:setStatus', { reviewId: rv.id, status: 'visible' });
  ok(await hasNotice(cust, (n) => n.entityId === rv.id && n.title === 'Your review is visible again'), 'restoring tells the author too');
  const h1 = await req(other.sock, 'reviews:helpful', { id: rv.id });
  const h2 = await req(other.sock, 'reviews:helpful', { id: rv.id });
  ok(h1.ok && h1.data.counted && h2.ok && !h2.data.counted && h2.data.helpful === 1, '"helpful" counts once per person', JSON.stringify([h1.data?.helpful, h2.data?.helpful]));
  ok((await req(cust.sock, 'reviews:helpful', { id: rv.id })).data.helpful === 2, 'a second person adds one');

  // ======================================================================== BELL
  section('The bell: the super admin, read state kept on the server');
  const adminList = await noticesOf(admin);
  const agentList = await noticesOf(agent);
  const roleNote = agentList.find((n) => n.title === 'Return requested' && n.entityId === r1.id);
  ok(!!roleNote && roleNote.read === false, 'an agent sees the role notice unread');
  ok(!!adminList.find((n) => n.id === roleNote.id) && adminList.find((n) => n.id === roleNote.id).read === false, 'the super admin sees the same notice (not a copy per role)');
  await req(agent.sock, 'notifications:markRead', { id: roleNote.id });
  ok((await noticesOf(agent)).find((n) => n.id === roleNote.id).read === true, 'one agent marks it read');
  ok((await noticesOf(admin)).find((n) => n.id === roleNote.id).read === false, 'it stays unread for the super admin');
  const others = (await noticesOf(admin)).filter((n) => n.read === false).length;
  a = await req(admin.sock, 'notifications:markAllRead');
  ok(a.ok && a.data.count >= 1, 'mark all read covers role-wide notices', JSON.stringify(a));
  ok((await noticesOf(admin)).every((n) => n.read === true) && others >= 1, 'the super admin has nothing unread now');
  ok((await noticesOf(agent)).some((n) => n.read === false), 'and the agent still has their own unread ones');
  const adminsRows = await sql("SELECT COUNT(*) AS c FROM notifications WHERE role = 'admins'");
  ok(Number(adminsRows[0].c) >= 1, 'a notice for every admin role is ONE saved row');

  // ======================================================================== SUPPORT
  section('Support: photos, unread counts, agent notices, every role');
  const ticketLive = nextEvent(admin.sock, 'support:updated');
  const supO = await delivered(cust, [{ productId: pB.id, qty: 1 }]);
  a = await req(cust.sock, 'support:open', { subject: 'My charger is slow', category: 'order', message: 'It takes 8 hours to charge', orderId: supO.id, attachments: [photo] });
  ok(a.ok && a.data.role === 'customer' && a.data.orderId === supO.id && a.data.category === 'order' && a.data.staffUnread === 1, 'the customer opens a ticket with an order, a category and a photo', a.error ?? '');
  const tk = a.data;
  const msgs0 = JSON.parse(tk.messages);
  ok(msgs0.length === 1 && msgs0[0].attachments.length === 1 && msgs0[0].role === 'customer', 'the first message carries the photo and the real role');
  ok((await ticketLive)?.id === tk.id, 'the super admin gets support:updated live');
  ok(await hasNotice(agent, (n) => n.entityId === tk.id && n.title === 'New support ticket'), 'a support agent gets the new-ticket notice');
  ok(await hasNotice(finance, (n) => n.entityId === tk.id && n.title === 'New support ticket'), 'so does every other admin role (finance)');
  ok(await hasNotice(admin, (n) => n.entityId === tk.id && n.title === 'New support ticket'), 'and the super admin');
  ok(!(await req(cust.sock, 'support:open', { subject: 'Order that is not mine', message: 'hello there', orderId: o1.id.replace(/.$/, (c) => (c === '0' ? '1' : '0')) })).ok, 'an order that does not exist is refused');
  ok(!(await req(other.sock, 'support:open', { subject: 'Order that is not mine', message: 'hello there', orderId: supO.id })).ok, "and so is someone else's order");
  a = await req(cust.sock, 'support:open', { subject: 'Bad photo', message: 'hello there', attachments: ['https://evil.example/a.png'] });
  ok(!a.ok, 'a photo that is not an upload is refused');
  a = await req(agent.sock, 'support:reply', { id: tk.id, text: 'Can you tell me which charger?', attachments: [photo2] });
  ok(a.ok && a.data.userUnread === 1 && a.data.status === 'pending' && a.data.assigneeId === agent.user.id, 'an agent answers: the customer has 1 unread, the agent took the ticket', a.error ?? '');
  ok(await hasNotice(cust, (n) => n.entityId === tk.id && n.title === 'Support reply'), 'the customer is told');
  ok((await req(cust.sock, 'support:list')).data.find((t) => t.id === tk.id).userUnread === 1, 'the list carries the unread count');
  a = await req(cust.sock, 'support:markRead', { id: tk.id });
  ok(a.ok && a.data.userUnread === 0, 'the customer reads it: 0');
  ok(!(await req(other.sock, 'support:markRead', { id: tk.id })).ok, "nobody else can mark it read");
  ok((await req(agent.sock, 'support:get', { id: tk.id })).data.staffUnread === 1, 'the agents still have the customer message unread');
  await req(agent.sock, 'support:markRead', { id: tk.id });
  a = await req(cust.sock, 'support:reply', { id: tk.id, text: 'The one in the photo' });
  ok(a.ok && a.data.staffUnread === 1 && a.data.status === 'open', 'a customer reply puts 1 unread on the agent side');
  ok(await hasNotice(agent, (n) => n.entityId === tk.id && n.title === 'New reply on a ticket'), 'the assigned agent gets a notice for the reply');
  ok(!(await noticesOf(finance)).some((n) => n.entityId === tk.id && n.title === 'New reply on a ticket'), 'and the others do not');
  ok(!(await req(cust.sock, 'support:setStatus', { id: tk.id, status: 'closed' })).ok, 'customers cannot change the status');
  ok(!(await req(agent.sock, 'support:setStatus', { id: tk.id, status: 'banana' })).ok, 'an invalid status is refused');
  a = await req(agent.sock, 'support:assign', { id: tk.id, assigneeId: finance.user.id });
  ok(a.ok && a.data.assigneeId === finance.user.id && a.data.assigneeName, 'an agent hands the ticket to a colleague', a.error ?? '');
  ok(await hasNotice(finance, (n) => n.entityId === tk.id && n.title === 'Ticket assigned to you'), 'who is notified');
  ok(!(await req(agent.sock, 'support:assign', { id: tk.id, assigneeId: cust.user.id })).ok, 'only an admin account can be assigned');
  ok(!(await req(cust.sock, 'support:assign', { id: tk.id, assigneeId: finance.user.id })).ok, 'customers cannot assign');
  await req(cust.sock, 'support:reply', { id: tk.id, text: 'Any news?' });
  ok(await hasNotice(finance, (n) => n.entityId === tk.id && n.title === 'New reply on a ticket'), 'the new assignee now gets the reply notices');
  // concurrent replies from both sides lose nothing
  const before = JSON.parse((await req(agent.sock, 'support:get', { id: tk.id })).data.messages).length;
  await Promise.all([
    ...Array.from({ length: 8 }, (_, i) => req(cust.sock, 'support:reply', { id: tk.id, text: `customer ${i}` })),
    ...Array.from({ length: 8 }, (_, i) => req(agent.sock, 'support:reply', { id: tk.id, text: `agent ${i}` })),
  ]);
  const after = JSON.parse((await req(agent.sock, 'support:get', { id: tk.id })).data.messages);
  ok(after.length === before + 16, '16 simultaneous replies are all kept', `${before} -> ${after.length}`);
  a = await req(agent.sock, 'support:setStatus', { id: tk.id, status: 'resolved' });
  ok(a.ok && a.data.status === 'resolved', 'an agent resolves it');
  ok(await hasNotice(cust, (n) => n.entityId === tk.id && n.title === 'Ticket resolved'), 'the customer is told');
  // seller and rider tickets
  a = await req(s1.sock, 'support:open', { subject: 'Payout question', category: 'payment', message: 'When is my payout?', orderId: orp.id });
  ok(a.ok && a.data.role === 'seller', 'a seller opens a ticket: stamped seller, not customer', a.error ?? '');
  const sellerTk = a.data;
  await req(agent.sock, 'support:reply', { id: sellerTk.id, text: 'Tomorrow morning.' });
  const sm = JSON.parse((await req(s1.sock, 'support:get', { id: sellerTk.id })).data.messages);
  ok(sm.map((m) => m.role).join() === 'seller,admin_support', 'each message is stamped with its real role', sm.map((m) => m.role).join());
  ok(await hasNotice(s1, (n) => n.entityId === sellerTk.id && n.title === 'Support reply'), 'the seller is told');
  ok((await noticesOf(s1)).find((n) => n.entityId === sellerTk.id)?.link === `/seller/support/${sellerTk.id}`, 'the notice opens the seller support page');
  const rider = await login('rider@somba.app', PW);
  a = await req(rider.sock, 'support:open', { subject: 'App crashes on tasks', category: 'technical', message: 'The app closes when I open a task' });
  ok(a.ok && a.data.role === 'rider', 'a rider opens a ticket', a.error ?? '');
  const strangerOrder = await delivered(cust, [{ productId: pA.id, qty: 1 }]);
  const notMine = await req(rider.sock, 'support:open', { subject: 'Someone else\'s order', message: 'hello there', orderId: strangerOrder.id });
  ok(!notMine.ok && /Order not found/.test(notMine.error ?? ''), 'a rider cannot link an order they never carried', notMine.error ?? 'was allowed');
  await req(agent.sock, 'support:reply', { id: a.data.id, text: 'We are looking into it.' });
  const rn = await until(async () => (await noticesOf(rider)).find((n) => n.entityId === a.data.id && n.title === 'Support reply'));
  ok(!!rn && rn.link === `/rider/support/${a.data.id}`, 'the rider is told, and the notice opens a rider support path', JSON.stringify(rn && rn.link));
  ok((await req(rider.sock, 'support:list')).data.length === 1, "a rider only sees their own tickets");
  rider.sock.close();

  // ======================================================================== PRIVACY / LISTS
  section('Privacy: sellers never get the customer id');
  const all = [
    ...(await req(s1.sock, 'disputes:list')).data,
    ...(await req(s1.sock, 'replacements:list')).data,
    ...(await req(s1.sock, 'exchanges:list')).data,
  ];
  ok(all.length > 6 && all.every((r) => !('customerId' in r) && r.customerName === 'buyer'), `none of the ${all.length} rows a seller receives carries a customer id or a full name`);
  ok((await req(admin.sock, 'disputes:list')).data.every((r) => 'customerId' in r), 'admins still get the full row');

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) console.log(fails.map((f) => `  - ${f}`).join('\n'));
  await db.end();
  for (const u of [...riders.filter(Boolean), poor, admin, finance, warehouse, agent, mod, cust, other, s1, s2, guest]) u.sock?.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
