/* Gives test products real photos, for local testing only. Photos come from Openverse
 * (https://openverse.org, openly licensed images, no API key): searched per product, centre-cropped to
 * 800×800 JPEG with ffmpeg, uploaded to /api/v1/uploads and set as the product image by the admin
 * (an admin edit keeps the listing live). Attribution for every photo used is written to
 * test/test-photo-credits.json.
 *
 *   ADMIN_PW=... node test/seed-product-photos.cjs            (API_URL defaults to http://localhost:3001)
 *   ADMIN_PW=... FORCE=1 node test/seed-product-photos.cjs    (also replace photos already set)
 *   ADMIN_PW=... FORCE=1 ONLY="Matte Lipstick,Wax Tote Bag" node test/seed-product-photos.cjs   (just these)
 *   ADMIN_PW=... PEXELS_KEY=... FORCE=1 node test/seed-product-photos.cjs   (search Pexels instead: better matches;
 *                                                       free key at https://www.pexels.com/api/)
 *
 * Without FORCE a product keeps an existing photo unless it is a generated placeholder (seed-test-stores.cjs)
 * or the demo colour squares. Smoke-test products ("Alpha kettle 82048116"…) share one photo per item type.
 */
const { io } = require('socket.io-client');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_PW = process.env.ADMIN_PW;
const FORCE = process.env.FORCE === '1';
// With a (free) Pexels API key the searches use Pexels, whose product photos match far better than Openverse's.
const PEXELS_KEY = process.env.PEXELS_KEY ?? '';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((n) => n.trim())) : null;
const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'somba-photos-dl-')); // downloads only
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'somba-photos-out-')); // converted JPEGs
const CREDITS = path.join(__dirname, 'test-photo-credits.json');

/** Product name → [search words, words the photo title/tags must contain (any)], or a list of such searches
 *  tried in order (the later ones are fallbacks). */
