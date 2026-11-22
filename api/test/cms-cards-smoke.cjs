/* Home cards from the CMS, end to end on a server seeded with the demo data (`npm run seed:demo`):
 * create / edit / hide / reorder / delete a card as Marketing, who hears about it (guests, customers), what a guest may
 * see (only live cards, a draft only as a stub), validation (with French), and that a customer cannot change anything.
 *
 *   API_URL=http://localhost:3057 DEMO_CREDENTIALS_FILE=/path/to/demo-credentials.txt node test/cms-cards-smoke.cjs
 *
 * It removes every card it creates.
 */
const { io } = require('socket.io-client');
const { readFileSync } = require('fs');
const { createHmac } = require('crypto');

const API = process.env.API_URL ?? 'http://localhost:3057';
const CRED = process.env.DEMO_CREDENTIALS_FILE ?? '/etc/somba/demo-credentials.txt';

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fails.push(name); console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const acct = (local) => accounts[`${local}@demo.komoriko.test`];

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
    const res = await new Promise((r) => { const t = setTimeout(() => r({ ok: false, error: `timeout: ${ev}` }), 15000); s.emit(ev, b, (x) => { clearTimeout(t); r(x); }); });
    if (res?.ok === false && /Too many requests/.test(res.error ?? '') && attempt < 5) { await sleep(1100); continue; }
    return res;
  }
};
const data = (r) => (r && r.ok ? r.data : null);
const arr = (r) => (Array.isArray(data(r)) ? data(r) : []);
/** The next time `ev` arrives on `sock` that matches (or null after `ms`). Start BEFORE doing the thing that causes it. */
const nextEvent = (sock, ev, match = () => true, ms = 6000) => new Promise((res) => {
  const t = setTimeout(() => { sock.off(ev, h); res(null); }, ms);
  const h = (p) => { if (match(p)) { clearTimeout(t); sock.off(ev, h); res(p); } };
  sock.on(ev, h);
});

const signIn = async (local) => {
  const a = acct(local);
  if (!a) throw new Error(`no credentials for ${local}`);
  const r = await post('/api/v1/auth/login', { email: a.email, password: a.password });
  if (r.status !== 200 && r.status !== 201) throw new Error(`${local}: sign-in status ${r.status}`);
  let tokens = r.json;
  if (r.json.needs2fa) {
    await sleep(6500); // 10 two-factor sign-ins a minute
    const t = await post('/api/v1/auth/login/2fa', { challenge: r.json.challenge, code: totp(a.totp_key) });
    if (t.status !== 200 && t.status !== 201) throw new Error(`${local}: two-factor status ${t.status}`);
    tokens = t.json;
  }
  return { user: tokens.user, sock: await connect(tokens.accessToken) };
};

