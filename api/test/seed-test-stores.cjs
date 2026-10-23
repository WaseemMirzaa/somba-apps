/* Seeds 8 realistic test stores into a RUNNING API, through the same calls the apps make:
 *   seller account → application with KYC (ID document uploaded) → admin approval →
 *   storefront logo / banner / description / pickup address → 4 products each (photos uploaded,
 *   some with size/colour options and discounts, each with the seller's delivery time in days) → admin puts
 *   the products live.
 *
 *   ADMIN_PW=... node test/seed-test-stores.cjs                 (API_URL defaults to http://localhost:3001)
 *
 * Safe to run again: existing accounts, stores and products (matched by name) are reused, nothing is
 * duplicated. Images are drawn with ffmpeg (on PATH) into a temp folder and uploaded to /api/v1/uploads.
 * Every seller signs in with STORE_PW below (local test value).
 */
const { io } = require('socket.io-client');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@somba.app';
const ADMIN_PW = process.env.ADMIN_PW;
const STORE_PW = 'Store@2026!Test';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'somba-stores-'));

const NEW_CATEGORIES = [{ name: 'Groceries', nameFr: 'Alimentation', icon: '🛒', sortOrder: 5 }];

const SIZES = { name: 'Size', options: ['S', 'M', 'L', 'XL'] };
const STORES = [
  {
    slug: 'mama-wax', days: 5, name: 'Mama Wax Couture', owner: 'Esther Mbuyi', color: '0xC2410C', accent: '0xFDBA74',
    category: 'Fashion', commune: 'Kalamu', idNumber: 'CD-1021-7781',
    description: 'Hand-tailored wax print dresses, shirts and headwraps, sewn in our Kalamu workshop. Custom sizes in 5 days.',
    pickup: '27 Avenue Kasa-Vubu, Kalamu, Kinshasa',
    products: [
      { name: 'Wax Print Maxi Dress', nameFr: 'Robe longue en wax', price: 45, orig: 60, stock: 30, variants: [SIZES, { name: 'Colour', options: ['Orange', 'Blue', 'Green'] }], desc: 'Full-length dress in 100% cotton wax print, lined bodice, side pockets.' },
      { name: 'Men\'s Wax Shirt', nameFr: 'Chemise homme en wax', price: 28, stock: 40, variants: [SIZES], desc: 'Short-sleeve shirt with a wax print front and plain back.' },
      { name: 'Headwrap (Duku)', nameFr: 'Foulard de tête (duku)', price: 9, stock: 80, variants: [{ name: 'Colour', options: ['Red', 'Gold', 'Indigo'] }], desc: 'Two-metre headwrap, pre-hemmed.' },
      { name: 'Wax Tote Bag', nameFr: 'Sac cabas en wax', price: 15, orig: 18, stock: 25, desc: 'Lined tote with an inner pocket, fits a 15" laptop.' },
    ],
  },
  {
    slug: 'kin-tech', days: 2, name: 'Kin Tech Hub', owner: 'Patrick Ilunga', color: '0x1D4ED8', accent: '0x93C5FD',
    category: 'Electronics', commune: 'Gombe', idNumber: 'CD-3390-1188',
    description: 'Phones, chargers and accessories with a 6-month warranty. Repairs and screen replacements at our Gombe counter.',
    pickup: '8 Boulevard du 30 Juin, Gombe, Kinshasa',
    products: [
      { name: 'Smartphone A15 128 GB', nameFr: 'Smartphone A15 128 Go', price: 189, orig: 220, stock: 15, variants: [{ name: 'Colour', options: ['Black', 'Blue'] }], desc: '6.5" screen, dual SIM, 5000 mAh battery, 128 GB storage.' },
      { name: 'Fast Charger 25 W USB-C', nameFr: 'Chargeur rapide 25 W USB-C', price: 14, stock: 60, days: 1, desc: 'Wall charger with a 1 m USB-C cable.' },
      { name: 'Wireless Earbuds Pro', nameFr: 'Écouteurs sans fil Pro', price: 39, orig: 49, stock: 35, desc: 'Noise reduction, 24 h with the case, splash resistant.' },
      { name: 'Power Bank 20000 mAh', nameFr: 'Batterie externe 20000 mAh', price: 29, stock: 40, desc: 'Charges a phone 4 times; two USB ports and USB-C.' },
    ],
  },
  {
    slug: 'beaute-lumiere', days: 3, name: 'Beauté Lumière', owner: 'Grâce Kabeya', color: '0xBE185D', accent: '0xF9A8D4',
    category: 'Beauty', commune: 'Ngaliema', idNumber: 'CD-5512-0042',
    description: 'Skincare and hair care for African skin and hair. Shea butter and natural oils sourced in the DRC.',
    pickup: '15 Avenue des Cliniques, Ngaliema, Kinshasa',
    products: [
      { name: 'Raw Shea Butter 250 g', nameFr: 'Beurre de karité brut 250 g', price: 8, stock: 100, desc: 'Unrefined grade A shea butter for skin and hair.' },
      { name: 'Hair Growth Oil', nameFr: 'Huile de croissance capillaire', price: 12, orig: 15, stock: 50, desc: 'Castor, coconut and rosemary oil blend, 100 ml.' },
      { name: 'Matte Lipstick', nameFr: 'Rouge à lèvres mat', price: 7, stock: 70, variants: [{ name: 'Shade', options: ['Ruby', 'Cocoa', 'Plum', 'Nude'] }], desc: 'Long-lasting matte finish.' },
      { name: 'Black Soap Face Wash', nameFr: 'Savon noir nettoyant visage', price: 6, stock: 90, desc: 'Gentle African black soap cleanser, 200 ml.' },
    ],
  },
  {
    slug: 'maison-gombe', days: 4, name: 'Maison Gombe', owner: 'Jean-Paul Tshibanda', color: '0x047857', accent: '0x6EE7B7',
    category: 'Home & Living', commune: 'Gombe', idNumber: 'CD-7720-3315',
    description: 'Kitchenware, bedding and home décor. Free assembly for furniture ordered before noon.',
    pickup: '41 Avenue de la Justice, Gombe, Kinshasa',
    products: [
      { name: 'Non-stick Cooking Pot Set', nameFr: 'Lot de marmites antiadhésives', price: 55, orig: 70, stock: 20, desc: 'Three pots (18, 22, 26 cm) with glass lids.' },
      { name: 'Cotton Bed Sheet Set', nameFr: 'Parure de draps en coton', price: 32, stock: 30, variants: [{ name: 'Size', options: ['Single', 'Double', 'King'] }], desc: 'Fitted sheet, flat sheet and two pillowcases.' },
      { name: 'Rechargeable LED Lamp', nameFr: 'Lampe LED rechargeable', price: 18, stock: 45, desc: '12 hours of light per charge — made for power cuts.' },
      { name: 'Woven Storage Basket', nameFr: 'Panier de rangement tressé', price: 13, stock: 35, desc: 'Hand-woven basket with handles, 40 cm.' },
    ],
  },
  {
    slug: 'sport-kin', days: 3, name: 'Sport Plus Kinshasa', owner: 'Cédric Mukendi', color: '0xB91C1C', accent: '0xFCA5A5',
    category: 'Sports', commune: 'Lingwala', idNumber: 'CD-2245-9083',
    description: 'Football kits, training gear and fitness equipment. Team orders and club printing on request.',
    pickup: '3 Avenue du Stade, Lingwala, Kinshasa',
    products: [
      { name: 'Football Size 5', nameFr: 'Ballon de football taille 5', price: 22, stock: 50, desc: 'Match ball, hand-stitched, for grass and turf.' },
      { name: 'Leopards Home Jersey', nameFr: 'Maillot domicile Léopards', price: 35, orig: 45, stock: 60, variants: [SIZES], desc: 'Supporter jersey, breathable polyester.' },
      { name: 'Training Cones (Set of 20)', nameFr: 'Plots d\'entraînement (lot de 20)', price: 11, stock: 40, desc: 'Flexible cones with a carry stand.' },
      { name: 'Running Shoes', nameFr: 'Chaussures de course', price: 49, stock: 30, variants: [{ name: 'Size', options: ['40', '41', '42', '43', '44'] }, { name: 'Colour', options: ['Black', 'White'] }], desc: 'Lightweight running shoes with cushioned soles.' },
    ],
  },
  {
    slug: 'saveurs-congo', days: 1, name: 'Saveurs du Congo', owner: 'Marie-Claire Lukusa', color: '0xA16207', accent: '0xFDE68A',
    category: 'Groceries', commune: 'Limete', idNumber: 'CD-6634-2210',
    description: 'Congolese pantry staples: fufu flour, palm oil, pondu, spices and coffee from Kivu. Packed fresh every morning.',
    pickup: '112 Boulevard Lumumba, Limete, Kinshasa',
    products: [
      { name: 'Cassava Flour (Fufu) 5 kg', nameFr: 'Farine de manioc (fufu) 5 kg', price: 9, stock: 120, desc: 'Fine-milled cassava flour.' },
      { name: 'Red Palm Oil 1 L', nameFr: 'Huile de palme rouge 1 L', price: 4, stock: 150, desc: 'Unrefined red palm oil.' },
      { name: 'Kivu Arabica Coffee 500 g', nameFr: 'Café arabica du Kivu 500 g', price: 14, orig: 17, stock: 60, variants: [{ name: 'Grind', options: ['Beans', 'Ground'] }], desc: 'Single-origin coffee from South Kivu, medium roast.' },
      { name: 'Pili-Pili Hot Sauce', nameFr: 'Sauce pili-pili', price: 3, stock: 200, desc: 'Fresh chilli sauce, 250 ml.' },
    ],
  },
  {
    slug: 'kin-kids', days: 3, name: 'Kin Kids Corner', owner: 'Sarah Ngalula', color: '0x7C3AED', accent: '0xC4B5FD',
    category: 'Fashion', commune: 'Bandalungwa', idNumber: 'CD-8812-4476',
    description: 'Children\'s clothes and school uniforms from 2 to 14 years. Uniform sets for most Kinshasa schools.',
    pickup: '9 Avenue Kasavubu, Bandalungwa, Kinshasa',
    products: [
      { name: 'School Uniform Set', nameFr: 'Ensemble uniforme scolaire', price: 24, stock: 80, days: 6, variants: [{ name: 'Age', options: ['4-6', '7-9', '10-12', '13-14'] }], desc: 'White shirt and navy trousers or skirt.' },
      { name: 'Kids Sneakers', nameFr: 'Baskets enfant', price: 19, orig: 25, stock: 40, variants: [{ name: 'Size', options: ['28', '30', '32', '34'] }], desc: 'Velcro sneakers with a non-slip sole.' },
      { name: 'Cotton Pyjamas', nameFr: 'Pyjama en coton', price: 12, stock: 50, variants: [{ name: 'Age', options: ['2-3', '4-5', '6-7'] }], desc: 'Soft two-piece pyjamas.' },
      { name: 'School Backpack', nameFr: 'Sac à dos scolaire', price: 16, stock: 45, desc: 'Padded straps, bottle pocket, fits A4 folders.' },
    ],
  },
  {
    slug: 'digital-masina', days: 4, name: 'Digital Masina', owner: 'Héritier Kalonji', color: '0x0F766E', accent: '0x5EEAD4',
    category: 'Electronics', commune: 'Masina', idNumber: 'CD-4407-6619',
    description: 'TVs, solar kits and home electronics at fair prices. Installation in Masina, N\'djili and Kimbanseke.',
    pickup: '56 Route de Matadi, Masina, Kinshasa',
    products: [
      { name: '43" Smart TV', nameFr: 'Smart TV 43"', price: 249, orig: 299, stock: 10, desc: 'Full HD smart TV with Wi-Fi, YouTube and Netflix.' },
      { name: 'Solar Home Kit 100 W', nameFr: 'Kit solaire domestique 100 W', price: 159, stock: 12, days: 7, desc: 'Panel, battery, 4 bulbs and a phone-charging port.' },
      { name: 'Bluetooth Speaker', nameFr: 'Enceinte Bluetooth', price: 27, stock: 35, variants: [{ name: 'Colour', options: ['Black', 'Red'] }], desc: '10 W speaker, 12-hour battery, FM radio.' },
      { name: 'Voltage Stabiliser 1000 VA', nameFr: 'Stabilisateur de tension 1000 VA', price: 38, stock: 20, desc: 'Protects the TV and fridge from power surges.' },
    ],
  },
];

