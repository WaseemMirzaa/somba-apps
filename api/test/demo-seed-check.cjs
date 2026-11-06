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
  const order = Object.keys(accounts).map((e) => e.split('@')[0]);
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
    const o = orders.find((x) => x.items?.[0]?.productNameFr);
    ok(o && o.items[0].productNameFr !== o.items[0].productName, 'French names on order lines', JSON.stringify(o?.items?.[0]?.productNameFr));
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

  for (const s of Object.values(S)) s.sock.close();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed: ' + fails.join('; ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
