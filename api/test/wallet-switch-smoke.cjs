/* The wallet switch (`walletEnabled`), end to end against a RUNNING dev API seeded with `npm run seed`:
 *   1 on (the default): pay with the wallet works, a card order works, customers read `walletEnabled: 'true'`
 *   2 off: the admin switches it; customers hear `settings:updated` live; pay with wallet, top-up and a wallet plan purchase are
 *     refused with the clear EN and FR sentence; balances are untouched
 *   3 refunds while off: an order paid with the wallet still refunds into the wallet; an order paid by card is NOT refunded into the
 *     wallet (here the payment cannot go back automatically: Stripe is not connected, so the refund is refused and nothing moves)
 *   4 on again: everything works as before (the same card order refunds to the wallet)
 *
 *   API_URL=http://localhost:3001 node test/wallet-switch-smoke.cjs
 *
 * ADMIN_PW overrides the seed password. The automatic refund to the phone / card (pawaPay, Stripe connected) is covered by the
 * jest suite `src/payments/wallet-switch.spec.ts` with fake processors. It restores `walletEnabled` at the end (even when a check throws).
 */
const { io } = require('socket.io-client');
const { kyc } = require('./kyc.cjs');
const API = process.env.API_URL ?? 'http://localhost:3001';
const PW = 'Somba@2026';
const NEW_PW = 'Wallet-Pass-2026';
const tag = Date.now().toString().slice(-8);

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b) => Math.abs(a - b) < 0.011;
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
const track = (client) => {
  client.events = [];
  client.sock.onAny((ev, payload) => client.events.push({ ev, payload, at: Date.now() }));
  return client;
};
const login = async (email, pw = PW) => {
  const r = await rest('/api/v1/auth/login', { email, password: pw });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return track({ token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) });
};
const register = async (label, role = 'customer') => {
  const r = await rest('/api/v1/auth/register', { email: `${label}${tag}@wallet.test`, password: NEW_PW, name: `${label} user`, role });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${JSON.stringify(r.json)}`);
  return track({ token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken), email: `${label}${tag}@wallet.test` });
};
const ADDRESS = JSON.stringify({ line1: '1 Test', city: 'Kinshasa' });
const PHONE = '+243 81 234 5678';

const OFF_EN = 'The wallet is not available right now.';
const OFF_FR = 'Le portefeuille n’est pas disponible pour le moment.';
const NO_ROUTE_EN = 'The wallet is switched off and this payment cannot be refunded to its original method from here. Switch the wallet back on to refund it.';

(async () => {
  const admin = await login('admin@somba.app', process.env.ADMIN_PW ?? PW);
  const saved = (await req(admin.sock, 'settings:get')).data ?? {};
  const setting = (key, value) => req(admin.sock, 'settings:set', { key, value });
  const restore = async () => {
    await setting('walletEnabled', saved.walletEnabled ?? 'true').catch(() => undefined);
    await setting('productModeration', saved.productModeration ?? 'false').catch(() => undefined);
    await setting('requireVerifiedForCheckout', saved.requireVerifiedForCheckout ?? 'false').catch(() => undefined);
  };

  try {
    await setting('walletEnabled', 'true');
    await setting('productModeration', 'false');
    await setting('requireVerifiedForCheckout', 'false');

    // ---- actors: a store with a product, and a customer with wallet money (the seeded demo customer holds a balance) -----------
    const seller = await register('shop', 'seller');
    const store = (await req(seller.sock, 'sellers:register', kyc(`Wallet Store ${tag}`))).data;
    await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' });
    await req(seller.sock, 'sellers:update', { pickupAddress: '7 Rue du Marché, Limete' });
    const prod = (await req(seller.sock, 'products:create', { name: `Wallet mug ${tag}`, price: 12, category: 'Electronics', stock: 50 })).data;
    ok(prod?.status === 'live', 'setup: a live product', JSON.stringify(prod?.status));
    const cust = await login('customer@somba.app');
    const wallet = async () => (await req(cust.sock, 'wallet:get')).data.balance;
    const order = (paymentMethod, extra = {}) => req(cust.sock, 'orders:create', { clientRequestId: require('crypto').randomUUID(), items: [{ productId: prod.id, qty: 1 }], paymentMethod, shippingAddress: ADDRESS, ...extra });
    const view = async (id) => (await req(cust.sock, 'orders:list')).data.find((o) => o.id === id);

    // =======================================================================
    section('1. Wallet on (the default)');
    let a = await req(cust.sock, 'settings:get');
    ok(a.ok && a.data.walletEnabled === 'true', 'customers read walletEnabled: true', JSON.stringify(a.data?.walletEnabled));
    const b0 = await wallet();
    a = await order('wallet');
    ok(a.ok, 'pay with the wallet works', a.error ?? '');
    const walletOrder = a.data;
    const b1 = await wallet();
    ok(near(b1, b0 - walletOrder.totalUsd), 'the wallet was charged the order total', `${b0} → ${b1} (total ${walletOrder.totalUsd})`);
    a = await order('stripe_card');
    ok(a.ok, 'a card order works', a.error ?? '');
    const cardOrder = a.data;
    ok(near(await wallet(), b1), 'a card order leaves the wallet alone');

    // =======================================================================
    section('2. The admin switches the wallet off');
    const since = Date.now();
    a = await setting('walletEnabled', 'false');
    ok(a.ok && a.data.walletEnabled === 'false', 'the admin can switch it off', a.error ?? '');
    const live = await until(async () => cust.events.find((e) => e.ev === 'settings:updated' && e.at >= since && e.payload.walletEnabled === 'false'));
    ok(!!live, 'customers hear it live (settings:updated carries walletEnabled: false)');
    a = await req(cust.sock, 'settings:get');
    ok(a.ok && a.data.walletEnabled === 'false', 'settings:get says walletEnabled: false');
    ok(near(await wallet(), b1), 'the balance is untouched by the switch');

    a = await order('wallet');
    ok(!a.ok && a.error === OFF_EN, 'pay with the wallet is refused', a.error ?? 'order was created');
    ok(a.errorFr === OFF_FR, '…with its French sentence', String(a.errorFr));
    a = await req(cust.sock, 'wallet:topup', { amountUsd: 10, method: 'orange_money', phone: PHONE });
    ok(!a.ok && a.error === OFF_EN && a.errorFr === OFF_FR, 'a top-up is refused, EN and FR', JSON.stringify(a));
    const plans = (await req(seller.sock, 'sellers:plans')).data ?? [];
    const paid = plans.find((p) => (p.priceUsd ?? 0) > 0);
    if (paid) {
      a = await req(seller.sock, 'sellers:subscribe', { plan: paid.id, method: 'wallet' });
      ok(!a.ok && a.error === OFF_EN, 'a seller plan paid with the wallet is refused', JSON.stringify(a));
    } else console.log('  (no paid plan in this seed: the plan purchase check is covered by the jest suite)');
    ok(near(await wallet(), b1), 'nothing above moved the balance');
    a = await order('stripe_card');
    ok(a.ok, 'a card order still works while the wallet is off', a.error ?? '');
    const cardOrder2 = a.data;
    ok(near(await wallet(), b1), '…and does not touch the wallet');

    // =======================================================================
    section('3. Refunds while the wallet is off');
    a = await req(admin.sock, 'orders:refund', { orderId: cardOrder2.id, toWallet: true });
    ok(!a.ok && a.error === NO_ROUTE_EN, 'a card-paid order is not refunded into the wallet (no automatic route here: refused)', JSON.stringify(a));
    ok(near(await wallet(), b1), '…and the wallet did not move');
    ok((await view(cardOrder2.id)).status !== 'cancelled' && (await view(cardOrder2.id)).status !== 'returned', '…and the order is untouched');
    a = await req(admin.sock, 'orders:refund', { orderId: walletOrder.id, toWallet: true });
    ok(a.ok && a.data.status === 'refunded', 'an order paid WITH the wallet still refunds', a.error ?? '');
    ok(near(await wallet(), b1 + walletOrder.totalUsd), 'the wallet gets back what the wallet paid', `${b1} → ${await wallet()}`);

    // =======================================================================
    section('4. Switched on again: everything is back');
    a = await setting('walletEnabled', 'true');
    ok(a.ok && a.data.walletEnabled === 'true', 'the admin switches it on');
    ok(!!(await until(async () => cust.events.find((e) => e.ev === 'settings:updated' && e.at >= since && e.payload.walletEnabled === 'true'))), 'customers hear it live');
    const b2 = await wallet();
    ok(near(b2, b1 + walletOrder.totalUsd), 'the balance is what it was (nothing lost, nothing added)');
    a = await order('wallet');
    ok(a.ok, 'pay with the wallet works again', a.error ?? '');
    const again = a.data;
    ok(near(await wallet(), b2 - again.totalUsd), 'and charges the wallet');
    a = await req(admin.sock, 'orders:refund', { orderId: cardOrder2.id, toWallet: true });
    ok(a.ok, 'the card order that could not refund while off refunds to the wallet now', a.error ?? '');
    ok(near(await wallet(), b2 - again.totalUsd + cardOrder2.totalUsd), 'the wallet got the card order back');
    a = await req(cust.sock, 'wallet:topup', { amountUsd: 10, method: 'orange_money', phone: PHONE });
    ok(a.ok, 'a top-up is accepted again', a.error ?? '');
    void cardOrder;
  } finally {
    await restore();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
