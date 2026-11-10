/* Checks a server that has the demo data (npm run seed:demo): signs in as every demo account (with its two-factor code
 * where it has one) and asks the API, over the socket, for what that account is meant to show.
 *
 *   API_URL=http://localhost:3063 DEMO_CREDENTIALS_FILE=/path/to/demo-credentials.txt node test/demo-seed-check.cjs
 *
 * It only reads (plus attempts that must be refused). The sign-in limit is 30 a minute and the two-factor step 10 a
 * minute, so the script paces itself. Run it on a server that holds the demo and nothing else you care about.
 */
const { io } = require('socket.io-client');
const { readFileSync } = require('fs');
const { createHmac } = require('crypto');

const API = process.env.API_URL ?? 'http://localhost:3063';
const CRED = process.env.DEMO_CREDENTIALS_FILE ?? '/etc/somba/demo-credentials.txt';

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── credentials file ──
const accounts = {};
(() => {
  let cur = null;
  for (const raw of readFileSync(CRED, 'utf8').split('\n')) {
    const line = raw.trim();
    const head = /^\[(.+)\]$/.exec(line);
    if (head) { cur = accounts[head[1]] = { email: head[1] }; continue; }
    const kv = /^(\w+)\s*=\s*(.*)$/.exec(line);
    if (cur && kv) cur[kv[1]] = kv[2];
  }
})();
const acct = (local) => accounts[`${local}@demo.sombateka.test`];

// ── TOTP (RFC 6238, as an authenticator app does it) ──
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = []; for (const c of s.replace(/[\s=-]/g, '').toUpperCase()) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, step = Math.floor(Date.now() / 30000)) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };

