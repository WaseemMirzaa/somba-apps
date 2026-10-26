/* Warehouses by area (docs/WAREHOUSE-AREAS-USE-CASE.md, docs/contracts/areas.md), end to end on a seeded API:
 *   the geography (tree, search, resolve in French and English, communes in one call, served / partly served), coverage
 *   (one owner per area, move, gaps), area routing and the fee, and use cases
 *     UC-1  one warehouse for all of Kinshasa (temporarily unassign Limete's districts)
 *     UC-2  a second warehouse (seller in Gombe -> customer in Masina: pickup, transfer Kinshasa -> Limete, delivery)
 *     UC-3  a basket from two warehouses
 *     UC-4  a return    UC-5  a replacement
 *     UC-6  another city (Lubumbashi warehouse; local order, then Kinshasa -> Lubumbashi, +days; switch off)
 *     UC-7  moving a commune (orders in progress keep their legs)
 *     UC-8  a warehouse without riders, a paused one
 *     UC-9  an address / a store outside every served area
 *     UC-10 lanes and multi-hop transfers (Limete -> Kinshasa -> Kikwit), different driver per hop, re-planning, returns
 *     UC-11 transfer runs (propose, create, split, assign, dispatch, in transit, receive part, close with a missing parcel)
 * Runs against a RUNNING API seeded with `npm run seed` (Entrepôt Kinshasa covers the province, Entrepôt Limete the
 * districts Mont-Amba and Tshangu). It restores what it changes and deactivates the warehouses it creates.
 *
 *   API_URL=http://localhost:3021 node test/warehouse-areas-smoke.cjs
 */
const { io } = require('socket.io-client');
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
const rest = async (path, body) => {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: token ? { token } : {}, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const login = async (email, pw = PW) => {
  for (let i = 0; i < 4; i++) {
    const r = await rest('/api/v1/auth/login', { email, password: pw });
    if (r.status === 200) return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
    if (r.status !== 429) throw new Error(`login ${email}: ${r.status}`);
    await sleep(15000);
  }
  throw new Error(`login ${email}: rate limited`);
};
const record = (sock, ev) => { const seen = []; sock.on(ev, (p) => seen.push(p)); return seen; };
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};
const day = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);

// Component builders for Google Geocoding results (the same address in French and in English).
const c = (types, long_name, short_name = long_name) => ({ types, long_name, short_name });
const COUNTRY_EN = c(['country', 'political'], 'Democratic Republic of the Congo', 'CD');
const COUNTRY_FR = c(['country', 'political'], 'République démocratique du Congo', 'CD');

const GOMBE_PIN = { lat: -4.3031, lng: 15.3033 };
const MASINA_PIN = { lat: -4.37, lng: 15.395 };
const LIMETE_PIN = { lat: -4.3543, lng: 15.3467 };
const KALAMU_PIN = { lat: -4.3496, lng: 15.3179 };
const MATETE_PIN = { lat: -4.389, lng: 15.3513 };
const LUBUMBASHI_PIN = { lat: -11.6609, lng: 27.4794 };
const KIKWIT_PIN = { lat: -5.0412, lng: 18.8162 };