(async () => {
  section('Sign in');
  const mkt = await signIn('admin.marketing');
  ok(!!mkt, 'marketing admin signs in');
  const C = await signIn('customer.full');
  ok(!!C, 'customer signs in');
  const G = await new Promise((resolve, reject) => { const s = io(API, { transports: ['websocket'] }); s.on('connect', () => resolve(s)); s.on('connect_error', reject); setTimeout(() => reject(new Error('guest timeout')), 10000); });
  ok(G.connected, 'a guest connects');
  const M = mkt.sock;
  const stamp = Date.now().toString(36);
  const k1 = `w5-a-${stamp}`, k2 = `w5-b-${stamp}`, k3 = `w5-future-${stamp}`;

  section('Create a card: everyone hears about it, a draft is never sent to guests');
  const gHear = nextEvent(G, 'cms:updated', (p) => p.key === k1);
  const cHear = nextEvent(C.sock, 'cms:updated', (p) => p.key === k1);
  const r1 = await req(M, 'cms:upsert', { key: k1, title: 'Card A', titleFr: 'Carte A', body: 'Body A', type: 'banner', active: true, imageUrl: 'https://cdn.example.com/a.jpg', linkType: 'deals', ctaText: 'See deals', ctaTextFr: 'Voir les offres', colorKey: 'teal', sortOrder: 5 });
  ok(r1.ok, 'marketing creates a card', r1.error);
  const gp = await gHear;
  ok(gp && gp.title === 'Card A' && gp.imageUrl === 'https://cdn.example.com/a.jpg' && gp.linkType === 'deals' && gp.ctaTextFr === 'Voir les offres' && gp.colorKey === 'teal', 'a guest receives the whole card');
  ok(!!(await cHear), 'a customer receives it too');
  const r2 = await req(M, 'cms:upsert', { key: k2, title: 'Card B', body: 'Body B', type: 'banner', active: true, sortOrder: 6 });
  ok(r2.ok, 'second card created', r2.error);
  const gDraft = nextEvent(G, 'cms:updated', (p) => p.key === k3);
  const r3 = await req(M, 'cms:upsert', { key: k3, title: 'Secret draft', body: 'Do not leak', type: 'banner', active: false });
  ok(r3.ok, 'a draft card is created', r3.error);
  const dp = await gDraft;
  ok(dp && dp.active === false && dp.title === undefined && dp.body === undefined, 'a guest only gets a stub for a draft', JSON.stringify(dp));

  section('Lists: order, schedule, guests vs staff');
  const rf = await req(M, 'cms:upsert', { key: k3, active: true, startsAt: new Date(Date.now() + 86400000).toISOString() });
  ok(rf.ok, 'the draft is scheduled for tomorrow', rf.error);
  const gl = arr(await req(G, 'cms:list'));
  const mine = gl.filter((b) => b.key.endsWith(stamp));
  ok(mine.map((b) => b.key).join() === `${k1},${k2}`, 'a guest sees the live cards in order, not the scheduled one', mine.map((b) => b.key).join());
  const al = arr(await req(M, 'cms:list')).filter((b) => b.key.endsWith(stamp));
  ok(al.length === 3, 'staff see all three');
  ok(gl.every((b, i) => i === 0 || gl[i - 1].sortOrder <= b.sortOrder), 'the list is sorted by position');

  section('Validation');
  const bad = [
    [{ key: k2, linkType: 'url', linkTarget: 'http://x.example' }, 'must start with https://'],
    [{ key: k2, linkType: 'product' }, 'Choose the product'],
    [{ key: k2, colorKey: 'pink' }, 'card colours'],
    [{ key: k2, startsAt: '2026-05-02', endsAt: '2026-05-01' }, 'end date'],
    [{ key: k2, ctaText: 'Go' }, 'somewhere to go'],
    [{ key: k2, imageUrl: 'javascript:alert(1)' }, 'uploaded image'],
  ];
  for (const [b, msg] of bad) {
    const r = await req(M, 'cms:upsert', b);
    ok(r.ok === false && (r.error ?? '').includes(msg), `refused: ${msg}`, JSON.stringify(r));
    ok(r.ok === false && !!r.errorFr, '  with a French text', JSON.stringify(r));
  }

  section('Reorder');
  const gRe = nextEvent(G, 'cms:updated', (p) => p.key === k2);
  const ro = await req(M, 'cms:reorder', { keys: [k2, k1] });
  ok(ro.ok, 'reorder works', ro.error);
  const after = arr(await req(G, 'cms:list')).filter((b) => b.key.endsWith(stamp)).map((b) => b.key);
  ok(after.join() === `${k2},${k1}`, 'the new order is what guests read', after.join());
  ok(!!(await gRe), 'guests hear about the move');

  section('Hide, delete, and who may');
  const gHide = nextEvent(G, 'cms:updated', (p) => p.key === k1);
  await req(M, 'cms:upsert', { key: k1, active: false });
  const hp = await gHide;
  ok(hp && hp.active === false && hp.title === undefined, 'hiding sends guests a stub');
  const cu = await req(C.sock, 'cms:upsert', { key: k1, title: 'hack' });
  const cd = await req(C.sock, 'cms:delete', { key: k1 });
  const cr = await req(C.sock, 'cms:reorder', { keys: [k1] });
  ok(!cu.ok && !cd.ok && !cr.ok, 'a customer cannot change, delete or reorder');
  const gDel = nextEvent(G, 'cms:updated', (p) => p.key === k2 && p.deleted);
  const d = await req(M, 'cms:delete', { key: k2 });
  ok(d.ok, 'delete works', d.error);
  ok(!!(await gDel), 'guests hear that it is gone');
  const d2 = await req(M, 'cms:delete', { key: k2 });
  ok(d2.ok === false && !!d2.errorFr, 'deleting twice is refused, in French too', JSON.stringify(d2));

  for (const k of [k1, k3]) await req(M, 'cms:delete', { key: k });
  ok(arr(await req(M, 'cms:list')).every((b) => !b.key.endsWith(stamp)), 'cleaned up');

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