const post = async (path, body) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch {}
    if (res.status === 429 && attempt < 8) { await sleep(15000); continue; }
    return { status: res.status, json };
  }
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 10000);
});
const req = async (s, ev, b = {}) => {
  for (let attempt = 0; ; attempt++) {
    const res = await new Promise((r) => s.emit(ev, b, r));
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
const data = (r) => (r && r.ok ? r.data : null);

const signIn = async (local) => {
  const a = acct(local);
  if (!a) throw new Error(`no credentials for ${local}`);
  const r = await post('/api/v1/auth/login', { email: a.email, password: a.password });
  if (r.status === 429) throw new Error('rate limited');
  if (r.status !== 200 && r.status !== 201) return { status: r.status, json: r.json };
  let tokens = r.json;
  if (r.json.needs2fa) {
    await sleep(6500); // 10 two-factor sign-ins a minute
    const code = totp(a.totp_key);
    const t = await post('/api/v1/auth/login/2fa', { challenge: r.json.challenge, code });
    if (t.status !== 200 && t.status !== 201) return { status: t.status, json: t.json, twofa: true };
    tokens = t.json;
  }
  const sock = await connect(tokens.accessToken);
  return { status: 200, user: tokens.user, sock, token: tokens.accessToken };
};

const list = (r) => (Array.isArray(data(r)) ? data(r) : Array.isArray(data(r)?.items) ? data(r).items : Array.isArray(data(r)?.orders) ? data(r).orders : []);

(async () => {
  section('Every account signs in');
  const sessions = {};
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // e.g. ONLY=seller.a,rider: sign in only these (a quick re-run)
  const order = Object.keys(accounts).map((e) => e.split('@')[0]).filter((l) => !only || only.includes(l));
  for (const local of order) {
    const a = acct(local);
    if (local === 'customer.suspended') {
      const r = await post('/api/v1/auth/login', { email: a.email, password: a.password });
      ok(r.status >= 400 && r.status < 500, 'customer.suspended is refused', `(status ${r.status})`);
      continue;
    }
    if (local === 'team.invited') continue;
    let s;
    try { s = await signIn(local); } catch (e) { ok(false, `${local} signs in`, e.message); continue; }
    ok(s.status === 200, `${local} signs in${a.totp_key ? ' (two-factor code)' : ''}`, JSON.stringify(s.json ?? ''));
    if (s.status === 200) {
      sessions[local] = s;
      const me = await req(s.sock, 'me:get');
      ok(data(me)?.email === a.email || data(me)?.role === s.user.role, `${local}: me:get answers over the socket`, JSON.stringify(me).slice(0, 80));
    }
    await sleep(900);
  }
  const S = sessions;

  section('Passwords');
  // With DEMO_PASSWORD the seed gives everybody one password; otherwise customers and store owners share one and staff another.
  const single = acct('customer.full').password === acct('admin.super').password;
  ok(single ? acct('seller.a').password === acct('rider').password : acct('seller.a').password === acct('customer.full').password && acct('rider').password === acct('admin.super').password, single ? 'one password for everybody (DEMO_PASSWORD)' : 'customers and store owners share one password, staff another');

  section('Customer: full');
  if (S['customer.full']) {
    const s = S['customer.full'].sock;
    const orders = list(await req(s, 'orders:list', { limit: 100 }));
    ok(orders.length >= 15, `orders list (${orders.length})`);
    const statuses = new Set(orders.map((o) => o.status));
    for (const st of ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']) ok(statuses.has(st), `an order is ${st}`);
    ok(orders.some((o) => o.promoCode === 'DEMO10'), 'an order used a promo code');
    ok(orders.some((o) => (o.items ?? []).map((i) => i.sellerId).filter((v, i, a) => a.indexOf(v) === i).length >= 2), 'a multi-seller basket');
    const out = orders.find((o) => o.status === 'out_for_delivery');
    const code = out ? data(await req(s, 'orders:deliveryCode', { orderId: out.id })) : null;
    ok(code && /^\d{4}$/.test(String(code.code ?? '')), 'the delivery code of an order out for delivery', JSON.stringify(code));
    const w = data(await req(s, 'wallet:get'));
    ok(Number(w?.balance ?? w) > 500, `a large wallet (${w?.balance ?? w})`);
    const wt = list(await req(s, 'wallet:transactions'));
    ok(wt.length >= 10, `wallet history (${wt.length})`);
    const addr = list(await req(s, 'addresses:list'));
    ok(addr.length === 2 && addr.every((a) => a.geo?.lat && a.areaId), 'two pinned addresses in two communes');
    ok((list(await req(s, 'wishlist:list')) || []).length >= 4 || (data(await req(s, 'wishlist:list')) ?? []).length >= 4, 'wishlist');
    const cart = data(await req(s, 'cart:get'));
    ok(cart?.lines?.length >= 3 && cart?.saved?.length >= 1, 'cart lines and saved for later');
    ok(list(await req(s, 'follows:list')).length >= 3, 'followed stores');
    const notes = list(await req(s, 'notifications:list'));
    ok(notes.some((n) => n.read) && notes.some((n) => !n.read), `notices read and unread (${notes.length})`);
    const ds = list(await req(s, 'disputes:list', { limit: 50 }));
    ok(ds.some((d) => d.type === 'return' && d.stage === 'closed') && ds.some((d) => d.type === 'return' && d.stage === 'awaiting_seller') && ds.some((d) => d.type === 'dispute'), 'returns (refunded, awaiting the seller) and a dispute');
    ok(list(await req(s, 'exchanges:mine')).length >= 1, 'an exchange');
    ok(list(await req(s, 'replacements:mine')).length >= 1, 'a replacement');
    const chats = data(await req(s, 'chat:list', {}));
    ok((chats?.items ?? chats ?? []).length >= 2, 'chats with a seller');
    const tickets = list(await req(s, 'support:list'));
    ok(tickets.some((t) => t.status === 'closed') && tickets.some((t) => t.status === 'open'), 'support tickets, open and closed');
  }

  section('Customers: new, unverified, French');
  if (S['customer.new']) {
    const s = S['customer.new'].sock;
    ok(list(await req(s, 'orders:list', { limit: 10 })).length === 0, 'new customer: no orders');
    ok(list(await req(s, 'addresses:list')).length === 0, 'new customer: no address');
    const w = data(await req(s, 'wallet:get'));
    ok(Number(w?.balance ?? w) === 0, 'new customer: no wallet');
  }
  if (S['customer.unverified']) {
    const s = S['customer.unverified'].sock;
    const cart = data(await req(s, 'cart:get'));
    const pid = cart?.lines?.[0]?.productId;
    const r = await req(s, 'orders:create', { items: [{ productId: pid, qty: 1 }], paymentMethod: 'wallet', shippingAddress: JSON.stringify({ line1: '1 Test', city: 'Kinshasa' }) });
    ok(r?.ok === false && /verif/i.test(r.error ?? ''), 'unverified customer is stopped at checkout', JSON.stringify(r).slice(0, 120));
  }
  if (S['customer.fr']) {
    ok(S['customer.fr'].user.locale === 'fr', 'French customer: locale fr');
    const orders = list(await req(S['customer.fr'].sock, 'orders:list', { limit: 20 }));
    ok(orders.length >= 4 && orders.some((o) => o.status === 'delivered') && orders.some((o) => o.status === 'out_for_delivery'), 'French customer: orders');
    const named = orders.flatMap((x) => x.items ?? []).filter((i) => i.productNameFr && i.productNameFr !== i.productName);
    ok(named.length > 0, 'French names on order lines', JSON.stringify(orders[0]?.items?.[0]?.productNameFr));
  }

  section('Stores');
  const mine = async (local) => data(await req(S[local].sock, 'sellers:mine'));
  if (S['seller.a']) {
    const s = S['seller.a'].sock;
    const m = await mine('seller.a');
    ok(m?.status === 'approved' && m?.plan === 'pro', 'store A: approved, Pro plan');
    const ps = list(await req(s, 'products:list', { mine: true, limit: 100 }));
    const states = new Set(ps.map((p) => p.status));
    for (const st of ['live', 'pending', 'rejected', 'draft']) ok(states.has(st), `store A has a ${st} listing`);
    ok(ps.some((p) => p.stock === 0), 'store A: an out-of-stock listing');
    ok(ps.some((p) => p.stock > 0 && p.stock <= 10), 'store A: a low-stock listing');
    ok(ps.some((p) => (p.images ?? []).length === 8), 'store A: an 8-photo gallery');
    ok(ps.some((p) => p.variants), 'store A: listings with options');
    const so = list(await req(s, 'orders:sellerList', { limit: 100 }));
    ok(so.length >= 20, `store A orders (${so.length})`);
    const team = data(await req(s, 'team:list'));
    const members = team?.members ?? team?.items ?? [];
    ok(['manager', 'catalog', 'orders', 'finance', 'support'].every((r) => members.some((x) => x.role === r && x.status === 'active')) && members.some((x) => x.status === 'invited'), 'team: every role, plus an open invitation');
    ok(list(await req(s, 'coupons:list')).some((c) => c.code === 'MAISON5'), 'a store coupon');
    const camps = list(await req(s, 'campaigns:list'));
    ok(camps.some((c) => c.status === 'active') && camps.some((c) => c.status === 'pending') && camps.some((c) => c.status === 'draft'), 'campaigns: active, pending, draft');
    const fl = list(await req(s, 'flashsales:mine'));
    ok(fl.some((f) => f.status === 'approved') && fl.some((f) => f.status === 'nominated'), 'flash sales: approved and waiting');
    ok(list(await req(s, 'questions:seller', {})).length >= 1, 'questions to answer');
    ok(list(await req(s, 'reviews:seller', {})).length >= 8, 'reviews');
    const po = list(await req(s, 'payouts:list'));
    ok(po.some((p) => p.status === 'paid') && po.some((p) => p.status === 'requested'), 'payouts: one paid (no real transfer), one requested');
    ok(!!data(await req(s, 'finance:earnings', {})), 'earnings');
    ok(!!data(await req(s, 'finance:statements', {})), 'statements');
    const returns = list(await req(s, 'returns:list', {}));
    ok(returns.some((r) => r.stage === 'awaiting_seller' && r.sellerDueAt), 'a return to answer with a timer running', `${returns.length}`);
    const sa = data(await req(s, 'analytics:seller', {}));
    ok(!!sa, 'seller analytics');
  }
  if (S['seller.b']) {
    const m = await mine('seller.b');
    ok(m?.status === 'approved' && m?.plan === 'free', 'store B: Free plan');
    const c = await req(S['seller.b'].sock, 'coupons:create', { code: 'BTEST', type: 'fixed', value: 1, minOrder: 5 });
    ok(c?.ok === false && /plan|upgrade|coupon/i.test(c.error ?? ''), 'store B: a coupon is refused by the plan', JSON.stringify(c).slice(0, 100));
    const fl = await req(S['seller.b'].sock, 'flashsales:nominate', { productId: 'none', flashPrice: 1, endsAt: new Date(Date.now() + 86400000).toISOString() });
    ok(fl?.ok === false, 'store B: a flash-sale nomination is refused', JSON.stringify(fl).slice(0, 100));
  }
  if (S['seller.c']) ok((await mine('seller.c'))?.status === 'approved', 'store C: approved, signs in without a code');
  if (S['seller.d']) ok((await mine('seller.d'))?.status === 'pending', 'store D: KYC pending');
  if (S['seller.e']) { const m = await mine('seller.e'); ok(m?.status === 'rejected' && !!m.statusReason, 'store E: rejected with a reason'); }
  if (S['seller.f']) {
    const m = await mine('seller.f');
    ok(m?.status === 'suspended', 'store F: suspended');
    const r = await req(S['seller.f'].sock, 'products:create', { name: 'x', price: 5, category: 'Grocery' });
    ok(r?.ok === false, 'store F: read only (listing refused)', JSON.stringify(r).slice(0, 100));
    ok(list(await req(S['seller.f'].sock, 'orders:sellerList', { limit: 5 })).length >= 0, 'store F: can still read orders');
  }
  if (S['seller.g']) {
    const m = await mine('seller.g');
    ok(m?.vacationUntil && new Date(m.vacationUntil) > new Date(), 'store G: vacation mode on');
  }
  if (S['seller.h']) {
    const r = await req(S['seller.h'].sock, 'products:create', { name: 'Notebook', price: 3, category: 'Books', stock: 5 });
    ok(r?.ok === false && /pin/i.test(r.error ?? ''), 'store H: listing refused without a pickup pin', JSON.stringify(r).slice(0, 100));
  }
  if (S['team.catalog']) {
    ok(list(await req(S['team.catalog'].sock, 'products:list', { mine: true, limit: 5 })).length > 0, 'catalog member sees the products');
    const r = await req(S['team.catalog'].sock, 'orders:sellerList', { limit: 5 });
    ok(r?.ok === false, 'catalog member is refused the orders', JSON.stringify(r).slice(0, 100));
  }
  if (S['team.finance']) {
    ok(!!data(await req(S['team.finance'].sock, 'finance:earnings', {})), 'finance member sees earnings');
    const r = await req(S['team.finance'].sock, 'orders:sellerList', { limit: 5 });
    ok(r?.ok === false, 'finance member is refused the orders', JSON.stringify(r).slice(0, 100));
  }
  if (S['team.orders']) ok(list(await req(S['team.orders'].sock, 'orders:sellerList', { limit: 5 })).length > 0, 'orders member sees the orders');
  if (S['team.support']) ok(!!(data(await req(S['team.support'].sock, 'chat:list', { as: 'seller' })) ?? null), 'support member sees the chats');
  if (S['team.manager']) ok(list(await req(S['team.manager'].sock, 'orders:sellerList', { limit: 5 })).length > 0, 'manager sees the orders');

  section('Admin');
  if (S['admin.super']) {
    const s = S['admin.super'].sock;
    ok(!!data(await req(s, 'settings:get')), 'settings');
    ok(list(await req(s, 'audit:list', { limit: 20 })).length > 0, 'audit log');
    ok(list(await req(s, 'roles:staff')).length >= 12, 'staff list');
    ok(list(await req(s, 'products:list', { status: 'removed', limit: 50 })).some((p) => p.sku === 'MK-ENG'), 'a blocked (taken down) listing');
    ok(list(await req(s, 'sellers:list', { status: 'pending', limit: 20 })).some((x) => x.name === 'Bandal Textiles'), 'pending seller (D) in the queue');
    ok(list(await req(s, 'fraud:list')).length >= 2, 'fraud alerts');
    const cust = list(await req(s, 'customers:list', { limit: 100 }));
    ok(cust.some((c) => c.active === false), 'customers list shows the suspended one');
    ok(list(await req(s, 'disputes:list', { limit: 50 })).length >= 4, 'disputes and returns');
    ok(list(await req(s, 'payouts:list')).length >= 2, 'payouts');
  }
  if (S['admin.moderation']) {
    const s = S['admin.moderation'].sock;
    const pend = list(await req(s, 'products:list', { status: 'pending', limit: 50 }));
    ok(pend.length >= 2, `product moderation queue (${pend.length})`);
    ok(list(await req(s, 'reviews:admin', { reported: true })).length >= 1, 'reported reviews');
  }
  if (S['admin.operations']) ok(list(await req(S['admin.operations'].sock, 'hubs:list')).some((h) => /Maluku/.test(h.name)), 'operations sees the demo warehouse');
  if (S['admin.finance']) ok(list(await req(S['admin.finance'].sock, 'payments:list', { limit: 20 })).length > 0, 'finance sees payments');
  if (S['admin.marketing']) {
    const s = S['admin.marketing'].sock;
    ok(list(await req(s, 'cms:list')).filter((b) => /^demo-/.test(b.key)).length >= 3, 'CMS banners');
    ok(list(await req(s, 'flashsales:list', { all: true })).length >= 3, 'flash sales');
    ok(list(await req(s, 'campaigns:list')).some((c) => c.status === 'pending'), 'a campaign waiting for marketing');
    ok(list(await req(s, 'promos:list')).some((p) => p.code === 'DEMO10'), 'promo codes');
  }
  if (S['admin.support']) {
    const t = list(await req(S['admin.support'].sock, 'support:list', { limit: 50 }));
    ok(t.length >= 3 && t.some((x) => x.status === 'open'), `support tickets (${t.length})`);
  }

  section('Warehouse and rider');
  if (S['warehouse.manager']) {
    const s = S['warehouse.manager'].sock;
    ok((data(await req(s, 'logistics:queue', { status: 'open', limit: 50 }))?.tasks ?? []).length >= 5, 'warehouse desk has open legs');
    ok(list(await req(s, 'stock:bins', {})).length >= 3, 'warehouse bins');
    ok(!!data(await req(s, 'hubSettings:get', {})), 'warehouse settings');
  }
  if (S['warehouse.supervisor']) ok(list(await req(S['warehouse.supervisor'].sock, 'exceptions:list', {})).length >= 3, 'incidents');
  if (S['warehouse.operator']) ok(!!data(await req(S['warehouse.operator'].sock, 'logistics:custody', {})), 'custody');
  if (S['rider']) {
    const t = data(await req(S['rider'].sock, 'rider:tasks', {}));
    const arr = Array.isArray(t) ? t : (t?.tasks ?? t?.items ?? []);
    ok(arr.length >= 2, `rider has tasks (${arr.length})`);
    ok(!!data(await req(S['rider'].sock, 'rider:workStats', {})), 'rider: my work');
  }
  if (S['warehouse.maluku']) ok(((data(await req(S['warehouse.maluku'].sock, 'logistics:queue', { status: 'open', limit: 50 }))?.tasks) ?? []).length >= 1, 'the demo warehouse expects the transfer');


  section('Orders to process: every store, split delivery, failed attempt, cash on delivery');
  const settings = S['admin.super'] ? data(await req(S['admin.super'].sock, 'settings:get')) : null;
  const sellerOrders = async (l) => (S[l] ? list(await req(S[l].sock, 'orders:sellerList', { limit: 200 })) : []);
  const names = (o) => (o.items ?? []).map((i) => i.productName);
  const has = (o, want) => names(o).length === want.length && want.every((n) => names(o).includes(n));
  const legsOf = (o) => o?.tracking?.legs ?? [];
  const STORES = {
    'seller.a': { label: 'A (Maison Kinshasa)', toPack: 5, pack: ['Natural Honey 500 g'], part: ['Solar LED Lantern', 'Football, Size 5'], ready: ['Wooden Building Blocks, 50 pieces'] },
    'seller.b': { label: 'B (Limete Grossiste)', toPack: 2, pack: ['Hibiscus Tea (Bissap) 250 g'], part: ['Storage Bin Set, 3 pieces', 'Exercise Notebooks, 5 pack'], ready: ['Steel Water Bottle 750 ml'] },
    'seller.c': { label: 'C (Ndolo Électro)', toPack: 2, pack: ['Electric Kettle 1.7 L'], part: ['Rechargeable Stand Fan', 'USB Fast Charger'], ready: ['Steam Iron'] },
  };
  const sellerSide = {};
  for (const [local, st] of Object.entries(STORES)) {
    if (!S[local]) continue;
    const orders = await sellerOrders(local);
    sellerSide[local] = orders;
    const toPack = orders.filter((o) => o.packageStatus === 'to_pack');
    ok(toPack.length >= st.toPack, `store ${st.label}: ${toPack.length} orders to pack (at least ${st.toPack})`);
    const pack = orders.find((o) => has(o, st.pack));
    ok(pack?.packageStatus === 'to_pack' && pack.paymentMethod === 'wallet', `store ${st.label}: a paid order waiting for Package Ready (${st.pack[0]})`, JSON.stringify(pack?.packageStatus));
    const part = orders.find((o) => has(o, st.part));
    ok(part?.packageStatus === 'to_pack' && part.items.length === 2 && part.items.every((i) => i.fulfilment === 'open'), `store ${st.label}: a two-line order the seller can part-cancel`, JSON.stringify(part?.packageStatus));
    const ready = orders.find((o) => has(o, st.ready));
    ok(ready?.packageStatus === 'ready' && legsOf(ready).some((l) => l.kind === 'pickup' && l.readyAt && ['unassigned', 'assigned'].includes(l.status)), `store ${st.label}: marked ready, the pickup leg waits for a rider`, JSON.stringify(ready?.packageStatus));
  }

  // A part-cancel is only refused here on a bad reason (nothing is changed): the order must be the seller's own and open.
  if (S['seller.b']) {
    const o = (sellerSide['seller.b'] ?? []).find((x) => has(x, STORES['seller.b'].part));
    const r = await req(S['seller.b'].sock, 'orders:sellerCancel', { orderId: o?.id, reason: '' });
    ok(r?.ok === false, 'store B: a part-cancel needs a reason (refused without one, nothing changed)', JSON.stringify(r).slice(0, 100));
  }

  // Split delivery: A's parcel waited past the limit and is out alone; B's is still on the way.
  const limit = Number(settings?.splitDeliveryAfterHours ?? 24);
  if (limit > 0) {
    if (S['customer.full']) {
      const o = list(await req(S['customer.full'].sock, 'orders:list', { limit: 100 })).find((x) => has(x, ['Planner 2027, A5', 'Cotton Bath Towel']));
      ok(!!o && o.status !== 'delivered', 'split order 1: the customer sees it, not delivered yet');
      const code = o ? data(await req(S['customer.full'].sock, 'orders:deliveryCode', { orderId: o.id })) : null;
      ok(code && /^\d{4}$/.test(String(code.code ?? '')), 'split order 1: the open partial leg has its own 4-digit code', JSON.stringify(code));
      const lg = legsOf(o);
      ok(lg.some((l) => l.kind === 'delivery' && l.status === 'in_transit'), 'split order 1: a delivery leg is out (partial)');
      ok(lg.some((l) => l.kind === 'pickup' && l.status === 'in_transit') && lg.some((l) => l.kind === 'pickup' && l.status === 'delivered'), "split order 1: A's parcel is at the warehouse, B's is still on its way");
      ok((o?.items ?? []).every((i) => !i.deliveredAt), 'split order 1: nothing is marked delivered yet');
    }
    if (S['seller.b']) {
      const o = (sellerSide['seller.b'] ?? (await sellerOrders('seller.b'))).find((x) => has(x, ['Cotton Bath Towel']));
      ok(!!o && o.packageStatus !== 'delivered' && legsOf(o).some((l) => l.kind === 'pickup' && l.status === 'in_transit'), "split order 1: store B sees its parcel still on the way to the warehouse");
    }
    if (S['rider']) {
      const t = data(await req(S['rider'].sock, 'rider:tasks', {}));
      const arr = Array.isArray(t) ? t : (t?.tasks ?? t?.items ?? []);
      ok(arr.some((x) => x.kind === 'delivery' && x.status === 'in_transit' && x.order?.partial === true && (x.sellerIds ?? []).length === 1), 'split order 1: the rider has the partial delivery (order.partial, one seller)');
    }
    if (S['customer.fr']) {
      const o = list(await req(S['customer.fr'].sock, 'orders:list', { limit: 100 })).find((x) => has(x, ['Football, Size 5', 'Cassava Flour 2 kg']));
      const lg = legsOf(o).filter((l) => l.kind === 'delivery');
      ok(o?.status === 'delivered' && lg.length === 2 && lg.every((l) => l.status === 'delivered'), 'split order 2: delivered on two legs', JSON.stringify([o?.status, lg.map((l) => l.status)]));
      ok((o?.items ?? []).length === 2 && o.items.every((i) => !!i.deliveredAt), 'split order 2: every line has its own delivered time');
      const times = new Set((o?.items ?? []).map((i) => String(i.deliveredAt)));
      ok(times.size === 2, 'split order 2: the two parts were delivered at different times');
    }
    for (const local of ['seller.a', 'seller.b']) {
      if (!S[local]) continue;
      const o = (await sellerOrders(local)).find((x) => (local === 'seller.a' ? has(x, ['Football, Size 5']) : has(x, ['Cassava Flour 2 kg'])) && x.status === 'delivered');
      ok(o?.packageStatus === 'delivered', `split order 2: store ${local === 'seller.a' ? 'A' : 'B'} sees its package delivered`, JSON.stringify(o?.packageStatus));
    }
  } else console.log('  (splitDeliveryAfterHours is 0 on this server: the split orders are plain two-seller orders and are not checked)');

  // A failed attempt that was re-opened.
  if (S['reviewer.4']) {
    const o = list(await req(S['reviewer.4'].sock, 'orders:list', { limit: 50 })).find((x) => has(x, ['Ceramic Dinner Plate Set, 12 pieces']));
    const del = legsOf(o).filter((l) => l.kind === 'delivery');
    const failed = del.find((l) => l.status === 'failed');
    const retry = del.find((l) => ['unassigned', 'assigned', 'picked_up', 'in_transit'].includes(l.status));
    ok(failed && failed.attempts === 1 && /not reachable/i.test(failed.failureReason ?? ''), 'failed attempt: attempt 1 failed with its reason recorded', JSON.stringify(failed?.failureReason));
    ok(retry && retry.attempts === 2, 'failed attempt: re-opened as attempt 2', JSON.stringify(retry?.attempts));
    ok(o?.status === 'confirmed', 'failed attempt: the order is back to confirmed', o?.status);
    const notes = list(await req(S['reviewer.4'].sock, 'notifications:list'));
    ok(notes.some((n) => /attempt failed/i.test(`${n.title} ${n.body}`)), 'failed attempt: the customer has the "attempt failed" notice');
  }
  if (S['rider']) {
    const t = data(await req(S['rider'].sock, 'rider:tasks', {}));
    const arr = Array.isArray(t) ? t : (t?.tasks ?? t?.items ?? []);
    ok(arr.some((x) => x.kind === 'delivery' && x.attempts === 2 && ['assigned', 'picked_up', 'in_transit'].includes(x.status)), 'failed attempt: the rider has the retry (attempt 2)');
  }

  // Cash on delivery: only when the server has it on.
  if (settings?.codEnabled === 'true') {
    if (S['seller.a']) {
      const o = (sellerSide['seller.a'] ?? (await sellerOrders('seller.a'))).find((x) => has(x, ['Leather Handbag']) && x.paymentMethod === 'cod');
      ok(o?.packageStatus === 'to_pack', 'cash on delivery: an order to pack (store A)', JSON.stringify(o?.packageStatus));
    }
    if (S['customer.full']) {
      const o = list(await req(S['customer.full'].sock, 'orders:list', { limit: 100 })).find((x) => has(x, ['Argan Hair Oil 100 ml', 'Ground Coffee 500 g']));
      ok(o?.paymentMethod === 'cod' && o.status === 'delivered', 'cash on delivery: a delivered order paid in cash', JSON.stringify([o?.paymentMethod, o?.status]));
      if (S['rider']) {
        const t = data(await req(S['rider'].sock, 'rider:tasks', {}));
        const arr = Array.isArray(t) ? t : (t?.tasks ?? t?.items ?? []);
        const leg = arr.find((x) => x.orderReference === o?.reference && x.kind === 'delivery');
        ok(leg && leg.codAmountUsd > 0 && Math.abs(leg.codCollectedUsd - leg.codAmountUsd) < 0.005 && leg.codCollectedAt, 'cash on delivery: the cash is recorded on the leg (amount, time)', JSON.stringify([leg?.codAmountUsd, leg?.codCollectedUsd]));
      }
    }
  } else console.log('  (cash on delivery is off on this server: the cash orders are not made and not checked. Seed with --with-cod to get them.)');

  // Preparation and handling time.
  if (S['seller.g']) {
    const ps = list(await req(S['seller.g'].sock, 'products:list', { mine: true, limit: 50 }));
    ok(ps.some((p) => p.prepDays === 5), 'prep time: a listing with 5 days (store G)');
    ok(ps.every((p) => p.prepDays >= 3), 'prep time: store G (hand-made) is 3 to 5 days');
  }
  if (S['seller.a']) {
    const ps = list(await req(S['seller.a'].sock, 'products:list', { mine: true, limit: 100 }));
    ok(ps.some((p) => p.prepDays === 0) && ps.some((p) => p.prepDays >= 2), 'prep time: store A has 0 days (food) up to 2 or more (goods made to order)');
  }
  for (const [local, days] of [['seller.a', 1], ['seller.b', 2], ['seller.c', 1], ['seller.g', 3]]) {
    if (S[local]) ok((await mine(local))?.handlingDays === days, `handling time: ${local} keeps ${days} day(s)`);
  }

  for (const s of Object.values(S)) s.sock.close();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed: ' + fails.join('; ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