const BY_NAME = {
  'Wax Print Maxi Dress': ['african print dress', ['dress', 'gown']],
  "Men's Wax Shirt": [['african print shirt', ['shirt']], ['dashiki', ['dashiki', 'shirt']], ['colorful shirt', ['shirt']]],
  'Headwrap (Duku)': [['african head wrap', ['wrap', 'gele', 'headtie', 'turban', 'headscarf', 'scarf']], ['headscarf', ['scarf', 'headscarf', 'wrap']]],
  'Wax Tote Bag': [['african print bag', ['bag', 'tote']], ['tote bag', ['bag', 'tote']]],
  'Smartphone A15 128 GB': ['smartphone', ['smartphone', 'phone', 'android']],
  'Fast Charger 25 W USB-C': [['usb charger', ['charger', 'usb']], ['phone charger', ['charger', 'charging']]],
  'Wireless Earbuds Pro': ['wireless earbuds', ['earbud', 'earphone', 'airpods', 'headphone', 'earpiece']],
  'Power Bank 20000 mAh': [['power bank', ['power bank', 'powerbank', 'battery']], ['portable battery charger', ['battery', 'charger']]],
  'Raw Shea Butter 250 g': [['shea butter', ['shea', 'butter']], ['body butter jar', ['butter', 'cream', 'jar']]],
  'Hair Growth Oil': [['hair oil bottle', ['oil']], ['essential oil bottle', ['oil', 'bottle']]],
  'Matte Lipstick': ['lipstick', ['lipstick']],
  'Black Soap Face Wash': [['african black soap', ['soap']], ['soap bar', ['soap']]],
  'Non-stick Cooking Pot Set': ['cooking pots', ['pot', 'pan', 'cookware', 'saucepan']],
  'Cotton Bed Sheet Set': [['bed sheets', ['sheet', 'bedding', 'linen']], ['bedroom bed', ['bed', 'pillow']]],
  'Rechargeable LED Lamp': [['led lantern', ['lamp', 'lantern', 'led']], ['camping lantern', ['lantern', 'lamp']]],
  'Woven Storage Basket': ['woven basket', ['basket']],
  'Football Size 5': [['soccer ball', ['ball', 'football', 'soccer']], ['football ball', ['ball', 'football']]],
  'Leopards Home Jersey': ['football jersey', ['jersey', 'shirt', 'kit']],
  'Training Cones (Set of 20)': [['training cones', ['cone']], ['soccer cones', ['cone']], ['traffic cones', ['cone']]],
  'Running Shoes': ['running shoes', ['shoe', 'sneaker', 'trainer']],
  'Cassava Flour (Fufu) 5 kg': [['cassava flour', ['cassava', 'flour', 'fufu', 'gari', 'manioc']], ['fufu', ['fufu', 'cassava']], ['cassava', ['cassava', 'manioc']], ['flour', ['flour']]],
  'Red Palm Oil 1 L': [['red palm oil', ['palm oil']], ['palm oil', ['palm oil', 'palm']], ['cooking oil bottle', ['oil']]],
  'Kivu Arabica Coffee 500 g': ['coffee beans', ['coffee']],
  'Pili-Pili Hot Sauce': [['hot sauce bottle', ['sauce', 'chili', 'chilli', 'pepper']], ['chili peppers', ['chili', 'chilli', 'pepper']]],
  'School Uniform Set': [['school uniform', ['uniform']], ['school children uniform africa', ['uniform', 'school']]],
  'Kids Sneakers': ['children sneakers', ['shoe', 'sneaker', 'trainer']],
  'Cotton Pyjamas': [['pajamas', ['pajama', 'pyjama', 'sleepwear']], ['children clothes', ['clothes', 'clothing', 'shirt']]],
  'School Backpack': ['school backpack', ['backpack', 'rucksack', 'schoolbag']],
  '43" Smart TV': ['flat screen television', ['tv', 'television', 'screen']],
  'Solar Home Kit 100 W': [['solar home system', ['solar']], ['solar panel', ['solar']]],
  'Bluetooth Speaker': ['bluetooth speaker', ['speaker']],
  'Voltage Stabiliser 1000 VA': [['voltage stabilizer', ['stabilizer', 'stabiliser', 'voltage', 'regulator']], ['voltage regulator', ['voltage', 'regulator']], ['uninterruptible power supply', ['ups', 'power supply']], ['power strip', ['power strip', 'surge', 'socket', 'outlet']]],
  'Kitchen Blender 1.5L': ['kitchen blender', ['blender']],
  'Running Sneakers': ['running sneakers', ['shoe', 'sneaker', 'trainer']],
  'Wireless Bluetooth Speaker': ['portable speaker', ['speaker']],
};
/** Hand-picked Openverse image ids (chosen by eye where the search ranks a wrong photo first). Re-apply with
 *  FORCE=1 ONLY="<name>". Ids come from https://api.openverse.org/v1/images/?q=… */
const PICKED = {
};
/** Smoke-test products: a keyword in the name → one shared search. */
const BY_KEYWORD = [
  ['kettle', ['electric kettle', ['kettle']]],
  ['mixer', ['kitchen mixer', ['mixer']]],
  ['radio', ['portable radio', ['radio']]],
  ['plate', ['dinner plate', ['plate']]],
  ['lamp', ['table lamp', ['lamp']]],
  ['fan', ['electric fan', ['fan']]],
  ['rug', ['rug carpet', ['rug', 'carpet']]],
  ['sofa', ['sofa', ['sofa', 'couch']]],
  ['sneaker', ['sneakers', ['shoe', 'sneaker']]],
];

// ---------------------------------------------------------------- plumbing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** fetch that waits out a rate limit (the API allows 30 requests/minute per IP; Openverse throttles too). */
async function fetchPatiently(url, init, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init ? init() : undefined);
      if (res.status !== 429 || attempt >= 6) return res;
    } catch (e) {
      if (attempt >= 6) throw new Error(`${label}: ${e.message} ${e.cause?.message ?? ''}`);
    }
    process.stdout.write(`  … rate limited, waiting 20 s (${label})\n`);
    await sleep(20000);
  }
}
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));

const MAGIC = [[0xff, 0xd8, 0xff], [0x89, 0x50, 0x4e, 0x47], [0x52, 0x49, 0x46, 0x46]]; // jpeg, png, webp(riff)
const isImage = (buf) => MAGIC.some((m) => m.every((b, i) => buf[i] === b));

