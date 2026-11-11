#!/usr/bin/env node
/**
 * i18n audit for the staff-facing web portals (seller, admin, warehouse desk, rider).
 *
 * What it does
 *   Signs in as the demo accounts of every portal role through the real /login form, crawls every reachable page
 *   (links found on the pages plus the static routes under src/app/<portal>), and on each page walks a fixed set of
 *   interactions inside the page: tabs, safe "opener" buttons (add / edit / filter / details...), the notification bell,
 *   dropdowns, dialogs, and the submit button of a form left empty (validation messages, toasts). It does this once with
 *   the page language set to English and once to French (localStorage `somba-locale`), extracts every visible text node
 *   plus placeholder / title / aria-label / alt / <option> / document.title, and reports the strings that are IDENTICAL in
 *   both languages and contain at least two alphabetic words, plus single lower-case raw keys (`in_transit`).
 *   Those are either untranslated UI or data that legitimately stays (names, brands, ids, typed text). The ALLOWLIST and
 *   DEMO_TEXT below hold the data, each group with its reason; strings the API writes in English are listed apart
 *   (SERVER_STRINGS) so they stay visible without being counted against the web.
 *   A last section lists French-pass strings that look English and have no identical English twin.
 *
 * Needs
 *   - the API and the web app running (a throwaway database seeded with `npm run seed:demo`), the web built with
 *     NEXT_PUBLIC_API_URL pointing at that API. `next start` is much faster than `next dev` for a crawl;
 *   - playwright-core installed OUTSIDE the repo (it is not a dependency of web/):
 *       mkdir /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright-core     (then PW_DIR=/tmp/pw)
 *   - a Chrome / Chromium binary (CHROME, default: macOS Google Chrome). The browser runs with a throwaway profile.
 *
 * Run (one portal per process; they can run in parallel)
 *   PW_DIR=/tmp/pw BASE=http://localhost:3082 DEMO_PASSWORD='<the demo password>' OUT=/tmp/i18n-out \
 *     node web/scripts/i18n-audit-portals.mjs seller        # or: admin | warehouse | rider | all
 *   Optional: ACCOUNTS=seller.a,seller.c   restrict to some accounts
 *             ONLY=/seller/orders,/seller/coupons   open just these pages (no link discovery): re-check a fix
 *             MAX_PER_PATTERN=2   how many pages of each dynamic kind (/orders/:id) to open per account
 *             HEADFUL=1           show the browser
 *   Output: $OUT/<portal>.json (raw strings per page and language) and $OUT/<portal>.report.txt (the candidates).
 *   Re-triage a saved crawl after editing the allowlist:  node web/scripts/i18n-audit-portals.mjs --report seller
 *   The password is read from the environment and never printed or written.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(process.env.PW_DIR || process.cwd(), "noop.js"));
const { chromium } = req("playwright-core");

const BASE = process.env.BASE || "http://localhost:3082";
const PASSWORD = process.env.DEMO_PASSWORD || "";
const OUT = process.env.OUT || path.join(os.tmpdir(), "i18n-audit-portals");
const CHROME = process.env.CHROME || "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome";
const MAX_PER_PATTERN = Number(process.env.MAX_PER_PATTERN || 2);
const VERBOSE = !!process.env.VERBOSE;
const DOMAIN = "@demo.komoriko.test";
const APP_DIR = path.join(here, "..", "src", "app");

/** Accounts per portal, in crawl order. The first account of a portal visits every route; the others only what is new
 *  for them plus their own home page (their dashboard and menu differ). Local-parts: deploy/DEMO-SEED.md. */
const PORTALS = {
  seller: {
    prefix: "/seller",
    accounts: ["seller.a", "seller.b", "seller.c", "seller.d", "seller.e", "seller.f", "seller.g", "seller.h", "team.manager", "team.catalog", "team.orders", "team.finance", "team.support"],
    // Gate pages and plan walls that only some accounts reach.
    extra: { "seller.b": ["/seller/coupons", "/seller/flash-sales", "/seller/team", "/seller/subscribe"], "seller.d": ["/seller/pending"], "seller.e": ["/seller/resubmit"], "team.support": ["/seller/finance", "/seller/products"], "team.finance": ["/seller/orders/new-nope"] },
  },
  admin: {
    prefix: "/admin",
    accounts: ["admin.super", "admin.moderation", "admin.operations", "admin.finance", "admin.marketing", "admin.support"],
    extra: { "admin.finance": ["/admin/settings"], "admin.support": ["/admin/finance"], "admin.marketing": ["/admin/roles"] },
  },
  warehouse: {
    prefix: "/warehouse",
    accounts: ["warehouse.manager", "warehouse.supervisor", "warehouse.operator", "warehouse.maluku"],
    extra: { "warehouse.operator": ["/warehouse/settings", "/warehouse/analytics"] },
  },
  rider: { prefix: "/rider", accounts: ["rider", "rider.maluku"], extra: { rider: ["/rider/first-password"] } },
};

/**
 * Strings that are identical in EN and FR on purpose. Matched against the whole string (case-insensitive) when the
 * entry is a string, or with .test() when it is a RegExp. Every entry says why it stays.
 */
