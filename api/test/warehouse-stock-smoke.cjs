/* Warehouse stock ledger (WS-C), against a RUNNING API seeded with `npm run seed`:
 * receive (by hand and from a scanned parcel), move between bins, cycle count with variance, stock out by hand and on
 * dispatch, negative stock refused, real concurrency on MySQL, retries recorded once, who may do what, and the parcel's
 * custody legs unchanged by all of it.
 *
 *   API_URL=http://localhost:3053 node test/warehouse-stock-smoke.cjs
 */
const { io } = require('socket.io-client');
const { hubId: hubIdOf, tasksOf } = require('./journey.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const tag = Date.now().toString().slice(-6);

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rest = async (path, body) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && attempt < 6) { await sleep(15000); continue; }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
const login = async (email) => {
  const r = await rest('/api/v1/auth/login', { email, password: PW });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};

(async () => {
  const admin = await login('admin@somba.app');
  const ops = await login('ops@somba.app');
  const finance = await login('finance@somba.app');
  const mgr = await login('warehouse@somba.app'); // Entrepôt Kinshasa, manager
  const op = await login('operator@somba.app'); // Entrepôt Kinshasa, operator
  const supL = await login('warehouse.limete@somba.app'); // Entrepôt Limete, supervisor
  const rider = await login('rider@somba.app');
  const cust = await login('customer@somba.app');
  const guest = { sock: await connect() };
  const kin = await hubIdOf(admin);
  const limete = await hubIdOf(admin, 'Entrepôt Limete');
  let a;

  const products = (await req(cust.sock, 'products:list', { limit: 200 })).data ?? [];
  const prod = products.find((p) => (p.sellerName ?? '') === 'Kinshasa Traders' && p.stock > 20) ?? products.find((p) => p.stock > 20);
  // The seed gives every fifth listing to Limete Wholesale, whose parcels are collected into the Limete warehouse: the parcel
  // section below expects the pickup leg to the Kinshasa warehouse, so take another Kinshasa Traders listing (the list order varies).
  const prod2 = products.find((p) => p.id !== prod.id && (p.sellerName ?? '') === 'Kinshasa Traders' && p.stock > 20) ?? products.find((p) => p.id !== prod.id && p.stock > 20);
  const onHand = async (sock, productId, hubId) => ((await req(sock, 'stock:onHand', { productId, ...(hubId ? { hubId } : {}) })).data?.rows ?? []);
  const binQty = async (sock, productId, code, hubId) => (await onHand(sock, productId, hubId)).flatMap((r) => r.bins).find((b) => b.code === code)?.qty ?? 0;
  const total = async (sock, productId, hubId) => (await onHand(sock, productId, hubId)).reduce((s, r) => s + r.onHand, 0);

  section('Who may do what');
  ok(!(await req(guest.sock, 'stock:onHand')).ok && !(await req(cust.sock, 'stock:onHand')).ok && !(await req(rider.sock, 'stock:onHand')).ok, 'guests, customers and riders cannot read the stock');
  a = await req(finance.sock, 'stock:onHand');
  ok(!a.ok && /warehouse desk/.test(a.error ?? '') && !(await req(finance.sock, 'stock:history')).ok, 'finance cannot read the warehouse stock either (the desk is the super admin and Operations)', a.error ?? '');
  ok((await req(ops.sock, 'stock:onHand')).ok && (await req(ops.sock, 'stock:history')).ok && (await req(admin.sock, 'stock:onHand')).ok, 'the operations admin and the super admin read it');
  a = await req(finance.sock, 'stock:receive', { hubId: kin, productId: prod.id, qty: 1 });
  ok(!a.ok && /operations administrators and warehouse staff/.test(a.error ?? ''), 'and finance cannot change it', a.error ?? '');
  a = await req(ops.sock, 'stock:receive', { productId: prod.id, qty: 1 });
  ok(!a.ok && /Choose a warehouse first/.test(a.error ?? ''), 'an operations admin must name a warehouse', a.error ?? '');
  a = await req(op.sock, 'stock:binCreate', { code: `NOPE-${tag}` });
  ok(!a.ok && /supervisors and managers/.test(a.error ?? ''), 'an operator cannot create a bin', a.error ?? '');
  a = await req(op.sock, 'stock:count', { binId: 'x', lines: [{ productId: prod.id, counted: 1 }] });
  ok(!a.ok && /supervisors and managers/.test(a.error ?? ''), 'an operator cannot record a count', a.error ?? '');

  section('Bins');
  const A = `SMK-${tag}-A`;
  const B = `SMK-${tag}-B`;
  a = await req(mgr.sock, 'stock:binCreate', { code: A.toLowerCase(), label: 'Smoke rack A' });
  ok(a.ok && a.data.code === A && a.data.hubId === kin, 'the manager creates a bin (code upper-cased, in their own warehouse)', a.error ?? '');
  const binA = a.data;
  const binB = (await req(mgr.sock, 'stock:binCreate', { code: B })).data;
  ok(!(await req(mgr.sock, 'stock:binCreate', { code: A })).ok, 'the same code twice is refused');
  ok(!(await req(mgr.sock, 'stock:binCreate', { code: 'bad code!' })).ok, 'a code with spaces or symbols is refused');
  a = await req(supL.sock, 'stock:binCreate', { code: A });
  ok(a.ok && a.data.hubId === limete, "another warehouse may use the same code (it is that warehouse's bin)", a.error ?? '');
  a = await req(supL.sock, 'stock:receive', { productId: prod.id, qty: 1, binId: binA.id });
  ok(!a.ok && /does not exist in this warehouse/.test(a.error ?? ''), "a bin of another warehouse is not found", a.error ?? '');

  section('Receive by hand, move, count, stock out');
  const t0 = await total(mgr.sock, prod.id);
  a = await req(op.sock, 'stock:receive', { productId: prod.id, qty: 10, binId: binA.id, note: 'smoke delivery', clientRef: `r-${tag}` });
  ok(a.ok && a.data.kind === 'receive' && a.data.delta === 10 && a.data.toBinCode === A && a.data.actorName, 'an operator receives 10 into A (ledger line with who and where)', a.error ?? '');
  const again = await req(op.sock, 'stock:receive', { productId: prod.id, qty: 10, binId: binA.id, note: 'smoke delivery', clientRef: `r-${tag}` });
  ok(again.ok && again.data.id === a.data.id && (await binQty(mgr.sock, prod.id, A)) === 10, 'sending the same receipt again records it once');
  a = await req(op.sock, 'stock:move', { productId: prod.id, qty: 4, fromBinId: binA.id, toBinId: binB.id });
  ok(a.ok && a.data.kind === 'move' && a.data.delta === 0 && a.data.fromBinCode === A && a.data.toBinCode === B, 'move 4 from A to B', a.error ?? '');
  ok((await binQty(mgr.sock, prod.id, A)) === 6 && (await binQty(mgr.sock, prod.id, B)) === 4 && (await total(mgr.sock, prod.id)) === t0 + 10, 'A holds 6, B holds 4, the SKU total is 10 more than before');
  a = await req(mgr.sock, 'stock:count', { binId: binB.id, lines: [{ productId: prod.id, counted: 5, expected: 4 }], note: 'smoke count', clientRef: `c-${tag}` });
  ok(a.ok && a.data.totalVariance === 1 && a.data.lines[0].expected === 4 && a.data.lines[0].counted === 5, 'the manager counts B: 5 found, 4 expected, variance +1', a.error ?? '');
  a = await req(mgr.sock, 'stock:count', { binId: binB.id, lines: [{ productId: prod.id, counted: 9, expected: 4 }] });
  ok(!a.ok && /changed while you were counting/.test(a.error ?? ''), 'a count made on a stale screen is refused, not applied', a.error ?? '');
  ok((await binQty(mgr.sock, prod.id, B)) === 5, 'B holds the counted 5');
  a = await req(op.sock, 'stock:out', { productId: prod.id, qty: 2, binId: binA.id, reason: 'damaged', note: 'dropped' });
  ok(a.ok && a.data.kind === 'stock_out' && a.data.delta === -2 && a.data.onHandAfter === t0 + 9, 'stock out 2 as damaged', a.error ?? '');
  const hist = (await req(op.sock, 'stock:history', { productId: prod.id, limit: 500 })).data ?? [];
  const kinds = hist.map((h) => h.kind);
  ok(['receive', 'move', 'count', 'stock_out'].every((k) => kinds.includes(k)) && hist[0].kind === 'stock_out', 'the history lists receive, move, count and stock out, newest first');
  ok(hist.every((h) => h.actorName && h.createdAt && h.sku), 'every line says who, when and which SKU');
  const sum = hist.reduce((s, h) => s + h.delta, 0);
  ok(sum === (await total(mgr.sock, prod.id)), 'the deltas of the whole ledger add up to what is on hand (the stock is the sum of its history)', `${sum} vs ${await total(mgr.sock, prod.id)}`);
  ok(hist.slice(0, 4).map((h) => h.delta).join() === '-2,1,0,10', 'and this session adds up too: +10, move 0, count +1, out -2');

  section('Negative stock is refused');
  a = await req(op.sock, 'stock:out', { productId: prod.id, qty: 99, binId: binA.id, reason: 'lost' });
  ok(!a.ok && /holds only 4 of/.test(a.error ?? ''), 'taking more than a bin holds is refused with the real number', a.error ?? '');
  a = await req(op.sock, 'stock:move', { productId: prod.id, qty: 99, fromBinId: binA.id, toBinId: binB.id });
  ok(!a.ok && /holds only 4/.test(a.error ?? ''), 'so is moving more than it holds');
  ok(!(await req(op.sock, 'stock:out', { productId: prod.id, qty: 0, binId: binA.id, reason: 'lost' })).ok && !(await req(op.sock, 'stock:out', { productId: prod.id, qty: -3, binId: binA.id, reason: 'lost' })).ok && !(await req(op.sock, 'stock:out', { productId: prod.id, qty: 1.5, binId: binA.id, reason: 'lost' })).ok, 'zero, negative and fractional units are refused');
  ok(!(await req(op.sock, 'stock:out', { productId: prod.id, qty: 1, binId: binA.id, reason: 'sale' })).ok, 'an unknown reason is refused');
  ok((await binQty(mgr.sock, prod.id, A)) === 4, 'A still holds 4: nothing was written by the refusals');

  section('Real concurrency (the database decides)');
  // Bin A holds 4. Ten people each take 1 at the same moment: exactly four can have it.
  const crowd = await Promise.all(Array.from({ length: 10 }, () => req(op.sock, 'stock:out', { productId: prod.id, qty: 1, binId: binA.id, reason: 'sample' })));
  ok(crowd.filter((r) => r.ok).length === 4 && crowd.filter((r) => !r.ok).every((r) => /holds (only|no)/.test(r.error ?? '')), 'ten parallel takers of 1 from a bin of 4: exactly four succeed, the rest are told it is empty', JSON.stringify(crowd.map((r) => r.ok)));
  ok((await binQty(mgr.sock, prod.id, A)) === 0, 'the bin is at zero, never below');
  const rec = await Promise.all(Array.from({ length: 8 }, () => req(op.sock, 'stock:receive', { productId: prod.id, qty: 3, binId: binA.id })));
  ok(rec.every((r) => r.ok) && (await binQty(mgr.sock, prod.id, A)) === 24, 'eight parallel receipts of 3 into the now-empty bin all land (24)');
  const sock2 = (await login('operator@somba.app')).sock;
  const twin = await Promise.all([req(op.sock, 'stock:receive', { productId: prod.id, qty: 5, binId: binA.id, clientRef: `tw-${tag}` }), req(sock2, 'stock:receive', { productId: prod.id, qty: 5, binId: binA.id, clientRef: `tw-${tag}` })]);
  ok(twin.every((r) => r.ok) && twin[0].data.id === twin[1].data.id && (await binQty(mgr.sock, prod.id, A)) === 29, 'the same request from two connections at once is recorded once');
  sock2.close();
  // Moves in opposite directions between the same two bins lock rows in opposite order: MySQL may roll one back as a deadlock victim; the service runs it again.
  await req(op.sock, 'stock:move', { productId: prod.id, qty: 6, fromBinId: binA.id, toBinId: binB.id });
  const totalBefore = await total(mgr.sock, prod.id);
  const swaps = await Promise.all(Array.from({ length: 24 }, (_, i) => req(op.sock, 'stock:move', { productId: prod.id, qty: 1, fromBinId: i % 2 ? binA.id : binB.id, toBinId: i % 2 ? binB.id : binA.id })));
  ok(swaps.every((r) => r.ok), 'twenty-four moves racing in opposite directions between two bins all succeed (a deadlock victim is retried)', JSON.stringify(swaps.filter((r) => !r.ok).map((r) => r.error)));
  ok((await total(mgr.sock, prod.id)) === totalBefore && (await binQty(mgr.sock, prod.id, A)) + (await binQty(mgr.sock, prod.id, B)) === 29 + 5, 'and nothing was lost or invented');
  await req(op.sock, 'stock:move', { productId: prod.id, qty: 6, fromBinId: binB.id, toBinId: binA.id });

  section('A scanned parcel is put away, and dispatch stocks it out (custody untouched)');
  const addr = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });
  const before = await total(mgr.sock, prod2.id);
  const placed = await req(cust.sock, 'orders:create', { items: [{ productId: prod2.id, qty: 2 }], paymentMethod: 'stripe_card', shippingAddress: addr });
  ok(placed.ok, 'a customer places an order', placed.error ?? '');
  const orderId = placed.data.id;
  const pick = (await tasksOf(admin, orderId)).find((t) => t.kind === 'pickup');
  ok(!!pick && pick.toHubId === kin, 'the order has a pickup leg to the Kinshasa warehouse');
  // Not scanned in yet: it cannot be put away.
  a = await req(op.sock, 'stock:receiveParcel', { taskId: pick.id, binId: binA.id });
  ok(!a.ok && /Scan the parcel in/.test(a.error ?? ''), 'a parcel that is not scanned in cannot be put away', a.error ?? '');
  await req(admin.sock, 'logistics:assign', { taskId: pick.id, riderId: rider.user.id });
  await req(rider.sock, 'delivery:updateStatus', { taskId: pick.id, status: 'picked_up' });
  a = await req(mgr.sock, 'logistics:scanIn', { taskId: pick.id });
  ok(a.ok, 'the desk scans the parcel in (the custody model, as before)', a.error ?? '');
  a = await req(op.sock, 'stock:parcel', { taskId: pick.id });
  ok(a.ok && a.data.canReceive && a.data.lines.length >= 1 && a.data.lines.some((l) => l.productId === prod2.id && l.qty === 2 && l.remaining === 2), 'the parcel shows what it carries and that it can be put away', a.error ?? '');
  a = await req(op.sock, 'stock:receiveParcel', { taskId: pick.id, binId: binB.id, lines: [{ productId: prod2.id, qty: 5 }], clientRef: `p0-${tag}` });
  ok(!a.ok && /carries 2 more/.test(a.error ?? ''), 'putting away more than the parcel carries is refused', a.error ?? '');
  // Two people scan the same parcel at the same moment (different requests): the parcel row is locked, so only one put-away lands.
  const sockP = (await login('operator@somba.app')).sock;
  const both = await Promise.all([req(op.sock, 'stock:receiveParcel', { taskId: pick.id, binId: binB.id, clientRef: `p1-${tag}` }), req(sockP, 'stock:receiveParcel', { taskId: pick.id, binId: binB.id, clientRef: `p1b-${tag}` })]);
  sockP.close();
  ok(both.filter((r) => r.ok).length === 1 && both.filter((r) => !r.ok).every((r) => /already in stock/.test(r.error ?? '')), 'the same parcel put away by two people at once lands exactly once', JSON.stringify(both.map((r) => r.ok ? 'ok' : r.error)));
  a = both.find((r) => r.ok) ?? both[0];
  ok(a.ok && a.data.lines.every((l) => l.reason === 'parcel' && l.taskId === pick.id && l.orderId === orderId), 'the parcel is put away into B (each line carries the parcel and the order)', a.error ?? '');
  ok((await total(mgr.sock, prod2.id)) === before + (a.data?.lines ?? []).filter((l) => l.productId === prod2.id).reduce((s, l) => s + l.qty, 0) && (await binQty(mgr.sock, prod2.id, B)) === 2, 'B now holds the 2 units');
  a = await req(op.sock, 'stock:receiveParcel', { taskId: pick.id, binId: binB.id });
  ok(!a.ok && /already in stock/.test(a.error ?? ''), 'the same parcel cannot be put away twice', a.error ?? '');
  const parcelAfter = (await req(op.sock, 'stock:parcel', { taskId: pick.id })).data;
  ok(parcelAfter.lines.every((l) => l.remaining === 0), 'and it now shows nothing left to put away');

  // Walk the rest of the legs: the delivery leg appears once every pickup is at the destination.
  let del = null;
  for (let i = 0; i < 14 && !del; i++) {
    const live = (await tasksOf(admin, orderId)).filter((t) => t.status !== 'failed');
    del = live.find((t) => t.kind === 'delivery') ?? null;
    if (!del) {
      const p = live.find((t) => ['pickup', 'transfer'].includes(t.kind) && t.status !== 'delivered');
      if (!p) { await sleep(250); continue; }
      if (p.status === 'unassigned') await req(admin.sock, 'logistics:assign', { taskId: p.id, riderId: rider.user.id });
      await req(rider.sock, 'delivery:updateStatus', { taskId: p.id, status: 'picked_up' });
      await req(admin.sock, 'logistics:scanIn', { taskId: p.id });
    }
  }
  ok(!!del, 'the delivery leg is created as usual');
  const stockBeforeDispatch = await binQty(mgr.sock, prod2.id, B);
  await req(admin.sock, 'logistics:assign', { taskId: del.id, riderId: rider.user.id });
  a = await req(mgr.sock, 'logistics:dispatchTransfer', { taskId: del.id });
  ok(a.ok && a.data.status === 'picked_up', 'the desk hands the parcel to the rider (custody moves exactly as before)', a.error ?? '');
  let out = [];
  for (let i = 0; i < 20 && !out.length; i++) {
    out = ((await req(mgr.sock, 'stock:history', { productId: prod2.id, kind: 'stock_out' })).data ?? []).filter((h) => h.reason === 'dispatch' && h.taskId === del.id);
    if (!out.length) await sleep(200);
  }
  ok(stockBeforeDispatch === 2 && out.reduce((s, h) => s + h.qty, 0) === 2 && out.every((h) => h.orderId === orderId && h.fromBinCode === B), 'dispatch stocked out those 2 units from B, with the parcel and order on the line');
  ok((await binQty(mgr.sock, prod2.id, B)) === 0, 'B is empty again');
  const dtask = (await tasksOf(admin, orderId)).find((t) => t.id === del.id);
  ok(dtask.status === 'picked_up' && dtask.riderId === rider.user.id, 'the delivery task itself is exactly as the custody model left it');

  section('Reads');
  a = await req(op.sock, 'stock:onHand', { search: prod.name.slice(0, 6) });
  ok(a.ok && a.data.rows.some((r) => r.productId === prod.id) && a.data.total >= 1, 'on hand can be searched by product name');
  a = await req(op.sock, 'stock:lookup', { code: A.toLowerCase() });
  ok(a.ok && a.data.bin?.code === A, 'a scanned bin label resolves to the bin');
  a = await req(op.sock, 'stock:lookup', { code: `SKU-${prod.id.slice(0, 6)}` });
  ok(a.ok && a.data.products.some((p) => p.productId === prod.id), 'a scanned SKU label resolves to the product');
  a = await req(op.sock, 'stock:bins');
  ok(a.ok && a.data.some((b) => b.code === A && b.units === 29) && a.data.every((b) => b.hubId === kin), "the bin list shows the caller's own warehouse only, with units");
  ok((await req(supL.sock, 'stock:history', { productId: prod.id })).data.length === 0, "another warehouse's staff do not see this ledger");
  a = await req(mgr.sock, 'stock:binUpdate', { binId: binA.id, active: false });
  ok(!a.ok && /still holds stock/.test(a.error ?? ''), 'a bin that holds stock cannot be switched off', a.error ?? '');

  console.log(fails.length ? `\n❌ ${pass} passed, ${fails.length} failed:\n   - ${fails.join('\n   - ')}` : `\n🎉 ${pass} passed, 0 failed`);
  for (const u of [admin, ops, finance, mgr, op, supL, rider, cust, guest]) u.sock.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