/** Openverse candidates for a search, best first: photos, ≥ 500 px, title matching one of the words. */
/** Pexels candidates for a search (needs PEXELS_KEY): the photo's description must mention one of the words. */
async function searchPexels(q, words) {
  const u = new URL('https://api.pexels.com/v1/search');
  u.search = new URLSearchParams({ query: q, per_page: '30', orientation: 'square' }).toString();
  const res = await fetchPatiently(u.toString(), () => ({ headers: { authorization: PEXELS_KEY } }), `pexels "${q}"`);
  if (!res.ok) {
    console.log(`  ! pexels "${q}" failed (${res.status}), skipping it`);
    return [];
  }
  const photos = (await res.json().catch(() => ({}))).photos ?? [];
  return photos
    .filter((ph) => words.some((w) => `${ph.alt ?? ''} ${ph.url ?? ''}`.toLowerCase().replace(/-/g, ' ').includes(w)))
    .map((ph) => ({
      id: `pexels-${ph.id}`,
      title: ph.alt || q,
      creator: ph.photographer ?? null,
      licenseLabel: 'Pexels License',
      url: ph.src?.large2x ?? ph.src?.large ?? ph.src?.original,
      thumbnail: ph.src?.large ?? null,
      foreign_landing_url: ph.url,
    }));
}

async function search(q, words) {
  if (PEXELS_KEY) return searchPexels(q, words);
  const u = new URL('https://api.openverse.org/v1/images/');
  u.search = new URLSearchParams({ q, license_type: 'commercial', category: 'photograph', page_size: '20', mature: 'false' }).toString();
  // Openverse answers 5xx now and then: retry a few times, then give up on this search (not the whole run).
  let results = null;
  for (let attempt = 1; attempt <= 4 && results === null; attempt++) {
    const res = await fetchPatiently(u.toString(), () => ({ headers: { 'user-agent': 'somba-local-test-seed/1.0' } }), `search "${q}"`);
    if (res.ok) results = (await res.json().catch(() => ({}))).results ?? [];
    else if (res.status >= 500 && attempt < 4) await sleep(5000 * attempt);
    else {
      console.log(`  ! search "${q}" failed (${res.status}), skipping it`);
      return [];
    }
  }
  results = results ?? [];
  const ok = (r) => (r.width ?? 0) >= 500 && (r.height ?? 0) >= 400 && ['jpg', 'jpeg', 'png', 'webp', undefined, null].includes(r.filetype);
  // Title only: Openverse tags are machine-generated and let unrelated photos through (a police car for "soap").
  const matches = (r) => words.some((w) => (r.title ?? '').toLowerCase().includes(w));
  const squareness = (r) => Math.abs(Math.log((r.width || 1) / (r.height || 1)));
  return results.filter((r) => ok(r) && matches(r)).sort((a, b) => squareness(a) - squareness(b));
}

/** Downloads a candidate (original, else Openverse's thumbnail) and converts it to an 800×800 JPEG. */
async function fetchPhoto(r, name) {
  for (const src of [r.url, r.thumbnail].filter(Boolean)) {
    try {
      const res = await fetchPatiently(src, () => ({ headers: { 'user-agent': 'somba-local-test-seed/1.0' }, redirect: 'follow' }), `download ${name}`);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 15_000_000 || !isImage(buf)) continue; // not an image we accept
      const raw = path.join(DL, `${name}.img`);
      fs.writeFileSync(raw, buf);
      const out = path.join(OUT, `${name}.jpg`);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=800:800", '-frames:v', '1', '-q:v', '4', out], { stdio: 'ignore' });
      if (fs.existsSync(out) && fs.statSync(out).size > 10_000) return out;
    } catch {
      /* try the next source */
    }
  }
  return null;
}