const ALLOWLIST = [
  // Brand and product names.
  [/^komoriko\b/i, "brand"],
  [/^lipcart\b/i, "brand"],
  // Currencies / units / codes that read the same in both languages and have fewer than two words once cleaned
  // are already dropped by the two-word rule; these are the multi-word ones.
  [/^(usd|cdf|fc|xaf)\b/i, "currency code"],
  // Data shown as typed by people: names, e-mails, phone numbers, order numbers, tracking codes, ids.
  [/@/, "e-mail address (data)"],
  [/^[+()\d\s.-]+$/, "phone / number"],
  [/^[A-Z0-9][A-Z0-9-]{5,}$/, "code / reference (data)"],
  // Demo data: names of people, stores, warehouses, products and addresses are written by users / the seed, not UI.
  [/^(demo|kinshasa) [\p{L}\s]+$/iu, "demo account / staff name (data)"],
  [/^(maison kinshasa|limete grossiste|ndolo [ée]lectro|bandal textiles|kintambo cosm[ée]tiques|gombe gadgets|kasa-vubu artisanat|ngaliema fournitures)$/i, "demo store name (data)"],
  [/^entrep[ôo]t [\p{L}\s()éè]+$/iu, "warehouse name (data)"],
  [/^maluku \(demo warehouse\)$/i, "warehouse short name (data)"],
  [/^entrep[ôo]t [^—]+ — .+$/iu, "warehouse name + its address (data)"],
  [/^\d+,? ?(avenue|boulevard|rue|av\.)\b/i, "street address (data)"],
  [/^(odette kalala|grace mbuyi|jean-baptiste( mukendi)?|daniel ngandu|esther kabongo|rita banza|samuel kitenge|naomi mulumba|patrick kasongo|chantal ilunga|albert tshibangu)$/i, "demo customer / rider name (data)"],
  // "<order reference> · <reason typed by the customer>" and "<ticket category> · <ticket subject typed by the user>".
  [/^(Commande|Order) [A-Z]{3}-\d+ · /, "order reference + typed reason"],
  [/^(Compte|Paiement|Commande|Livraison|Technique|Autre|Account|Payment|Order|Delivery|Technical|Other) · .+$/, "ticket category + typed subject"],
  // Free text a customer or a store wrote (question / chat / reason lines are shown as typed; translating them is the
  // "translate" button's job, owned by the review / Q&A / chat builder).
  [/^[\p{L}0-9 .,'’-]+: .{10,}$/u, "'<product or person>: <message typed by a user>'"],
  // Both-language labels by design: the broadcast form has an English and a French message field.
  [/^message \((en|fr)\)$/i, "EN/FR field label"],
  // Brands of payment methods and plans, and acronyms that read the same in French.
  [/^(mobile money|airtel money|orange money|vodacom m-pesa|m-pesa|gmv \(usd\)|super admin)$/i, "brand / acronym"],
  // The test translator of the local stack (TRANSLATE_PROVIDER=fake) prefixes machine translations with "[fr] ".
  [/^\[fr\] /, "fake-provider machine translation (local stack only)"],
  // Warehouse lanes and legs are "<from> → <to>" with the names of stores, warehouses and customers.
  [/^.+ → .+$/, "route label made of names (data)"],
  [/^SKU[-: ]/, "SKU (data)"],
  [/^[0-9a-f]{8}$/, "short id (data)"],
  // Machine ids shown in tables: order SOM-..., parcel PKG-..., exception INC-/EXC-..., uuids.
  [/^[A-Z]{2,4}-[0-9A-Z]{5,}( ·.*)?$/, "reference (data)"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-/, "uuid (data)"],
];

// Single lower-case words that are the same in French on purpose (shown as such in the UI).
const KEEP_LOWER = new Set(["pro", "ref", "info", "audit", "admin", "email", "code", "type", "date", "note", "notes", "action", "actions", "stock", "photo", "photos", "message", "conversation", "transaction", "express", "agent", "total", "hub", "commission", "support", "marketing", "finance", "cms", "sku"]);
/**
 * Exact strings of the DEMO DATA that people (or the seed) typed and the UI shows as written: product names and
 * descriptions, reviews, questions, chat lines, return / exchange / incident reasons, ticket subjects, team member names,
 * place names. They are the same in both languages because they are content, not interface. Translating user content is
 * the "translate" button's job (see components/shop/translatable-text.tsx), not this audit's.
 */
const DEMO_TEXT = new Set([
  "6.5 inch display, 128 GB storage, dual SIM, 5000 mAh battery. Includes charger and cable. One year warranty.",
  "Admin Root",
  "African Black Soap Bar",
  "Aimé Kabeya",
  "Alain Mpoyi (finance)",
  "Approved for the demo.",
  "Articles de sport",
  "Bandalungwa, Bumbu, Kalamu, Kasa-Vubu, Makala, Ngiri-Ngiri, Selembao, Barumbu, Gombe, Kinshasa, Kintambo, Lingwala, Mont-Ngafula, Ngaliema, Kisenso, Lemba, Limete, Matete, Ngaba, Kimbanseke, Masina, N'djili, Nsele",
  "Bas-Uélé",
  "Batterie externe 20 000 mAh",
  "Beaded Necklace",
  "Beautiful dress, the fabric is thick and the colours did not fade after washing. It fits as described. Delivered on time.",
  "Bluetooth Speaker",
  "Bonjour, ma robe est en livraison. Pouvez-vous me confirmer que la taille S correspond bien à du 36 ?",
  "Bright enough for the whole room during power cuts. Solar charging is slow on cloudy days.",
  "Bénédicte Lukusa (support)",
  "CD/KIN/RCCM/DEMO-065",
  "CD/KIN/RCCM/DEMO-066",
  "CD/KIN/RCCM/DEMO-071",
  "Can I use only one earbud at a time?",
  "Canvas Sneakers",
  "Carved Wooden Figure",
  "Central Kasai",
  "Central Kongo",
  "Charged my phone four times in one day. Works with all my cables.",
  "Clean, long grain white rice in a 5 kg bag. Cooks fluffy and separate.",
  "Colourful hand-strung glass bead necklace.",
  "Colourful hand-woven basket from raffia and grass. Good for storage or shopping.",
  "Comfortable and light. A bit tight at the start but they loosen after two days.",
  "Cracked lenses found at shelving",
  "Cushion Cover Set, 4 pieces",
  "Customer called back and confirmed the address.",
  "Customer phone was off; rider could not confirm the address.",
  "Daniel Ngandu — 6 Avenue de l’Université, Kintambo, Kinshasa",
  "Deux sorties USB et un port USB-C. Recharge un téléphone environ cinq fois. Des voyants indiquent la charge restante.",
  "Do you have these in size 45?",
  "Does this phone take two SIM cards and work on 4G in Kinshasa?",
  "Dried hibiscus flowers for a deep red, tangy drink served hot or cold.",
  "Dès 20 $ d’achat. Données de démonstration, visibles par tous tant qu’elles sont installées.",
  "Eastern Kasai",
  "Electric Kettle 1.7 L",
  "Enceinte Bluetooth",
  "Enceinte portable aux basses profondes, résistante aux éclaboussures. Également en attente de modération.",
  "Entrepôt Kinshasa — Gombe",
  "Entrepôt Maluku (démo) · Kinshasa",
  "Entrepôt Maluku (démo): workStart \"08:00\" -> \"07:00\"; workEnd \"18:00\" -> \"19:00\"; batchSize 20 -> 12",
  "Est-ce que cette robe rétrécit au lavage ? Je fais du 40.",
  "Fast-boil kettle with automatic shut-off and a 1.7 litre capacity.",
  "Figurine en bois sculpté",
  "Figurine sculptée à la main en bois, environ 30 cm de haut. Chaque pièce est légèrement différente.",
  "Fiston Mbala",
  "Foldable LED desk lamp with three colour temperatures and a USB charging port. Waiting for moderation.",
  "Football, Size 5",
  "Fresh and crunchy, well salted.",
  "GMV (USD)",
  "Gestion des commandes Analytique de base Support par e-mail",
  "Gestion des commandes Support par e-mail",
  "Gombe, Kinshasa",
  "Good battery, the camera is fine in daylight. Two SIM slots are very useful.",
  "Good oil, strong colour and smell. The bottle leaked a little at the cap but nothing was lost.",
  "Gorgeous print and a perfect fit. I got compliments all day at the wedding.",
  "Ground Coffee 500 g",
  "Hand Drum",
  "Hand-carved wooden figure, about 30 cm tall. Each piece is slightly different.",
  "Hand-made wooden drum with a goat-skin head, about 40 cm tall.",
  "Hand-woven Basket",
  "Hand-woven floor mat in natural fibre, 120 x 180 cm. Out of stock until the next batch arrives.",
  "Haut-Katanga",
  "Haut-Lomami",
  "Haut-Uélé",
  "Hello Grace, thank you for your message. We only have Blue and Red at the moment. A green one arrives next month.",
  "Hello Grace, your order is packed by the seller and a rider is assigned to collect it today. You will get a notice when it is at our warehouse.",
  "Hello! Do you have this dress in green, like the one in my picture?",
  "Hello! Yes, size S is a French 36. Your parcel is on its way and the rider will call you.",
  "Hello, open Subscribe in your portal, choose Pro and pay with your wallet. The perks are on straight away.",
  "Hibiscus Tea (Bissap) 250 g",
  "Home & Living",
  "How do I get on the Pro plan?",
  "I ordered honey and hair oil this morning and I would like to know when the rider will come.",
  "Invited (pending)",
  "Is the oil sold in a plastic or a glass bottle?",
  "Jacques Mwamba",
  "Jane Doe, +243 8x xxx xxxx",
  "Jean-Baptiste ·",
  "Josée Mbombo (orders)",
  "Kalamu, Kinshasa",
  "Kasa-Vubu",
  "Kasa-Vubu Artisanat SARL (demo)",
  "Kasaï Central",
  "Kasaï Oriental",
  "Kongo Central",
  "La chemise a une tache près du col.",
  "Lampe de bureau LED pliable à trois températures de couleur et port de charge USB. En attente de modération.",
  "Lampe de bureau rechargeable",
  "Leather Handbag",
  "Les retours sont acceptés dans les 7 jours suivant la livraison pour les articles non utilisés dans leur emballage d’origine. Les produits alimentaires et de beauté doivent être non ouverts.",
  "Limete Grossiste SARL (demo)",
  "Limete Grossiste — 8 Boulevard Lumumba, Limete, Kinshasa",
  "Limete Grossiste, Maison Kinshasa",
  "Limete, Kinshasa",
  "Long Grain Rice 5 kg",
  "Looks much more expensive than it is. The strap is comfortable and the zip is solid.",
  "Lower Uele",
  "Léa Kabeya (manager)",
  "Mai-Ndombe",
  "Maison Kinshasa SARL (demo)",
  "Maison Kinshasa ·",
  "Maison Kinshasa — 14 Avenue du Commerce, Gombe, Kinshasa",
  "Maison Kinshasa, Limete Grossiste",
  "Maluku, Kinshasa",
  "Men's Linen Shirt",
  "Merci beaucoup, très bon service !",
  "Michel Tshisekedi (catalog)",
  "Mont-Ngafula",
  "Moved to the cold shelf",
  "Multi-boutiques Commission sur mesure Gestionnaire dédié SLA et accompagnement",
  "Multi-store Custom commission Dedicated manager SLA & onboarding",
  "Natural Honey 500 g",
  "Ngiri-Ngiri",
  "Nord-Kivu",
  "Nord-Ubangi",
  "North Kivu",
  "North Ubangi",
  "Noël Tshimanga",
  "On orders over $20. Demo data, visible to everyone while it is installed.",
  "Order management Basic analytics Email support",
  "Order management Email support",
  "Padded backpack with two compartments and a bottle pocket. Saved as a draft, not on sale yet.",
  "Panier coloré tressé à la main en raphia et herbe. Pratique pour le rangement ou les courses.",
  "Panier tressé à la main",
  "Perfect, I will order the blue M today.",
  "Portable speaker with deep bass and a splash-proof body. Also waiting for moderation.",
  "Power Bank 20,000 mAh",
  "Prisca Lunda",
  "Promotions & flash sales Advanced analytics Priority support",
  "Promotions et ventes flash Analytique avancée Support prioritaire",
  "Pure shea butter, no smell of chemicals. My skin is much softer.",
  "Quiet stand fan with a built-in battery that runs about eight hours without mains power.",
  "Real honey, thick and fragrant. Better than the supermarket one.",
  "Rechargeable Desk Lamp",
  "Rechargeable Stand Fan",
  "Red Palm Oil 1 L",
  "Returns are accepted within 7 days of delivery for unused items in their original packaging. Food and beauty products can only be returned unopened.",
  "Rich coffee, smells wonderful when you open the bag.",
  "Riz blanc long grain propre en sac de 5 kg. Cuit léger et bien détaché.",
  "Riz long grain 5 kg",
  "SCAM!!! Do not buy from this seller, they are thieves and liars!!! I want everything back!!!",
  "Sac à dos rembourré à deux compartiments et poche pour bouteille. Enregistré en brouillon, pas encore en vente.",
  "Seller delivery (demo)",
  "Several customers reported items that never arrived. The store is suspended while we investigate.",
  "Shea Butter 250 g",
  "Shoe box crushed at one corner; the shoes look fine.",
  "Size M fits 1.65 to 1.75 m. Here is our measuring guide.",
  "Smartphone A15 flash deal",
  "Solar LED Lantern",
  "Sound is okay for the price but the case is loose and the left bud disconnects sometimes.",
  "South Kivu",
  "South Ubangi",
  "Storage Bin Set, 3 pieces",
  "Sud-Kivu",
  "Sud-Ubangi",
  "Tapis tressé",
  "Tapis tressé à la main en fibres naturelles, 120 x 180 cm. Rupture de stock jusqu’au prochain lot.",
  "Thank you Esther! We are happy the dress fitted so well.",
  "Thank you for the honest review. The solar panel needs direct sun; the USB cable charges it faster.",
  "Thanks! What size would you recommend for 1.70 m?",
  "The ID document is unreadable and the RCCM number does not match the legal name. Please upload clear copies and submit again.",
  "The box arrived crushed and two cushion covers were missing from the set.",
  "The fabric is pre-washed so it does not shrink. For a French size 40, take the M. Wash it at 30 degrees.",
  "The lantern does not charge from the solar panel.",
  "The screen was cracked when I opened the box.",
  "The shirt is too large and I would like my money back.",
  "The shirt left our warehouse clean. The stain is not from us, so we cannot accept this return.",
  "The size is too small, I need a 42.",
  "The total on my receipt does not match what was taken from my wallet. I attach a photo of the receipt.",
  "Three stackable plastic bins with lids, in three sizes.",
  "Trop petites, je voudrais la pointure 41.",
  "Très bonne huile de palme, couleur et goût authentiques. Emballage à améliorer.",
  "Two USB outputs and one USB-C port. Charges a phone about five times. Indicator lights show what is left.",
  "Two of the three steel bottles in the parcel were missing at scan-in.",
  "Un beurre de karité pur, très hydratant. Livraison rapide, je recommande ce vendeur.",
  "Upper Katanga",
  "Upper Lomami",
  "Upper Uele",
  "Wax Print Maxi Dress",
  "We are on the Free plan and want coupons and flash sales. What is the next step?",
  "We are sorry about this. We packed four covers and the box looked fine in our photo. Could you send a picture of the covers you received?",
  "We are sorry you feel this way. The towel was delivered on time; please contact us so we can help.",
  "We pack every order within one working day and hand it to the KOMORIKO warehouse in Gombe.",
  "Weekly count (demo)",
  "Where is my order of honey and oil?",
  "Wireless Earbuds",
  "Wooden Building Blocks, 50 pieces",
  "Woven Floor Mat",
  "Wrong total on my receipt",
  "Yes, each earbud works alone.",
  "Yes, it has two nano SIM slots and supports 4G on all Kinshasa networks. A memory card can go in a third slot.",
  "Yoga Mat",
  "[ { \"id\": \"free\", \"name\": \"Free\", \"nameFr\": \"Gratuit\", \"priceUsd\": 0, \"months\": 1, \"features\": [ \"Order management\", \"Email support\" ], \"featuresFr\": [ \"Gestion des commandes\", \"Support par e-mail\" ] }, { \"id\": \"starter\", \"name\": \"Starter\", \"nameFr\": \"Starter\", \"priceUsd\": 49, \"months\": 1, \"features\": [ \"Order management\", \"Basic analytics\", \"Email support\" ], \"featuresFr\": [ \"Gestion des commandes\", \"Analytique de base\", \"Support par e-mail\" ] }, { \"id\": \"pro\", \"name\": \"Professional\", \"nameFr\": \"Professionnel\", \"priceUsd\": 99, \"months\": 1, \"features\": [ \"Promotions & flash sales\", \"Advanced analytics\", \"Priority support\" ], \"featuresFr\": [ \"Promotions et ventes flash\", \"Analytique avancée\", \"Support prioritaire\" ], \"popular\": true }, { \"id\": \"enterprise\", \"name\": \"Enterprise\", \"nameFr\": \"Entreprise\", \"priceUsd\": null, \"months\": 1, \"features\": [ \"Multi-store\", \"Custom commission\", \"Dedicated manager\", \"SLA & onboarding\" ], \"featuresFr\": [ \"Multi-boutiques\", \"Commission sur mesure\", \"Gestionnaire dédié\", \"SLA et accompagnement\" ] } ]",
  "demo-delivery",
  "demo-home-hero",
  "demo-promo-strip",
  "order · Where is my order of honey and oil?",
  "· Gombe, Kinshasa",
  "· Maison Kinshasa",
  "Écran de 6,5 pouces, 128 Go de stockage, double SIM, batterie 5000 mAh. Chargeur et câble inclus. Garantie un an.",
]);
const WORD = /[\p{L}]{2,}/gu;
const twoWords = (s) => (s.match(WORD) || []).length >= 2;
const ENGLISH_HINT = /\b(the|and|your|you|with|for|has|have|not|is|are|was|were|will|this|that|from|please|no|yet|new|all|of|to|in|on|by|an|a)\b/i;
const FRENCH_HINT = /[àâçéèêëîïôûùüÿœ]|\b(il y a|min|le|la|les|des|du|de|un|une|et|ou|pour|avec|sur|dans|votre|vos|pas|est|sont|aucun|aucune|ce|cette|ces|vous|nous|par|au|aux|en)\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Static routes from the app folder: src/app/<portal>/**\/page.tsx, dynamic ones ([id]) are found through links. */
function staticRoutes(prefix) {
  const root = path.join(APP_DIR, prefix.slice(1));
  const out = [];
  const dynamic = [];
  const walk = (dir, url) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${url}/${e.name}`);
      else if (e.name === "page.tsx") (url.includes("[") ? dynamic : out).push(url);
    }
  };
  walk(root, prefix);
  return { out: [...new Set(out)], dynamic };
}

// A path segment that is an id (uuid, number, order / parcel / ticket reference with digits) counts as ":id", so only
// MAX_PER_PATTERN pages of each kind are opened.
const patternOf = (p) => p.split("/").map((s) => (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(s) || /\d/.test(s) && s.length >= 5 ? ":id" : s)).join("/");

/** Runs inside the page: every visible string. */
const EXTRACT = () => {
  const out = new Set();
  const add = (s) => {
    if (!s) return;
    const v = String(s).replace(/\s+/g, " ").trim();
    if (v) out.add(v);
  };
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH"]);
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest("nextjs-portal, [data-nextjs-toast], [data-next-badge-root]")) return false;
    if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") return true; // options are not "rendered" until opened
    try { return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }); } catch { return !!el.offsetParent; }
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el || skip.has(el.tagName.toUpperCase())) continue;
    if (!visible(el)) continue;
    add(n.nodeValue);
  }
  for (const el of document.querySelectorAll("[placeholder],[title],[aria-label],img[alt],input[type=submit],input[type=button]")) {
    if (!visible(el)) continue;
    add(el.getAttribute("placeholder"));
    add(el.getAttribute("title"));
    add(el.getAttribute("aria-label"));
    if (el.tagName === "IMG") add(el.getAttribute("alt"));
    if (el.tagName === "INPUT" && /submit|button/.test(el.type)) add(el.value);
  }
  add(document.title);
  return [...out];
};

/** Runs inside the page: same-portal links. */
const LINKS = (prefix) =>
  [...document.querySelectorAll("a[href]")]
    .map((a) => { try { const u = new URL(a.href, location.href); return u.origin === location.origin ? u.pathname : ""; } catch { return ""; } })
    .filter((p) => p === prefix || p.startsWith(prefix + "/"));

const OPENER = /^(\+|add|new|create|edit|filter|invite|detail|view|open|more|show|manage|configure|upgrade|ajouter|nouveau|nouvelle|créer|creer|modifier|filtrer|inviter|détail|voir|ouvrir|plus|afficher|gérer|gerer|configurer|passer|choose|select|choisir|sélectionner|preview|aperçu|history|historique|notes?|columns|colonnes|sort|trier|refresh|actualiser|help|aide|learn|how|comment)\b/i;
const SAVE = /^(save|submit|next|continue|create|add|send|apply|update|confirm|register|sign|enregistrer|soumettre|suivant|continuer|créer|ajouter|envoyer|appliquer|mettre|confirmer|valider|enregistrement)\b/i;
const DANGER = /(delete|supprim|remove|retir|reject|rejet|refus|decline|cancel|annul|logout|sign out|déconnex|suspend|block|bloqu|ban\b|reset|réinit|revoke|révoqu|deactivate|désactiv|pay|payer|refund|rembours|approve|approuv|publish|publi|accept|assign|attribu|mark|marquer|scan|upload|télécharg|download|export|print|imprim|impersonat|dispatch|expédi|release|libér|close|clôtur|escalat)/i;

/**
 * The whole interaction walk runs INSIDE the page in one evaluate call (tabs, bell, dropdowns, opener buttons, dialogs,
 * empty submit): one round trip per page instead of one per click, which matters on a loaded machine. Identical for
 * both languages. Returns { strings, links, finalPath, steps }.
 */
const WALK = async ({ prefix, withBell, opener, save, danger, formRoute }) => {
  const OPENER = new RegExp(opener, "i"), SAVE = new RegExp(save, "i"), DANGER = new RegExp(danger, "i");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const strings = new Set();
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const vis = (el) => {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest("nextjs-portal, [data-nextjs-toast], [data-next-badge-root]")) return false;
    if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") return true;
    try { return el.checkVisibility({ checkVisibilityCSS: true }); } catch { return !!el.offsetParent; }
  };
  const take = () => {
    const add = (s) => { const v = norm(s); if (v) strings.add(v); };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/i.test(el.tagName) || !vis(el)) continue;
      add(n.nodeValue);
    }
    for (const el of document.querySelectorAll("[placeholder],[title],[aria-label],img[alt],input[type=submit],input[type=button]")) {
      if (!vis(el)) continue;
      add(el.getAttribute("placeholder")); add(el.getAttribute("title")); add(el.getAttribute("aria-label"));
      if (el.tagName === "IMG") add(el.getAttribute("alt"));
      if (el.tagName === "INPUT" && /submit|button/.test(el.type)) add(el.value);
    }
    add(document.title);
  };
  const settle = async (max = 8000) => {
    const t0 = Date.now(); let last = -1, same = 0;
    while (Date.now() - t0 < max) {
      const txt = document.body ? document.body.innerText : "";
      const busy = !!document.querySelector(".animate-pulse, [aria-busy=true]") || /Loading…|Loading\.\.\.|Chargement…|Chargement\.\.\./.test(txt);
      if (!busy && txt.length === last) same++; else same = 0;
      last = txt.length;
      if (same >= 2) return;
      await sleep(400);
    }
  };
  const click = async (el, wait = 700) => { try { el.scrollIntoView({ block: "center" }); el.click(); } catch {} await sleep(wait); await settle(4000); };
  const closeOverlays = async () => {
    for (let i = 0; i < 3 && document.querySelector("[role=dialog], [role=alertdialog], [aria-modal=true]"); i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(300);
      if (document.querySelector("[role=dialog], [role=alertdialog], [aria-modal=true]")) {
        const x = [...document.querySelectorAll("[role=dialog] button, [aria-modal=true] button")].find((b) => /close|fermer|cancel|annuler|×|✕|^x$/i.test(norm(b.innerText) + " " + (b.getAttribute("aria-label") || "")));
        if (x) { x.click(); await sleep(300); }
      }
    }
  };
  const submitEmpty = async (scopeSel) => {
    const scope = document.querySelector(scopeSel) || document;
    const btns = [...scope.querySelectorAll("button")].filter((b) => vis(b) && !b.disabled);
    for (const b of btns) {
      const t = norm(b.innerText);
      if (!t || DANGER.test(t)) continue;
      if (!(SAVE.test(t) || b.type === "submit")) continue;
      await click(b, 900);
      take();
      return true;
    }
    return false;
  };

  await settle(120000);
  const finalPath = location.pathname;
  take();
  const links = [...document.querySelectorAll("a[href]")].map((a) => { try { const u = new URL(a.href, location.href); return u.origin === location.origin ? u.pathname : ""; } catch { return ""; } }).filter((p) => p === prefix || p.startsWith(prefix + "/"));

  // tabs
  const tabs = [...document.querySelectorAll("[role=tab]")].filter(vis).slice(0, 12);
  for (const t of tabs) { if (!t.isConnected) continue; await click(t, 500); take(); }

  // bell
  if (withBell) {
    const bell = [...document.querySelectorAll("button[aria-label]")].find((b) => /notif/i.test(b.getAttribute("aria-label")) && vis(b));
    if (bell) { await click(bell, 700); take(); await click(bell, 300); }
  }

  // custom dropdowns
  const pops = [...document.querySelectorAll("main [aria-haspopup]:not([aria-haspopup=false]), main [aria-expanded=false]")].filter(vis).slice(0, 6);
  for (const el of pops) {
    if (!el.isConnected) continue;
    if (DANGER.test(norm(el.innerText) + " " + (el.getAttribute("aria-label") || ""))) continue;
    await click(el, 400); take(); await closeOverlays();
  }

  // opener buttons
  const mainButtons = () => [...document.querySelectorAll("main button, main [role=button], main summary")];
  const cands = mainButtons().map((e, i) => ({ i, t: norm(e.innerText || e.getAttribute("aria-label") || e.title), e })).filter((c) => vis(c.e) && !c.e.disabled && c.t && c.t.length < 40 && OPENER.test(c.t) && !DANGER.test(c.t)).slice(0, 8).map((c) => c.t);
  for (const label of cands) {
    const el = mainButtons().find((e) => norm(e.innerText || e.getAttribute("aria-label") || e.title) === label && vis(e));
    if (!el) continue;
    const before = location.pathname;
    await click(el, 900);
    if (location.pathname !== before) { take(); history.back(); await sleep(800); await settle(6000); continue; }
    take();
    if (document.querySelector("[role=dialog], [aria-modal=true], dialog[open]")) { await submitEmpty("[role=dialog], [aria-modal=true], dialog[open]"); }
    await closeOverlays();
  }

  // form on the page itself
  if (formRoute || document.querySelector("main form")) await submitEmpty("main");
  await sleep(300);
  take();
  return { strings: [...strings], links, finalPath };
};

async function walkPage(page, url, prefix, { withBell }, loc) {
  await page.context().addCookies([{ name: "i18nloc", value: loc, url: BASE }]);
  try { await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 180000 }); }
  catch (e) { return { strings: new Set(), links: [], error: String(e.message).slice(0, 120), finalUrl: url }; }
  const formRoute = /\/(new|register|resubmit|subscribe|first-password|account|settings|storefront)(\/|$)/.test(url);
  try {
    const r = await page.evaluate(WALK, { prefix, withBell, opener: OPENER.source, save: SAVE.source, danger: DANGER.source, formRoute });
    return { strings: new Set(r.strings), links: r.links, finalUrl: r.finalPath };
  } catch (e) {
    // The page navigated away mid-walk (a form did a hard navigation): keep what a plain read gives.
    await sleep(1500);
    const strings = new Set(await page.evaluate(EXTRACT).catch(() => []));
    return { strings, links: [], finalUrl: new URL(page.url()).pathname, error: "walk: " + String(e.message).slice(0, 80) };
  }
}

async function login(browser, who, storageDir, fallbackHome) {
  const file = path.join(storageDir, `${who}.json`);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("somba-locale", "en"); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("input[type=password]", { state: "attached" });
  // Submitting before React has hydrated the form would do a native GET: wait for its React props.
  await page.waitForFunction(() => { const f = document.querySelector("form"); return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps")); }, null, { timeout: 240000, polling: 1000 });
  // Set the fields the way React expects (native setter + input event), then press the form's submit button, all in
  // the page: no actionability polling.
  await page.evaluate(([email, pw]) => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(document.querySelector("input[type=email]"), email);
    set(document.querySelector("input[type=password]"), pw);
  }, [who + DOMAIN, PASSWORD]);
  await page.evaluate(() => document.querySelector("form button[type=submit]").click());
  // The redirect to the portal home can take minutes on a cold dev server (the route compiles first). The session is
  // already stored once the page says "Redirecting"; stop waiting then and use the portal prefix as the home.
  let home = fallbackHome;
  try {
    await page.waitForFunction(() => !location.pathname.startsWith("/login") || /Redirecting|Redirection/.test(document.body.innerText), null, { timeout: 240000, polling: 1000 });
  } catch (e) {
    const shown = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300)).catch(() => "");
    throw new Error("sign-in did not complete: " + shown);
  }
  if (!new URL(page.url()).pathname.startsWith("/login")) home = new URL(page.url()).pathname;
  await sleep(1500);
  await ctx.storageState({ path: file });
  await ctx.close();
  return { file, home };
}

async function crawlPortal(browser, portalName, storageDir, visited) {
  const cfg = PORTALS[portalName];
  const accounts = (process.env.ACCOUNTS ? process.env.ACCOUNTS.split(",") : cfg.accounts).filter((a) => cfg.accounts.includes(a));
  const stat = staticRoutes(cfg.prefix);
  const pages = []; // {account, url, finalUrl, en:[], fr:[], error}
  const patternCount = new Map();

  for (const who of accounts) {
    let session;
    try { session = await login(browser, who, storageDir, cfg.prefix); } catch (e) { log(`LOGIN FAILED ${who}: ${String(e.message).slice(0, 100)}`); pages.push({ account: who, url: "(login)", error: String(e.message).slice(0, 200) }); continue; }
    log(`${portalName}: ${who} signed in -> ${session.home}`);
    // ONE browser context per account for both languages: the refresh token rotates, so two contexts sharing one stored
    // session would sign each other out. The language travels in a cookie (`i18nloc`) and an init
    // script copies it into localStorage `somba-locale` before the app starts.
    const ctx = await browser.newContext({ storageState: session.file, viewport: { width: 1360, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("somba-locale", /(?:^|; )i18nloc=fr/.test(document.cookie) ? "fr" : "en"); } catch {} });
    const pg = await ctx.newPage();
    pg.setDefaultTimeout(60000);
    pg.on("dialog", (d) => d.dismiss().catch(() => {}));
    const inLocale = (loc) => ({ page: pg, loc });
    const en = inLocale("en");
    const fr = inLocale("fr");
    const first = who === accounts[0];
    // ONLY=/admin/audit,/admin/cms : just these pages, no link discovery (re-checking fixes).
    const only = process.env.ONLY ? process.env.ONLY.split(",").filter((u) => u.startsWith(cfg.prefix)) : null;
    const queue = only ? [...only] : [session.home, cfg.prefix, ...(cfg.extra[who] || []), ...(first ? stat.out : [])];
    const homes = new Set([session.home, cfg.prefix]);
    const seen = new Set();
    let bellDone = false;
    while (queue.length) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const pat = patternOf(url);
      const isHome = homes.has(url);
      if (!isHome && visited.has(url)) continue;
      if (patternCount.get(pat + "@" + who) >= MAX_PER_PATTERN && pat.includes(":id")) continue;
      patternCount.set(pat + "@" + who, (patternCount.get(pat + "@" + who) || 0) + 1);
      visited.add(url);
      const withBell = !bellDone;
      // A loaded machine makes requests time out and pages half-render: walk again (up to 3 times) until both
      // languages show a comparable amount of text and no timeout message.
      let re, rf;
      for (let attempt = 1; attempt <= 3; attempt++) {
        re = await walkPage(en.page, url, cfg.prefix, { withBell }, "en");
        rf = await walkPage(fr.page, url, cfg.prefix, { withBell }, "fr");
        const a = re.strings.size, b = rf.strings.size;
        const timedOut = [...re.strings, ...rf.strings].some((x) => /timed out|trop de temps/i.test(x));
        const lopsided = Math.min(a, b) < 0.75 * Math.max(a, b);
        if (!timedOut && !lopsided) break;
        log(`  retry ${url} (en=${a} fr=${b}${timedOut ? " timeout" : ""})`);
      }
      bellDone = true;
      pages.push({ account: who, url, finalUrl: re.finalUrl, en: [...re.strings], fr: [...rf.strings], error: re.error || rf.error, status: re.status });
      for (const l of only ? [] : [...(re.links || []), ...(rf.links || [])]) {
        const clean = l.replace(/\/$/, "") || cfg.prefix;
        if (!seen.has(clean) && !queue.includes(clean)) queue.push(clean);
      }
      log(`${portalName}/${who} ${url}${re.finalUrl !== url ? " -> " + re.finalUrl : ""} en=${re.strings.size} fr=${rf.strings.size}${re.error ? " ERR " + re.error : ""} queue=${queue.length}`);
      fs.writeFileSync(path.join(OUT, `${portalName}.json`), JSON.stringify(pages, null, 1));
    }
    await ctx.close();
  }
  return pages;
}

function allowed(s) {
  return ALLOWLIST.find(([m]) => (m instanceof RegExp ? m.test(s) : m.toLowerCase() === s.toLowerCase())) || (DEMO_TEXT.has(s) ? ["demo text"] : null);
}

/** Strings the SERVER writes in English whatever the language (reported to the API owners, shown apart, not allowlisted). */
const SERVER_STRINGS = [
  [/^A refresh token used at .* was presented again/, "audit detail written by the API"],
  [/^(SOM|PKG|RET|EXC|REP)-[\w-]+ (pickup|delivery|transfer)( -> .*)?$/, "audit detail written by the API"],
  [/^warehouse_staff .* -> /, "audit detail written by the API (role key inside)"],
  [/^Welcome credit from KOMORIKO/, "wallet transaction description written by the API"],
  [/^Wallet top-up via /, "wallet transaction description written by the API"],
  [/^Colour: Blue$/, "payout statement line: the API sends productName / variant in English only (no productNameFr / variantFr)"],
  [/^Maison Kinshasa logo$/, "alt text built by components/shop/store-header.tsx (`${name} logo`), shared with the shop: owned by the shopper-site builder"],
  [/sent to your mobile-money number|was paid\.$|^the warehouse received the returned goods\.$|^Refunded to wallet$/, "notice body not localized by the API"],
];

function report(portalName, pages) {
  const same = new Map(); // short strings: string -> pages
  const long = new Map(); // 8+ words: sentences (typed text, helper copy) -> pages
  const server = new Map();
  const lowerKeys = new Map(); // single lower-case raw keys such as "in_transit" or "mobile_money"
  const englishInFr = new Map();
  const put = (m, k, u) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(u); };
  for (const p of pages) {
    if (!p.en) continue;
    const en = new Set(p.en);
    for (const s of p.fr) {
      const isSame = en.has(s);
      if (isSame && !allowed(s)) {
        const srv = SERVER_STRINGS.find(([re]) => re.test(s));
        if (srv) put(server, `${s}   <${srv[1]}>`, p.url);
        else if (twoWords(s)) put((s.match(WORD) || []).length >= 8 ? long : same, s, p.url);
        else if (/^[a-z][a-z_.]{2,}$/.test(s) && !KEEP_LOWER.has(s)) put(lowerKeys, s, p.url);
      } else if (!isSame && twoWords(s) && ENGLISH_HINT.test(s) && !FRENCH_HINT.test(s) && !allowed(s)) {
        put(englishInFr, s, p.url);
      }
    }
  }
  const lines = [];
  const dump = (title, m) => {
    lines.push(`## ${title} (${m.size})`);
    for (const [s, urls] of [...m].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) lines.push(`${urls.size}x  ${JSON.stringify(s)}   [${[...urls].slice(0, 3).join(", ")}]`);
    lines.push("");
  };
  dump(`${portalName}: identical in EN and FR, short (untranslated UI, or data to allowlist)`, same);
  dump(`${portalName}: identical in EN and FR, 8+ words (typed text / helper copy: read them)`, long);
  dump(`${portalName}: raw lower-case keys identical in EN and FR`, lowerKeys);
  dump(`${portalName}: server-written English (handed over to the API owners)`, server);
  dump(`${portalName}: English-looking in FR, no EN twin`, englishInFr);
  const errs = pages.filter((p) => p.error);
  if (errs.length) { lines.push(`## errors (${errs.length})`); for (const e of errs) lines.push(`${e.account} ${e.url} ${e.error}`); }
  fs.writeFileSync(path.join(OUT, `${portalName}.report.txt`), lines.join("\n"));
  log(`${portalName}: ${pages.length} pages, ${same.size} short + ${long.size} long identical, ${lowerKeys.size} raw keys, ${server.size} server, ${englishInFr.size} english-looking -> ${path.join(OUT, portalName + ".report.txt")}`);
  return { identical: same.size, long: long.size, lowerKeys: lowerKeys.size, server: server.size, englishInFr: englishInFr.size };
}

async function main() {
  const which = process.argv[2] || "all";
  const names = which === "all" ? Object.keys(PORTALS) : [which];
  if (!PASSWORD) { console.error("Set DEMO_PASSWORD (the demo accounts' password)."); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-audit-state-"));
  // launch() gives the browser its own throwaway profile folder (deleted on close): the owner's profile is never touched.
  const browser = await chromium.launch({ executablePath: CHROME, headless: !process.env.HEADFUL, args: ["--no-first-run", "--no-default-browser-check", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-background-timer-throttling"] });
  try {
    for (const name of names) {
      if (!PORTALS[name]) throw new Error(`unknown portal ${name}`);
      const pages = await crawlPortal(browser, name, storageDir, new Set());
      report(name, pages);
    }
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--report") {
  // Re-run the triage on a saved crawl:  node i18n-audit-portals.mjs --report seller
  const name = process.argv[3];
  report(name, JSON.parse(fs.readFileSync(path.join(OUT, `${name}.json`), "utf8")));
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
