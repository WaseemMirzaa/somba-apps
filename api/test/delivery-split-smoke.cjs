/* Split delivery: a multi-seller order waits at the destination warehouse for every seller's parcel; once the oldest waiting
 * parcel has waited longer than `splitDeliveryAfterHours`, the warehouse job delivers what arrived and the rest goes later.
 * Runs against a RUNNING dev API seeded with `npm run seed`. It turns cash on delivery and the delivery code on for itself and
 * puts every setting back; it moves the job's clock with `warehouseOps:runNow { asOf }` (outside production only).
 *
 *   API_URL=http://localhost:3001 node test/delivery-split-smoke.cjs
 *
 * Scenarios: (1) a two-seller COD order: seller A's parcel arrives, +25 h makes a partial leg (A's share + the fee, payment still
 * pending), B's parcel arrives and gives the final leg (the remainder, a new code), the payment succeeds with the total and the
 * rider's cash matches; running the job twice makes one leg. (2) A parcel that arrives while the leg is still unassigned is merged
 * into it. (3) Once a part is delivered the order can no longer be cancelled or refunded.
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const { tasksOf } = require('./journey.cjs');
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
const money = (n) => Math.round(n * 100) / 100;
const rest = async (path, body, token) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && /ThrottlerException/.test(json?.message ?? '') && attempt < 6) { await sleep(15000); continue; }
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
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
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
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@split.test`, password: 'Split-Pass-2026', name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
};
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const finance = await login('finance@somba.app');
  const demoRider = await login('rider@somba.app');
  const limeteRider = await login('rider.limete@somba.app').catch(() => null);
  const riders = [demoRider, limeteRider].filter(Boolean);
  const get = async (key) => (await req(admin.sock, 'settings:get')).data?.[key];
  const was = { productModeration: await get('productModeration'), codEnabled: await get('codEnabled'), codCapUsd: await get('codCapUsd'), requireDeliveryCode: await get('requireDeliveryCode'), splitDeliveryAfterHours: await get('splitDeliveryAfterHours'), requireVerifiedForCheckout: await get('requireVerifiedForCheckout') };
  const set = (key, value) => req(admin.sock, 'settings:set', { key, value: String(value) });
  await set('productModeration', 'false');
  await set('codEnabled', 'true');
  await set('codCapUsd', '5000');
  await set('requireDeliveryCode', 'true');
  await set('splitDeliveryAfterHours', '24');
  await set('requireVerifiedForCheckout', 'false');

  /** Assign a task to a rider who fits (the demo rider, or the Limete one) and have them collect it. Returns that rider. */
  const collect = async (taskId) => {
    for (const r of riders) {
      const a = await req(admin.sock, 'logistics:assign', { taskId, riderId: r.user.id });
      if (a.ok) { await req(r.sock, 'delivery:updateStatus', { taskId, status: 'picked_up' }); return r; }
    }
    return null;
  };
  /** Walk one seller's parcel to the destination warehouse: collect and scan in each leg (a pickup, then maybe a transfer). */
  const arrive = async (orderId, sellerId) => {
    for (let i = 0; i < 8; i++) {
      const open = (await tasksOf(admin, orderId)).find((t) => t.sellerId === sellerId && ['pickup', 'transfer'].includes(t.kind) && !['delivered', 'failed'].includes(t.status));
      if (!open) return true;
      if (['unassigned', 'assigned'].includes(open.status)) await collect(open.id);
      const s = await req(admin.sock, 'logistics:scanIn', { taskId: open.id });
      if (!s.ok) throw new Error(`scan in: ${s.error}`);
    }
    return false;
  };
  const legsOf = async (orderId) => (await tasksOf(admin, orderId)).filter((t) => t.kind === 'delivery');
  const openLegOf = async (orderId) => (await legsOf(orderId)).find((t) => ['unassigned', 'assigned', 'picked_up', 'in_transit'].includes(t.status));
  const payOf = async (orderId) => ((await req(finance.sock, 'payments:list', { limit: 300 })).data ?? []).find((p) => p.orderId === orderId);
  const run = (body) => req(admin.sock, 'warehouseOps:runNow', { only: ['split'], ...body });
  /** The rider takes the leg, drives it and hands it over (the customer's code, and the cash when due). */
  const deliverLeg = async (cust, orderId, leg, cashUsd) => {
    const r = (await collect(leg.id)) ?? demoRider;
    await req(r.sock, 'delivery:updateStatus', { taskId: leg.id, status: 'in_transit' });
    const code = (await req(cust.sock, 'orders:deliveryCode', { orderId })).data?.code;
    const a = await req(r.sock, 'delivery:updateStatus', { taskId: leg.id, status: 'delivered', code, ...(cashUsd > 0 ? { cashUsd } : {}) });
    return { ...a, rider: r, code };
  };

  const makeSeller = async (label, pickup) => {
    const u = await register(label, 'seller');
    const store = (await req(u.sock, 'sellers:register', kyc(`${label} Store ${tag}`))).data;
    await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    await req(u.sock, 'sellers:update', { pickupAddress: pickup });
    return { ...u, store };
  };
  const shopA = await makeSeller('splita', '7 Rue du Marché, Limete');
  const shopB = await makeSeller('splitb', '12 Avenue Kasa-Vubu, Kalamu');
  const prodA = (await req(shopA.sock, 'products:create', { name: `Split kettle ${tag}`, price: 30, category: 'Electronics', stock: 50 })).data;
  const prodB = (await req(shopB.sock, 'products:create', { name: `Split lamp ${tag}`, price: 20, category: 'Electronics', stock: 50 })).data;
  const cust = await register('splitbuyer');
  ok(prodA?.status === 'live' && prodB?.status === 'live', 'two sellers each list a live product', JSON.stringify([prodA?.status, prodB?.status]));
  const place = async (items, paymentMethod) => {
    const r = await req(cust.sock, 'orders:create', { items, paymentMethod, shippingAddress: ADDRESS });
    if (!r.ok) throw new Error(`orders:create (${paymentMethod}): ${r.error}`);
    const order = r.data;
    const sellerA = order.items.find((i) => i.productId === prodA.id).sellerId;
    const sellerB = order.items.find((i) => i.productId === prodB.id).sellerId;
    await until(async () => (await tasksOf(admin, order.id)).filter((t) => t.kind === 'pickup').length === 2);
    return { order, sellerA, sellerB };
  };
  const heldBefore = (await req(demoRider.sock, 'cash:mine')).data?.heldUsd ?? 0;
  const heldLimeteBefore = limeteRider ? ((await req(limeteRider.sock, 'cash:mine')).data?.heldUsd ?? 0) : 0;
  const held = async () => money((await req(demoRider.sock, 'cash:mine')).data.heldUsd + (limeteRider ? (await req(limeteRider.sock, 'cash:mine')).data.heldUsd : 0));

  // ── 1. A two-seller cash order, split by the warehouse job ─────────────────────────────────────────────────────────
  section('A two-seller COD order: seller A arrives, the oldest parcel ages past 24 h, the job sends A\'s part alone');
  const { order, sellerA, sellerB } = await place([{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 2 }], 'cod');
  const fee = money(order.totalUsd - 70);
  ok(order.paymentMethod === 'cod' && order.totalUsd >= 70, 'the cash order is placed (A $30 + B 2 x $20 + the delivery fee)', JSON.stringify([order.paymentMethod, order.totalUsd]));
  const cash0 = await held();
  ok(await arrive(order.id, sellerA), "A's parcel reaches the destination warehouse");
  ok((await legsOf(order.id)).length === 0, "B's parcel is not there: no customer leg yet");
  let r = await run({});
  ok(r.ok && typeof r.data.split === 'number' && r.data.aged && typeof r.data.autoAssigned === 'number', 'warehouseOps:runNow answers { aged, autoAssigned, split }', JSON.stringify(r));
  ok((await legsOf(order.id)).length === 0, 'a parcel that has only just arrived is not sent alone', JSON.stringify((await legsOf(order.id)).length));
  r = await run({ asOf: hoursFromNow(25) });
  ok(r.ok && r.data.split >= 1, 'once the oldest parcel has waited 25 h the job plans a leg', JSON.stringify(r));
  const first = await openLegOf(order.id);
  ok(first && JSON.stringify(first.sellerIds) === JSON.stringify([sellerA]), 'the partial leg records the seller it carries', JSON.stringify(first?.sellerIds));
  const cargo = JSON.parse(first?.itemsJson ?? '[]');
  ok(cargo.length === 1 && cargo[0].productId === prodA.id, "its cargo is A's line only", JSON.stringify(cargo.map((c) => c.productId)));
  ok(first && Math.abs(first.codAmountUsd - money(30 + fee)) < 0.011, "it collects A's share plus the delivery fee", `${first?.codAmountUsd} vs ${money(30 + fee)}`);
  ok((await payOf(order.id))?.status === 'pending', 'the cash payment is still pending');
  await run({ asOf: hoursFromNow(26) });
  await run({ asOf: hoursFromNow(30) });
  ok((await legsOf(order.id)).length === 1, 'running the job again and again still gives one leg', String((await legsOf(order.id)).length));

  section('One open leg: what the customer, the sellers and the rider see');
  const code1 = (await req(cust.sock, 'orders:deliveryCode', { orderId: order.id })).data;
  ok(code1?.required === true && /^\d{4}$/.test(code1?.code ?? ''), 'the customer gets the code of the open leg', JSON.stringify(code1));
  const sellerBView = (await req(shopB.sock, 'orders:list')).data.find((o) => o.id === order.id);
  const sellerAView = (await req(shopA.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(!(sellerBView?.tracking?.legs ?? []).some((l) => l.kind === 'delivery'), "seller B does not see the leg that carries only A's parcel", JSON.stringify((sellerBView?.tracking?.legs ?? []).map((l) => l.kind)));
  ok((sellerAView?.tracking?.legs ?? []).some((l) => l.kind === 'delivery'), 'seller A sees it');
  const assigned = await req(admin.sock, 'logistics:assign', { taskId: first.id, riderId: demoRider.user.id });
  ok(assigned.ok, 'the warehouse gives the partial leg to a rider', assigned.error ?? '');
  const riderRow = ((await req(demoRider.sock, 'rider:tasks')).data ?? []).find((t) => t.id === first.id);
  ok(riderRow && riderRow.order.items.length === 1 && riderRow.order.partial === true && riderRow.completesOrder === false, 'the rider sees only the leg\'s line and that the order is partial', JSON.stringify(riderRow && { n: riderRow.order.items.length, p: riderRow.order.partial, c: riderRow.completesOrder }));
  await req(demoRider.sock, 'delivery:updateStatus', { taskId: first.id, status: 'picked_up' });
  let custOrder = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(custOrder?.rider?.name === demoRider.user.name, 'the customer sees the rider while the partial leg is on the road', JSON.stringify(custOrder?.rider));
  ok(custOrder.status !== 'out_for_delivery' && custOrder.status !== 'delivered', 'the partial leg does not move the order to "out for delivery"', custOrder.status);
  ok((await arrive(order.id, sellerB)), "B's parcel arrives while the leg is on the road");
  ok((await legsOf(order.id)).length === 1, 'it waits: still one customer leg');

  section('The partial leg is delivered: its cash, its lines, the order and the payment');
  let a = await deliverLeg(cust, order.id, first, first.codAmountUsd);
  ok(a.ok && a.data.status === 'delivered', 'the rider hands over A\'s part with the code and the exact cash', a.error ?? '');
  ok((await payOf(order.id))?.status === 'pending', 'the payment is still pending: the rest is to come');
  ok(Math.abs((await held()) - cash0 - first.codAmountUsd) < 0.011, 'the rider\'s cash in hand grew by the leg\'s share', `${await held()} vs ${cash0 + first.codAmountUsd}`);
  custOrder = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === order.id);
  const lineA = custOrder.items.find((i) => i.productId === prodA.id);
  const lineB = custOrder.items.find((i) => i.productId === prodB.id);
  ok(custOrder.status !== 'delivered' && lineA.fulfilment === 'received' && !!lineA.deliveredAt && !lineB.deliveredAt, "A's line is stamped delivered (fulfilment stays 'received'), B's is not, the order is not delivered", JSON.stringify([custOrder.status, lineA.fulfilment, lineA.deliveredAt, lineB.deliveredAt]));
  const sellerAAfter = (await req(shopA.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(sellerAAfter?.packageStatus === 'delivered', "seller A's package reads 'delivered'", sellerAAfter?.packageStatus);
  const notes = (await req(cust.sock, 'notifications:list')).data ?? [];
  ok(notes.some((n) => n.title === 'Part of your order is on its way') && notes.some((n) => n.title === 'Part of your order was delivered'), 'the customer was told about the part on its way and the part delivered', JSON.stringify(notes.map((n) => n.title).slice(0, 8)));

  section("B's parcel arrives: the final leg takes the remainder, with a new code");
  const second = await until(async () => { const l = await openLegOf(order.id); return l && l.id !== first.id ? l : null; });
  ok(second && JSON.stringify(second.sellerIds) === JSON.stringify([sellerB]), 'the next leg was planned when the first ended, for B', JSON.stringify(second?.sellerIds));
  ok(second && Math.abs(second.codAmountUsd - money(order.totalUsd - first.codAmountUsd)) < 0.011 && Math.abs(second.codAmountUsd - 40) < 0.011, "it takes the remainder (B's $40, no second fee)", `${second?.codAmountUsd}`);
  const code2 = (await req(cust.sock, 'orders:deliveryCode', { orderId: order.id })).data?.code;
  ok(/^\d{4}$/.test(code2 ?? '') && code2 !== code1.code, 'the second leg has a new code', `${code1.code} -> ${code2}`);
  a = await deliverLeg(cust, order.id, second, second.codAmountUsd);
  ok(a.ok && a.data.status === 'delivered', "the rider hands over B's part with the exact remainder", a.error ?? '');
  const pay = await until(async () => { const p = await payOf(order.id); return p?.status === 'succeeded' ? p : null; });
  ok(pay && Math.abs(pay.amountUsd - order.totalUsd) < 0.011, 'the payment is collected once, with the total', JSON.stringify(pay && [pay.status, pay.amountUsd]));
  ok(Math.abs((await held()) - cash0 - order.totalUsd) < 0.011, 'the rider\'s cash in hand is the order total across both legs', `${await held()} vs ${cash0 + order.totalUsd}`);
  const audit = (await req(admin.sock, 'audit:list')).data ?? [];
  ok(audit.some((l) => l.action === 'payment.cod_collected' && l.detail.includes(order.totalUsd.toFixed(2))) && audit.filter((l) => l.action === 'cod.collected' && [first.id, second.id].includes(l.entityId)).length === 2, 'the audit trail shows the cash of each leg and the payment collected with the total');
  custOrder = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === order.id);
  ok(custOrder.status === 'delivered' && custOrder.items.every((i) => !!i.deliveredAt), 'the order is delivered, every line stamped', custOrder.status);

  // ── 2. A parcel that arrives while the leg is still unassigned is merged into it ───────────────────────────────────
  section('A parcel arriving while the partial leg is still unassigned is merged into it');
  const o2 = await place([{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 1 }], 'cod');
  await arrive(o2.order.id, o2.sellerA);
  await run({ asOf: hoursFromNow(25) });
  const partial2 = await openLegOf(o2.order.id);
  ok(partial2 && partial2.status === 'unassigned' && partial2.sellerIds?.length === 1, 'the job made a partial leg that nobody has taken yet');
  const codeBefore = (await req(cust.sock, 'orders:deliveryCode', { orderId: o2.order.id })).data?.code;
  await arrive(o2.order.id, o2.sellerB);
  const legs2 = await legsOf(o2.order.id);
  ok(legs2.length === 1 && legs2[0].id === partial2.id, 'B\'s parcel is merged: still one leg, the same one', JSON.stringify(legs2.map((l) => l.id)));
  const merged = legs2[0];
  ok(merged.sellerIds?.length === 2 && JSON.parse(merged.itemsJson).length === 2, 'it now carries both sellers and both lines', JSON.stringify(merged.sellerIds));
  ok(Math.abs(merged.codAmountUsd - o2.order.totalUsd) < 0.011, 'its cash is now the whole order (it finishes the order)', `${merged.codAmountUsd} vs ${o2.order.totalUsd}`);
  ok((await req(cust.sock, 'orders:deliveryCode', { orderId: o2.order.id })).data?.code === codeBefore, 'the code stays the same on a merge');
  a = await deliverLeg(cust, o2.order.id, merged, merged.codAmountUsd);
  ok(a.ok, 'the merged leg is delivered in one go', a.error ?? '');
  ok((await payOf(o2.order.id))?.status === 'succeeded' && (await req(cust.sock, 'orders:list')).data.find((o) => o.id === o2.order.id)?.status === 'delivered', 'the order is delivered and its payment collected');

  // ── 3. Once a part is delivered the order cannot be cancelled or refunded ──────────────────────────────────────────
  section('After a partial delivery the order cannot be cancelled or refunded');
  const o3 = await place([{ productId: prodA.id, qty: 1 }, { productId: prodB.id, qty: 1 }], 'stripe_card');
  await arrive(o3.order.id, o3.sellerA);
  await run({ asOf: hoursFromNow(25) });
  const leg3 = await openLegOf(o3.order.id);
  a = await deliverLeg(cust, o3.order.id, leg3, 0);
  ok(a.ok, 'a prepaid order\'s partial leg is delivered', a.error ?? '');
  const TEXT = 'Part of this order was already delivered. Contact support to stop the rest.';
  a = await req(cust.sock, 'orders:cancel', { orderId: o3.order.id });
  ok(!a.ok && a.error === TEXT, 'the customer cannot cancel it', a.error ?? 'was allowed');
  a = await req(admin.sock, 'orders:adminCancel', { orderId: o3.order.id, reason: 'Customer asked by phone' });
  ok(!a.ok && a.error === TEXT, 'an operator cannot cancel it either', a.error ?? 'was allowed');
  a = await req(finance.sock, 'orders:refund', { orderId: o3.order.id });
  ok(!a.ok && a.error === TEXT, 'finance cannot refund it as a whole', a.error ?? 'was allowed');
  const still = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === o3.order.id);
  ok(still.status !== 'cancelled' && still.items.every((i) => i.fulfilment !== 'cancelled'), 'nothing changed on the order', still.status);
  await arrive(o3.order.id, o3.sellerB);
  const final3 = await until(async () => { const l = await openLegOf(o3.order.id); return l && l.id !== leg3.id ? l : null; });
  a = final3 ? await deliverLeg(cust, o3.order.id, final3, 0) : { ok: false, error: 'no final leg' };
  ok(a.ok && (await req(cust.sock, 'orders:list')).data.find((o) => o.id === o3.order.id)?.status === 'delivered', 'the rest arrives and the order is delivered', a.error ?? '');

  // The rider's cash from the COD orders is what they took: nothing was invented along the way.
  const cashEnd = await held();
  ok(Math.abs(cashEnd - (heldBefore + heldLimeteBefore) - (order.totalUsd + o2.order.totalUsd)) < 0.011, 'across the scenarios the riders hold exactly the cash of the two COD orders', `${cashEnd} vs ${heldBefore + heldLimeteBefore + order.totalUsd + o2.order.totalUsd}`);

  for (const [key, value] of Object.entries(was)) if (value !== undefined) await set(key, value);
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