// ---------------------------------------------------------------- plumbing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** fetch that waits out the API's rate limit (30 requests/minute per IP): a 429, or the connection the
 *  limiter closes mid-upload, is retried after a pause. */
async function fetchPatiently(url, init, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init());
      if (res.status !== 429 || attempt >= 6) return res;
    } catch (e) {
      if (attempt >= 6) throw new Error(`${label}: ${e.message} ${e.cause?.message ?? ''}`);
    }
    process.stdout.write(`  … rate limited, waiting 20 s (${label})\n`);
    await sleep(20000);
  }
}
const post = async (p, body) => {
  const res = await fetchPatiently(API + p, () => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), p);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(API, { auth: { token }, transports: ['websocket'] });
  s.on('ready', () => resolve(s));
  s.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket timeout')), 8000);
});
// The gateway allows 40 events/second/socket: pace each socket.
const nextSlot = new WeakMap();
const req = async (s, ev, b = {}) => {
  const at = Math.max(Date.now(), nextSlot.get(s) ?? 0);
  nextSlot.set(s, at + 40);
  if (at > Date.now()) await sleep(at - Date.now());
  return new Promise((r) => s.emit(ev, b, r));
};
const must = (r, what) => {
  if (!r?.ok) throw new Error(`${what}: ${r?.error ?? 'no response'}`);
  return r.data;
};