/** The admin's REST token. A long run outlives it, so a 401 signs in again once and retries. */
let adminToken = null;
async function signIn() {
  const login = await fetchPatiently(API + '/api/v1/auth/login', () => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@somba.app', password: ADMIN_PW }) }), 'login');
  const auth = await login.json().catch(() => ({}));
  if (!auth.accessToken) throw new Error(`admin login: ${login.status}`);
  adminToken = auth.accessToken;
  return adminToken;
}

async function upload(file) {
  const send = () => fetchPatiently(API + '/api/v1/uploads', () => {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
    return { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: form };
  }, `upload ${path.basename(file)}`);
  let res = await send();
  if (res.status === 401) {
    await signIn();
    res = await send();
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.url) throw new Error(`upload ${path.basename(file)}: ${res.status} ${JSON.stringify(json)}`);
  return json.url;
}

/** Finds, downloads and uploads one photo for a search; null when nothing suitable was found. */
/** One Openverse image by id (a hand-picked photo, see PICKED). */
async function byId(id) {
  const res = await fetchPatiently(`https://api.openverse.org/v1/images/${id}/`, () => ({ headers: { 'user-agent': 'somba-local-test-seed/1.0' } }), `image ${id}`);
  return res.ok ? res.json() : null;
}

async function photoFor(spec, name, used, picked) {
  const searches = Array.isArray(spec[0]) ? spec : [spec];
  // A hand-picked photo comes first; the searches remain the fallback if it is gone.
  const runs = [...(picked ? [['', null]] : []), ...searches];
  for (const [q, words] of runs) {
    const candidates = words === null ? [await byId(picked)].filter(Boolean) : (await search(q, words)).filter((r) => !used.has(r.id));
    for (const r of candidates.slice(0, 5)) {
      const file = await fetchPhoto(r, name);
      if (!file) continue;
      used.add(r.id);
      return {
        url: await upload(file),
        credit: { title: r.title, creator: r.creator ?? null, license: r.licenseLabel ?? `CC ${String(r.license).toUpperCase()} ${r.license_version ?? ''}`.trim(), source: r.foreign_landing_url ?? r.url, ...(words === null ? { picked: r.id } : { search: q }) },
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- main
(async () => {
  if (!ADMIN_PW) throw new Error('Set ADMIN_PW (the admin@somba.app password of this API).');
  const admin = await connect(await signIn());

  const products = (await req(admin, 'products:list', { limit: 1000 })).data ?? [];
  const isPlaceholder = (img) => !img || /\/(p[123])\.png$/.test(img) || (img.includes('/uploads/') && !img.endsWith('.jpg')); // generated PNGs
  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  const used = new Set();
  const shared = new Map(); // keyword → uploaded photo, for smoke-test products
  const report = { photographed: 0, kept: 0, skipped: [], notFound: [] };

  for (const p of products) {
    if (p.status === 'removed') continue;
    if (ONLY && !ONLY.has(p.name)) continue;
    // A photo is redone when forced, when it is a placeholder, or when its credit is missing (an earlier run died).
    if (!FORCE && !isPlaceholder(p.image) && (credits[p.name] || !p.image?.endsWith('.jpg'))) { report.kept++; continue; }
    const curated = BY_NAME[p.name];
    const kw = curated ? null : BY_KEYWORD.find(([k]) => p.name.toLowerCase().includes(k));
    if (!curated && !kw) { report.skipped.push(p.name); continue; }

    let photo;
    if (curated) {
      photo = await photoFor(curated, p.id, used, PICKED[p.name]);
    } else {
      if (!shared.has(kw[0])) shared.set(kw[0], await photoFor(kw[1], `kw-${kw[0]}`, used));
      photo = shared.get(kw[0]);
    }
    if (!photo) { report.notFound.push(p.name); continue; }
    const r = await req(admin, 'products:update', { id: p.id, patch: { image: photo.url } });
    if (!r.ok) throw new Error(`update ${p.name}: ${r.error}`);
    credits[p.name] = { ...photo.credit, image: photo.url };
    fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n'); // after each product, so a crash keeps them
    report.photographed++;
    console.log(`✓ ${p.name.padEnd(32)} ${String(photo.credit.creator ?? '').slice(0, 24).padEnd(24)} ${photo.credit.license}`);
    await sleep(600); // be gentle with Openverse
  }

  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n');
  admin.close();
  console.log(`\n${report.photographed} photographed, ${report.kept} kept their photo.`);
  if (report.skipped.length) console.log(`Skipped (no search for these names): ${report.skipped.join(', ')}`);
  if (report.notFound.length) console.log(`No suitable photo found: ${report.notFound.join(', ')}`);
  console.log(`Credits: ${path.relative(process.cwd(), CREDITS)}`);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
