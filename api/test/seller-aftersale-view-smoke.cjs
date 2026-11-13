/* Seller portal's read-only after-sale view (docs/contracts/admin-controls.md §13), end to end on a server seeded with the demo
 * data (`npm run seed:demo`):
 *   - every section is off for a store until admin switches it on (default per section, per-store override Follow default / On / Off);
 *   - Returns / Exchanges / Replacements / Express then show READ-ONLY, redacted (first name only), live via `seller:updated`;
 *   - the private seller <-> support thread works both ways, support sees it, the customer never does;
 *   - the manager roles (admin, operations, support) manage it; finance only reads; nobody else gets in.
 *
 *   API_URL=http://localhost:3031 DEMO_CREDENTIALS_FILE=/path/to/demo-credentials.txt node test/seller-aftersale-view-smoke.cjs
 *
 * It restores every switch it changes (all defaults off, no override). The sign-in limit is 30 a minute and the two-factor step
 * 10 a minute, so it paces itself.
 */
const { io } = require('socket.io-client');
const { readFileSync } = require('fs');
const { createHmac } = require('crypto');

const API = process.env.API_URL ?? 'http://localhost:3031';
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
  const S = {};
  for (const local of ['admin.support', 'admin.operations', 'admin.finance', 'admin.marketing', 'seller.a', 'seller.b', 'team.orders', 'team.finance', 'customer.full']) {
    try { S[local] = await signIn(local); ok(true, `${local} signs in`); } catch (e) { ok(false, `${local} signs in`, e.message); }
    await sleep(700);
  }
  if (Object.keys(S).length < 9) { console.log('\nCannot continue without every account.'); process.exit(1); }
  const sup = S['admin.support'].sock;
  const ops = S['admin.operations'].sock;
  const fin = S['admin.finance'].sock;
  const mkt = S['admin.marketing'].sock;
  const A = S['seller.a'].sock;
  const B = S['seller.b'].sock;
  const TO = S['team.orders'].sock;
  const TF = S['team.finance'].sock;
  const C = S['customer.full'].sock;
  const mine = async (s) => data(await req(s, 'sellers:mine'));

  const sc = async (sock, ev) => arr(await req(sock, ev, { scope: 'store', limit: 100 })).filter((x) => x.sellerView);
  // A clean start: every default off, no override on store A.
  const store = await mine(A);
  const storeA = store.id;
  // (the demo gives store A its own override: remember it and put it back at the end)
  const KEYS = ['returns', 'exchanges', 'replacements', 'express', 'customerThread', 'reasons'];
  const origOverride = (data(await req(sup, 'sellers:get', { id: storeA })) ?? {}).afterSaleAccessOverride ?? {};
  const allNull = Object.fromEntries(KEYS.map((k) => [k, null]));
  const allOff = Object.fromEntries(KEYS.map((k) => [k, false]));
  await req(sup, 'sellerAccess:defaults:set', allOff);
  await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, ...allNull });

  section('Off by default: the seller sees nothing');
  const m0 = await mine(A);
  ok(m0.afterSaleAccess && Object.values(m0.afterSaleAccess).every((v) => v === false), 'sellers:mine carries afterSaleAccess, all four off', JSON.stringify(m0.afterSaleAccess));
  ok(!arr(await req(A, 'returns:list', {})).some((x) => x.sellerView), 'returns:list has no store case');
  ok(!arr(await req(A, 'exchanges:list', {})).some((x) => x.sellerView), 'exchanges:list has no store case');
  ok(!arr(await req(A, 'replacements:list', {})).some((x) => x.sellerView), 'replacements:list has no store case');
  const settingsAsSeller = data(await req(A, 'settings:get')) ?? {};
  ok(!Object.keys(settingsAsSeller).some((k) => /^sellerView/.test(k)), 'the four defaults are not in the public settings');

  // The store's return cases, as the desk sees them (with the customer's full name, which the seller must never get).
  const desk = arr(await req(sup, 'returns:list', { limit: 200 })).filter((d) => d.sellerId === storeA);
  ok(desk.length >= 1, `the demo has returns on store A (${desk.length})`);
  const ret = desk[0];
  const lastName = String(ret.customerName).split(/\s+/).slice(1).join(' ');
  const disputeDesk = arr(await req(sup, 'disputes:list', { limit: 200 })).filter((d) => d.sellerId === storeA && d.type === 'dispute');

  section('Turning Returns on by default (support), live on the open portal');
  const live = nextEvent(A, 'seller:updated', (p) => p?.id === storeA && p?.afterSaleAccess?.returns === true);
  const set = await req(sup, 'sellerAccess:defaults:set', { returns: true });
  ok(set.ok && set.data.returns === true && set.data.exchanges === false, 'support sets the Returns default', JSON.stringify(set));
  ok(!!(await live), 'the seller portal gets seller:updated with Returns on, without signing in again');
  const m1 = await mine(A);
  ok(m1.afterSaleAccess.returns === true && m1.afterSaleAccess.exchanges === false, 'only Returns is on');
  const rl = arr(await req(A, 'returns:list', {}));
  const mineRet = rl.find((x) => x.id === ret.id);
  ok(!!mineRet && mineRet.sellerView === true, 'the store return shows in returns:list');
  ok(rl.filter((x) => x.sellerView).every((x) => !('customerId' in x) && !('customerName' in x) && !('messages' in x)), 'redacted: no customer id, full name or thread');
  const raw = JSON.stringify(rl.filter((x) => x.sellerView));
  ok(mineRet?.customerFirstName === String(ret.customerName).split(/\s+/)[0] && (!lastName || !raw.includes(lastName)), 'only the first name of the customer is there');
  ok(!/\+\d{8,}|(?<![\w-])\d{9,}(?![\w-])/.test(raw) && !/"(phone|email|address|customerPhone)"/.test(raw), 'no phone, e-mail or address');
  ok(mineRet && Array.isArray(mineRet.items) && mineRet.items.length > 0 && Array.isArray(mineRet.timeline), 'items and a timeline are there', JSON.stringify(mineRet)?.slice(0, 160));
  const scoped = arr(await req(A, 'returns:list', { scope: 'store', limit: 2, offset: 0 }));
  ok(scoped.length >= 1 && scoped.length <= 2 && scoped.every((x) => x.sellerView), 'scope "store" returns the store cases only, and pages (limit / offset)');
  const one = data(await req(A, 'disputes:get', { id: ret.id }));
  ok(one?.sellerView === true && !('messages' in one) && !('customerName' in one), 'disputes:get gives the redacted case, no customer thread');
  if (disputeDesk[0]) ok(!(await req(A, 'disputes:get', { id: disputeDesk[0].id })).ok, 'a dispute (not a return) stays hidden');
  const other = arr(await req(B, 'returns:list', {}));
  ok(!other.some((x) => x.id === ret.id), 'another store never sees it');
  ok(!(await req(B, 'disputes:get', { id: ret.id })).ok, "another store cannot open it");
  for (const [ev, body] of [['returns:respond', { id: ret.id, accept: true }], ['returns:decide', { id: ret.id, approve: true }], ['disputes:reply', { id: ret.id, message: 'hello' }], ['disputes:decide', { id: ret.id, outcome: 'reject' }]]) {
    ok(!(await req(A, ev, body)).ok, `the seller cannot ${ev}`);
  }
  ok(!arr(await req(A, 'exchanges:list', {})).some((x) => x.sellerView), 'Exchanges is still off');

  section('Team: only roles that handle orders');
  ok(arr(await req(TO, 'returns:list', {})).some((x) => x.id === ret.id && x.sellerView), 'a team member with the orders role sees the store returns');
  ok(!arr(await req(TF, 'returns:list', {})).some((x) => x.sellerView), 'a finance team member does not');

  section('The private seller <-> support thread');
  const text1 = `Where is the customer's parcel? ${Date.now()}`;
  const heard = nextEvent(sup, 'caseThread:message', (p) => p?.caseId === ret.id && p.authorSide === 'seller');
  const s1 = await req(A, 'caseThread:send', { kind: 'return', caseId: ret.id, text: text1 });
  ok(s1.ok && s1.data.authorSide === 'seller', 'the seller writes to support', JSON.stringify(s1));
  ok(!!(await heard), 'support hears it live (caseThread:message)');
  ok(!!s1.data?.textI18n?.fr && !!s1.data?.textI18n?.en, 'the message is stored in both languages');
  const supList = arr(await req(sup, 'caseThread:list', { kind: 'return', caseId: ret.id }));
  ok(supList.some((m) => m.text === text1), 'support reads it in the Seller thread');
  const un = data(await req(sup, 'caseThread:unread'));
  ok(un?.count >= 1 && un.cases.some((c) => c.caseId === ret.id), 'support has an unread seller message');
  const text2 = `We are checking with the warehouse. ${Date.now()}`;
  const back = nextEvent(A, 'caseThread:message', (p) => p?.caseId === ret.id && p.authorSide === 'support');
  const r2 = await req(ops, 'caseThread:send', { kind: 'return', caseId: ret.id, text: text2 });
  ok(r2.ok && r2.data.authorSide === 'support', 'operations replies as support', JSON.stringify(r2));
  ok(!!(await back), 'the seller hears the reply live');
  const both = (l) => l.some((m) => m.text === text1) && l.some((m) => m.text === text2);
  ok(both(arr(await req(A, 'caseThread:list', { kind: 'return', caseId: ret.id }))), 'the seller reads both messages');
  const uA = data(await req(A, 'caseThread:unread'));
  ok(uA?.returns >= 1, 'the seller has an unread support message (nav badge)', JSON.stringify(uA));
  await req(A, 'caseThread:markRead', { kind: 'return', caseId: ret.id });
  const afterRead = (await sc(A, 'returns:list')).find((x) => x.id === ret.id);
  ok(afterRead?.unread === 0, 'reading it clears this case\'s unread count (the demo has other unread threads, so the total is not 0)');
  ok(!(await req(B, 'caseThread:list', { kind: 'return', caseId: ret.id })).ok, "another store cannot read this store's thread");
  ok(!(await req(A, 'caseThread:send', { kind: 'return', caseId: ret.id, text: '   ' })).ok, 'an empty message is refused');
  ok(!(await req(A, 'caseThread:send', { kind: 'return', caseId: ret.id, text: 'x'.repeat(2001) })).ok, 'a message over 2000 characters is refused');
  const exOff = await req(A, 'caseThread:list', { kind: 'exchange', caseId: ret.id });
  ok(!exOff.ok, 'the thread of a section that is off is refused', JSON.stringify(exOff));

  section('The customer never sees it');
  const cl = await req(C, 'caseThread:list', { kind: 'return', caseId: ret.id });
  ok(!cl.ok, 'the customer cannot open the seller thread', JSON.stringify(cl));
  ok(!(await req(C, 'caseThread:send', { kind: 'return', caseId: ret.id, text: 'hi' })).ok, 'the customer cannot write in it');
  const custCase = data(await req(C, 'disputes:get', { id: ret.id }));
  if (custCase) {
    const blob = JSON.stringify(custCase);
    ok(!blob.includes(text1) && !blob.includes(text2), 'the customer thread of the case holds none of it');
  } else {
    // the demo customer who filed it is another account: the customer-facing thread table is checked by id through the desk instead
    const deskCase = data(await req(sup, 'disputes:get', { id: ret.id }));
    ok(!JSON.stringify(deskCase.messages ?? []).includes(text1), 'the customer <-> support thread of the case holds none of it');
  }
  const cn = arr(await req(C, 'notifications:list', {}));
  ok(!cn.some((n) => /Seller message|Message from KOMORIKO support/.test(n.title)), 'the customer gets no notice about it');

  section('Roles');
  ok(!(await req(fin, 'sellerAccess:defaults:set', { returns: false })).ok, 'finance cannot change the defaults');
  ok(!(await req(mkt, 'sellerAccess:defaults:get')).ok, 'marketing cannot read them');
  ok(!(await req(A, 'sellerAccess:defaults:set', { returns: false })).ok, 'a seller cannot change them');
  ok(!(await req(A, 'sellers:setAfterSaleAccess', { sellerId: storeA, returns: true })).ok, 'a seller cannot override their own store');
  ok(!(await req(C, 'sellers:setAfterSaleAccess', { sellerId: storeA, returns: true })).ok, 'a customer cannot');
  ok(both(arr(await req(fin, 'caseThread:list', { kind: 'return', caseId: ret.id }))), 'finance reads the thread');
  ok(!(await req(fin, 'caseThread:send', { kind: 'return', caseId: ret.id, text: 'hi' })).ok, 'finance cannot write in it');
  ok(!(await req(mkt, 'caseThread:list', { kind: 'return', caseId: ret.id })).ok, 'marketing cannot read it');
  ok((await req(ops, 'sellerAccess:defaults:get')).ok, 'operations reads the defaults');
  ok(!(await req(sup, 'sellerAccess:defaults:set', { returns: 'yes' })).ok, 'a non-boolean default is refused');
  const bad = await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, returns: 'maybe' });
  ok(!bad.ok && /Follow default, On or Off/.test(bad.error), 'a bad override is refused with the sentence', JSON.stringify(bad));
  ok(!(await req(sup, 'sellers:setAfterSaleAccess', { sellerId: 'nope', returns: true })).ok, 'an unknown store is refused');

  section('Per-store override: Off hides it again, live; Follow default brings it back');
  const gone = nextEvent(A, 'seller:updated', (p) => p?.id === storeA && p?.afterSaleAccess?.returns === false);
  const off = await req(ops, 'sellers:setAfterSaleAccess', { sellerId: storeA, returns: false });
  ok(off.ok && off.data.afterSaleAccessOverride?.returns === false && off.data.afterSaleAccessDefaults?.returns === true, 'operations sets store A to Off', JSON.stringify(off).slice(0, 200));
  ok(!!(await gone), 'the portal hears it live');
  ok(!arr(await req(A, 'returns:list', {})).some((x) => x.sellerView), 'the Returns list is empty again');
  ok(!(await req(A, 'caseThread:list', { kind: 'return', caseId: ret.id })).ok, 'and so is the thread ("This section is turned off for your store.")');
  const offMsg = await req(A, 'caseThread:send', { kind: 'return', caseId: ret.id, text: 'still there?' });
  ok(!offMsg.ok && /turned off for your store/.test(offMsg.error), 'writing is refused with that sentence', JSON.stringify(offMsg));
  ok(arr(await req(B, 'returns:list', {})).length >= 0 && (await mine(B)).afterSaleAccess.returns === true, 'store B still follows the default (On)');
  const back2 = nextEvent(A, 'seller:updated', (p) => p?.id === storeA && p?.afterSaleAccess?.returns === true);
  await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, returns: null });
  ok(!!(await back2), 'Follow default brings it back live');
  ok(arr(await req(A, 'returns:list', {})).some((x) => x.id === ret.id && x.sellerView), 'and the return is there again');
  const staffView = data(await req(sup, 'sellers:get', { id: storeA }));
  ok(staffView?.afterSaleAccessDefaults?.returns === true && staffView.afterSaleAccessOverride && Object.keys(staffView.afterSaleAccessOverride).length === 0, 'staff store view carries the raw override and the defaults', JSON.stringify(staffView?.afterSaleAccessOverride));

  section('Exchanges, Replacements and the Express card');
  await req(sup, 'sellerAccess:defaults:set', { exchanges: true, replacements: true, express: true });
  await sleep(400);
  const m2 = await mine(A);
  ok(m2.afterSaleAccess.exchanges && m2.afterSaleAccess.replacements && m2.afterSaleAccess.express, 'sellers:mine shows all four on');
  ok(typeof m2.expressDelivery === 'boolean', 'the store still carries expressDelivery for the read-only card');
  const exl = arr(await req(A, 'exchanges:list', {}));
  const rel = arr(await req(A, 'replacements:list', {}));
  ok(exl.filter((x) => x.sellerView).every((x) => !('customerId' in x) && !('customerName' in x)), `exchanges are redacted (${exl.filter((x) => x.sellerView).length} on the store)`);
  ok(rel.filter((x) => x.sellerView).every((x) => !('customerId' in x) && !('customerName' in x)), `replacements are redacted (${rel.filter((x) => x.sellerView).length} on the store)`);
  const exCase = exl.find((x) => x.sellerView);
  if (exCase) {
    ok(!!data(await req(A, 'exchanges:get', { id: exCase.id }))?.sellerView, 'exchanges:get gives the redacted case');
    ok((await req(A, 'caseThread:list', { kind: 'exchange', caseId: exCase.id })).ok, 'the exchange has its own seller thread');
  }
  for (const [ev, body] of [['exchanges:respond', { id: 'x', approve: true }], ['replacements:respond', { id: 'x', approve: true }], ['sellers:setExpress', { sellerId: storeA, enabled: true }], ['exchanges:setStatus', { id: 'x', status: 'approved' }]]) {
    ok(!(await req(A, ev, body)).ok, `the seller cannot ${ev}`);
  }
  const expressOnly = nextEvent(A, 'seller:updated', (p) => p?.id === storeA && p?.afterSaleAccess?.express === false);
  await req(ops, 'sellers:setAfterSaleAccess', { sellerId: storeA, express: false });
  ok(!!(await expressOnly), 'the Express card can be hidden for one store, live');

  section('Visibility switches: the customer\'s reason (reasons) and the customer <-> support conversation (customerThread)');
  const defs = data(await req(sup, 'sellerAccess:defaults:get')) ?? {};
  ok(KEYS.every((k) => k in defs), 'the defaults carry all six keys', JSON.stringify(defs));
  await req(sup, 'sellerAccess:defaults:set', { returns: true, exchanges: true, replacements: true });
  await sleep(300);
  const mv = data(await req(A, 'sellers:mine')) ?? {};
  ok(mv.afterSaleAccess?.customerThread === false && mv.afterSaleAccess?.reasons === false, 'sellers:mine carries customerThread and reasons (both off)', JSON.stringify(mv.afterSaleAccess));
  const stripped = await sc(A, 'returns:list');
  ok(stripped.length >= 1 && stripped.every((c) => c.reasonHidden === true && c.reason === null && (c.attachments ?? []).length === 0 && !('reasonI18n' in c) && c.decisionNote === null && !('decisionNoteI18n' in c)), 'reasons OFF: the reason, photos and decision note are removed from every returns:list case');
  ok(stripped.every((c) => c.customerFirstName && c.orderReference && Array.isArray(c.items) && c.items.length > 0 && Array.isArray(c.timeline)), 'everything else in the view is unchanged (first name, order, items, timeline)');
  const strippedOne = data(await req(A, 'disputes:get', { id: ret.id }));
  ok(strippedOne?.reasonHidden === true && strippedOne.reason === null && !JSON.stringify(strippedOne).includes(String(ret.reason).slice(0, 25)), 'reasons OFF: disputes:get has no reason text anywhere in the payload');
  ok(!JSON.stringify(await sc(A, 'exchanges:list')).match(/"reason":"[^n]/) && (await sc(A, 'exchanges:list')).every((c) => c.reasonHidden === true), 'reasons OFF: exchanges are stripped too');
  ok(!JSON.stringify(await sc(A, 'replacements:list')).match(/"reason":"[^n]/) && (await sc(A, 'replacements:list')).every((c) => c.reasonHidden === true), 'reasons OFF: replacements are stripped too');
  const noConv = await req(A, 'caseThread:customer', { kind: 'return', caseId: ret.id });
  ok(noConv.ok === false && /not shared/i.test(noConv.error ?? ''), 'customerThread OFF: the conversation is refused', JSON.stringify(noConv).slice(0, 120));
  ok((await req(B, 'caseThread:customer', { kind: 'return', caseId: ret.id })).ok === false, 'another store cannot read it either');

  // admin turns "reasons" on for store A only: live, and the same payloads now carry the words
  const liveR = nextEvent(A, 'seller:updated', (p) => p?.id === storeA && p?.afterSaleAccess?.reasons === true);
  const setR = await req(ops, 'sellers:setAfterSaleAccess', { sellerId: storeA, reasons: true });
  ok(setR.ok && setR.data.afterSaleAccessOverride?.reasons === true && setR.data.afterSaleAccessDefaults?.reasons === false, 'operations turns reasons ON for store A (override + defaults in the staff view)', JSON.stringify(setR).slice(0, 160));
  ok(!!(await liveR), 'the seller portal hears it live');
  const shown = await sc(A, 'returns:list');
  ok(shown.length >= 1 && shown.every((c) => c.reasonHidden === false) && shown.some((c) => !!c.reason && c.reasonI18n?.en && c.reasonI18n?.fr), 'reasons ON: the reason (both languages) is back');
  ok((await sc(B, 'returns:list')).length === 0 || (await sc(B, 'returns:list')).every((c) => c.reasonHidden === true), 'store B is unaffected by store A\'s override');

  // customerThread for store A: read-only, first names, live
  const liveT = nextEvent(A, 'seller:updated', (p) => p?.id === storeA && p?.afterSaleAccess?.customerThread === true);
  await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, customerThread: true });
  ok(!!(await liveT), 'customerThread ON for store A, live');
  const rc = desk.find((d) => d.status === 'open') ?? ret;
  // support writes to the customer; the store hears it read-only
  const supportText = `Support to the customer ${Date.now()}`;
  const pushedSupport = nextEvent(A, 'caseThread:customerMessage', (p) => p?.caseId === rc.id && p.text === supportText);
  const sent = await req(sup, 'disputes:reply', { id: rc.id, message: supportText });
  ok(sent.ok, 'support writes in the customer conversation', JSON.stringify(sent).slice(0, 100));
  const heardLive = await pushedSupport;
  ok(!!heardLive && heardLive.side === 'support' && heardLive.authorName === 'KOMORIKO' && Array.isArray(heardLive.attachments), 'the store hears it live, read-only (caseThread:customerMessage)');
  const conv2 = data(await req(A, 'caseThread:customer', { kind: 'return', caseId: rc.id })) ?? [];
  ok(conv2.some((m) => m.text === supportText && m.side === 'support') && conv2.every((m) => m.authorName === 'KOMORIKO' || !/\s/.test(m.authorName)), 'the store reads the conversation: support as KOMORIKO, the customer by first name');
  const deskTexts = (data(await req(sup, 'disputes:get', { id: rc.id })) ?? {}).messages?.filter((m) => m.role !== 'seller').map((m) => m.text) ?? [];
  ok(deskTexts.length === conv2.length && deskTexts.every((t) => conv2.some((m) => m.text === t)), 'it is exactly the customer <-> support conversation of the desk', JSON.stringify([deskTexts.length, conv2.length]));
  ok(conv2.every((m) => !supList.some((t) => t.text === m.text)), 'and none of the private seller <-> support thread');
  ok((await req(A, 'disputes:reply', { id: rc.id, message: 'I am the seller' })).ok === false, 'the store still cannot write in it');
  ok((await req(A, 'caseThread:send', { kind: 'return', caseId: rc.id, text: 'private note to support' })).ok === true, 'its private thread with support is still its writable one');
  // a live case push never carries stripped words: reasons off again, then a case update
  await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, reasons: false });
  const caseLive = nextEvent(A, 'dispute:updated', (p) => p?.id === rc.id && p.sellerView === true);
  await req(sup, 'disputes:reply', { id: rc.id, message: `Another line ${Date.now()}` });
  const lp = await caseLive;
  ok(!!lp && lp.reasonHidden === true && lp.reason === null && (lp.attachments ?? []).length === 0, 'a live dispute:updated push carries no reason when reasons are off');
  // roles and values
  ok((await req(fin, 'sellers:setAfterSaleAccess', { sellerId: storeA, reasons: true })).ok === false, 'finance cannot change the new switches');
  const badV = await req(sup, 'sellerAccess:defaults:set', { reasons: 'yes' });
  ok(!badV.ok && /Choose On or Off/.test(badV.error ?? ''), 'a non-boolean default for the new keys is refused');
  const sv = data(await req(sup, 'sellers:get', { id: storeA })) ?? {};
  ok(sv.afterSaleAccessOverride?.customerThread === true && sv.afterSaleAccessOverride?.reasons === false && sv.afterSaleAccessDefaults && 'customerThread' in sv.afterSaleAccessDefaults, 'the staff store view carries the raw override and the defaults for both keys');
  await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, ...allNull });

  section('Restore');
  const reset = await req(sup, 'sellerAccess:defaults:set', allOff);
  ok(reset.ok && KEYS.every((k) => reset.data[k] === false), 'all six defaults are off again');
  await req(sup, 'sellers:setAfterSaleAccess', { sellerId: storeA, ...allNull, ...origOverride });
  const restored = (data(await req(sup, 'sellers:get', { id: storeA })) ?? {}).afterSaleAccessOverride ?? {};
  ok(JSON.stringify(restored) === JSON.stringify(origOverride), 'store A\'s own override is back as it was', JSON.stringify([restored, origOverride]));

  for (const s of Object.values(S)) s.sock.close();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => `  ❌ ${f}`).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
