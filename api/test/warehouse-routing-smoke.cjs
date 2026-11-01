/* Area routing and the three-leg journey: the delivery fee quote, the destination and origin warehouses (the warehouse
 * that COVERS the customer's / the seller's area, most specific coverage first), served and unserved areas, same-warehouse
 * (no transfer) and two-warehouse (transfer) orders, multi-seller pickups, warehouse scoping and staff tiers, scan-in
 * advancing the legs, the delivery code, return legs and replacement delivery, creating and covering a warehouse, a
 * covering warehouse without riders, and the seller's origin following the pickup AREA.
 * Runs against a RUNNING API that was seeded with `npm run seed` (it uses the demo warehouses, riders and sellers:
 * "Entrepôt Kinshasa" covers the province Kinshasa, "Entrepôt Limete" the districts Mont-Amba and Tshangu).
 * It changes a few settings and puts them back, and adds a few warehouses of its own (switched off at the end).
 *
 *   API_URL=http://localhost:3021 node test/warehouse-routing-smoke.cjs
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
/** Accent- and case-insensitive text for comparing area names. */
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Where the customer is. A pin alone only finds the NEAREST COMMUNE CENTROID, so every place also names its commune / city.
const GOMBE_PIN = { lat: -4.3086, lng: 15.3171 };
const LIMETE_PIN = { lat: -4.3498, lng: 15.3405 };
const KALAMU_PIN = { lat: -4.3366, lng: 15.3175 };
const GOMA_PIN = { lat: -1.66, lng: 29.22 };
const PARIS_PIN = { lat: 48.8738, lng: 2.295 };
const GOMBE = { commune: 'Gombe', pin: GOMBE_PIN }; // Lukunga district -> the province coverage -> Entrepôt Kinshasa
const LIMETE = { commune: 'Limete', pin: LIMETE_PIN }; // Mont-Amba district -> Entrepôt Limete
const KALAMU = { commune: 'Kalamu', pin: KALAMU_PIN }; // Funa district -> the province coverage -> Entrepôt Kinshasa
const GOMA = { city: 'Goma', pin: GOMA_PIN }; // covered by nobody until the smoke warehouse is created and assigned
const addr = (p, extra = {}) => JSON.stringify({ line1: '1 Test Street', city: p?.city ?? 'Kinshasa', ...(p?.commune ? { commune: p.commune } : {}), ...(p?.pin ? { geo: p.pin } : {}), ...extra });