(async () => {
  const guest = { sock: await connect(null) };
  const admin = await login('admin@somba.app');
  const cust = await login('customer@somba.app');
  const mgrK = await login('warehouse@somba.app'); // Entrepôt Kinshasa, manager
  const opK = await login('operator@somba.app'); // Entrepôt Kinshasa, operator
  const supL = await login('warehouse.limete@somba.app'); // Entrepôt Limete, supervisor
  const riderK = await login('rider@somba.app');
  let riderL = await login('rider.limete@somba.app'); // reassigned when the UC-8 deactivation check signs them in again
  const sellerK = await login('seller@somba.app'); // pickup in Gombe
  const sellerL = await login('seller2@somba.app'); // pickup in Limete

  const settings0 = (await req(admin.sock, 'settings:get')).data;
  const restoreSettings = async () => {
    for (const k of ['deliveryBaseUsd', 'deliveryPerKmUsd', 'deliveryMaxUsd', 'deliveryTransferUsd', 'allowInterCityDelivery', 'interCityTransferDays', 'requireDeliveryCode', 'requirePinnedAddress']) {
      if (settings0[k] !== undefined) await req(admin.sock, 'settings:set', { key: k, value: settings0[k] });
    }
  };
  const cleanup = [];

  try {
    // ---- the cast ---------------------------------------------------------------------------------
    const hubList = async () => (await req(admin.sock, 'hubs:list')).data ?? [];
    let hubs = await hubList();
    const K = hubs.find((h) => h.name === 'Entrepôt Kinshasa');
    const L = hubs.find((h) => h.name === 'Entrepôt Limete');
    ok(K && L && hubs.filter((h) => h.active).length === 2 && !hubs.some((h) => /Paris|Lubumbashi Hub/.test(h.name)), 'the dev seed has exactly two active warehouses: Entrepôt Kinshasa and Entrepôt Limete (no Paris, no Lubumbashi Hub)', JSON.stringify(hubs.map((h) => h.name)));
    const areaByCode = {};
    const A = async (code) => {
      if (!areaByCode[code]) areaByCode[code] = (await req(guest.sock, 'geo:tree', { rootCode: code, depth: 0 })).data;
      return areaByCode[code];
    };
    const products = (await req(cust.sock, 'products:list', {})).data ?? [];
    const prodK = products.filter((p) => (p.sellerName ?? '') === 'Kinshasa Traders').sort((x, y) => y.stock - x.stock)[0];
    const prodL = products.filter((p) => (p.sellerName ?? '') === 'Limete Wholesale').sort((x, y) => y.stock - x.stock)[0];
    ok(prodK?.stock > 60 && prodL?.stock > 12, 'two demo sellers have stock (Gombe and Limete)', JSON.stringify([prodK?.stock, prodL?.stock]));
    const line = (p, qty = 1) => ({ productId: p.id, qty });
    const myAddrs = (await req(cust.sock, 'addresses:list')).data ?? [];
    const addrGombe = myAddrs.find((a) => a.commune === 'Gombe');
    const addrMasina = myAddrs.find((a) => a.commune === 'Masina');
    ok(addrGombe?.isDefault && addrMasina && myAddrs.length === 2, 'the demo customer has two addresses: Gombe (default) and Masina', JSON.stringify(myAddrs.map((a) => a.commune)));

    const ship = (p, extra = {}) => JSON.stringify({ line1: '1 Test Street', city: p.city ?? 'Kinshasa', ...(p.commune ? { commune: p.commune } : {}), ...(p.areaId ? { areaId: p.areaId } : {}), ...(p.pin ? { geo: p.pin } : {}), ...extra });
    const quote = (p, lines, extra = {}) => req(cust.sock, 'delivery:quote', { ...(p.areaId ? { areaId: p.areaId } : {}), ...(p.pin ? { geo: p.pin } : {}), city: p.city ?? 'Kinshasa', ...(p.commune ? { commune: p.commune } : {}), lines, ...extra });
    const place = (lines, p, extra = {}) => req(cust.sock, 'orders:create', { items: lines, paymentMethod: 'stripe_card', shippingAddress: ship(p), ...extra });
    const queueOf = async (u, extra = {}) => (await req(u.sock, 'logistics:queue', { status: 'all', limit: 500, ...extra })).data;
    const tasksOf = async (orderId) => (await queueOf(admin)).tasks.filter((t) => t.orderId === orderId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const taskOf = async (orderId, kind, hop) => (await tasksOf(orderId)).find((t) => t.kind === kind && (hop === undefined || t.hop === hop) && t.status !== 'failed');
    /** Assign (admin), the rider collects, the receiving warehouse (or an admin) scans it in. Returns the scan reply. */
    const move = async (task, rider, scanner = admin) => {
      const a = await req(admin.sock, 'logistics:assign', { taskId: task.id, riderId: rider.user.id });
      if (!a.ok) return a;
      await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'picked_up' });
      return req(scanner.sock, 'logistics:scanIn', { taskId: task.id });
    };
    const deliver = async (task, rider) => {
      await req(admin.sock, 'logistics:assign', { taskId: task.id, riderId: rider.user.id });
      await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'picked_up' });
      await req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'in_transit' });
      return req(rider.sock, 'delivery:updateStatus', { taskId: task.id, status: 'delivered' });
    };
    const orderOf = async (id) => ((await req(admin.sock, 'orders:list', { limit: 500 })).data ?? []).find((o) => o.id === id);
    const noteTitles = async (u) => ((await req(u.sock, 'notifications:list')).data ?? []).map((n) => n.title);

    await req(admin.sock, 'settings:set', { key: 'deliveryBaseUsd', value: 2 });
    await req(admin.sock, 'settings:set', { key: 'deliveryPerKmUsd', value: 0.5 });
    await req(admin.sock, 'settings:set', { key: 'deliveryMaxUsd', value: 15 });
    await req(admin.sock, 'settings:set', { key: 'deliveryTransferUsd', value: 1.5 });
    await req(admin.sock, 'settings:set', { key: 'allowInterCityDelivery', value: 'true' });
    await req(admin.sock, 'settings:set', { key: 'interCityTransferDays', value: 3 });
    await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'false' });

    // ================================================================================================
    section('Geography: anybody reads the tree; names in French and English; served and partly served');
    let a = await req(guest.sock, 'geo:children', {});
    ok(a.ok && a.data.length === 26, 'a guest lists the 26 provinces', a.error ?? String(a.data?.length));
    ok(a.data[0].code === 'CD-KN' && a.data[0].served === true && a.data[0].hubName === 'Entrepôt Kinshasa' && a.data[0].partiallyServed === false, 'served areas come first: Kinshasa, served by Entrepôt Kinshasa');
    ok(a.data.slice(1).every((p) => p.served === false && p.hubId === null), 'every other province is "coming soon"');
    const nk = a.data.find((p) => p.code === 'CD-NK');
    ok(nk.name === 'Nord-Kivu' && nk.nameEn === 'North Kivu' && nk.googleName === 'Nord-Kivu' && nk.googleNameEn === 'North-Kivu', 'both names and both Google spellings are served (Nord-Kivu / North Kivu / North-Kivu)', JSON.stringify([nk.name, nk.nameEn, nk.googleName, nk.googleNameEn]));
    const tree = (await req(guest.sock, 'geo:tree', { rootCode: 'CD-KN', depth: 2 })).data;
    ok(tree?.code === 'CD-KN' && tree.children[0]?.code === 'CD-KN-KIN' && tree.children[0].children.length === 4 && tree.children[0].children[0].children.length === 0, 'geo:tree gives the province, its city and the 4 districts to the asked depth');
    const flat = (await req(guest.sock, 'geo:children', { parentCode: 'CD-KN-KIN', flatten: 'commune' })).data ?? [];
    ok(flat.length === 24 && flat.every((x) => x.district?.level === 'district'), 'flatten: "commune" returns Kinshasa\'s 24 communes in one call, each with its district', String(flat.length));
    ok(flat.find((x) => x.code === 'CD-KN-LMT')?.district.code === 'CD-KN-D-MAM' && flat.find((x) => x.code === 'CD-KN-LMT')?.hubName === 'Entrepôt Limete', 'Limete is in Mont-Amba and served by Entrepôt Limete');
    ok(((await req(guest.sock, 'geo:communes', { cityCode: 'CD-KN-KIN' })).data ?? []).length === 24, 'geo:communes is the same in one event');
    const blocks = (rows) => rows.map((x) => x.district?.code).filter((d, i, all) => i === 0 || d !== all[i - 1]).join();
    ok(blocks(flat) === 'CD-KN-D-FUN,CD-KN-D-LUK,CD-KN-D-MAM,CD-KN-D-TSH', 'flatten: the communes come district by district (Funa, Lukunga, Mont-Amba, Tshangu), each district one block', blocks(flat));
    // a mixed picture: only Gombe is Entrepôt Kinshasa's and Mont-Amba / Tshangu are Entrepôt Limete's, the rest of the province is not covered. Served communes must
    // not jump out of their district to the top of the list.
    await req(admin.sock, 'hubs:unassign', { hubId: K.id, areaIds: [(await A('CD-KN')).id] });
    await req(admin.sock, 'hubs:assign', { hubId: K.id, areaIds: [(await A('CD-KN-GOM')).id] });
    try {
      for (const mixed of [(await req(guest.sock, 'geo:children', { parentCode: 'CD-KN-KIN', flatten: 'commune' })).data ?? [], (await req(guest.sock, 'geo:communes', { cityCode: 'CD-KN-KIN' })).data ?? []]) {
        const luk = mixed.filter((x) => x.district?.code === 'CD-KN-D-LUK');
        const fun = mixed.filter((x) => x.district?.code === 'CD-KN-D-FUN');
        ok(mixed.length === 24 && blocks(mixed) === 'CD-KN-D-FUN,CD-KN-D-LUK,CD-KN-D-MAM,CD-KN-D-TSH', 'with coverage mixed up the districts still do not interleave', blocks(mixed));
        ok(luk[0]?.code === 'CD-KN-GOM' && luk[0].served === true && luk.slice(1).every((x) => x.served === false) && luk.slice(1).map((x) => x.name).join() === luk.slice(1).map((x) => x.name).sort((x, y) => x.localeCompare(y, 'fr')).join(), 'inside a district: served first (Gombe), then by name');
        ok(fun.length === 7 && fun.every((x) => x.served === false) && fun.map((x) => x.name).join() === fun.map((x) => x.name).sort((x, y) => x.localeCompare(y, 'fr')).join(), 'a district with nothing served is sorted by name');
      }
    } finally {
      await req(admin.sock, 'hubs:unassign', { hubId: K.id, areaIds: [(await A('CD-KN-GOM')).id] });
      const back = await req(admin.sock, 'hubs:assign', { hubId: K.id, areaIds: [(await A('CD-KN')).id] });
      ok(back.ok && back.data.assigned.length === 1, 'coverage restored: Entrepôt Kinshasa covers the province again', back.error ?? '');
    }
    const served = (await req(guest.sock, 'geo:servedCities')).data ?? [];
    ok(served.length === 1 && served[0].code === 'CD-KN-KIN', 'geo:servedCities: only Kinshasa at launch', JSON.stringify(served.map((s) => s.code)));
    const found = async (q, extra = {}) => ((await req(guest.sock, 'geo:search', { q, ...extra })).data ?? []).map((x) => x.code);
    ok((await found('north-kivu')).includes('CD-NK') && (await found('NORD KIVU')).includes('CD-NK') && (await found('Equator')).includes('CD-EQ') && (await found('équateur')).includes('CD-EQ'), 'search ignores accents, hyphens, case and finds either language');
    ok((await found('ndjili'))[0] === 'CD-KN-NDJ' && (await found('mont ngafula')).includes('CD-KN-MNG') && (await found('kinshasa', { level: 'commune' })).join() === 'CD-KN-KNS', 'search: Ndjili, Mont Ngafula, and a level filter');
    ok((await found('l', { servedOnly: true })).every((cd) => cd.startsWith('CD-KN')) && (await found('lubumbashi', { servedOnly: true })).length === 0, 'servedOnly keeps served areas only');

    const resolve = async (components) => (await req(guest.sock, 'geo:resolve', { components })).data;
    const addrOf = (commune, province, country) => [c(['sublocality_level_1', 'sublocality', 'political'], commune), c(['locality', 'political'], 'Kinshasa'), c(['administrative_area_level_1', 'political'], province), country];
    let r = await resolve(addrOf('Gombe', 'Kinshasa', COUNTRY_FR));
    ok(r.area?.code === 'CD-KN-GOM' && r.served === true && r.hubName === 'Entrepôt Kinshasa' && r.matchedBy === 'components' && r.chain.length === 5, 'geo:resolve from Google components (French): Gombe, served, with its chain', JSON.stringify(r.area?.code));
    r = await resolve(addrOf('Gombe', 'Kinshasa', COUNTRY_EN));
    ok(r.area?.code === 'CD-KN-GOM', 'the same address in English resolves to the same area');
    ok((await resolve(addrOf('Ndjili', 'Kinshasa', COUNTRY_EN))).area?.code === 'CD-KN-NDJ' && (await resolve(addrOf("N'djili", 'Kinshasa', COUNTRY_FR))).area?.code === 'CD-KN-NDJ', "Google's \"Ndjili\" and the official \"N'djili\" are one area");
    ok((await resolve(addrOf('Mont Ngafula', 'Kinshasa', COUNTRY_EN))).area?.code === 'CD-KN-MNG' && (await resolve(addrOf('Mont-Ngafula', 'Kinshasa', COUNTRY_FR))).area?.code === 'CD-KN-MNG', '"Mont Ngafula" (Google) and "Mont-Ngafula" are one area');
    const goma = (province, country) => [c(['locality'], 'Goma'), c(['administrative_area_level_1'], province), country];
    ok([(await resolve(goma('Nord-Kivu', COUNTRY_FR))).area?.code, (await resolve(goma('North-Kivu', COUNTRY_EN))).area?.code, (await resolve(goma('North Kivu', COUNTRY_EN))).area?.code].every((x) => x === 'CD-NK-GOM'), 'Goma resolves from Nord-Kivu / North-Kivu / North Kivu alike');
    ok((await resolve(goma('Nord-Kivu', COUNTRY_FR))).served === false, 'and Goma is not served yet');
    ok((await resolve([c(['sublocality_level_1'], 'Gombe'), c(['locality'], 'Brazzaville'), c(['country'], 'Republic of the Congo', 'CG')])).area === null, 'a result in Brazzaville is not matched to Kinshasa');
    r = (await req(guest.sock, 'geo:resolve', { text: { commune: 'Limete', city: 'Kinshasa' } })).data;
    ok(r.area?.code === 'CD-KN-LMT' && r.matchedBy === 'text' && r.hubName === 'Entrepôt Limete', 'geo:resolve from text: Limete is served by Entrepôt Limete');
    r = (await req(guest.sock, 'geo:resolve', { pin: MASINA_PIN })).data;
    ok(r.area?.code === 'CD-KN-MSN' && r.matchedBy === 'pin', 'geo:resolve from a pin: the nearest commune (Masina)');
    ok((await req(guest.sock, 'geo:resolve', { pin: { lat: 48.85, lng: 2.35 } })).data.area === null, 'a pin in Paris matches nothing');

    section('Geography: only admins write; communes and quartiers can be added; both names are editable');
    ok(!(await req(guest.sock, 'geo:create', { parentId: (await A('CD-KN-GOM')).id, level: 'quartier', name: 'Nope' })).ok, 'a guest cannot add an area');
    ok(!(await req(cust.sock, 'geo:update', { id: (await A('CD-KN-GOM')).id, name: 'Nope' })).ok, 'a customer cannot edit one');
    const seen = record(cust.sock, 'geo:updated');
    a = await req(admin.sock, 'geo:create', { parentId: (await A('CD-KN-GOM')).id, level: 'quartier', name: `Quartier Smoke ${tag}`, nameEn: `Smoke Quarter ${tag}`, aliases: [`QS${tag}`], lat: -4.31, lng: 15.31 });
    ok(a.ok && a.data.level === 'quartier' && a.data.depth === 5 && a.data.served === true && a.data.hubName === 'Entrepôt Kinshasa', 'an admin adds a quartier under Gombe: depth 5, already served through the province', a.error ?? '');
    const quartier = a.data;
    ok(!!(await until(async () => seen.find((x) => x.id === quartier.id))), 'geo:updated is pushed to every client');
    a = await req(admin.sock, 'geo:update', { id: quartier.id, name: `Quartier Renamed ${tag}`, googleNameEn: `Renamed Quarter ${tag}` });
    ok(a.ok && a.data.name === `Quartier Renamed ${tag}` && a.data.googleNameEn === `Renamed Quarter ${tag}`, 'both the French and the English spellings can be edited');
    ok((await req(guest.sock, 'geo:resolve', { components: [c(['neighborhood'], `Renamed Quarter ${tag}`), c(['sublocality'], 'Gombe'), c(['locality'], 'Kinshasa'), COUNTRY_EN] })).data?.area?.id === quartier.id, 'a Google result with that neighborhood resolves to the new quartier');
    ok(!(await req(admin.sock, 'geo:create', { parentId: (await A('CD-KN-GOM')).id, level: 'province', name: 'Bad' })).ok && !(await req(admin.sock, 'geo:create', { parentId: (await A('CD-KN-GOM')).id, level: 'quartier', name: `quartier renamed ${tag}` })).ok, 'a wrong level or a duplicate name is refused');
    a = await req(admin.sock, 'geo:setActive', { id: quartier.id, active: false });
    ok(a.ok && a.data.active === false, 'geo:setActive hides it');
    ok(!((await req(guest.sock, 'geo:children', { parentId: (await A('CD-KN-GOM')).id })).data ?? []).some((x) => x.id === quartier.id) && ((await req(admin.sock, 'geo:children', { parentId: (await A('CD-KN-GOM')).id })).data ?? []).some((x) => x.id === quartier.id), 'hidden from pickers, still visible to admins');
    a = await req(admin.sock, 'geo:stats', { areaId: (await A('CD-KN')).id });
    ok(a.ok && a.data.customers >= 1 && a.data.sellers === 2 && a.data.orders >= 5, 'geo:stats counts customers, sellers and orders in a subtree', JSON.stringify(a.data));
    ok(!(await req(cust.sock, 'geo:stats', { areaId: (await A('CD-KN')).id })).ok, 'only admins read the numbers');

    // ================================================================================================
    section('Warehouses and coverage: the directory, who may read a coverage, the map, no gaps');
    hubs = await hubList();
    const hK = hubs.find((h) => h.id === K.id);
    const hL = hubs.find((h) => h.id === L.id);
    ok(hK.area?.code === 'CD-KN-GOM' && hL.area?.code === 'CD-KN-LMT', 'a warehouse sits in an area (Gombe, Limete)', JSON.stringify([hK.area?.code, hL.area?.code]));
    ok(hK.coverage.map((x) => x.code).join() === 'CD-KN' && hL.coverage.map((x) => x.code).sort().join() === 'CD-KN-D-MAM,CD-KN-D-TSH', 'hubs:list carries the covered areas (province / two districts)');
    ok(hK.riders >= 1 && hK.staff >= 2 && hL.riders >= 1 && hL.staff >= 1 && hK.activeRiders === hK.riders, 'and the rider and staff counts');
    a = await req(admin.sock, 'hubs:coverage', { hubId: L.id });
    ok(a.ok && a.data.hubId === L.id && a.data.areas.length === 2 && 'feeOverrideUsd' in a.data.areas[0], 'hubs:coverage: an admin reads any warehouse', a.error ?? '');
    ok((await req(supL.sock, 'hubs:coverage', { hubId: L.id })).ok === false, 'a supervisor (not a manager) cannot', '');
    ok((await req(mgrK.sock, 'hubs:coverage', { hubId: K.id })).ok && !(await req(mgrK.sock, 'hubs:coverage', { hubId: L.id })).ok, 'a manager reads their own warehouse only');
    a = await req(riderL.sock, 'hubs:coverage', { hubId: L.id });
    ok(a.ok && a.data.areas.length === 2, 'a rider reads their own warehouse coverage', a.error ?? '');
    ok(!(await req(riderL.sock, 'hubs:coverage', { hubId: K.id })).ok && !(await req(cust.sock, 'hubs:coverage', { hubId: L.id })).ok && !(await req(guest.sock, 'hubs:coverage', { hubId: L.id })).ok, "but not another warehouse's, and a customer or guest cannot");
    a = await req(riderL.sock, 'rider:assignment');
    ok(a.ok && a.data.hub?.id === L.id && a.data.hub.coverage.length === 2 && a.data.hub.coverage.every((x) => x.hubName === 'Entrepôt Limete'), 'rider:assignment.hub carries the coverage', a.error ?? JSON.stringify(a.data));
    const map = (await req(admin.sock, 'coverage:map', { rootId: (await A('CD-KN-KIN')).id })).data ?? [];
    const byArea = new Map(map.map((m) => [m.areaId, m]));
    ok(byArea.get((await A('CD-KN-LMT')).id)?.hubId === L.id && byArea.get((await A('CD-KN-LMT')).id)?.direct === false && byArea.get((await A('CD-KN-D-MAM')).id)?.direct === true && byArea.get((await A('CD-KN-GOM')).id)?.hubId === K.id, 'coverage:map: Limete -> Entrepôt Limete (inherited from Mont-Amba), Gombe -> Entrepôt Kinshasa');
    ok(((await req(opK.sock, 'coverage:map', {})).data ?? []).length > 24 && !(await req(cust.sock, 'coverage:map', {})).ok, 'staff read the map; customers cannot');
    ok(((await req(admin.sock, 'coverage:gaps', { rootId: (await A('CD-KN')).id })).data ?? []).length === 0, 'no gaps: every commune of Kinshasa has an owner');
    ok(!(await req(opK.sock, 'coverage:gaps', { rootId: (await A('CD-KN')).id })).ok, 'only admins read the gaps');

    // ================================================================================================
    section('Area routing and the fee: Gombe -> Entrepôt Kinshasa, Limete / Masina -> Entrepôt Limete, most specific wins');
    const GOMBE = { commune: 'Gombe', pin: GOMBE_PIN };
    const MASINA = { commune: 'Masina', pin: MASINA_PIN };
    const LIMETE = { commune: 'Limete', pin: LIMETE_PIN };
    const KALAMU = { commune: 'Kalamu', pin: KALAMU_PIN };
    const FAR = { commune: 'Gombe', pin: { lat: -4.2, lng: 15.9 } };
    let q = (await quote(GOMBE, [line(prodK)])).data;
    const feeGombe = r2(2 + 0.5 * km({ lat: -4.3105, lng: 15.3136 }, GOMBE_PIN));
    ok(q?.served === true && q.destinationHubId === K.id && q.destinationHubName === 'Entrepôt Kinshasa' && q.transfer === false && q.fallback === null && q.pinned === true, 'a Gombe seller to a Gombe customer: Entrepôt Kinshasa, no transfer', JSON.stringify(q));
    ok(q.feeUsd === feeGombe && q.transferUsd === 0 && q.interCity === false && q.extraDays === 0 && q.transitHours === 0, `the fee is base + km from the destination warehouse (${feeGombe})`, String(q.feeUsd));
    ok(q.destinationArea.code === 'CD-KN-GOM' && q.destinationAreaChain.map((x) => x.level).join() === 'country,province,city,district,commune', 'the quote names the delivery area and its chain');
    ok(q.origins.length === 1 && q.origins[0].hubName === 'Entrepôt Kinshasa' && q.origins[0].areaName === 'Gombe' && q.origins[0].hops.length === 0, 'origins: the Gombe store, collected at Entrepôt Kinshasa');
    q = (await quote(KALAMU, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id && q.transfer === false, 'UC-2a: a customer in Kalamu (Funa) is also Entrepôt Kinshasa\'s: no transfer');
    q = (await quote(MASINA, [line(prodK)])).data;
    const feeMasina = r2(2 + 0.5 * km({ lat: -4.354, lng: 15.347 }, MASINA_PIN) + 1.5);
    ok(q?.destinationHubId === L.id && q.destinationHubName === 'Entrepôt Limete' && q.transfer === true && q.originHubIds.join() === K.id, 'UC-2b: Gombe seller -> Masina customer: delivered by Entrepôt Limete, collected by Entrepôt Kinshasa, transfer', JSON.stringify(q));
    ok(q.feeUsd === feeMasina && q.transferUsd === 1.5, `fee = base + km (Limete hub -> Masina pin) + the transfer fee (${feeMasina})`, String(q.feeUsd));
    ok(q.origins[0].hops.length === 1 && q.origins[0].hops[0].fromHubName === 'Entrepôt Kinshasa' && q.origins[0].hops[0].toHubName === 'Entrepôt Limete' && q.origins[0].hops[0].transitHours === 0 && q.origins[0].hops[0].costUsd === 1.5 && q.origins[0].hops[0].laneCost === false && q.defaultTransferUsd === 1.5, 'with no lanes the transfer is one direct hop (per-hop transit and the effective price: the default $1.50, laneCost false; defaultTransferUsd in the quote)', JSON.stringify([q.origins[0].hops, q.defaultTransferUsd]));
    q = (await quote(LIMETE, [line(prodL)])).data;
    ok(q?.destinationHubId === L.id && q.transfer === false && q.origins[0].hubName === 'Entrepôt Limete', 'UC-2c (reverse): Limete seller + Limete customer stay in Entrepôt Limete');
    q = (await quote(GOMBE, [line(prodL)])).data;
    ok(q?.destinationHubId === K.id && q.originHubIds.join() === L.id && q.transfer === true, 'UC-2c: Limete seller -> Gombe customer: collected by Entrepôt Limete, delivered by Entrepôt Kinshasa');
    q = (await req(cust.sock, 'delivery:quote', { addressId: addrMasina.id, lines: [line(prodK)] })).data;
    ok(q?.destinationHubId === L.id && q.destinationArea.code === 'CD-KN-MSN', 'a saved address is quoted by its stored area (addressId)');
    q = (await quote({ areaId: (await A('CD-KN-LMT')).id }, [line(prodL)], { city: undefined })).data;
    ok(q?.destinationHubId === L.id && q.pinned === false && q.deliveryUsd === 2, 'an address with only an areaId (no pin) routes by area; the distance part is 0');
    q = (await quote(FAR, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id && q.deliveryUsd === 15, 'a far pin inside Kinshasa: the distance part is capped at $15', JSON.stringify(q));

    // ================================================================================================
    section('UC-9 (customer): outside every served area the quote and the order are refused, in a way clients can render');
    a = await quote({ city: 'Lubumbashi', pin: LUBUMBASHI_PIN }, [line(prodK)]);
    ok(!a.ok && a.error === "We don't deliver to Lubumbashi yet.", 'quote: "We don\'t deliver to Lubumbashi yet."', a.error ?? JSON.stringify(a.data));
    ok(a.areaName === 'Lubumbashi' && a.areaNameEn === 'Lubumbashi' && a.code === 'not_served' && a.areaId === (await A('CD-HK-LUB')).id && Array.isArray(a.servedCities) && a.servedCities.length === 1 && a.servedCities[0].name === 'Kinshasa' && a.servedCities[0].nameEn === 'Kinshasa' && !!a.servedCities[0].id, 'the refusal also carries { areaId, areaName, areaNameEn, servedCities } so a client can show it in either language and list the cities we serve', JSON.stringify(a));
    a = await req(cust.sock, 'delivery:quote', { areaId: (await A('CD-NK')).id, lines: [line(prodK)] });
    ok(!a.ok && a.areaName === 'Nord-Kivu' && a.areaNameEn === 'North Kivu' && /Nord-Kivu/.test(a.error), 'a province is named in French on the wire and in English in the structured fields', JSON.stringify(a));
    a = await place([line(prodK)], { city: 'Lubumbashi', pin: LUBUMBASHI_PIN });
    ok(!a.ok && a.error === "We don't deliver to Lubumbashi yet." && a.areaNameEn === 'Lubumbashi' && a.servedCities?.length === 1, 'orders:create is refused the same way, with the same fields', JSON.stringify(a));
    a = await place([line(prodK)], { city: 'Paris', pin: { lat: 48.8738, lng: 2.295 } });
    ok(!a.ok && /We don't deliver to Paris yet\./.test(a.error ?? '') && a.areaId === null && a.areaName === 'Paris', 'a Paris address is refused; nothing could be matched, so only the typed name comes back', JSON.stringify(a));
    a = await req(cust.sock, 'delivery:quote', { lines: [line(prodK)] });
    ok(!a.ok && a.error === "We don't deliver to this area yet.", 'no address at all is refused too', a.error ?? '');
    const stockBefore = ((await req(cust.sock, 'products:get', { id: prodK.id })).data ?? {}).stock;
    await place([line(prodK)], { city: 'Paris' });
    ok(((await req(cust.sock, 'products:get', { id: prodK.id })).data ?? {}).stock === stockBefore, 'a refused order reserves no stock');

    section('Addresses: the server finds the area, writes Google\'s spellings, and tells the client whether we deliver there');
    const mk = async (body) => (await req(cust.sock, 'addresses:create', { label: `Smoke ${tag}`, line1: '9 Test Avenue', phone: '+243900000001', ...body }));
    a = await mk({ city: 'x', components: addrOf('Ndjili', 'Kinshasa', COUNTRY_EN) });
    ok(a.ok && a.data.commune === 'Ndjili' && a.data.city === 'Kinshasa' && a.data.region === 'Kinshasa' && a.data.country === 'République démocratique du Congo' && a.data.served === true && a.data.areaChain.at(-1).code === 'CD-KN-NDJ', 'Google components give the area; commune / city / region / country are rewritten', a.error ?? JSON.stringify(a.data));
    cleanup.push(a.data.id);
    a = await mk({ city: 'Kinshasa', commune: 'Masina', areaId: (await A('CD-KN-LMT')).id });
    ok(a.ok && a.data.commune === 'Limete' && a.data.areaId === (await A('CD-KN-LMT')).id, 'an explicit areaId wins over the typed text', a.error ?? '');
    cleanup.push(a.data.id);
    a = await mk({ city: 'Kinshasa', geo: { lat: MASINA_PIN.lat, lng: MASINA_PIN.lng } });
    ok(a.ok && a.data.areaChain.at(-1).code === 'CD-KN-MSN' && a.data.commune === 'Masina', 'with only a pin the nearest commune is used', a.error ?? '');
    cleanup.push(a.data.id);
    a = await mk({ city: 'Lubumbashi' });
    ok(a.ok && a.data.served === false && a.data.region === 'Haut-Katanga' && a.data.areaChain.at(-1).code === 'CD-HK-LUB', 'an address in Lubumbashi is kept, flagged served: false', a.error ?? '');
    cleanup.push(a.data.id);
    a = await mk({ city: 'Paris', country: 'France' });
    ok(a.ok && a.data.areaId === null && a.data.served === false && a.data.areaChain.length === 0, 'an address nobody can place has no area and is not served', a.error ?? '');
    cleanup.push(a.data.id);
    ok(!(await mk({ city: 'Kinshasa', areaId: 'nope' })).ok, 'an unknown areaId is refused ("Area not found.")');
    a = await req(cust.sock, 'addresses:update', { id: cleanup[0], patch: { commune: 'Kimbanseke', city: 'Kinshasa' } });
    ok(a.ok && a.data.areaChain.at(-1).code === 'CD-KN-KMB', 'editing the commune re-resolves the area', a.error ?? '');
    ok(((await req(cust.sock, 'addresses:list')).data ?? []).every((x) => 'areaChain' in x && 'served' in x), 'every listed address carries areaChain and served');
    for (const id of cleanup.splice(0)) await req(cust.sock, 'addresses:remove', { id });

    // ================================================================================================
    section('UC-1 launch: ONE warehouse covers all of Kinshasa (Limete\'s districts temporarily unassigned)');
    const coverageEvents = record(cust.sock, 'coverage:updated');
    const districtIds = [(await A('CD-KN-D-MAM')).id, (await A('CD-KN-D-TSH')).id];
    a = await req(admin.sock, 'hubs:unassign', { hubId: L.id, areaIds: districtIds });
    ok(a.ok && a.data.removed === 2, 'the districts are unassigned from Entrepôt Limete', a.error ?? '');
    ok(!!(await until(async () => coverageEvents.find((e) => e.hubId === L.id && e.areaIds.length === 2))), 'every client is told: coverage:updated { hubId, areaIds }');
    const sellerSeat = async (u) => (await req(u.sock, 'sellers:mine')).data;
    let mineL = await sellerSeat(sellerL);
    ok(mineL.originHubId === K.id && mineL.originHubName === 'Entrepôt Kinshasa' && mineL.pickupServed === true && mineL.pickupAreaChain.at(-1).code === 'CD-KN-LMT', 'the Limete store\'s origin warehouse is recomputed: Entrepôt Kinshasa now', JSON.stringify([mineL.originHubName, mineL.pickupServed]));
    q = (await quote(MASINA, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id && q.transfer === false && q.transferUsd === 0, 'a Masina customer is now Entrepôt Kinshasa\'s: origin = destination, no transfer, no transfer fee', JSON.stringify(q));
    a = await place([line(prodK)], MASINA);
    const uc1 = a.data;
    ok(a.ok && uc1.destinationHubId === K.id && uc1.originHubIds.join() === K.id, 'UC-1: Masina customer buys from the Gombe seller: one warehouse for both ends', a.error ?? '');
    let pick = await until(() => taskOf(uc1.id, 'pickup'));
    ok(pick && pick.toHubId === K.id, 'pickup leg: seller -> Entrepôt Kinshasa');
    a = await move(pick, riderK, opK);
    ok(a.ok && a.data.next.length === 1 && a.data.next[0].kind === 'delivery' && a.data.next[0].fromHubId === K.id, 'scan-in at Entrepôt Kinshasa creates the delivery leg directly (no transfer leg)', a.error ?? JSON.stringify(a.data?.next?.map((t) => t.kind)));
    ok(!(await tasksOf(uc1.id)).some((t) => t.kind === 'transfer'), 'there is no transfer leg anywhere on the order');
    a = await deliver(a.data.next[0], riderK);
    ok(a.ok, 'the rider delivers it', a.error ?? '');
    ok((await orderOf(uc1.id))?.status === 'delivered', 'the order is delivered');
    a = await req(admin.sock, 'hubs:assign', { hubId: L.id, areaIds: districtIds });
    ok(a.ok && a.data.assigned.length === 2 && a.data.conflicts.length === 0, 'the districts go back to Entrepôt Limete', a.error ?? '');
    mineL = await sellerSeat(sellerL);
    ok(mineL.originHubId === L.id, 'and the Limete store\'s origin follows');

    // ================================================================================================
    section('UC-2b: Gombe seller -> Masina customer: pickup by Kinshasa, transfer Kinshasa -> Limete, delivery by Limete');
    const evK = record(mgrK.sock, 'task:updated');
    a = await place([line(prodK)], { ...MASINA, areaId: (await A('CD-KN-MSN')).id });
    const uc2 = a.data;
    ok(a.ok && uc2.destinationHubId === L.id && uc2.originHubIds.join() === K.id && uc2.destinationAreaId === (await A('CD-KN-MSN')).id && uc2.deliveryFeeUsd === feeMasina, 'the order records its destination area and charges exactly the quote', a.error ?? JSON.stringify([uc2?.deliveryFeeUsd, feeMasina]));
    ok(uc2.hubs?.destination?.name === 'Entrepôt Limete' && Object.values(uc2.hubs?.bySeller ?? {})[0]?.name === 'Entrepôt Kinshasa', 'the customer\'s view names the warehouses');
    pick = await until(() => taskOf(uc2.id, 'pickup'));
    ok(pick && pick.hubId === K.id && !(await queueOf(supL)).tasks.some((t) => t.orderId === uc2.id), 'the pickup belongs to Entrepôt Kinshasa; Limete\'s staff do not see it yet');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: pick.id, riderId: riderK.user.id });
    ok(a.ok, 'Kinshasa assigns ITS rider to the pickup', a.error ?? '');
    await req(riderK.sock, 'delivery:updateStatus', { taskId: pick.id, status: 'picked_up' });
    a = await req(opK.sock, 'logistics:scanIn', { taskId: pick.id });
    const tr = a.data?.next?.[0];
    ok(a.ok && tr?.kind === 'transfer' && tr.fromHubId === K.id && tr.toHubId === L.id && tr.finalHubId === L.id && tr.hop === 1 && tr.hops === 1 && tr.hubId === K.id && tr.status === 'unassigned' && tr.riderId === null, 'Kinshasa scans the pickup in: a transfer Kinshasa -> Limete appears, unassigned', a.error ?? JSON.stringify(tr));
    ok(!!(await until(async () => (await queueOf(supL)).tasks.find((t) => t.id === tr.id))), 'Limete sees the inbound transfer');
    a = await req(supL.sock, 'logistics:assign', { taskId: tr.id, riderId: riderL.user.id });
    ok(!a.ok, 'Limete cannot assign Kinshasa\'s transfer (the sending warehouse assigns)', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: tr.id, riderId: riderL.user.id });
    ok(a.ok, 'Kinshasa may give the transfer to a Limete rider (either end\'s riders)', a.error ?? '');
    await req(riderL.sock, 'delivery:updateStatus', { taskId: tr.id, status: 'picked_up' });
    a = await req(supL.sock, 'logistics:scanIn', { taskId: tr.id });
    const dl = a.data?.next?.[0];
    ok(a.ok && dl?.kind === 'delivery' && dl.fromHubId === L.id && dl.hubId === L.id, 'Limete scans it in: the delivery leg appears at Limete', a.error ?? '');
    a = await req(supL.sock, 'logistics:assign', { taskId: dl.id, riderId: riderL.user.id });
    ok(a.ok, 'Limete assigns its own rider to the delivery');
    let mine = await orderOf(uc2.id);
    const tracking = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === uc2.id)?.tracking;
    ok(tracking?.legs?.map((l) => l.kind).join() === 'pickup,transfer,delivery', 'the customer\'s tracking has the three legs');
    const tl = tracking?.legs?.find((l) => l.kind === 'transfer');
    ok(tl?.fromHubName === 'Entrepôt Kinshasa' && tl.toHubName === 'Entrepôt Limete' && tl.fromHub?.name === 'Entrepôt Kinshasa' && tl.toHub?.name === 'Entrepôt Limete' && tl.hop === 1 && tl.hops === 1 && 'runId' in tl && 'runReference' in tl && tl.riderFirstName, 'the transfer leg carries hop, hops, runId, runReference, flat fromHubName / toHubName (and the objects) and the rider\'s first name', JSON.stringify(tl));
    a = await deliver(dl, riderL);
    ok(a.ok && (await orderOf(uc2.id)).status === 'delivered', 'the Limete rider delivers: Gombe seller -> Masina customer is complete');
    ok(evK.some((t) => t.id === tr.id), 'Kinshasa\'s staff were pushed the transfer');

    // ================================================================================================
    section('UC-3: one basket, two warehouses (Gombe seller + Limete seller -> customer in Gombe)');
    a = await place([line(prodK), line(prodL)], GOMBE);
    const uc3 = a.data;
    ok(a.ok && uc3.destinationHubId === K.id && uc3.originHubIds.length === 2 && uc3.originHubIds.includes(L.id), 'destination Entrepôt Kinshasa, two origins', a.error ?? '');
    const pK = await until(async () => (await tasksOf(uc3.id)).find((t) => t.kind === 'pickup' && t.toHubId === K.id));
    const pL = await until(async () => (await tasksOf(uc3.id)).find((t) => t.kind === 'pickup' && t.toHubId === L.id));
    ok(pK && pL && pK.hubId === K.id && pL.hubId === L.id, 'two pickups: Kinshasa\'s rider collects at the Gombe seller, Limete\'s at the Limete seller');
    a = await move(pK, riderK, opK);
    ok(a.ok && a.data.next.length === 0, 'the Gombe parcel is in; nothing else happens yet (the other parcel is not at a warehouse)');
    a = await move(pL, riderL, supL);
    const t3 = a.data?.next?.find((t) => t.kind === 'transfer');
    ok(a.ok && t3 && t3.fromHubId === L.id && t3.toHubId === K.id && a.data.next.length === 1, 'the Limete parcel in: ONE transfer Limete -> Kinshasa (only that package)', a.error ?? '');
    a = await move(t3, riderL, opK);
    ok(a.ok && a.data.next.length === 1 && a.data.next[0].kind === 'delivery' && a.data.next[0].fromHubId === K.id, 'once every package is at Entrepôt Kinshasa: ONE delivery leg', a.error ?? '');
    ok((await tasksOf(uc3.id)).filter((t) => t.kind === 'delivery').length === 1, 'exactly one delivery for the whole basket');
    await deliver(a.data.next[0], riderK);
    ok((await orderOf(uc3.id)).status === 'delivered', 'delivered');

    // ================================================================================================
    section('UC-4: a return (customer in Masina, seller in Gombe): collect at Limete, transfer back, rider takes it to the seller');
    a = await req(admin.sock, 'logistics:createReturnPickup', { disputeId: `ret-${tag}`, orderId: uc2.id });
    const ret = a.data;
    ok(a.ok && ret.kind === 'return_pickup' && ret.toHubId === L.id && ret.hubId === L.id, 'the return pickup is Entrepôt Limete\'s (the customer\'s warehouse)', a.error ?? '');
    a = await move(ret, riderL, supL);
    const rt = a.data?.next?.[0];
    ok(a.ok && rt?.kind === 'return_transfer' && rt.fromHubId === L.id && rt.toHubId === K.id && rt.finalHubId === K.id, 'Limete scans it in: a return transfer Limete -> Kinshasa (the seller\'s warehouse)', a.error ?? '');
    a = await move(rt, riderL, opK);
    const rs = a.data?.next?.[0];
    ok(a.ok && rs?.kind === 'return_to_seller' && rs.fromHubId === K.id, 'Kinshasa scans it in: a Kinshasa rider takes it back to the seller', a.error ?? '');
    a = await deliver(rs, riderK);
    ok(a.ok && (await orderOf(uc2.id)).status === 'delivered', 'delivered back to the seller; return legs never change the order status');

    // ================================================================================================
    section('UC-5: a replacement unit travels seller -> Kinshasa -> Limete -> customer, the old one is collected');
    const lineK = uc2.items[0];
    a = await req(cust.sock, 'replacements:create', { orderId: uc2.id, sku: lineK.productId, productName: lineK.productName, reason: 'Defective', qty: 1 });
    ok(a.ok, 'the customer files a replacement', a.error ?? '');
    const rep = a.data;
    a = await req(admin.sock, 'logistics:createReplacementDelivery', { replacementId: rep.id, orderId: uc2.id });
    ok(a.ok && a.data.kind === 'pickup' && a.data.toHubId === K.id && a.data.replacementId === rep.id, 'first leg: pickup at the Gombe seller, Entrepôt Kinshasa', a.error ?? '');
    a = await move(a.data, riderK, opK);
    const rtr = a.data?.next?.[0];
    ok(a.ok && rtr?.kind === 'transfer' && rtr.toHubId === L.id && rtr.replacementId === rep.id, 'then the transfer to Limete', a.error ?? '');
    a = await move(rtr, riderK, supL);
    const rdl = a.data?.next?.[0];
    ok(a.ok && rdl?.kind === 'replacement_delivery' && rdl.fromHubId === L.id && rdl.collectOld === true, 'then the replacement delivery from Limete (collecting the old unit)', a.error ?? '');
    a = await deliver(rdl, riderL);
    ok(a.ok && (await orderOf(uc2.id)).status === 'delivered', 'delivered; the order status is untouched');

    // ================================================================================================
    section('UC-7: moving a commune (Matete from Entrepôt Limete to Entrepôt Kinshasa); orders in progress keep their legs');
    const MATETE = { commune: 'Matete', pin: MATETE_PIN };
    a = await place([line(prodK)], MATETE);
    const uc7 = a.data;
    ok(a.ok && uc7.destinationHubId === L.id, 'before the move a Matete order goes to Entrepôt Limete', a.error ?? '');
    const matete = await A('CD-KN-MTT');
    a = await req(admin.sock, 'hubs:assign', { hubId: K.id, areaIds: [matete.id] });
    ok(a.ok && a.data.assigned.length === 1 && a.data.conflicts.length === 0, 'assigning Matete to Entrepôt Kinshasa is allowed: Matete itself has no owner (Mont-Amba owns it from above)', a.error ?? JSON.stringify(a.data));
    q = (await quote(MATETE, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id && q.transfer === false, 'the most specific assignment wins: Matete is now Entrepôt Kinshasa\'s');
    a = await req(admin.sock, 'hubs:assign', { hubId: L.id, areaIds: [matete.id] });
    ok(a.ok && a.data.assigned.length === 0 && a.data.conflicts.length === 1 && a.data.conflicts[0].hubId === K.id && a.data.conflicts[0].hubName === 'Entrepôt Kinshasa' && a.data.conflicts[0].area.code === 'CD-KN-MTT', 'an area has ONE owner: giving Matete to Limete is refused and listed in conflicts', JSON.stringify(a.data));
    a = await req(admin.sock, 'hubs:assign', { hubId: L.id, areaIds: [matete.id], move: true });
    ok(a.ok && a.data.assigned.length === 1 && a.data.conflicts.length === 0, 'with move: true it changes hands', a.error ?? '');
    ok((await quote(MATETE, [line(prodK)])).data?.destinationHubId === L.id, 'and orders route to Entrepôt Limete again');
    a = await req(admin.sock, 'hubs:assign', { hubId: K.id, areaIds: [matete.id], move: true });
    ok(a.ok && a.data.assigned.length === 1, 'moved to Entrepôt Kinshasa (the real move of UC-7)', a.error ?? '');
    q = (await quote(MATETE, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id, 'NEW orders route to Entrepôt Kinshasa');
    const uc7After = await orderOf(uc7.id);
    const uc7Legs = await tasksOf(uc7.id);
    ok(uc7After.destinationHubId === L.id && uc7Legs.length === 1 && uc7Legs[0].kind === 'pickup', 'the order already placed keeps its recorded destination (Entrepôt Limete): nothing is rerouted mid-journey', JSON.stringify([uc7After.destinationHubId]));
    a = await move(uc7Legs[0], riderK, opK);
    ok(a.ok && a.data.next[0]?.kind === 'transfer' && a.data.next[0].toHubId === L.id, 'its transfer still goes to Entrepôt Limete');
    a = await req(admin.sock, 'hubs:unassign', { hubId: K.id, areaIds: [matete.id] });
    ok(a.ok && a.data.removed === 1, 'Matete goes back to Mont-Amba\'s owner (unassigned from Kinshasa)');
    ok((await quote(MATETE, [line(prodK)])).data?.destinationHubId === L.id, 'restored');

    // ================================================================================================
    section('UC-8: a warehouse without riders, and a paused one');
    a = await req(admin.sock, 'hubs:create', { name: `Smoke Kalamu ${tag}`, areaId: (await A('CD-KN-KLM')).id, lat: -4.3496, lng: 15.3179, capacity: 20 });
    ok(a.ok && a.data.areaId === (await A('CD-KN-KLM')).id && a.data.city === 'Kinshasa', 'an admin creates a warehouse in Kalamu (no riders)', a.error ?? '');
    const KL = a.data;
    cleanup.push(KL.id);
    ok(!(await req(admin.sock, 'hubs:create', { name: `No Area ${tag}`, lat: 1, lng: 1 })).ok && (await req(admin.sock, 'hubs:create', { name: `No Area ${tag}`, lat: 1, lng: 1 })).error === 'Choose where this warehouse is.', 'hubs:create without an area: "Choose where this warehouse is."');
    a = await req(admin.sock, 'hubs:assign', { hubId: KL.id, areaIds: [(await A('CD-KN-KLM')).id], feeOverrideUsd: 4.5 });
    ok(a.ok && a.data.assigned.length === 1, 'it covers Kalamu, with a flat fee of $4.50', a.error ?? '');
    q = (await quote(KALAMU, [line(prodK)])).data;
    ok(q?.destinationHubId === L.id && q.fallback === 'city' && q.coveringHubId === KL.id && q.coveringHubName === KL.name, 'no active rider there: the nearest staffed warehouse of the city (Limete, 3 km away) takes over (fallback "city"), and the quote names the covering one', JSON.stringify(q && { d: q.destinationHubName, f: q.fallback, c: q.coveringHubName }));
    ok(q.feeOverrideUsd === 4.5 && q.deliveryUsd === 4.5 && q.transferUsd === 1.5, 'the flat fee of the Kalamu coverage replaces base + km (the transfer fee still applies)', JSON.stringify([q.deliveryUsd, q.feeOverrideUsd, q.transferUsd]));
    ok(q.origins[0].coveringHubId === null && q.origins[0].fallback === null, 'the Gombe seller\'s origin is unaffected');
    const adminNotes0 = (await noteTitles(admin)).filter((t) => t === 'Warehouse without riders').length;
    a = await place([line(prodK)], KALAMU);
    const uc8 = a.data;
    ok(a.ok && uc8.destinationHubId === L.id && uc8.deliveryFeeUsd === r2(4.5 + 1.5), 'the order is placed with the fallback, the flat fee and the transfer fee (the Gombe store is collected by Entrepôt Kinshasa)', a.error ?? JSON.stringify(uc8?.deliveryFeeUsd));
    ok(!!(await until(async () => (await noteTitles(admin)).filter((t) => t === 'Warehouse without riders').length > adminNotes0)), 'admins get a "Warehouse without riders" notice');
    ok(!!(await until(async () => (await noteTitles(supL)).includes('Warehouse without riders'))), 'and so does the staff of the warehouse that took over');
    a = await req(admin.sock, 'hubs:setActive', { id: KL.id, active: false });
    ok(a.ok, 'the warehouse is paused');
    q = (await quote(KALAMU, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id && q.fallback === null && q.feeOverrideUsd === null && q.transfer === false, 'paused: Kalamu falls back to the province owner (no fallback, its flat fee is gone)', JSON.stringify(q && { d: q.destinationHubName, f: q.fallback, o: q.feeOverrideUsd }));
    ok(((await req(guest.sock, 'geo:resolve', { text: { commune: 'Kalamu', city: 'Kinshasa' } })).data?.hubName) === 'Entrepôt Kinshasa', 'and the area says who serves it now');
    await req(admin.sock, 'hubs:setActive', { id: KL.id, active: true });
    await req(admin.sock, 'hubs:unassign', { hubId: KL.id, areaIds: [(await A('CD-KN-KLM')).id] });
    await req(admin.sock, 'hubs:setActive', { id: KL.id, active: false });
    ok((await quote(KALAMU, [line(prodK)])).data?.destinationHubId === K.id, 'unassigned and switched off again');

    // nobody staffed in the same city or province (North Kivu has only this riderless warehouse): the covering warehouse keeps the order, and the quote still names it
    const GOMA_AREA = await A('CD-NK-GOM');
    a = await req(admin.sock, 'hubs:create', { name: `Smoke Goma ${tag}`, areaId: GOMA_AREA.id, lat: -1.6585, lng: 29.2205, capacity: 20 });
    ok(a.ok && a.data.areaId === GOMA_AREA.id, 'an admin creates a warehouse in Goma (no riders, and nobody staffed in North Kivu)', a.error ?? '');
    const NG = a.data;
    cleanup.push(NG.id);
    a = await req(admin.sock, 'hubs:assign', { hubId: NG.id, areaIds: [GOMA_AREA.id] });
    ok(a.ok && a.data.assigned.length === 1, 'it covers the city Goma', a.error ?? '');
    a = await quote({ areaId: GOMA_AREA.id, city: 'Goma' }, [line(prodK)]);
    q = a.data;
    ok(a.ok && q.served === true && q.destinationHubId === NG.id && q.fallback === 'no_riders', 'covered but nobody staffed nearby: the covering warehouse keeps the order (fallback "no_riders")', a.error ?? JSON.stringify(q && { d: q.destinationHubName, f: q.fallback }));
    ok(q.coveringHubId === NG.id && q.coveringHubName === NG.name && q.destinationHubName === NG.name, 'and the quote names the warehouse that covers the area (coveringHubId / coveringHubName), which is the one handling it', JSON.stringify([q.coveringHubId, q.coveringHubName]));
    ok(q.origins[0].fallback === null && q.origins[0].coveringHubId === null, 'the Gombe seller\'s origin is unaffected');
    await req(admin.sock, 'hubs:unassign', { hubId: NG.id, areaIds: [GOMA_AREA.id] });
    await req(admin.sock, 'hubs:setActive', { id: NG.id, active: false });
    ok(!(await quote({ areaId: GOMA_AREA.id, city: 'Goma' }, [line(prodK)])).ok, 'unassigned and switched off again: Goma is not served');

    // ================================================================================================
    section('UC-8: an admin deactivates a warehouse\'s only rider (staff:setActive): signed out, counted as gone, never offered, fallback and notices');
    const hubRow = async (id) => (await hubList()).find((h) => h.id === id);
    const LIMETE_RIDER = 'rider.limete@somba.app';
    const limeteRiders0 = (await hubRow(L.id)).activeRiders;
    ok(limeteRiders0 === 1, 'Entrepôt Limete has exactly one active rider (Marc)', String(limeteRiders0));
    // an order in flight: the Gombe seller to Masina, its transfer Kinshasa -> Limete is waiting for a driver
    a = await place([line(prodK)], MASINA);
    const uc8a = a.data;
    ok(a.ok && uc8a.destinationHubId === L.id, 'a Gombe seller -> Masina order is placed while Limete has its rider (destination Entrepôt Limete)', a.error ?? '');
    a = await move(await taskOf(uc8a.id, 'pickup'), riderK, opK);
    const transfer8 = a.data?.next?.[0];
    ok(a.ok && transfer8?.kind === 'transfer' && transfer8.fromHubId === K.id && transfer8.toHubId === L.id, 'its transfer Kinshasa -> Limete is waiting for a driver', a.error ?? '');
    a = await req(admin.sock, 'logistics:riders', { taskId: transfer8.id });
    ok(a.ok && a.data.some((r) => r.id === riderL.user.id) && a.data.some((r) => r.id === riderK.user.id), 'before: logistics:riders offers a rider of either end of the transfer (Marc and Jean)', JSON.stringify(a.data?.map((r) => r.name)));
    // who may switch someone off
    for (const [who, u] of [['a customer', cust], ['a seller', sellerK], ['a warehouse manager', mgrK], ['a rider', riderL], ['a guest', guest]]) {
      a = await req(u.sock, 'staff:setActive', { userId: riderL.user.id, active: false });
      ok(!a.ok, `${who} cannot switch a rider off`, JSON.stringify(a));
    }
    a = await req(mgrK.sock, 'staff:setActive', { userId: riderL.user.id, active: false });
    ok(a.error === 'Super admin only.', 'the refusal says "Super admin only."', a.error ?? '');
    ok((await req(riderL.sock, 'rider:assignment')).ok && (await hubRow(L.id)).activeRiders === 1, 'and nothing changed: Marc is still signed in and counted');
    a = await req(admin.sock, 'staff:setActive', { userId: riderL.user.id, active: 'no' });
    ok(!a.ok && a.error === 'Active must be true or false.', 'active must be a real true or false', a.error ?? '');
    a = await req(admin.sock, 'staff:setActive', { userId: cust.user.id, active: false });
    ok(!a.ok && a.error === 'Only riders and warehouse staff can be switched on or off here.', 'a customer is not switched here (customers:setActive is theirs)', a.error ?? '');
    a = await req(admin.sock, 'staff:setActive', { userId: 'nope', active: false });
    ok(!a.ok && a.error === 'Account not found.', 'an unknown account', a.error ?? '');
    // switch Marc off
    const wwr0 = (await noteTitles(admin)).filter((t) => t === 'Warehouse without riders').length;
    const wwrSup0 = (await noteTitles(supL)).filter((t) => t === 'Warehouse without riders').length;
    const wwrMgr0 = (await noteTitles(mgrK)).filter((t) => t === 'Warehouse without riders').length;
    const rolesPush = record(admin.sock, 'roles:updated');
    const hubPush = record(supL.sock, 'hub:updated');
    const oldRiderToken = riderL.token;
    a = await req(admin.sock, 'staff:setActive', { userId: riderL.user.id, active: false });
    ok(a.ok && a.data.id === riderL.user.id && a.data.active === false && a.data.role === 'rider' && a.data.hubId === L.id && a.data.openTasks === 0, 'the super admin switches Marc off', a.error ?? JSON.stringify(a.data));
    ok(!!(await until(async () => riderL.sock.disconnected)), 'his open socket is dropped at once');
    ok(!!(await until(async () => rolesPush.some((p) => p.id === riderL.user.id && p.active === false && !('email' in p) && !('name' in p)))), 'admins get roles:updated { id, role, active, hubId } (no name, no e-mail)', JSON.stringify(rolesPush));
    ok(!!(await until(async () => hubPush.some((h) => h.id === L.id))), 'and the warehouse desk gets hub:updated (its rider count changed)');
    const audit = (await req(admin.sock, 'audit:list', { limit: 50 })).data ?? [];
    ok(audit.some((l) => l.action === 'staff.deactivate' && l.entityId === riderL.user.id && /rider/.test(l.detail ?? '')), 'it is audited (staff.deactivate)', JSON.stringify(audit.slice(0, 2)));
    for (let i = 0; i < 4; i++) {
      a = await rest('/api/v1/auth/login', { email: LIMETE_RIDER, password: PW });
      if (a.status !== 429) break;
      await sleep(15000);
    }
    ok(a.status === 401 && /suspended/i.test(a.json?.message ?? ''), 'a switched-off rider cannot sign in again', JSON.stringify(a));
    ok(await connect(oldRiderToken).then((s) => { s.close(); return false; }, () => true), 'and the session he had stopped working (the token is revoked)');
    // counted as gone
    const limeteNow = await hubRow(L.id);
    ok(limeteNow.activeRiders === 0 && limeteNow.riders === 0 && limeteNow.active === true, 'hubs:list: Entrepôt Limete has no active rider any more', JSON.stringify([limeteNow.activeRiders, limeteNow.riders]));
    ok(((await req(admin.sock, 'roles:staff')).data ?? []).find((u) => u.id === riderL.user.id)?.active === false, 'roles:staff lists him as inactive');
    // never offered
    a = await req(admin.sock, 'logistics:riders', { taskId: transfer8.id });
    ok(a.ok && !a.data.some((r) => r.id === riderL.user.id) && a.data.some((r) => r.id === riderK.user.id), 'logistics:riders no longer offers him for the transfer (the driver list of a run is this list)', JSON.stringify(a.data?.map((r) => r.name)));
    a = await req(admin.sock, 'warehouse:riders', { hubId: L.id });
    ok(a.ok && a.data.length === 0, 'warehouse:riders: Entrepôt Limete has none to pick from', JSON.stringify(a.data));
    a = await req(admin.sock, 'logistics:assign', { taskId: transfer8.id, riderId: riderL.user.id });
    ok(!a.ok && a.error === 'Choose an active rider.', 'a task cannot be given to him', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:createRun', { toHubId: L.id, taskIds: [transfer8.id] });
    const run8 = a.data;
    ok(a.ok && run8.count === 1, 'a transfer run is created for the waiting parcel', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:assignRun', { runId: run8.id, riderId: riderL.user.id });
    ok(!a.ok && a.error === 'Choose an active rider.', 'and he cannot be its driver', a.error ?? '');
    // the fallback of UC-8
    q = (await quote(MASINA, [line(prodK)])).data;
    ok(q?.destinationHubId === K.id && q.fallback === 'city' && q.coveringHubId === L.id && q.coveringHubName === L.name, 'Masina is Entrepôt Limete\'s, which now has no rider: the nearest staffed warehouse of the city (Entrepôt Kinshasa) takes over (fallback "city")', JSON.stringify(q && { d: q.destinationHubName, f: q.fallback, c: q.coveringHubName }));
    a = await place([line(prodK)], MASINA);
    const uc8b = a.data;
    ok(a.ok && uc8b.destinationHubId === K.id, 'a new order is accepted and routed to Entrepôt Kinshasa', a.error ?? '');
    ok(!!(await until(async () => (await noteTitles(admin)).filter((t) => t === 'Warehouse without riders').length > wwr0)), 'admins get a "Warehouse without riders" notice');
    ok(!!(await until(async () => (await noteTitles(supL)).filter((t) => t === 'Warehouse without riders').length > wwrSup0)), 'so does the covering warehouse (Entrepôt Limete)');
    ok(!!(await until(async () => (await noteTitles(mgrK)).filter((t) => t === 'Warehouse without riders').length > wwrMgr0)), 'and the warehouse that stands in (Entrepôt Kinshasa)');
    const legs8b = await tasksOf(uc8b.id);
    ok(legs8b.length === 1 && legs8b[0].kind === 'pickup' && legs8b[0].hubId === K.id, 'its pickup is Entrepôt Kinshasa\'s: no transfer is needed any more');
    a = await move(legs8b[0], riderK, opK);
    ok(a.ok && a.data.next[0]?.kind === 'delivery' && a.data.next[0].hubId === K.id, 'Entrepôt Kinshasa scans it in and delivers it itself', a.error ?? '');
    a = await deliver(a.data.next[0], riderK);
    ok(a.ok && (await orderOf(uc8b.id)).status === 'delivered', 'delivered by Entrepôt Kinshasa\'s rider', a.error ?? '');
    // switch Marc back on
    a = await req(admin.sock, 'staff:setActive', { userId: riderL.user.id, active: true });
    ok(a.ok && a.data.active === true, 'the super admin switches him back on', a.error ?? '');
    ok((await hubRow(L.id)).activeRiders === 1, 'Entrepôt Limete has its rider again');
    q = (await quote(MASINA, [line(prodK)])).data;
    ok(q?.destinationHubId === L.id && q.fallback === null, 'and Masina is delivered by Entrepôt Limete again (no fallback)', JSON.stringify(q && { d: q.destinationHubName, f: q.fallback }));
    riderL = await login(LIMETE_RIDER);
    ok(riderL.user.role === 'rider' && (await req(riderL.sock, 'rider:assignment')).data?.hub?.id === L.id, 'he can sign in again, at his warehouse');
    a = await req(admin.sock, 'logistics:riders', { taskId: transfer8.id });
    ok(a.ok && a.data.some((r) => r.id === riderL.user.id), 'and he is offered again');
    // the run goes with him as the driver: assign, dispatch, on the road, received, delivered
    a = await req(mgrK.sock, 'logistics:assignRun', { runId: run8.id, riderId: riderL.user.id });
    ok(a.ok && a.data.riderId === riderL.user.id, 'he is the driver of the waiting run', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:dispatchRun', { runId: run8.id });
    ok(a.ok && a.data.status === 'dispatched', 'dispatched', a.error ?? '');
    a = await req(riderL.sock, 'rider:runStatus', { runId: run8.id, status: 'in_transit' });
    ok(a.ok && a.data.inTransit === true, 'he puts the run on the road', a.error ?? '');
    a = await req(supL.sock, 'logistics:receiveRun', { runId: run8.id });
    ok(a.ok && a.data.receivedCount === 1, 'Entrepôt Limete receives it', a.error ?? '');
    const delivery8 = await taskOf(uc8a.id, 'delivery');
    ok(delivery8?.hubId === L.id, 'and the delivery leg is Entrepôt Limete\'s');
    a = await deliver(delivery8, riderL);
    ok(a.ok && (await orderOf(uc8a.id)).status === 'delivered', 'delivered by Marc: the first order finished through Entrepôt Limete', a.error ?? '');

    // ================================================================================================
    section('UC-6: another city. Entrepôt Lubumbashi (with a rider) covers the city Lubumbashi; local order, then Kinshasa -> Lubumbashi');
    a = await req(admin.sock, 'hubs:create', { name: `Entrepôt Lubumbashi ${tag}`, areaId: (await A('CD-HK-LUB')).id, lat: LUBUMBASHI_PIN.lat, lng: LUBUMBASHI_PIN.lng, capacity: 200 });
    ok(a.ok && a.data.city === 'Lubumbashi', 'an admin creates Entrepôt Lubumbashi', a.error ?? '');
    const LB = a.data;
    cleanup.push(LB.id);
    const mkPerson = async (hub, role, name) => {
      const email = `${role}.${name.replace(/\W/g, '').toLowerCase()}${tag}@areas.test`;
      const created = await req(admin.sock, 'roles:createStaff', { email, name, role, hubId: hub.id, ...(role === 'warehouse_staff' ? { warehouseTier: 'supervisor' } : {}) });
      if (!created.ok) throw new Error(`createStaff ${name}: ${created.error}`);
      return login(email, created.data.tempPassword);
    };
    const riderLB = await mkPerson(LB, 'rider', 'Smoke Lubumbashi Rider');
    const staffLB = await mkPerson(LB, 'warehouse_staff', 'Smoke Lubumbashi Staff');
    q = (await quote({ city: 'Lubumbashi', pin: LUBUMBASHI_PIN }, [line(prodK)]));
    ok(!q.ok && /Lubumbashi/.test(q.error), 'a warehouse with no coverage receives nothing: Lubumbashi is still refused');
    a = await req(admin.sock, 'hubs:assign', { hubId: LB.id, areaIds: [(await A('CD-HK-LUB')).id] });
    ok(a.ok && a.data.assigned.length === 1, 'the city Lubumbashi is assigned to it', a.error ?? '');
    const hk = (await req(guest.sock, 'geo:children', {})).data.find((p) => p.code === 'CD-HK');
    ok(hk.served === false && hk.partiallyServed === true, 'the province Haut-Katanga is "partially served" (a served city inside): pickers do not grey it out', JSON.stringify([hk.served, hk.partiallyServed]));
    ok(((await req(guest.sock, 'geo:children', { parentCode: 'CD-HK' })).data ?? []).find((x) => x.code === 'CD-HK-LUB')?.served === true && ((await req(guest.sock, 'geo:children', { parentCode: 'CD-HK' })).data ?? []).find((x) => x.code === 'CD-HK-LIK')?.partiallyServed === false, 'Lubumbashi is served, Likasi is not (and not partly)');
    ok((await req(guest.sock, 'geo:servedCities')).data.map((x) => x.code).sort().join() === 'CD-HK-LUB,CD-KN-KIN', 'geo:servedCities now lists Kinshasa and Lubumbashi');
    a = await quote({ city: 'Lubumbashi', pin: LUBUMBASHI_PIN }, [line(prodK)]);
    q = a.data;
    ok(a.ok && q.served === true && q.destinationHubId === LB.id && q.fallback === null, 'Lubumbashi is served by its own warehouse', a.error ?? JSON.stringify(q));
    ok(q.interCity === true && q.interCityDays === 3 && q.extraDays === 3 && q.transfer === true && q.originHubIds.join() === K.id, 'Kinshasa seller -> Lubumbashi customer: inter-city, +3 days, a transfer from Entrepôt Kinshasa', JSON.stringify([q.interCity, q.interCityDays, q.extraDays]));
    // a local order: the Limete store moves its pickup to Lubumbashi
    a = await req(sellerL.sock, 'sellers:update', { pickupAreaId: (await A('CD-HK-LUB')).id });
    ok(a.ok && a.data.pickupServed === true && a.data.originHubId === LB.id && a.data.originHubName === LB.name && a.data.pickupAreaChain.at(-1).code === 'CD-HK-LUB', 'a store can pick up in Lubumbashi: its origin is Entrepôt Lubumbashi', a.error ?? JSON.stringify(a.data));
    const LUBUM = { city: 'Lubumbashi', pin: LUBUMBASHI_PIN };
    q = (await quote(LUBUM, [line(prodL)])).data;
    ok(q?.destinationHubId === LB.id && q.transfer === false && q.interCity === false && q.extraDays === 0, 'local order (store and customer in Lubumbashi) stays inside Entrepôt Lubumbashi: no transfer, no extra days', JSON.stringify(q));
    a = await place([line(prodL)], LUBUM);
    const ucLocal = a.data;
    const lp = await until(() => taskOf(ucLocal.id, 'pickup'));
    a = await move(lp, riderLB, staffLB);
    ok(a.ok && a.data.next[0]?.kind === 'delivery' && a.data.next[0].fromHubId === LB.id, 'the local Lubumbashi order goes pickup -> delivery inside Entrepôt Lubumbashi', a.error ?? '');
    await deliver(a.data.next[0], riderLB);
    ok((await orderOf(ucLocal.id)).status === 'delivered', 'and is delivered');
    // the Limete store goes back to Limete
    a = await req(sellerL.sock, 'sellers:update', { pickupAreaId: (await A('CD-KN-LMT')).id });
    ok(a.ok && a.data.originHubId === L.id, 'the Limete store moves back to Limete');
    // cross-city order: Kinshasa seller -> Lubumbashi customer
    a = await place([line(prodK)], LUBUM);
    const ucX = a.data;
    const localEst = (await orderOf(ucLocal.id)).estimatedDeliveryDate;
    ok(a.ok && ucX.destinationHubId === LB.id && day(ucX.estimatedDeliveryDate) - day(localEst) >= 0, 'the cross-city order is placed', a.error ?? '');
    const sameProduct = await place([line(prodK)], GOMBE);
    ok(day(ucX.estimatedDeliveryDate) - day(sameProduct.data.estimatedDeliveryDate) === 3, 'its estimated delivery date is 3 days later than the same basket in Kinshasa (interCityTransferDays)', `${ucX.estimatedDeliveryDate} vs ${sameProduct.data.estimatedDeliveryDate}`);
    await req(cust.sock, 'orders:cancel', { orderId: sameProduct.data.id });
    const xp = await until(() => taskOf(ucX.id, 'pickup'));
    a = await move(xp, riderK, opK);
    const xt = a.data?.next?.[0];
    ok(a.ok && xt?.kind === 'transfer' && xt.fromHubId === K.id && xt.toHubId === LB.id, 'transfer Kinshasa -> Lubumbashi (assigned by Kinshasa, direct as there are no lanes)', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: xt.id, riderId: riderLB.user.id });
    ok(a.ok, 'Kinshasa may use a Lubumbashi driver for the long-distance transfer', a.error ?? '');
    await req(riderLB.sock, 'delivery:updateStatus', { taskId: xt.id, status: 'picked_up' });
    a = await req(staffLB.sock, 'logistics:scanIn', { taskId: xt.id });
    ok(a.ok && a.data.next[0]?.kind === 'delivery' && a.data.next[0].fromHubId === LB.id, 'Lubumbashi scans it in and delivers locally', a.error ?? '');
    await req(admin.sock, 'settings:set', { key: 'allowInterCityDelivery', value: 'false' });
    a = await quote(LUBUM, [line(prodK)]);
    ok(!a.ok && a.error === 'Delivery between cities is not available right now.', 'with allowInterCityDelivery off a cross-city order is refused', a.error ?? '');
    ok((await quote(LUBUM, [line(prodL)])).ok === false, 'a Limete (Kinshasa) store is a cross-city seller too: refused');
    await req(admin.sock, 'settings:set', { key: 'allowInterCityDelivery', value: 'true' });
    await req(admin.sock, 'settings:set', { key: 'interCityTransferDays', value: 5 });
    ok((await quote(LUBUM, [line(prodK)])).data?.extraDays === 5, 'the number of days is a setting (5)');
    await req(admin.sock, 'settings:set', { key: 'interCityTransferDays', value: 3 });
    const pubS = (await req(cust.sock, 'settings:get')).data;
    ok(pubS.allowInterCityDelivery === 'true' && pubS.interCityTransferDays === '3', 'both settings are public');

    // ================================================================================================
    section('UC-9 (seller): a store whose pickup area is not served can set up but cannot sell');
    a = await req(sellerL.sock, 'sellers:update', { pickupAreaId: (await A('CD-NK-GOM')).id });
    ok(a.ok && a.data.pickupServed === false && a.data.originHubId === null && a.data.pickupAreaChain.at(-1).code === 'CD-NK-GOM', 'the store can be set up in Goma: pickupServed false, no origin warehouse', a.error ?? JSON.stringify(a.data));
    a = await req(sellerL.sock, 'products:create', { name: `Smoke product ${tag}`, price: 5, stock: 3, category: 'Electronics' });
    ok(!a.ok && a.error === 'Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.', 'listing a product is refused with the contract message', a.error ?? '');
    a = await place([line(prodL)], GOMBE);
    ok(!a.ok && /cannot ship from their area yet/.test(a.error ?? ''), 'and an existing listing of that store cannot be ordered', a.error ?? '');
    a = await req(sellerL.sock, 'sellers:update', { pickupAreaId: (await A('CD-KN-LMT')).id });
    ok(a.ok && a.data.pickupServed === true && a.data.originHubId === L.id, 'back in Limete the store sells again');
    a = await req(sellerL.sock, 'sellers:update', { pickupLat: GOMBE_PIN.lat, pickupLng: GOMBE_PIN.lng });
    ok(a.ok && a.data.pickupAreaChain.at(-1).code === 'CD-KN-GOM' && a.data.originHubId === K.id, 'moving only the pickup pin re-derives the area (Gombe) and the origin warehouse');
    await req(sellerL.sock, 'sellers:update', { pickupAreaId: (await A('CD-KN-LMT')).id, pickupLat: LIMETE_PIN.lat, pickupLng: LIMETE_PIN.lng });
    ok((await sellerSeat(sellerL)).originHubId === L.id, 'restored: Limete');
    ok(!('pickupAreaId' in ((await req(guest.sock, 'sellers:storefront', { id: (await sellerSeat(sellerL)).id })).data?.seller ?? {})) , 'the pickup area is never in the public storefront');

    // ================================================================================================
    section('UC-10: lanes and multi-hop transfers. Limete -> Kinshasa -> Kikwit, a different driver per hop');
    a = await req(admin.sock, 'hubs:create', { name: `Entrepôt Kikwit ${tag}`, areaId: (await A('CD-KL-KIK')).id, lat: KIKWIT_PIN.lat, lng: KIKWIT_PIN.lng, capacity: 100 });
    ok(a.ok, 'an admin creates Entrepôt Kikwit', a.error ?? '');
    const W = a.data;
    cleanup.push(W.id);
    await req(admin.sock, 'hubs:assign', { hubId: W.id, areaIds: [(await A('CD-KL-KIK')).id] });
    const riderW = await mkPerson(W, 'rider', 'Smoke Kikwit Rider');
    const staffW = await mkPerson(W, 'warehouse_staff', 'Smoke Kikwit Staff');
    ok(!(await req(opK.sock, 'lanes:upsert', { fromHubId: L.id, toHubId: K.id, transitHours: 4 })).ok && !(await req(cust.sock, 'lanes:list')).ok, 'only admins write lanes; customers cannot read them');
    a = await req(admin.sock, 'routes:preview', { fromHubId: L.id, toHubId: W.id });
    ok(a.ok && a.data.hops.length === 1 && a.data.direct === true && a.data.totalHours === 0, 'with no lane at all the route is a direct transfer', a.error ?? JSON.stringify(a.data));
    a = await req(admin.sock, 'lanes:upsert', { fromHubId: L.id, toHubId: K.id, transitHours: 4, bidirectional: true });
    ok(a.ok && a.data.transitHours === 4 && a.data.bidirectional === true && a.data.fromHubName === 'Entrepôt Limete', 'Limete <-> Kinshasa: 4 h (both directions)', a.error ?? '');
    const laneLK = a.data;
    a = await req(admin.sock, 'lanes:upsert', { fromHubId: K.id, toHubId: W.id, transitHours: 24, bidirectional: true });
    ok(a.ok, 'Kinshasa <-> Kikwit: 24 h', a.error ?? '');
    const laneKW = (await req(admin.sock, 'lanes:list', { hubId: W.id })).data.find((l) => l.fromHubId === K.id);
    ok(((await req(opK.sock, 'lanes:list')).data ?? []).length === 4 && laneKW?.toHubName === W.name && laneKW.bidirectional === true, 'lanes:list shows the four directed lanes');
    a = await req(admin.sock, 'routes:preview', { fromHubId: L.id, toHubId: W.id });
    ok(a.ok && a.data.hops.length === 2 && a.data.totalHours === 28 && a.data.direct === false && a.data.hops[0].toHubId === K.id, 'routes:preview: Limete -> Kinshasa -> Kikwit, 28 h', a.error ?? JSON.stringify(a.data));
    ok(!(await req(admin.sock, 'routes:preview', { fromHubId: L.id, toHubId: LB.id })).ok && (await req(admin.sock, 'routes:preview', { fromHubId: L.id, toHubId: LB.id })).error === 'These warehouses are not connected by any lane.', 'a pair that lanes do not connect: "These warehouses are not connected by any lane."');
    const KIKWIT = { city: 'Kikwit', pin: KIKWIT_PIN };
    q = (await quote(KIKWIT, [line(prodL)])).data;
    ok(q?.destinationHubId === W.id && q.interCity === true, 'a Kikwit customer is Entrepôt Kikwit\'s', JSON.stringify(q && q.destinationHubName));
    ok(q.origins[0].hubId === L.id && q.origins[0].hops.map((h) => h.toHubName).join() === `Entrepôt Kinshasa,${W.name}`, 'the Limete store\'s parcel goes Limete -> Kinshasa -> Kikwit (hops per origin)', JSON.stringify(q.origins[0].hops));
    ok(q.origins[0].hops[0].transitHours === 4 && q.origins[0].hops[1].transitHours === 24 && q.origins[0].hops.every((h) => h.costUsd === 1.5 && h.laneCost === false) && q.defaultTransferUsd === 1.5 && q.origins[0].transitHours === 28 && q.transitHours === 28, 'each hop carries its transit hours (4 and 24) and its effective price (no lane price: the default $1.50, laneCost false); total 28 h', JSON.stringify(q.origins[0].hops));
    ok(q.transferUsd === 3 && r2(q.feeUsd - q.deliveryUsd) === 3, 'the transfer fee is charged per hop: 2 x $1.50', JSON.stringify([q.transferUsd, q.feeUsd, q.deliveryUsd]));
    ok(q.extraDays === 2, 'the estimate adds the lanes\' transit (28 h -> 2 days)', String(q.extraDays));
    a = await req(admin.sock, 'lanes:upsert', { id: laneKW.id, costUsd: 7, bidirectional: true });
    ok(a.ok && a.data.costUsd === 7, 'a lane can carry its own price');
    q = (await quote(KIKWIT, [line(prodL)])).data;
    ok(q.transferUsd === 8.5 && q.origins[0].hops[1].costUsd === 7 && q.origins[0].hops[1].laneCost === true && q.origins[0].hops[0].costUsd === 1.5 && q.origins[0].hops[0].laneCost === false && q.defaultTransferUsd === 1.5, 'and that price replaces the transfer fee for that hop ($1.50 + $7.00): laneCost true on it, false on the other', JSON.stringify(q.origins[0].hops));
    a = await req(admin.sock, 'lanes:upsert', { id: laneKW.id, costUsd: null, bidirectional: true });
    const localLimete = await place([line(prodL)], LIMETE);
    a = await place([line(prodL)], KIKWIT);
    const uc10 = a.data;
    ok(a.ok && uc10.destinationHubId === W.id && JSON.stringify(Object.values(uc10.routeBySeller ?? {})[0]) === JSON.stringify([L.id, K.id, W.id]), 'orders:create stores the planned route per seller: routeBySeller = [Limete, Kinshasa, Kikwit]', a.error ?? JSON.stringify(uc10?.routeBySeller));
    ok(day(uc10.estimatedDeliveryDate) - day(localLimete.data.estimatedDeliveryDate) === 2, 'the order\'s estimated date is 2 days (the lanes\' transit) later than the same basket delivered in Limete', `${uc10.estimatedDeliveryDate} vs ${localLimete.data.estimatedDeliveryDate}`);
    await req(cust.sock, 'orders:cancel', { orderId: localLimete.data.id });
    const p10 = await until(() => taskOf(uc10.id, 'pickup'));
    a = await move(p10, riderL, supL);
    const hop1 = a.data?.next?.[0];
    ok(a.ok && hop1?.kind === 'transfer' && hop1.fromHubId === L.id && hop1.toHubId === K.id && hop1.finalHubId === W.id && hop1.hop === 1 && hop1.hops === 2 && hop1.status === 'unassigned', 'hop 1: Limete scans the pickup in and Limete -> Kinshasa is created (heading for Kikwit, hop 1 of 2)', a.error ?? JSON.stringify(hop1));
    a = await req(supL.sock, 'logistics:assign', { taskId: hop1.id, riderId: riderL.user.id });
    ok(a.ok, 'Limete assigns its own rider to hop 1', a.error ?? '');
    await req(riderL.sock, 'delivery:updateStatus', { taskId: hop1.id, status: 'picked_up' });
    a = await req(mgrK.sock, 'logistics:scanIn', { taskId: hop1.id });
    const hop2 = a.data?.next?.[0];
    ok(a.ok && a.data.next.length === 1 && hop2?.kind === 'transfer' && hop2.fromHubId === K.id && hop2.toHubId === W.id && hop2.hop === 2 && hop2.hops === 2 && hop2.status === 'unassigned' && hop2.riderId === null, 'Kinshasa scans hop 1 in: hop 2 (Kinshasa -> Kikwit) is created UNASSIGNED — the driver of hop 1 is not inherited', a.error ?? JSON.stringify(hop2));
    ok((await queueOf(admin)).tasks.find((t) => t.id === hop1.id)?.riderId === riderL.user.id, 'hop 1 keeps Limete\'s rider');
    ok(!(await tasksOf(uc10.id)).some((t) => t.kind === 'delivery'), 'no delivery before the last hop lands');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: hop2.id, riderId: riderL.user.id });
    ok(!a.ok, 'a Limete driver cannot take hop 2 (neither end of Kinshasa -> Kikwit)', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: hop2.id, riderId: riderK.user.id });
    ok(a.ok && a.data.riderId === riderK.user.id && riderK.user.id !== riderL.user.id, 'Kinshasa assigns a Kinshasa driver to hop 2: a different driver per hop', a.error ?? '');
    await req(riderK.sock, 'delivery:updateStatus', { taskId: hop2.id, status: 'picked_up' });
    const trk = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === uc10.id)?.tracking;
    const tHops = trk.legs.filter((l) => l.kind === 'transfer');
    ok(tHops.length === 2 && tHops[0].hop === 1 && tHops[1].hop === 2 && tHops.every((l) => l.hops === 2) && tHops[0].fromHubName === 'Entrepôt Limete' && tHops[0].toHubName === 'Entrepôt Kinshasa' && tHops[1].toHubName === W.name, 'tracking has one entry per hop: Limete -> Kinshasa (1 of 2), Kinshasa -> Kikwit (2 of 2)', JSON.stringify(tHops.map((l) => [l.hop, l.hops, l.fromHubName, l.toHubName])));
    ok(tHops[0].riderFirstName && tHops[1].riderFirstName && tHops[0].riderFirstName !== tHops[1].riderFirstName, 'each hop shows its own rider\'s first name', JSON.stringify(tHops.map((l) => l.riderFirstName)));
    a = await req(staffW.sock, 'logistics:scanIn', { taskId: hop2.id });
    const dl10 = a.data?.next?.[0];
    ok(a.ok && dl10?.kind === 'delivery' && dl10.fromHubId === W.id, 'Kikwit scans hop 2 in: now the delivery appears at Kikwit', a.error ?? '');
    ok((await orderOf(uc10.id)).status === 'shipped', 'the order is shipped');
    a = await deliver(dl10, riderW);
    ok(a.ok && (await orderOf(uc10.id)).status === 'delivered', 'the Kikwit rider delivers');

    section('UC-10: returns run the same route in reverse; a lane switched off mid-route re-plans the hops not yet created');
    a = await req(admin.sock, 'logistics:createReturnPickup', { disputeId: `ret10-${tag}`, orderId: uc10.id });
    const r10 = a.data;
    ok(a.ok && r10.toHubId === W.id, 'the return pickup is at Entrepôt Kikwit', a.error ?? '');
    a = await move(r10, riderW, staffW);
    const rh1 = a.data?.next?.[0];
    ok(a.ok && rh1?.kind === 'return_transfer' && rh1.fromHubId === W.id && rh1.toHubId === K.id && rh1.finalHubId === L.id && rh1.hop === 1 && rh1.hops === 2, 'return hop 1: Kikwit -> Kinshasa (heading for Limete)', a.error ?? JSON.stringify(rh1));
    a = await move(rh1, riderK, mgrK);
    const rh2 = a.data?.next?.[0];
    ok(a.ok && rh2?.kind === 'return_transfer' && rh2.fromHubId === K.id && rh2.toHubId === L.id && rh2.hop === 2 && rh2.hops === 2 && rh2.riderId === null, 'return hop 2: Kinshasa -> Limete, unassigned', a.error ?? '');
    a = await move(rh2, riderK, supL);
    ok(a.ok && a.data.next[0]?.kind === 'return_to_seller' && a.data.next[0].fromHubId === L.id, 'Limete scans it in: back to the seller', a.error ?? '');
    // re-planning
    a = await place([line(prodL)], KIKWIT);
    const uc10b = a.data;
    const p10b = await until(() => taskOf(uc10b.id, 'pickup'));
    a = await move(p10b, riderL, supL);
    const h1b = a.data.next[0];
    ok(h1b?.hop === 1 && h1b.hops === 2, 'a second order: hop 1 created (1 of 2)');
    await req(admin.sock, 'lanes:upsert', { id: laneKW.id, active: false, bidirectional: true });
    const adminNotes1 = (await noteTitles(admin)).filter((t) => t === 'Warehouses not connected').length;
    a = await move(h1b, riderL, mgrK);
    const h2b = a.data?.next?.[0];
    ok(a.ok && h2b?.kind === 'transfer' && h2b.fromHubId === K.id && h2b.toHubId === W.id && h2b.hop === 2, 'with Kinshasa <-> Kikwit switched off, hop 2 is planned at the next scan-in: no lane connects them, so it goes direct', a.error ?? JSON.stringify(h2b));
    ok(!!(await until(async () => (await noteTitles(admin)).filter((t) => t === 'Warehouses not connected').length > adminNotes1)), 'and admins get a "Warehouses not connected" notice');
    ok((await queueOf(admin)).tasks.find((t) => t.id === h1b.id)?.toHubId === K.id, 'hop 1 (already on its way) kept its route');
    await req(admin.sock, 'lanes:upsert', { id: laneKW.id, active: true, bidirectional: true });
    a = await req(admin.sock, 'lanes:remove', { id: laneLK.id });
    ok(a.ok && a.data.removed === true, 'lanes:remove deletes a lane');
    ok((await req(admin.sock, 'lanes:remove', { id: laneLK.id })).ok === false, 'removing it twice fails');
    await req(cust.sock, 'orders:cancel', { orderId: uc10b.id });

    // ================================================================================================
    section('UC-11: transfer runs. Propose, create, split between two drivers, dispatch, in transit, receive, close with a missing parcel');
    const runPush = { mgrK: record(mgrK.sock, 'run:updated'), supL: record(supL.sock, 'run:updated'), riderK: record(riderK.sock, 'run:updated'), riderL: record(riderL.sock, 'run:updated') };
    // clear the lanes so runs are plain Kinshasa -> Limete trips
    for (const l of (await req(admin.sock, 'lanes:list')).data ?? []) await req(admin.sock, 'lanes:remove', { id: l.id });
    const waiting = [];
    for (let i = 0; i < 4; i++) {
      a = await place([line(prodK)], { ...MASINA, areaId: (await A('CD-KN-MSN')).id });
      const o = a.data;
      const pk = await until(() => taskOf(o.id, 'pickup'));
      const s = await move(pk, riderK, opK);
      waiting.push({ order: o, transfer: s.data.next[0] });
    }
    const ids = waiting.map((w) => w.transfer.id);
    ok(waiting.every((w) => w.transfer.kind === 'transfer' && w.transfer.toHubId === L.id && w.transfer.status === 'unassigned'), 'four orders left four transfer legs Kinshasa -> Limete waiting at Entrepôt Kinshasa');
    a = await req(mgrK.sock, 'logistics:runProposals');
    const prop = a.data?.find((p) => p.toHubId === L.id);
    ok(a.ok && prop && ids.every((id) => prop.taskIds.includes(id)) && prop.toHubName === 'Entrepôt Limete' && prop.count === prop.taskIds.length, 'logistics:runProposals groups the waiting transfers by next warehouse', a.error ?? JSON.stringify(a.data));
    ok((await req(supL.sock, 'logistics:runProposals')).data?.every((p) => p.toHubId !== L.id), 'Limete has nothing waiting for Limete');
    a = await req(opK.sock, 'logistics:createRun', { toHubId: L.id, taskIds: ids });
    ok(!a.ok && a.error === 'Only supervisors and managers can assign riders.', 'an operator cannot create a run', a.error ?? '');
    a = await req(supL.sock, 'logistics:createRun', { toHubId: L.id, taskIds: ids });
    ok(!a.ok && a.error === 'Only parcels waiting at this warehouse can join this run.', 'Limete cannot put Kinshasa\'s parcels in a run', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:createRun', { toHubId: L.id, taskIds: ids });
    const run = a.data;
    ok(a.ok && /^TR-\d{4}$/.test(run.reference) && run.status === 'planned' && run.count === 4 && run.fromHubName === 'Entrepôt Kinshasa' && run.toHubName === 'Entrepôt Limete' && run.riderId === null && run.inTransit === false, 'the manager creates a run (TR-xxxx, planned, 4 parcels)', a.error ?? JSON.stringify(run));
    ok((await req(mgrK.sock, 'logistics:assign', { taskId: ids[0], riderId: riderK.user.id })).error === 'This parcel is part of a transfer run. Manage it from the run.', 'a parcel of a run is managed from the run');
    ok((await queueOf(admin)).tasks.find((t) => t.id === ids[0]).runId === run.id && (await queueOf(admin)).tasks.find((t) => t.id === ids[0]).runReference === run.reference, 'task views carry runId and runReference');
    const legOf = async () => (await req(cust.sock, 'orders:list')).data.find((o) => o.id === waiting[0].order.id)?.tracking?.legs?.find((l) => l.kind === 'transfer');
    ok((await legOf())?.runId === run.id && (await legOf())?.runReference === run.reference, 'and so does the customer\'s tracking leg (runId, runReference)', JSON.stringify(await legOf()));
    a = await req(mgrK.sock, 'logistics:dispatchRun', { runId: run.id });
    ok(!a.ok && a.error === 'Choose a driver for this run first.', 'dispatching without a driver: "Choose a driver for this run first."');
    a = await req(mgrK.sock, 'logistics:updateRun', { runId: run.id, removeTaskIds: [ids[3]] });
    ok(a.ok && a.data.count === 3, 'a parcel can leave a planned run', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:updateRun', { runId: run.id, addTaskIds: [ids[3]] });
    ok(a.ok && a.data.count === 4, 'and join it again', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:splitRun', { runId: run.id, taskIds: [ids[2], ids[3]] });
    ok(a.ok && a.data.original.id === run.id && a.data.original.count === 2 && a.data.created.count === 2 && a.data.created.reference !== run.reference && a.data.created.fromHubId === K.id && a.data.created.toHubId === L.id && a.data.created.riderId === null, 'splitRun: 4 parcels become 2 + 2 on the same lane (a new run, no driver yet)', a.error ?? JSON.stringify(a.data));
    const run2 = a.data.created;
    ok(!(await req(mgrK.sock, 'logistics:splitRun', { runId: run.id, taskIds: ids.slice(0, 2) })).ok, 'a run cannot be split into nothing: all of its parcels cannot move');
    a = await req(mgrK.sock, 'logistics:assignRun', { runId: run.id, riderId: riderK.user.id });
    ok(a.ok && a.data.riderId === riderK.user.id && a.data.riderName, 'run 1 gets a Kinshasa driver', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:assignRun', { runId: run2.id, riderId: riderL.user.id });
    ok(a.ok && a.data.riderId === riderL.user.id, 'run 2 gets another driver (the receiving warehouse\'s): one driver per run, two drivers = two runs', a.error ?? '');
    ok(!(await req(mgrK.sock, 'logistics:assignRun', { runId: run2.id, riderId: cust.user.id })).ok, 'a customer cannot be a driver');
    ok(!!(await until(async () => runPush.riderK.find((r) => r.id === run.id && r.riderId === riderK.user.id))) && !!(await until(async () => runPush.supL.find((r) => r.id === run2.id))), 'run:updated reaches the driver and both warehouses');
    const rr = (await req(riderK.sock, 'rider:runs')).data;
    const card = rr?.find((x) => x.id === run.id);
    ok(card && card.count === 2 && card.toHubName === 'Entrepôt Limete' && card.status === 'planned' && card.riderId === riderK.user.id && !rr.some((x) => x.id === run2.id), 'rider:runs: the driver\'s run card ("Transfer to Entrepôt Limete · 2 parcels"), not the other driver\'s run', JSON.stringify(rr));
    ok((await req(riderL.sock, 'rider:runs')).data?.some((x) => x.id === run2.id) && !(await req(riderL.sock, 'rider:runs')).data?.some((x) => x.id === run.id) && (await req(cust.sock, 'rider:runs')).ok === false, 'the other driver sees only theirs; customers cannot ask');
    a = await req(mgrK.sock, 'logistics:dispatchRun', { runId: run.id });
    ok(a.ok && a.data.status === 'dispatched' && a.data.dispatchedAt, 'run 1 is dispatched', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:dispatchRun', { runId: run2.id });
    ok(a.ok && a.data.status === 'dispatched', 'run 2 is dispatched', a.error ?? '');
    const live = (await queueOf(admin)).tasks;
    ok([ids[0], ids[1]].every((id) => live.find((t) => t.id === id).status === 'picked_up' && live.find((t) => t.id === id).riderId === riderK.user.id) && [ids[2], ids[3]].every((id) => live.find((t) => t.id === id).status === 'picked_up' && live.find((t) => t.id === id).riderId === riderL.user.id), 'every parcel is picked_up with its run\'s driver');
    a = await req(mgrK.sock, 'logistics:updateRun', { runId: run.id, removeTaskIds: [ids[0]] });
    ok(!a.ok && a.error === 'This run has already left.', 'a run cannot change after dispatch: "This run has already left."');
    ok((await req(mgrK.sock, 'logistics:splitRun', { runId: run.id, taskIds: [ids[0]] })).error === 'This run has already left.', 'nor be split');
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: ids[0], status: 'in_transit' });
    ok(a.ok, 'the driver marks one parcel in transit', a.error ?? '');
    const afterTap = (await req(mgrK.sock, 'logistics:runs', { status: 'open' })).data ?? [];
    const liveAfter = (await queueOf(admin)).tasks;
    ok(afterTap.find((r) => r.id === run.id)?.inTransit === true && liveAfter.find((t) => t.id === ids[1]).status === 'in_transit' && afterTap.find((r) => r.id === run2.id)?.inTransit === false, 'the whole run goes in transit (inTransit: true); the other run is untouched');
    a = await req(riderK.sock, 'rider:runStatus', { runId: run2.id, status: 'in_transit' });
    ok(!a.ok, 'a driver cannot report someone else\'s run');
    a = await req(riderL.sock, 'rider:runStatus', { runId: run2.id, status: 'in_transit' });
    ok(a.ok && a.data.inTransit === true && a.data.inTransitAt, 'rider:runStatus marks run 2 on the road', a.error ?? '');
    ok(!(await req(riderL.sock, 'rider:runStatus', { runId: run2.id, status: 'delivered' })).ok, 'only in_transit can be reported');
    a = await req(opK.sock, 'logistics:receiveRun', { runId: run.id });
    ok(!a.ok && /not due at your warehouse/.test(a.error ?? ''), 'Kinshasa cannot receive a run addressed to Limete');
    ok((await req(supL.sock, 'logistics:runs', { direction: 'in', status: 'open' })).data?.filter((r) => [run.id, run2.id].includes(r.id)).length === 2, 'Limete sees both runs coming in');
    a = await req(supL.sock, 'logistics:receiveRun', { runId: run.id });
    ok(a.ok && a.data.status === 'arrived' && a.data.receivedCount === 2 && a.data.arrivedAt, 'Limete receives run 1: both parcels scanned in at once', a.error ?? '');
    const after1 = await tasksOf(waiting[0].order.id);
    ok(after1.some((t) => t.kind === 'delivery' && t.fromHubId === L.id), 'each scan ran the normal next-leg logic: the deliveries appear at Limete');
    a = await req(supL.sock, 'logistics:receiveRun', { runId: run2.id, taskIds: [ids[2]] });
    ok(a.ok && a.data.status === 'arrived' && a.data.receivedCount === 1 && a.data.count === 2, 'run 2: staff scan parcel by parcel (1 of 2)', a.error ?? '');
    a = await req(supL.sock, 'logistics:closeRun', { runId: run.id });
    ok(a.ok && a.data.status === 'closed' && a.data.missingCount === 0 && a.data.closedAt, 'run 1 closes cleanly', a.error ?? '');
    const excBefore = ((await req(supL.sock, 'exceptions:list')).data ?? []).length;
    const adminNotes2 = (await noteTitles(admin)).filter((t) => t === 'Parcel missing from run').length;
    a = await req(supL.sock, 'logistics:closeRun', { runId: run2.id });
    ok(a.ok && a.data.status === 'closed' && a.data.missingCount === 1 && a.data.receivedCount === 1, 'run 2 closes with one parcel that never arrived', a.error ?? JSON.stringify(a.data));
    const missing = (await queueOf(admin)).tasks.find((t) => t.id === ids[3]);
    ok(missing.status === 'failed' && missing.failureReason === `Parcel missing from run ${run2.reference}.`, 'it is marked failed: "Parcel missing from run TR-…."', JSON.stringify([missing.status, missing.failureReason]));
    const excs = (await req(supL.sock, 'exceptions:list')).data ?? [];
    ok(excs.length === excBefore + 1 && excs.some((e) => e.notes === `Parcel missing from run ${run2.reference}.` && e.type === 'missing_item' && e.hubId === L.id && e.severity === 'high'), 'and it becomes an exception at the receiving warehouse (visible to its staff)', JSON.stringify(excs.map((e) => e.notes)));
    ok(!!(await until(async () => (await noteTitles(admin)).filter((t) => t === 'Parcel missing from run').length > adminNotes2)) && (await noteTitles(mgrK)).includes('Parcel missing from run') && (await noteTitles(supL)).includes('Parcel missing from run'), 'admins and both warehouses are told');
    ok((await req(supL.sock, 'logistics:receiveRun', { runId: run2.id })).error === 'This run is already closed.', 'a closed run takes no more scans');
    ok((await req(supL.sock, 'logistics:runs', { status: 'closed' })).data.filter((r) => [run.id, run2.id].includes(r.id)).length === 2, 'logistics:runs filters by status');
    const an = (await req(admin.sock, 'analytics:warehouse')).data;
    const lane = an?.runs?.byLane?.find((l) => l.fromHubId === K.id && l.toHubId === L.id);
    ok(lane && lane.runs >= 2 && lane.parcels >= 4 && lane.missing >= 1, 'analytics: runs per lane with parcels and missing parcels', JSON.stringify(an?.runs));
    const com = an?.byCommune?.find((x) => x.area === 'Masina');
    ok(com && com.orders >= 1 && 'failureRatePct' in com && com.hub === 'Entrepôt Limete', 'analytics: orders, failures and delivery time per commune (Masina -> Entrepôt Limete)', JSON.stringify(an?.byCommune?.slice(0, 3)));
    ok(Array.isArray(an?.byHub) && an.byHub.length >= 2, 'and still per warehouse');
    // a rider's own warehouse list now includes the runs' deliveries; the rest of the orders are cancelled to keep the demo tidy
    for (const w of waiting) await req(admin.sock, 'orders:adminCancel', { orderId: w.order.id, reason: 'smoke cleanup' });
  } finally {
    for (const id of cleanup) {
      if (String(id).length > 20) {
        try {
          const cov = await req(admin.sock, 'hubs:coverage', { hubId: id });
          if (cov.ok && cov.data.areas.length) await req(admin.sock, 'hubs:unassign', { hubId: id, areaIds: cov.data.areas.map((x) => x.id) });
          await req(admin.sock, 'hubs:setActive', { id, active: false });
        } catch {}
      }
    }
    await restoreSettings();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed:\n - ' + fails.join('\n - ')); process.exitCode = 1; }
  process.exit();
})().catch((e) => { console.error(e); process.exit(1); });