/** Draws a PNG with ffmpeg: a coloured background, an inner band and centred text. */
function draw(file, { w, h, color, accent, text, size }) {
  const safe = text.replace(/\\/g, '').replace(/'/g, '’').replace(/:/g, '\\:');
  const vf = [
    `drawbox=x=0:y=${Math.round(h * 0.62)}:w=${w}:h=${Math.round(h * 0.38)}:color=${accent}@0.55:t=fill`,
    `drawtext=text='${safe}':fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(h * 0.08)}`,
  ].join(',');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}`, '-vf', vf, '-frames:v', '1', file], { stdio: ['ignore', 'ignore', 'ignore'] });
  return file;
}

async function upload(token, file) {
  const res = await fetchPatiently(API + '/api/v1/uploads', () => {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'image/png' }), path.basename(file));
    return { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form };
  }, `upload ${path.basename(file)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.url) throw new Error(`upload ${path.basename(file)}: ${res.status} ${JSON.stringify(json)}`);
  return json.url;
}

async function signIn(email, password, name) {
  let r = await post('/api/v1/auth/login', { email, password });
  if (r.status !== 200 && name) {
    const reg = await post('/api/v1/auth/register', { email, password, name, role: 'seller' });
    if (reg.status !== 201) throw new Error(`register ${email}: ${reg.status} ${JSON.stringify(reg.json)}`);
    r = await post('/api/v1/auth/login', { email, password });
  }
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.accessToken, user: r.json.user, sock: await connect(r.json.accessToken) };
}