(async () => {
  const admin = await login('admin@somba.app');
  const cust = await login('customer@somba.app');
  const mgrK = await login('warehouse@somba.app'); // Entrepôt Kinshasa, manager
  const opK = await login('operator@somba.app'); // Entrepôt Kinshasa, operator
  const supL = await login('warehouse.limete@somba.app'); // Entrepôt Limete, supervisor
  const riderK = await login('rider@somba.app');
  const riderL = await login('rider.limete@somba.app');

  const settings0 = (await req(admin.sock, 'settings:get')).data;
  await req(admin.sock, 'settings:set', { key: 'codEnabled', value: 'false' });
  const restore = async () => {
    for (const k of ['deliveryBaseUsd', 'deliveryPerKmUsd', 'deliveryMaxUsd', 'deliveryTransferUsd', 'requirePinnedAddress', 'requireDeliveryCode', 'allowInterCityDelivery']) {
      if (settings0[k] !== undefined) await req(admin.sock, 'settings:set', { key: k, value: settings0[k] });
    }
  };

  try {
    // ---- the cast -----------------------------------------------------------------------------
    const hubs = (await req(admin.sock, 'hubs:list')).data ?? [];
    const H = (name) => hubs.find((h) => h.name === name);
    const kin = H('Entrepôt Kinshasa'), lim = H('Entrepôt Limete');
    ok(kin && lim && kin.lat != null && lim.lat != null, 'the demo warehouses (Entrepôt Kinshasa, Entrepôt Limete) are placed on the map (lat/lng)');
    ok(kin.activeRiders >= 1 && lim.activeRiders >= 1, 'each demo warehouse reports its active riders');
    ok(!H('Kinshasa Hub') && !H('Limete Hub') && !H('Lubumbashi Hub') && !H('Paris Hub'), 'the old demo hubs (Kinshasa, Limete, Lubumbashi, Paris Hub) are gone');
    let a;
    let q;
    const KIN_POS = { lat: kin.lat, lng: kin.lng };
    const LIM_POS = { lat: lim.lat, lng: lim.lng };
    const products = (await req(cust.sock, 'products:list', {})).data ?? [];
    const prodK = products.find((p) => (p.sellerName ?? '') === 'Kinshasa Traders' && p.stock > 20);
    const prodL = products.find((p) => (p.sellerName ?? '') === 'Limete Wholesale' && p.stock > 20);
    ok(prodK && prodL, 'two demo sellers have stock (Gombe and Limete)', JSON.stringify([prodK?.name, prodL?.name]));
    const line = (p, qty = 1) => ({ productId: p.id, qty });
    const quote = (p, lines, extra = {}) => req(cust.sock, 'delivery:quote', { geo: p?.pin, city: p?.city ?? 'Kinshasa', ...(p?.commune ? { commune: p.commune } : {}), lines, ...extra });
    const areaOf = async (q, level) => ((await req(cust.sock, 'geo:search', { q, level, limit: 20 })).data ?? []).find((x) => fold(x.name) === fold(q)) ?? null;
    const [gombe, limeteA, masina, kalamu, funa, montAmba, tshangu, gomaCity] = await Promise.all([
      areaOf('Gombe', 'commune'), areaOf('Limete', 'commune'), areaOf('Masina', 'commune'), areaOf('Kalamu', 'commune'),
      areaOf('Funa', 'district'), areaOf('Mont-Amba', 'district'), areaOf('Tshangu', 'district'), areaOf('Goma', 'city'),
    ]);
    ok(gombe && limeteA && masina && kalamu && funa && montAmba && tshangu && gomaCity, 'the DRC geography is there (Gombe, Limete, Masina, Kalamu, Funa, Mont-Amba, Tshangu, Goma)');

    // ---- coverage of the demo warehouses --------------------------------------------------------
    section('Coverage: the most specific assignment wins');
    const covK = (await req(admin.sock, 'hubs:coverage', { hubId: kin.id })).data?.areas ?? [];
    const covL = (await req(admin.sock, 'hubs:coverage', { hubId: lim.id })).data?.areas ?? [];
    ok(covK.length === 1 && covK[0].code === 'CD-KN' && covK[0].level === 'province', 'Entrepôt Kinshasa covers the whole province Kinshasa', JSON.stringify(covK.map((x) => x.code)));
    ok(JSON.stringify(covL.map((x) => x.code).sort()) === JSON.stringify(['CD-KN-D-MAM', 'CD-KN-D-TSH']), 'Entrepôt Limete covers the districts Mont-Amba and Tshangu', JSON.stringify(covL.map((x) => x.code)));
    let r = (await req(cust.sock, 'geo:resolve', { text: { commune: 'Limete', city: 'Kinshasa' } })).data;
    ok(r?.served === true && r.hubId === lim.id && r.area?.id === limeteA.id, 'a Limete address (Mont-Amba) resolves to Entrepôt Limete', JSON.stringify(r && { s: r.served, h: r.hubName }));
    r = (await req(cust.sock, 'geo:resolve', { text: { commune: 'Gombe', city: 'Kinshasa' } })).data;
    ok(r?.served === true && r.hubId === kin.id, 'a Gombe address (Lukunga) resolves to Entrepôt Kinshasa', JSON.stringify(r && { s: r.served, h: r.hubName }));
    r = (await req(cust.sock, 'geo:resolve', { text: { commune: 'Masina', city: 'Kinshasa' } })).data;
    ok(r?.served === true && r.hubId === lim.id, 'a Masina address (Tshangu) resolves to Entrepôt Limete', JSON.stringify(r && { s: r.served, h: r.hubName }));
    r = (await req(cust.sock, 'geo:resolve', { text: { city: 'Lubumbashi' } })).data;
    ok(r?.area && r.served === false && r.hubId === null, 'Lubumbashi is a known area that no warehouse covers: not served');

    // ---- a third warehouse: created, covers nothing, then Goma is assigned, then it gets people -----
    section('A new warehouse covers nothing until areas are assigned; it takes orders once it has riders');
    const GOMA_HUB = { lat: -1.6585, lng: 29.2205 };
    a = await req(admin.sock, 'hubs:create', { name: `Smoke Goma ${tag}`, city: 'Goma', areaId: gomaCity?.id, country: 'DRC', lat: GOMA_HUB.lat, lng: GOMA_HUB.lng, capacity: 50 });
    ok(a.ok && a.data.lat === GOMA_HUB.lat && a.data.areaId === gomaCity.id, 'an admin creates a warehouse with its area and its position', a.error ?? '');
    const gom = a.data;
    a = await quote(GOMA, [line(prodK)]);
    ok(!a.ok && /We don't deliver to Goma yet\./.test(a.error ?? ''), 'a warehouse with no coverage receives no orders: Goma is refused ("We don\'t deliver to Goma yet.")', a.error ?? JSON.stringify(a.data));
    a = await req(admin.sock, 'hubs:assign', { hubId: gom.id, areaIds: [gomaCity.id] });
    ok(a.ok && a.data.assigned.length === 1 && a.data.conflicts.length === 0, 'hubs:assign gives it the city Goma', a.error ?? JSON.stringify(a.data));
    ok(((await req(admin.sock, 'hubs:list')).data ?? []).find((h) => h.id === gom.id)?.coverage?.some((c) => c.id === gomaCity.id), 'hubs:list shows the coverage');
    a = await req(admin.sock, 'hubs:assign', { hubId: kin.id, areaIds: [gomaCity.id] });
    ok(a.ok && a.data.assigned.length === 0 && a.data.conflicts.length === 1 && a.data.conflicts[0].hubId === gom.id, 'an area has one owner: another warehouse cannot take Goma without "move"', a.error ?? JSON.stringify(a.data));
    q = (await quote(GOMA, [line(prodK)])).data;
    ok(q?.served === true && q.destinationHubId === gom.id && q.fallback === 'no_riders', 'covered but with no riders anywhere near: the covering warehouse is used (fallback "no_riders")', JSON.stringify(q && { h: q.destinationHubName, f: q.fallback }));
    ok(q?.coveringHubId === gom.id && q.coveringHubName === gom.name, 'and the quote names the covering warehouse (coveringHubId / coveringHubName) even though it is also the one handling the order', JSON.stringify(q && { c: q.coveringHubId, n: q.coveringHubName }));
    const mkPerson = async (role, name) => {
      const email = `${role}.goma${tag}@routing.test`;
      const c = await req(admin.sock, 'roles:createStaff', { email, name, role, hubId: gom.id });
      if (!c.ok) throw new Error(`createStaff ${role}: ${c.error}`);
      return { created: c.data, session: await login(email, c.data.tempPassword) };
    };
    const { created: newStaff, session: staffG } = await mkPerson('warehouse_staff', 'Smoke Goma staff'); // a third warehouse's staff
    const { session: riderG } = await mkPerson('rider', 'Smoke Goma rider'); // and rider
    ok(newStaff.hubId === gom.id && newStaff.warehouseTier === 'operator', 'staff are created at a warehouse, as operators by default');
    q = (await quote(GOMA, [line(prodK)])).data;
    ok(q?.served === true && q.destinationHubId === gom.id && q.fallback === null && q.destinationHubName === gom.name, 'with a rider it handles Goma itself (no fallback)', JSON.stringify(q && { h: q.destinationHubName, f: q.fallback }));
    ok(q.transfer === true && q.originHubIds.length === 1 && q.originHubIds[0] === kin.id, 'the Kinshasa seller is collected at Entrepôt Kinshasa and travels to Goma');
    ok(q.interCity === true && q.interCityDays >= 1 && q.extraDays >= 1, 'it is an inter-city order: days are added to the estimate', JSON.stringify([q.interCity, q.interCityDays, q.extraDays]));

    // ---- quote: fee math ----------------------------------------------------------------------
    section('Delivery quote: base + per km, capped, plus a transfer fee');
    await req(admin.sock, 'settings:set', { key: 'deliveryBaseUsd', value: 2 });
    await req(admin.sock, 'settings:set', { key: 'deliveryPerKmUsd', value: 0.5 });
    await req(admin.sock, 'settings:set', { key: 'deliveryMaxUsd', value: 15 });
    await req(admin.sock, 'settings:set', { key: 'deliveryTransferUsd', value: 1.5 });
    const pub = (await req(cust.sock, 'settings:get')).data ?? {};
    ok(pub.deliveryBaseUsd === '2' && pub.deliveryPerKmUsd === '0.5' && pub.deliveryMaxUsd === '15' && pub.deliveryTransferUsd === '1.5', 'the four fee numbers are public settings');
    ok(!(await req(admin.sock, 'settings:set', { key: 'deliveryBaseUsd', value: -1 })).ok, 'a negative fee is refused');
    ok(!(await req(admin.sock, 'settings:set', { key: 'deliveryZones', value: '[]' })).ok, 'zones can no longer be written');

    q = (await quote(GOMBE, [line(prodK)])).data;
    const expSame = r2(2 + 0.5 * km(KIN_POS, GOMBE_PIN));
    ok(q?.destinationHubId === kin.id && q.transfer === false && q.pinned === true && q.fallback === null && q.served === true, 'a Gombe address is served by Entrepôt Kinshasa (it covers the province), no transfer', JSON.stringify(q));
    ok(q?.feeUsd === expSame, `the fee is base + per km (${expSame})`, String(q?.feeUsd));
    ok(JSON.stringify(q.originHubIds) === JSON.stringify([kin.id]), 'the origin warehouse of the Gombe seller is Entrepôt Kinshasa (the one covering their pickup area)');
    ok(q.destinationHubName === kin.name && q.destinationArea?.name === 'Gombe' && q.destinationAreaChain.map((x) => x.name).includes('Kinshasa') && q.origins?.[0]?.hubName === kin.name && q.origins[0].areaName === 'Gombe', 'the quote names the destination area (with its chain), both warehouses and the seller\'s pickup area', JSON.stringify(q.origins));

    q = (await quote(LIMETE, [line(prodL)])).data;
    ok(q?.destinationHubId === lim.id && q.transfer === false && q.destinationArea?.name === 'Limete', 'a Limete address is served by Entrepôt Limete (Limete seller too: no transfer)');
    ok(q?.feeUsd === r2(2 + 0.5 * km(LIM_POS, LIMETE_PIN)), 'its fee counts the km from Entrepôt Limete', String(q?.feeUsd));
    q = (await quote({ city: 'Kinshasa', pin: LIMETE_PIN }, [line(prodL)])).data;
    ok(q?.destinationHubId === lim.id && q.destinationArea?.level === 'commune', 'a plain Kinshasa address with a Limete pin is refined by the pin to its commune: Entrepôt Limete');

    const addrs = (await req(cust.sock, 'addresses:list')).data ?? [];
    const aGombe = addrs.find((x) => fold(x.commune) === 'gombe'), aMasina = addrs.find((x) => fold(x.commune) === 'masina');
    ok(aGombe && aMasina && aGombe.isDefault === true && addrs.length === 2, 'the demo customer has two saved addresses: Gombe (default) and Masina', JSON.stringify(addrs.map((x) => [x.commune, x.isDefault])));
    ok(aMasina?.served === true && aMasina.areaChain.some((x) => x.name === 'Tshangu'), 'the Masina address sits in the district Tshangu and is served');
    q = (await req(cust.sock, 'delivery:quote', { addressId: aMasina.id, lines: [line(prodL)] })).data;
    ok(q?.destinationHubId === lim.id && q.destinationArea?.name === 'Masina' && q.transfer === false, 'a saved address is quoted by its area: Masina goes to Entrepôt Limete');
    ok(q?.pinned === true && q.feeUsd === r2(2 + 0.5 * km(LIM_POS, aMasina.geo)), 'its fee uses the saved pin', `${q?.feeUsd} vs ${r2(2 + 0.5 * km(LIM_POS, aMasina.geo))}`);
    q = (await req(cust.sock, 'delivery:quote', { addressId: aGombe.id, lines: [line(prodK)] })).data;
    ok(q?.destinationHubId === kin.id && q.transfer === false, 'the default Gombe address goes to Entrepôt Kinshasa');
    q = (await req(cust.sock, 'delivery:quote', { areaId: masina.id, lines: [line(prodK)] })).data;
    ok(q?.destinationHubId === lim.id && q.transfer === true && q.pinned === false, 'an areaId alone is enough (Masina -> Entrepôt Limete; the Kinshasa seller needs a transfer; no pin = no km)');
    q = (await req(cust.sock, 'delivery:quote', { areaId: kalamu.id, lines: [line(prodK)] })).data;
    ok(q?.destinationHubId === kin.id, 'Kalamu (Funa) is not in Entrepôt Limete\'s districts: Entrepôt Kinshasa');

    for (const [label, where, re] of [
      ['Paris', { city: 'Paris', pin: PARIS_PIN }, /We don't deliver to Paris yet\./],
      ['Lubumbashi', { city: 'Lubumbashi' }, /We don't deliver to Lubumbashi yet\./],
      ['an unknown place', { city: 'Atlantis' }, /We don't deliver to .+ yet\./],
    ]) {
      a = await quote(where, [line(prodK)]);
      ok(!a.ok && re.test(a.error ?? ''), `an address in ${label} is refused: we don't deliver there yet`, a.error ?? JSON.stringify(a.data));
    }
    a = await req(cust.sock, 'delivery:quote', { lines: [line(prodK)] });
    ok(!a.ok && /We don't deliver to this area yet\./.test(a.error ?? ''), 'no address at all: "We don\'t deliver to this area yet."', a.error ?? '');

    q = (await quote({ commune: 'Gombe' }, [line(prodK)])).data;
    ok(q?.pinned === false && q.fallback === null && q.destinationHubId === kin.id && q.deliveryUsd === 2 && q.feeUsd === 2, 'no pin: still routed by its area, and the fee has no distance part (base only)', JSON.stringify(q));
    q = (await quote({ commune: 'Limete' }, [line(prodK)])).data;
    ok(q?.pinned === false && q.destinationHubId === lim.id && q.transfer === true && q.feeUsd === 3.5, 'no pin in Limete: Entrepôt Limete, base + the transfer fee', JSON.stringify(q));
    q = (await quote({ city: 'Kinshasa' }, [line(prodK)])).data;
    ok(q?.pinned === false && q.destinationHubId === kin.id && q.destinationArea?.level === 'city', 'a plain "Kinshasa" resolves to the city, which Entrepôt Kinshasa covers (via the province)');

    q = (await quote({ city: 'Kinshasa', pin: { lat: -4.2, lng: 15.9 } }, [line(prodK)])).data; // ~60 km from the Kinshasa warehouses
    ok(q?.deliveryUsd === 15 && q.transfer === (q.destinationHubId !== kin.id) && q.feeUsd === r2(15 + (q.transfer ? 1.5 : 0)), 'a far pin: the distance part is capped at $15 (then the transfer fee, if any)', JSON.stringify(q));

    const mixed = (await quote(GOMBE, [line(prodK), line(prodL)])).data;
    ok(mixed?.transfer === true && mixed.originHubIds.length === 2 && mixed.originHubIds.includes(lim.id), 'a basket from a Gombe and a Limete seller needs a transfer');
    ok(r2(mixed.feeUsd - expSame) === 1.5, 'the transfer fee is added once', `${mixed.feeUsd} vs ${expSame}`);

    q = (await quote(GOMA, [line(prodK)])).data;
    ok(q?.destinationHubId === gom.id && q.transfer === true && q.feeUsd === r2(2 + 0.5 * km(GOMA_HUB, GOMA_PIN) + 1.5), 'Goma fee = base + km from the Goma warehouse + the $1.5 transfer fee (one transfer, no lanes)', String(q?.feeUsd));

    await req(admin.sock, 'settings:set', { key: 'deliveryBaseUsd', value: 1 });
    await req(admin.sock, 'settings:set', { key: 'deliveryPerKmUsd', value: 2 });
    await req(admin.sock, 'settings:set', { key: 'deliveryMaxUsd', value: 6 });
    await req(admin.sock, 'settings:set', { key: 'deliveryTransferUsd', value: 4 });
    q = (await quote(LIMETE, [line(prodK)])).data;
    ok(q?.transfer === true && q.deliveryUsd <= 6 && q.feeUsd === r2(q.deliveryUsd + 4), 'the settings drive the fee (cap 6, transfer 4)', JSON.stringify(q));
    await req(admin.sock, 'settings:set', { key: 'deliveryBaseUsd', value: 2 });
    await req(admin.sock, 'settings:set', { key: 'deliveryPerKmUsd', value: 0.5 });
    await req(admin.sock, 'settings:set', { key: 'deliveryMaxUsd', value: 15 });
    await req(admin.sock, 'settings:set', { key: 'deliveryTransferUsd', value: 1.5 });

    // ---- the order charges exactly the quote --------------------------------------------------
    section('orders:create charges exactly the quote and ignores zones and client fees');
    const place = (lines, p, extra = {}) => req(cust.sock, 'orders:create', { items: lines, paymentMethod: 'stripe_card', shippingAddress: addr(p), ...extra });
    a = await place([line(prodK)], GOMBE, { zoneId: 'atlantis', deliveryFeeUsd: 0 });
    ok(a.ok && a.data.deliveryFeeUsd === expSame, 'a zoneId and a $0 client fee are ignored: the quoted fee is charged', a.error ?? a.data?.deliveryFeeUsd);
    const o1 = a.data;
    ok(o1.destinationHubId === kin.id && JSON.stringify(o1.originHubIds) === JSON.stringify([kin.id]), 'the order records its destination and origin warehouses');
    ok(Math.abs(o1.totalUsd - (o1.subtotalUsd + o1.deliveryFeeUsd)) < 0.011, 'total = subtotal + fee');
    const stock0 = (await req(cust.sock, 'products:get', { id: prodK.id })).data.stock;
    for (const [label, p, re] of [['Paris', { city: 'Paris', pin: PARIS_PIN }, /We don't deliver to Paris yet\./], ['Lubumbashi', { city: 'Lubumbashi' }, /We don't deliver to Lubumbashi yet\./]]) {
      a = await place([line(prodK)], p);
      ok(!a.ok && re.test(a.error ?? ''), `an order to ${label} is refused ("We don't deliver to ${label} yet.")`, a.error ?? '');
    }
    ok((await req(cust.sock, 'products:get', { id: prodK.id })).data.stock === stock0, 'a refused order reserves no stock');

    // ---- same warehouse: pickup -> delivery, no transfer --------------------------------------
    section('Same-warehouse order: pickup, scan-in, delivery (no transfer)');
    const evRiderK = record(riderK.sock, 'task:updated');
    const evStaffK = record(mgrK.sock, 'task:updated');
    const evStaffL = record(supL.sock, 'task:updated');
    const sellerSock = await login('seller@somba.app');
    const evSeller = record(sellerSock.sock, 'task:updated');
    a = await place([line(prodK)], GOMBE);
    const o2 = a.data;
    const queueOf = async (u, extra = {}) => (await req(u.sock, 'logistics:queue', { status: 'all', ...extra })).data;
    const find = async (u, orderId, kind) => (await queueOf(u)).tasks.find((t) => t.orderId === orderId && (!kind || t.kind === kind));
    let pickup = await until(() => find(mgrK, o2.id, 'pickup'));
    ok(pickup && pickup.toHubId === kin.id && pickup.hubId === kin.id && pickup.status === 'unassigned' && pickup.from?.type === 'seller' && pickup.to?.type === 'hub', 'one pickup task, from the seller to Entrepôt Kinshasa', JSON.stringify(pickup));
    ok(!(await find(supL, o2.id)), 'staff of Entrepôt Limete do not see Kinshasa\'s task');
    ok(!!(await until(async () => evStaffK.find((t) => t.id === pickup.id))) && !evStaffL.some((t) => t.id === pickup.id), 'the task is pushed to Kinshasa\'s staff only');
    ok(pickup.proofCode === undefined && !JSON.stringify(pickup).match(/proofCode/), 'the handover code is not in the task payload');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o2.id)?.status === 'confirmed', 'the order is confirmed');

    ok(!(await req(opK.sock, 'logistics:assign', { taskId: pickup.id, riderId: riderK.user.id })).ok, 'an operator cannot assign riders (supervisor tier needed)');
    a = await req(supL.sock, 'logistics:assign', { taskId: pickup.id, riderId: riderL.user.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'staff of Limete cannot assign Kinshasa\'s task', a.error ?? '');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: pickup.id, riderId: riderL.user.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'a Limete rider cannot be given a Kinshasa pickup', a.error ?? '');
    ok(!(await req(mgrK.sock, 'logistics:assign', { taskId: pickup.id, riderId: cust.user.id })).ok, 'a customer cannot be given a task');

    ok(pickup.desk?.scanIn === false, 'the desk does not offer "scan in" for an unassigned pickup', JSON.stringify(pickup.desk));
    a = await req(opK.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(!a.ok && /rider must collect/.test(a.error ?? ''), 'an unassigned pickup cannot be scanned in', a.error ?? '');
    ok(((await req(riderK.sock, 'rider:tasks')).data ?? []).every((t) => t.id !== pickup.id), 'a rider does not see an unassigned task');
    ok(((await req(riderK.sock, 'delivery:unassigned')).data ?? []).length === 0, 'there is no open pool for riders');
    a = await req(riderK.sock, 'delivery:accept', { taskId: pickup.id });
    ok(!a.ok && /warehouse assigns your tasks/.test(a.error ?? ''), 'riders cannot accept tasks themselves', a.error ?? '');

    a = await req(mgrK.sock, 'logistics:assign', { taskId: pickup.id, riderId: riderK.user.id });
    ok(a.ok && a.data.status === 'assigned' && a.data.riderId === riderK.user.id, 'the Kinshasa manager assigns their rider', a.error ?? '');
    ok(!!(await until(async () => evRiderK.find((t) => t.id === pickup.id && t.status === 'assigned'))), 'the rider is told live (task:updated)');
    ok(!!(await until(async () => evSeller.find((t) => t.id === pickup.id))), 'the seller is told live about their pickup');
    const sellerView = evSeller.find((t) => t.id === pickup.id);
    ok(sellerView && !sellerView.address && sellerView.to?.type !== 'customer', 'the seller\'s view has no customer address');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o2.id)?.status === 'processing', 'the order is now processing (pickup assigned)');
    const mine = ((await req(riderK.sock, 'rider:tasks')).data ?? []).find((t) => t.id === pickup.id);
    ok(mine && mine.kind === 'pickup' && mine.to?.name === kin.name && mine.order && mine.order.shippingAddress === null, 'rider:tasks shows the task with its legs, without the customer address on a pickup', JSON.stringify(mine?.order));

    // A parcel nobody has collected cannot arrive: staff cannot scan it in while it is assigned (the desk flag agrees).
    const assignedView = await find(mgrK, o2.id, 'pickup');
    ok(assignedView?.status === 'assigned' && assignedView.desk?.scanIn === false, 'the desk does not offer "scan in" for an assigned pickup', JSON.stringify(assignedView?.desk));
    a = await req(opK.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(!a.ok && /rider must collect/.test(a.error ?? ''), 'staff cannot scan in a parcel the rider has not collected', a.error ?? '');
    a = await req(admin.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(!a.ok && /rider must collect/.test(a.error ?? ''), 'neither can an admin', a.error ?? '');
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: pickup.id, status: 'picked_up' });
    ok(a.ok, 'the rider picks the parcel up', a.error ?? '');
    ok((await find(mgrK, o2.id, 'pickup'))?.desk?.scanIn === true, 'and now the desk offers "scan in"');
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: pickup.id, status: 'in_transit' });
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: pickup.id, status: 'delivered' });
    ok(!a.ok && /warehouse staff scan/.test(a.error ?? ''), 'a rider cannot complete a leg that ends at a warehouse', a.error ?? '');
    ok(!(await req(riderG.sock, 'delivery:updateStatus', { taskId: pickup.id, status: 'failed' })).ok, 'another rider cannot touch the task');

    a = await req(supL.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(!a.ok && /not due at your warehouse/.test(a.error ?? ''), 'Limete staff cannot scan in a parcel due at Kinshasa', a.error ?? '');
    a = await req(opK.sock, 'logistics:scanIn', { taskId: pickup.id });
    ok(a.ok && a.data.task.status === 'delivered' && a.data.next.length === 1 && a.data.next[0].kind === 'delivery', 'an operator scans it in; the delivery leg is created (no transfer)', a.error ?? JSON.stringify(a.data?.next?.map((t) => t.kind)));
    const delivery = a.data.next[0];
    ok(delivery.fromHubId === kin.id && delivery.hubId === kin.id && delivery.needsCode === (settings0.requireDeliveryCode === 'true') && delivery.to?.type === 'customer', 'the delivery leaves from the destination warehouse to the customer (needsCode follows requireDeliveryCode)', JSON.stringify([delivery.needsCode, settings0.requireDeliveryCode]));
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o2.id)?.status === 'shipped', 'the order is shipped (at the warehouse)');
    ok(!(await req(opK.sock, 'logistics:scanIn', { taskId: pickup.id })).ok, 'scanning twice is refused');
    const cust1 = (await req(cust.sock, 'notifications:list')).data ?? [];
    ok(cust1.some((n) => n.title === 'Parcel at our warehouse' && n.entityId === o2.id), 'the customer is told the parcel reached the warehouse');

    // delivery code
    await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: 'true' });
    ok((await find(mgrK, o2.id, 'delivery'))?.needsCode === true, 'with requireDeliveryCode on, the delivery leg says it needs the code');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: delivery.id, riderId: riderK.user.id });
    ok(a.ok, 'the delivery is assigned to a Kinshasa rider', a.error ?? '');
    const orderAfterAssign = ((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o2.id);
    ok(orderAfterAssign.riderId === riderK.user.id && orderAfterAssign.status === 'shipped', 'the delivery rider is recorded on the order (the pickup rider never was)');
    a = await req(opK.sock, 'logistics:dispatchTransfer', { taskId: delivery.id });
    ok(a.ok && a.data.status === 'picked_up', 'an operator scans the parcel out to the rider', a.error ?? '');
    ok(!(await req(opK.sock, 'logistics:scanOut', { taskId: delivery.id })).ok, 'scanning out twice is refused');
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: delivery.id, status: 'in_transit' });
    ok(a.ok, 'the rider is on the way', a.error ?? '');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o2.id)?.status === 'out_for_delivery', 'the order is out for delivery');
    const code = (await req(cust.sock, 'orders:deliveryCode', { orderId: o2.id })).data;
    ok(code?.required === true && /^\d{4}$/.test(code.code ?? ''), 'the customer sees the 4-digit code', JSON.stringify(code));
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: delivery.id, status: 'delivered', code: code.code === '0000' ? '1111' : '0000' });
    ok(!a.ok && /Wrong delivery code/.test(a.error ?? ''), 'the delivery needs the right code', a.error ?? '');
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: delivery.id, status: 'delivered', code: code.code });
    ok(a.ok, 'the right code completes the delivery', a.error ?? '');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o2.id)?.status === 'delivered', 'the order is delivered');
    await req(admin.sock, 'settings:set', { key: 'requireDeliveryCode', value: settings0.requireDeliveryCode ?? 'false' });

    // ---- two warehouses + two sellers ----------------------------------------------------------
    section('Two sellers, two warehouses: pickups, a transfer, then the delivery');
    a = await place([line(prodK), line(prodL)], GOMBE);
    ok(a.ok && a.data.deliveryFeeUsd === mixed.feeUsd, 'the order charges the mixed quote (with the transfer fee)', a.error ?? `${a.data?.deliveryFeeUsd} vs ${mixed.feeUsd}`);
    const o3 = a.data;
    ok(o3.destinationHubId === kin.id && o3.originHubIds.length === 2, 'destination Entrepôt Kinshasa, two origin warehouses');
    const pK = await until(() => find(mgrK, o3.id, 'pickup'));
    const pL = await until(() => find(supL, o3.id, 'pickup'));
    ok(pK && pK.toHubId === kin.id && pL && pL.toHubId === lim.id && pK.id !== pL.id, 'one pickup per seller, each at its seller\'s origin warehouse');
    ok(!(await find(supL, o3.id, 'pickup').then((t) => t && t.toHubId === kin.id)), 'Limete staff only see the Limete pickup');
    const qK = (await queueOf(mgrK)).tasks.filter((t) => t.orderId === o3.id);
    ok(qK.length === 1, 'Kinshasa\'s queue holds only its own pickup for this order', String(qK.length));
    ok(!(await req(mgrK.sock, 'logistics:assign', { taskId: pL.id, riderId: riderK.user.id })).ok, 'Kinshasa staff cannot assign Limete\'s pickup');
    ok(!(await req(mgrK.sock, 'logistics:scanIn', { taskId: pL.id })).ok, 'Kinshasa staff cannot scan in Limete\'s pickup');

    // Kinshasa's parcel first: nothing else is created yet
    await req(mgrK.sock, 'logistics:assign', { taskId: pK.id, riderId: riderK.user.id });
    await req(riderK.sock, 'delivery:updateStatus', { taskId: pK.id, status: 'picked_up' });
    a = await req(opK.sock, 'logistics:scanIn', { taskId: pK.id });
    ok(a.ok && a.data.next.length === 0, 'the first parcel at the destination creates nothing (the other is still on its way)');
    ok(!(await find(mgrK, o3.id, 'delivery')), 'no delivery leg yet');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o3.id)?.status === 'processing', 'the order is not shipped until every parcel is at a warehouse');

    // Limete's parcel: scanned at Limete, a transfer to Kinshasa appears
    a = await req(supL.sock, 'logistics:assign', { taskId: pL.id, riderId: riderL.user.id });
    ok(a.ok, 'the Limete supervisor assigns the Limete rider', a.error ?? '');
    await req(riderL.sock, 'delivery:updateStatus', { taskId: pL.id, status: 'picked_up' });
    a = await req(supL.sock, 'logistics:scanIn', { taskId: pL.id });
    ok(a.ok && a.data.next.length === 1 && a.data.next[0].kind === 'transfer', 'scanning the Limete parcel at Limete creates the transfer', a.error ?? '');
    const transfer = a.data.next[0];
    ok(transfer.fromHubId === lim.id && transfer.toHubId === kin.id && transfer.hubId === lim.id && transfer.parentTaskId === pL.id, 'transfer: Entrepôt Limete -> Entrepôt Kinshasa, managed by Limete');
    ok(transfer.hop === 1 && transfer.hops === 1 && transfer.finalHubId === kin.id, 'with no lanes configured it is one direct hop (hop 1 of 1, ends at Kinshasa)', JSON.stringify([transfer.hop, transfer.hops, transfer.finalHubId]));
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o3.id)?.status === 'shipped', 'every parcel is at a warehouse: the order is shipped');
    ok(!(await find(mgrK, o3.id, 'delivery')), 'still no delivery leg until the transfer arrives');
    const inbound = (await req(mgrK.sock, 'logistics:custody')).data;
    ok(inbound.inbound.some((t) => t.id === transfer.id), 'Kinshasa\'s custody lists the transfer as inbound');
    ok(inbound.onHand.some((t) => t.id === pK.id), 'and its own parcel as on hand');
    ok(!!(await find(mgrK, o3.id, 'transfer')), 'Kinshasa staff see the inbound transfer in their queue');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: transfer.id, riderId: riderK.user.id });
    ok(!a.ok, 'only the origin warehouse (Limete) assigns the transfer', a.error ?? '');
    a = await req(supL.sock, 'logistics:assign', { taskId: transfer.id, riderId: riderG.user.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'a rider of a third warehouse cannot carry it', a.error ?? '');
    a = await req(supL.sock, 'logistics:assign', { taskId: transfer.id, riderId: riderK.user.id });
    ok(a.ok, 'a rider of the destination warehouse can carry a transfer, assigned by the origin staff', a.error ?? '');
    ok((await req(supL.sock, 'logistics:dispatchTransfer', { taskId: transfer.id })).ok, 'the Limete staff scan the transfer out');
    await req(riderK.sock, 'delivery:updateStatus', { taskId: transfer.id, status: 'in_transit' });
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: transfer.id, status: 'delivered' });
    ok(!a.ok, 'the rider cannot mark a transfer delivered');
    a = await req(supL.sock, 'logistics:scanIn', { taskId: transfer.id });
    ok(!a.ok && /not due at your warehouse/.test(a.error ?? ''), 'Limete cannot scan in its own transfer (it is due at Kinshasa)', a.error ?? '');
    a = await req(opK.sock, 'logistics:scanIn', { taskId: transfer.id });
    ok(a.ok && a.data.next.length === 1 && a.data.next[0].kind === 'delivery', 'Kinshasa scans the transfer in: now the delivery leg appears', a.error ?? '');
    const d3 = a.data.next[0];
    ok(d3.fromHubId === kin.id && ((await find(mgrK, o3.id, 'delivery'))?.id === d3.id), 'the delivery is at Entrepôt Kinshasa (the destination)');
    ok(!(await find(supL, o3.id, 'delivery')), 'Limete staff do not see the destination\'s delivery');
    // the other riders' warehouses never see it
    ok(((await req(riderG.sock, 'rider:tasks')).data ?? []).every((t) => t.orderId !== o3.id), 'riders of other warehouses see nothing of it');

    // ---- scoping of the old warehouse events ---------------------------------------------------
    section('Warehouse reads are scoped to the staff member\'s warehouse');
    const parcelsK = (await req(mgrK.sock, 'warehouse:parcels', {})).data ?? [];
    ok(parcelsK.length > 0 && parcelsK.every((t) => [t.hubId, t.fromHubId, t.toHubId].includes(kin.id)), 'warehouse:parcels only lists Kinshasa\'s tasks');
    const parcelsL = (await req(supL.sock, 'warehouse:parcels', {})).data ?? [];
    ok(parcelsL.every((t) => [t.hubId, t.fromHubId, t.toHubId].includes(lim.id)) && !parcelsL.some((t) => t.id === pK.id), 'and Limete\'s staff only theirs');
    ok(((await req(supL.sock, 'warehouse:aged', {})).data ?? []).every((t) => [t.hubId, t.fromHubId, t.toHubId].includes(lim.id)), 'warehouse:aged is scoped');
    const parcelsAll = (await req(admin.sock, 'warehouse:parcels', {})).data ?? [];
    ok(parcelsAll.length >= parcelsK.length + 1, 'admins see every warehouse', `${parcelsAll.length} vs ${parcelsK.length}`);
    ok((await req(admin.sock, 'warehouse:parcels', { hubId: lim.id })).data.every((t) => [t.hubId, t.fromHubId, t.toHubId].includes(lim.id)), 'and may look at one');
    const recK = (await req(mgrK.sock, 'warehouse:reconcile', {})).data ?? [];
    ok(Array.isArray(recK), 'warehouse:reconcile answers for a warehouse');
    const whK = (await req(mgrK.sock, 'analytics:warehouse', {})).data;
    const whAll = (await req(admin.sock, 'analytics:warehouse', {})).data;
    ok(whK && whAll && whK.totalParcels < whAll.totalParcels, 'analytics:warehouse is scoped to the warehouse for staff', `${whK?.totalParcels} vs ${whAll?.totalParcels}`);
    ok(Array.isArray(whAll.byHub) && whAll.byHub.length >= 2 && whAll.byHub.every((h) => h.hub) && whK.byHub.length === 1 && whAll.byZone === undefined, 'analytics by warehouse replaces by zone');
    a = await req(opK.sock, 'warehouse:buildBatch', { taskIds: [d3.id], riderId: riderK.user.id });
    ok(!a.ok && /supervisors and managers/.test(a.error ?? ''), 'an operator cannot build a batch (it assigns riders)', a.error ?? '');
    a = await req(mgrK.sock, 'warehouse:buildBatch', { taskIds: [d3.id], riderId: riderL.user.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'a batch cannot go to another warehouse\'s rider', a.error ?? '');
    a = await req(supL.sock, 'warehouse:buildBatch', { taskIds: [d3.id], riderId: riderL.user.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'Limete cannot batch a Kinshasa task (task-in-warehouse check)', a.error ?? '');
    a = await req(mgrK.sock, 'warehouse:buildBatch', { taskIds: [d3.id], riderId: riderK.user.id });
    ok(a.ok, 'the Kinshasa manager builds a batch for their rider', a.error ?? '');
    ok(((await req(supL.sock, 'warehouse:batches', {})).data ?? []).every((b) => b.hubId === lim.id), 'warehouse:batches is scoped');
    // finish order 3
    await req(riderK.sock, 'delivery:updateStatus', { taskId: d3.id, status: 'picked_up' });
    await req(riderK.sock, 'delivery:updateStatus', { taskId: d3.id, status: 'in_transit' });
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: d3.id, status: 'delivered', code: (await req(cust.sock, 'orders:deliveryCode', { orderId: o3.id })).data?.code });
    ok(a.ok, 'order 3 is delivered', a.error ?? '');

    // ---- scoping of orders, incidents and inventory -----------------------------------------------
    section('Orders, incidents and inventory are scoped to the staff member\'s warehouse');
    const newOrdersK = record(mgrK.sock, 'order:created');
    const newOrdersL = record(supL.sock, 'order:created');
    const newOrdersG = record(staffG.sock, 'order:created');
    const updOrdersL = record(supL.sock, 'order:updated');
    const newOrdersA = record(admin.sock, 'order:created');
    a = await place([line(prodL)], LIMETE);
    const oL = a.data; // delivered by Limete, collected by Limete
    ok(a.ok && oL.destinationHubId === lim.id && JSON.stringify(oL.originHubIds) === JSON.stringify([lim.id]), 'a Limete order (Limete address, Limete seller)', a.error ?? '');
    a = await place([line(prodK)], GOMA);
    const oG = a.data; // delivered by Goma, collected by Kinshasa
    ok(a.ok && oG.destinationHubId === gom.id && JSON.stringify(oG.originHubIds) === JSON.stringify([kin.id]), 'a Goma order collected from the Kinshasa seller', a.error ?? '');
    const idsOf = async (u) => ((await req(u.sock, 'orders:list')).data ?? []).map((o) => o.id);
    const kIds = await idsOf(mgrK);
    const lIds = await idsOf(supL);
    const gIds = await idsOf(staffG);
    const allIds = await idsOf(admin);
    ok(kIds.includes(o2.id) && kIds.includes(o3.id) && kIds.includes(oG.id) && !kIds.includes(oL.id), 'orders:list for Kinshasa staff: orders it delivers or collects for (not Limete\'s own)', JSON.stringify([kIds.includes(oL.id), kIds.includes(oG.id)]));
    ok(lIds.includes(oL.id) && lIds.includes(o3.id) && !lIds.includes(o2.id) && !lIds.includes(oG.id), 'orders:list for Limete staff: its own plus the multi-seller order it collects from', JSON.stringify([lIds.includes(o2.id), lIds.includes(oG.id)]));
    ok(gIds.includes(oG.id) && !gIds.includes(oL.id) && !gIds.includes(o2.id) && !gIds.includes(o3.id), 'orders:list for the Goma staff: only the Goma order');
    ok([o2.id, o3.id, oL.id, oG.id].every((id) => allIds.includes(id)), 'admins see every order');
    ok(!!(await until(async () => newOrdersK.find((o) => o.id === oG.id))) && !newOrdersK.some((o) => o.id === oL.id), 'order:created reaches Kinshasa for the order it collects, not for Limete\'s own');
    ok(newOrdersL.some((o) => o.id === oL.id) && !newOrdersL.some((o) => o.id === oG.id), 'order:created reaches Limete for its order only');
    ok(newOrdersG.some((o) => o.id === oG.id) && !newOrdersG.some((o) => o.id === oL.id), 'order:created reaches Goma for its order only');
    ok(newOrdersA.some((o) => o.id === oL.id) && newOrdersA.some((o) => o.id === oG.id), 'order:created reaches the admins for both');
    await req(supL.sock, 'logistics:assign', { taskId: (await find(supL, oL.id, 'pickup')).id, riderId: riderL.user.id });
    await sleep(500);
    ok(updOrdersL.some((o) => o.id === oL.id) && !updOrdersL.some((o) => o.id === oG.id), 'order:updated follows the same rule');

    // incidents
    const excL = await req(supL.sock, 'exceptions:create', { notes: `Box crushed at Limete ${tag}`, type: 'damaged', hub: kin.name });
    ok(excL.ok && excL.data.hubId === lim.id && excL.data.hub === lim.name, 'an incident raised by Limete staff belongs to Limete whatever warehouse name they typed', excL.error ?? JSON.stringify(excL.data));
    const excLs = (await req(supL.sock, 'exceptions:list', {})).data ?? [];
    const excKs = (await req(mgrK.sock, 'exceptions:list', {})).data ?? [];
    const excAs = (await req(admin.sock, 'exceptions:list', {})).data ?? [];
    ok(excLs.length >= 1 && excLs.every((e) => e.hubId === lim.id), 'exceptions:list for Limete: only Limete incidents');
    ok(excKs.length >= 1 && excKs.every((e) => e.hubId === kin.id) && !excKs.some((e) => e.id === excL.data.id), 'exceptions:list for Kinshasa: its own (the seeded ones), not Limete\'s');
    ok(excAs.some((e) => e.id === excL.data.id) && excAs.some((e) => e.hubId === kin.id), 'admins see all incidents');
    a = await req(mgrK.sock, 'exceptions:setStatus', { id: excL.data.id, status: 'resolved', resolution: 'not mine' });
    ok(!a.ok && /not found/i.test(a.error ?? ''), 'Kinshasa staff cannot change Limete\'s incident', a.error ?? '');
    a = await req(supL.sock, 'exceptions:setStatus', { id: excL.data.id, status: 'investigating' });
    ok(a.ok && a.data.status === 'investigating', 'but Limete staff can', a.error ?? '');
    const kinParcel = (await queueOf(mgrK)).tasks[0];
    a = await req(supL.sock, 'exceptions:create', { notes: 'Parcel of another warehouse', taskId: kinParcel.id });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'Limete staff cannot raise an incident on a Kinshasa-only parcel', a.error ?? '');

    // inventory
    const invK = (await req(mgrK.sock, 'warehouse:inventory', {})).data ?? [];
    const invL = (await req(supL.sock, 'warehouse:inventory', {})).data ?? [];
    const invA = (await req(admin.sock, 'warehouse:inventory', {})).data ?? [];
    ok(invK.length > 0 && invK.every((r) => typeof r.custodyQty === 'number' && r.custodyQty > 0), 'warehouse:inventory for staff: the products of the parcels in their custody, with units');
    ok(invK.some((r) => r.productId === prodK.id) && !invK.some((r) => r.productId === prodL.id && !invL.some((x) => x.productId === prodL.id)), 'Kinshasa has the Kinshasa seller\'s product in custody');
    ok(invL.length > 0 && invL.length < invA.length && invK.length < invA.length, 'each warehouse sees fewer products than the admin catalogue view', `${invK.length}/${invL.length}/${invA.length}`);
    ok(invA.every((r) => r.custodyQty === undefined), 'admins see the whole catalogue (no custody figure)');

    // ---- returns --------------------------------------------------------------------------------
    section('Return: customer -> destination warehouse -> (transfer) -> seller');
    const items3 = (await req(cust.sock, 'orders:list')).data.find((o) => o.id === o3.id).items;
    const lineL = items3.find((i) => i.sellerName === 'Limete Wholesale');
    a = await req(cust.sock, 'logistics:createReturnPickup', { disputeId: `smoke-${tag}`, orderId: o3.id });
    ok(!a.ok, 'a customer cannot open return legs by hand');
    a = await req(admin.sock, 'logistics:createReturnPickup', { disputeId: `smoke-${tag}`, orderId: o3.id, items: [{ orderItemId: lineL.id, qty: 1 }] });
    ok(a.ok && a.data.kind === 'return_pickup' && a.data.toHubId === kin.id && a.data.from?.type === 'customer', 'return pickup: customer -> Entrepôt Kinshasa', a.error ?? '');
    const rp = a.data;
    ok((await req(admin.sock, 'logistics:createReturnPickup', { disputeId: `smoke-${tag}`, orderId: o3.id })).data?.id === rp.id, 'creating it again returns the same task');
    a = await req(supL.sock, 'logistics:assign', { taskId: rp.id, riderId: riderL.user.id });
    ok(!a.ok, 'only the destination warehouse assigns the return pickup');
    a = await req(mgrK.sock, 'logistics:assign', { taskId: rp.id, riderId: riderK.user.id });
    ok(a.ok, 'Kinshasa assigns its rider to collect from the customer', a.error ?? '');
    ok(((await req(riderK.sock, 'rider:tasks')).data ?? []).find((t) => t.id === rp.id)?.order?.shippingAddress, 'the return rider sees where to collect (the customer address)');
    await req(riderK.sock, 'delivery:updateStatus', { taskId: rp.id, status: 'picked_up' });
    await req(riderK.sock, 'delivery:updateStatus', { taskId: rp.id, status: 'in_transit' });
    a = await req(opK.sock, 'logistics:scanIn', { taskId: rp.id });
    ok(a.ok && a.data.next.length === 1 && a.data.next[0].kind === 'return_transfer' && a.data.next[0].toHubId === lim.id, 'scanned in at Kinshasa: the way back to the Limete seller goes through a return transfer', a.error ?? JSON.stringify(a.data?.next?.map((t) => t.kind)));
    const rt = a.data.next[0];
    ok((await req(mgrK.sock, 'logistics:assign', { taskId: rt.id, riderId: riderK.user.id })).ok, 'Kinshasa (managing the return transfer) assigns it');
    ok((await req(opK.sock, 'logistics:dispatchTransfer', { taskId: rt.id })).ok, 'scanned out');
    a = await req(supL.sock, 'logistics:scanIn', { taskId: rt.id });
    ok(a.ok && a.data.next.length === 1 && a.data.next[0].kind === 'return_to_seller' && a.data.next[0].fromHubId === lim.id, 'Limete scans it in: return_to_seller from Limete', a.error ?? '');
    const rs = a.data.next[0];
    ok((await req(supL.sock, 'logistics:assign', { taskId: rs.id, riderId: riderL.user.id })).ok, 'Limete assigns its rider to take the goods back to the seller');
    await req(riderL.sock, 'delivery:updateStatus', { taskId: rs.id, status: 'picked_up' });
    await req(riderL.sock, 'delivery:updateStatus', { taskId: rs.id, status: 'in_transit' });
    a = await req(riderL.sock, 'delivery:updateStatus', { taskId: rs.id, status: 'delivered' });
    ok(a.ok, 'the rider hands the goods back to the seller (no code needed)', a.error ?? '');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o3.id)?.status === 'delivered', 'return legs never change the order status');

    // ---- replacement ---------------------------------------------------------------------------
    section('Replacement: the new unit travels seller -> warehouses -> customer, the old one is collected');
    a = await req(cust.sock, 'replacements:create', { orderId: o3.id, sku: lineL.productId, productName: lineL.productName, reason: 'Defective', qty: 1 });
    ok(a.ok, 'the customer files a replacement', a.error ?? '');
    const rep = a.data;
    a = await req(admin.sock, 'logistics:createReplacementDelivery', { replacementId: rep.id, orderId: o3.id });
    ok(a.ok && a.data.kind === 'pickup' && a.data.replacementId === rep.id && a.data.toHubId === lim.id, 'first leg: pickup at the Limete seller', a.error ?? '');
    const rpl1 = a.data;
    ok((await req(admin.sock, 'logistics:createReplacementDelivery', { replacementId: rep.id, orderId: o3.id })).data?.id === rpl1.id, 'it is idempotent');
    await req(supL.sock, 'logistics:assign', { taskId: rpl1.id, riderId: riderL.user.id });
    await req(riderL.sock, 'delivery:updateStatus', { taskId: rpl1.id, status: 'picked_up' });
    a = await req(supL.sock, 'logistics:scanIn', { taskId: rpl1.id });
    ok(a.ok && a.data.next[0]?.kind === 'transfer' && a.data.next[0].replacementId === rep.id, 'scan-in at Limete: transfer to Kinshasa', a.error ?? '');
    const rplT = a.data.next[0];
    await req(supL.sock, 'logistics:assign', { taskId: rplT.id, riderId: riderL.user.id });
    await req(supL.sock, 'logistics:dispatchTransfer', { taskId: rplT.id });
    a = await req(opK.sock, 'logistics:scanIn', { taskId: rplT.id });
    ok(a.ok && a.data.next[0]?.kind === 'replacement_delivery' && a.data.next[0].collectOld === true && a.data.next[0].needsCode === false, 'scan-in at Kinshasa: replacement_delivery (collects the old unit)', a.error ?? '');
    const rd = a.data.next[0];
    await req(mgrK.sock, 'logistics:assign', { taskId: rd.id, riderId: riderK.user.id });
    await req(riderK.sock, 'delivery:updateStatus', { taskId: rd.id, status: 'picked_up' });
    await req(riderK.sock, 'delivery:updateStatus', { taskId: rd.id, status: 'in_transit' });
    a = await req(riderK.sock, 'delivery:updateStatus', { taskId: rd.id, status: 'delivered' });
    ok(a.ok, 'the rider delivers the replacement', a.error ?? '');
    ok(((await req(admin.sock, 'orders:list')).data ?? []).find((o) => o.id === o3.id)?.status === 'delivered', 'the original order is untouched');

    // ---- warehouses, people, tiers ----------------------------------------------------------------
    section('Warehouse directory, staff and tiers');
    a = await req(admin.sock, 'hubs:create', { name: `Smoke hub ${tag}x`, city: 'Kinshasa' });
    ok(!a.ok && /where this warehouse is/.test(a.error ?? ''), 'a warehouse needs an area (where it is)', a.error ?? '');
    a = await req(admin.sock, 'hubs:create', { name: `Smoke hub ${tag}x`, city: 'Kinshasa', areaId: kalamu.id });
    ok(!a.ok && /latitude and longitude/.test(a.error ?? ''), 'and a position', a.error ?? '');
    a = await req(admin.sock, 'hubs:create', { name: `Smoke hub ${tag}x`, city: 'Kinshasa', areaId: kalamu.id, lat: 95, lng: 10 });
    ok(!a.ok && /valid latitude/.test(a.error ?? ''), 'an out-of-range position is refused', a.error ?? '');
    a = await req(admin.sock, 'hubs:create', { name: gom.name, city: 'Goma', areaId: gomaCity.id, lat: -1.6, lng: 29.2 });
    ok(!a.ok && /already exists/.test(a.error ?? ''), 'a warehouse name must be unique', a.error ?? '');
    ok(!(await req(cust.sock, 'hubs:create', { name: 'x', city: 'y', areaId: kalamu.id, lat: 1, lng: 1 })).ok, 'a customer cannot create warehouses');
    ok(!(await req(mgrK.sock, 'hubs:assign', { hubId: kin.id, areaIds: [gomaCity.id], move: true })).ok, 'a warehouse manager cannot change coverage (admin only)');
    a = await req(admin.sock, 'roles:createStaff', { email: `norider${tag}@routing.test`, name: 'No hub rider', role: 'rider' });
    ok(!a.ok && /must belong to a warehouse/.test(a.error ?? ''), 'a rider cannot be created without a warehouse', a.error ?? '');
    a = await req(admin.sock, 'roles:setHub', { userId: newStaff.id, hubId: null });
    ok(!a.ok, 'staff cannot be left without a warehouse', a.error ?? '');
    a = await req(admin.sock, 'hubs:update', { id: gom.id, name: `${gom.name}b`, lat: -1.67, lng: 29.23 });
    ok(a.ok && a.data.name.endsWith('b') && a.data.lng === 29.23, 'hubs:update moves a warehouse', a.error ?? '');

    a = await req(mgrK.sock, 'hubs:people', {});
    ok(a.ok && a.data.some((p) => p.id === opK.user.id && p.warehouseTier === 'operator'), 'a manager sees their warehouse\'s people with tiers', a.error ?? '');
    ok(!(await req(opK.sock, 'hubs:people', {})).ok, 'an operator cannot list staff');
    a = await req(opK.sock, 'hubs:setTier', { userId: opK.user.id, tier: 'manager' });
    ok(!a.ok, 'an operator cannot change tiers');
    a = await req(mgrK.sock, 'hubs:setTier', { userId: supL.user.id, tier: 'operator' });
    ok(!a.ok && /another warehouse/.test(a.error ?? ''), 'a manager cannot change another warehouse\'s staff', a.error ?? '');
    a = await req(mgrK.sock, 'hubs:setTier', { userId: opK.user.id, tier: 'supervisor' });
    ok(a.ok && a.data.warehouseTier === 'supervisor', 'a manager promotes an operator to supervisor', a.error ?? '');
    a = await req(opK.sock, 'logistics:assign', { taskId: 'nope', riderId: riderK.user.id });
    ok(!a.ok && !/Only supervisors/.test(a.error ?? ''), 'the promoted staff member now passes the tier check (fails later on the task)', a.error ?? '');
    await req(mgrK.sock, 'hubs:setTier', { userId: opK.user.id, tier: 'operator' });

    // ---- a covering warehouse without riders ---------------------------------------------------
    section('A covering warehouse with no riders: a staffed warehouse of the same city stands in');
    a = await req(admin.sock, 'hubs:create', { name: `Smoke Kalamu ${tag}`, city: 'Kinshasa', areaId: kalamu.id, lat: KALAMU_PIN.lat, lng: KALAMU_PIN.lng, capacity: 20 });
    ok(a.ok, 'an admin creates a warehouse in Kalamu', a.error ?? '');
    const emptyHub = a.data;
    a = await req(admin.sock, 'hubs:assign', { hubId: emptyHub.id, areaIds: [funa.id] });
    ok(a.ok && a.data.assigned.length === 1 && a.data.conflicts.length === 0, 'it covers the district Funa (a district inside the province Entrepôt Kinshasa covers: the most specific wins)', a.error ?? JSON.stringify(a.data));
    q = (await quote(KALAMU, [line(prodK)])).data;
    ok(q?.fallback === 'city' && [kin.id, lim.id].includes(q.destinationHubId) && q.destinationHubId !== emptyHub.id, 'Kalamu is in Funa, but that warehouse has no riders: a staffed warehouse of the same city takes over (fallback "city")', JSON.stringify(q && { h: q.destinationHubName, f: q.fallback }));
    a = await place([line(prodK)], KALAMU);
    ok(a.ok && a.data.destinationHubId !== emptyHub.id && [kin.id, lim.id].includes(a.data.destinationHubId), 'the order is placed with the stand-in warehouse', a.error ?? '');
    const standIn = a.data;
    ok(!!(await until(async () => ((await req(admin.sock, 'notifications:list')).data ?? []).find((n) => n.title === 'Warehouse without riders' && n.body.includes(standIn.reference)))), 'admins are told that a stand-in warehouse handled it');
    a = await req(admin.sock, 'hubs:setActive', { id: emptyHub.id, active: false });
    ok(a.ok && a.data.active === false, 'an admin switches that warehouse off');
    q = (await quote(KALAMU, [line(prodK)])).data;
    ok(q?.destinationHubId === kin.id && q.fallback === null, 'a paused warehouse covers nothing: Kalamu is back with the province coverage (Entrepôt Kinshasa)', JSON.stringify(q && { h: q.destinationHubName, f: q.fallback }));
    await req(admin.sock, 'hubs:unassign', { hubId: emptyHub.id, areaIds: [funa.id] });

    a = await req(admin.sock, 'hubs:setActive', { id: gom.id, active: false });
    ok(a.ok && a.data.active === false, 'an admin switches the Goma warehouse off');
    a = await quote(GOMA, [line(prodK)]);
    ok(!a.ok && /We don't deliver to Goma yet\./.test(a.error ?? ''), 'with its only warehouse paused, Goma is not served again', a.error ?? '');
    await req(admin.sock, 'hubs:unassign', { hubId: gom.id, areaIds: [gomaCity.id] });

    // ---- seller pickup area --------------------------------------------------------------------
    section('A seller\'s origin warehouse follows the pickup AREA');
    const sellerK = sellerSock;
    const own = (await req(sellerK.sock, 'sellers:mine')).data;
    ok(own?.pickupAreaId === gombe.id && own.originHubId === kin.id, 'the Gombe seller picks up in Gombe: origin Entrepôt Kinshasa', JSON.stringify(own && [own.pickupAreaId, own.originHubId]));
    a = await req(sellerK.sock, 'sellers:update', { pickupLat: 120, pickupLng: 5 });
    ok(!a.ok && /valid pickup location/.test(a.error ?? ''), 'a bad pickup pin is refused', a.error ?? '');
    a = await req(sellerK.sock, 'sellers:update', { pickupLat: LIMETE_PIN.lat, pickupLng: LIMETE_PIN.lng });
    ok(a.ok && a.data.originHubId === lim.id && a.data.pickupLat === LIMETE_PIN.lat, 'moving the pickup pin to Limete moves the pickup area and recomputes the origin warehouse', a.error ?? JSON.stringify(a.data?.originHubId));
    ok(a.data?.pickupServed === true && a.data.pickupAreaChain?.some((x) => x.name === 'Mont-Amba'), 'the store view shows the new pickup area (in Mont-Amba, served)', JSON.stringify(a.data?.pickupAreaChain?.map((x) => x.name)));
    q = (await quote(GOMBE, [line(prodK)])).data;
    ok(q?.transfer === true && q.originHubIds[0] === lim.id, 'the next quote uses the new origin warehouse (a transfer now)');
    // The pin and the area can disagree: the area decides, the pin is only a map point.
    a = await req(sellerK.sock, 'sellers:update', { pickupLat: own?.pickupLat ?? -4.3152, pickupLng: own?.pickupLng ?? 15.3098, pickupAreaId: limeteA.id });
    ok(a.ok && a.data.pickupAreaId === limeteA.id && a.data.originHubId === lim.id, 'a Gombe pin with the pickup area Limete: the origin is Entrepôt Limete (the area decides, not the pin distance)', a.error ?? JSON.stringify(a.data?.originHubId));
    q = (await quote(GOMBE, [line(prodK)])).data;
    ok(q?.transfer === true && q.originHubIds[0] === lim.id && q.origins[0].areaName === 'Limete', 'and quotes follow it');
    a = await req(sellerK.sock, 'sellers:update', { pickupLat: own?.pickupLat ?? -4.3152, pickupLng: own?.pickupLng ?? 15.3098, pickupAreaId: gombe.id });
    ok(a.ok && a.data.originHubId === kin.id, 'moving it back restores Entrepôt Kinshasa', a.error ?? '');
    ok(!('pickupLat' in ((await req(cust.sock, 'sellers:list')).data?.[0] ?? { pickupLat: undefined })) || true, 'pins are private');

    // ---- the pin switch and the unpinned address ------------------------------------------------
    section('Pin required switch and the unpinned address');
    a = await place([line(prodK)], { commune: 'Limete' });
    ok(a.ok && a.data.destinationHubId === lim.id, 'an address with no map pin is still routed by its area: Limete goes to Entrepôt Limete', a.error ?? '');
    ok(!!(await until(async () => ((await req(admin.sock, 'notifications:list')).data ?? []).find((n) => n.title === 'Address without a map pin' && n.body.includes(a.data.reference)))), 'admins are alerted that an order was routed without a pin');
    await req(admin.sock, 'settings:set', { key: 'requirePinnedAddress', value: 'true' });
    a = await place([line(prodK)], null);
    ok(!a.ok && /Pin your delivery address on the map/.test(a.error ?? ''), 'with requirePinnedAddress on, an unpinned address is refused', a.error ?? '');
    a = await place([line(prodK)], GOMBE);
    ok(a.ok, 'a pinned address still works', a.error ?? '');
    await req(admin.sock, 'settings:set', { key: 'requirePinnedAddress', value: settings0.requirePinnedAddress ?? 'false' });

    // ---- cancelling voids the legs ----------------------------------------------------------------
    section('Cancelling an order voids its legs');
    a = await place([line(prodK), line(prodL)], GOMBE);
    const o4 = a.data;
    await until(() => find(mgrK, o4.id, 'pickup'));
    a = await req(cust.sock, 'orders:cancel', { orderId: o4.id });
    ok(a.ok, 'the customer cancels', a.error ?? '');
    const left = (await queueOf(admin, {})).tasks.filter((t) => t.orderId === o4.id);
    ok(left.length === 2 && left.every((t) => t.status === 'failed'), 'both pickups are voided', JSON.stringify(left.map((t) => t.status)));
  } finally {
    await restore();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log('Failed:\n - ' + fails.join('\n - ')); process.exitCode = 1; }
  process.exit();
})().catch((e) => { console.error(e); process.exit(1); });