// ---------------------------------------------------------------- main
(async () => {
  if (!ADMIN_PW) throw new Error('Set ADMIN_PW (the admin@somba.app password of this API).');
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PW);

  const cats = must(await req(admin.sock, 'categories:list'), 'categories:list');
  for (const c of NEW_CATEGORIES) {
    if (!cats.some((x) => x.name === c.name)) {
      must(await req(admin.sock, 'categories:create', c), `create category ${c.name}`);
      console.log(`+ category ${c.name}`);
    }
  }
  const catFr = Object.fromEntries([...cats, ...NEW_CATEGORIES].map((c) => [c.name, c.nameFr ?? null]));

  const summary = [];
  for (const st of STORES) {
    const email = `${st.slug}@stores.test`;
    const seller = await signIn(email, STORE_PW, st.owner);
    let store = must(await req(seller.sock, 'sellers:mine'), 'sellers:mine');

    if (!store) {
      const doc = await upload(seller.token, draw(path.join(TMP, `${st.slug}-id.png`), { w: 800, h: 500, color: '0x334155', accent: '0x94A3B8', text: `ID ${st.idNumber}`, size: 44 }));
      store = must(await req(seller.sock, 'sellers:register', {
        name: st.name,
        legalName: `${st.name} SARL`,
        phone: `+24381${st.idNumber.replace(/\D/g, '').slice(-7)}`,
        idNumber: st.idNumber,
        rccm: `CD/KIN/RCCM/26-B-${st.idNumber.slice(-4)}`,
        documentUrls: [doc],
        acceptTerms: true,
      }), `register ${st.name}`);
    }
    if (store.status !== 'approved') {
      must(await req(admin.sock, 'sellers:setStatus', { id: store.id, status: 'approved' }), `approve ${st.name}`);
    }

    // Storefront branding (uploaded again only when missing).
    const brand = { pickupAddress: st.pickup, description: st.description };
    if (!store.logoUrl) {
      const initials = st.name.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      brand.logoUrl = await upload(seller.token, draw(path.join(TMP, `${st.slug}-logo.png`), { w: 512, h: 512, color: st.color, accent: st.accent, text: initials, size: 200 }));
    }
    if (!store.bannerUrl) {
      brand.bannerUrl = await upload(seller.token, draw(path.join(TMP, `${st.slug}-banner.png`), { w: 1600, h: 400, color: st.color, accent: st.accent, text: st.name, size: 110 }));
    }
    must(await req(seller.sock, 'sellers:update', brand), `branding ${st.name}`);

    // Products: create the missing ones, then make sure every one of them is live.
    const own = (must(await req(seller.sock, 'products:list', { limit: 500 }), 'products:list') ?? []).filter((p) => p.sellerId === store.id);
    let created = 0;
    for (const p of st.products) {
      let prod = own.find((x) => x.name === p.name);
      if (!prod) {
        const img = await upload(seller.token, draw(path.join(TMP, `${st.slug}-${created}.png`), { w: 800, h: 800, color: st.color, accent: st.accent, text: p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name, size: 46 }));
        prod = must(await req(seller.sock, 'products:create', {
          name: p.name,
          nameFr: p.nameFr,
          price: p.price,
          ...(p.orig ? { originalPrice: p.orig } : {}),
          category: st.category,
          categoryFr: catFr[st.category] ?? undefined,
          stock: p.stock,
          deliveryDays: p.days ?? st.days,
          image: img,
          description: p.desc,
          ...(p.variants ? { variants: p.variants } : {}),
        }), `create ${p.name}`);
        created++;
      }
      // The seller's delivery time (kept in step when the script changes it; not a material edit, stays live).
      const days = p.days ?? st.days;
      if (prod.deliveryDays !== days) must(await req(seller.sock, 'products:update', { id: prod.id, patch: { deliveryDays: days } }), `delivery time ${p.name}`);
      if (prod.status !== 'live') must(await req(admin.sock, 'products:update', { id: prod.id, patch: { status: 'live' } }), `publish ${p.name}`);
    }
    seller.sock.close();
    summary.push({ store: st.name, email, category: st.category, commune: st.commune, products: st.products.length, newProducts: created });
    console.log(`✓ ${st.name.padEnd(22)} ${email.padEnd(30)} ${st.products.length} products (${created} new)`);
  }
  admin.sock.close();
  console.table(summary);
  console.log(`All sellers sign in with the password in STORE_PW (test/seed-test-stores.cjs).`);
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message, e.cause?.message ?? '');
  process.exit(1);
});
