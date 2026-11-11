#!/usr/bin/env node
/**
 * KOMORIKO web: "nothing untranslated" differential crawl.
 *
 * Loads every shopper-facing page once in English, then switches the UI to French in place (the same thing the header
 * toggle does) and reads the page again. It extracts everything a person can read (visible text nodes plus
 * placeholder, title, aria-label, alt, button values, the document <title> and the meta description) and reports
 * strings that are IDENTICAL in both languages, have at least two alphabetic words and are not allow-listed
 * (scripts/i18n-audit-allowlist.mjs). A second list shows French-mode text that still looks English.
 *
 * It also drives what hides text: it opens menus, popups and tabs, and submits every form empty (validation
 * messages), and after signing in it adds a product to the cart and visits the cart, checkout and payment pages.
 * Dynamic pages (orders, products, stores, tickets...) are discovered from the links of the pages it visits, so it
 * needs a seeded demo database (api: `npm run seed:demo`). Pages of the seller / admin / warehouse / rider portals
 * are skipped (they have their own audit).
 *
 * HOW TO RUN (playwright-core is NOT a dependency of the web app: install it anywhere outside the repo)
 *
 *   1. A local stack on THROWAWAY data: the API with the demo seed, started with CORS_ORIGINS=<the web origin>
 *      (the sign-in page calls the API from the browser), and the web app (`next start` is much faster than
 *      `next dev` for a crawl) built with NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SOCKET_URL pointing at that API.
 *   2. mkdir /tmp/pw && cd /tmp/pw && npm i playwright-core
 *   3. From /tmp/pw (so `playwright-core` resolves), with the demo password in the environment:
 *
 *      AUDIT_PASSWORD='<demo password>' node /path/to/web/scripts/i18n-audit.mjs \
 *          --base http://localhost:3072 \
 *          --accounts customer.full@demo.komoriko.test,customer.new@demo.komoriko.test \
 *          --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *          --out /tmp/i18n-audit-out
 *
 * Options
 *   --base <url>          web origin (default http://localhost:3072)
 *   --accounts a,b,c      demo accounts to sign in as; a signed-out (guest) run is always included unless --guest no.
 *                         Use --accounts "" for the guest alone.
 *   --chrome <path>       Chrome / Chromium binary (default: $PLAYWRIGHT_CHROME, else the macOS Chrome path)
 *   --out <dir>           where report.json / report.txt / raw-*.json are written (default ./i18n-audit-out)
 *   --only a,b,=/x        crawl only routes containing a or b, or exactly /x (handy while fixing one page)
 *   --max-per-pattern N   pages visited per dynamic route pattern (.../:id), default 1
 *   --locales en,fr       languages to compare (default both)
 *   --playwright <path>   explicit path to the playwright-core package (default: resolved from the current directory)
 *   --tag name --no-report  save the raw snapshots as raw-<tag>.json and skip the comparison. Run several processes
 *                         (one per account, say) and merge them with:  node i18n-audit.mjs --compare --out <dir>
 *
 * The browser starts with Playwright's own throwaway profile, never yours. The password is read from AUDIT_PASSWORD
 * and is never printed or written to the report.
 *
 * Triage: a finding is either UI text (fix it in the web app) or DATA (a name, a message typed by a person, text the
 * server sends). Data that must stay the same in both languages goes to scripts/i18n-audit-allowlist.mjs with a
 * comment. Data that the server should have translated (product text, notification titles) is listed by the audit
 * with the page it came from, but the fix belongs to the API, not to this app.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALLOW_EXACT, ALLOW_DATA_NAMES, ALLOW_PATTERNS } from "./i18n-audit-allowlist.mjs";

// ---------------------------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; // an explicit empty value (--accounts "") is kept
};
const BASE = opt("base", "http://localhost:3072").replace(/\/$/, "");
const ACCOUNTS = opt("accounts", "customer.full@demo.komoriko.test").split(",").filter(Boolean);
const CHROME = opt("chrome", process.env.PLAYWRIGHT_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const OUT = resolve(opt("out", "./i18n-audit-out"));
const ONLY = opt("only", "");
/** --only a,b,=/exact : keep routes that contain a or b, or equal "/exact". */
const wanted = (r) => !ONLY || ONLY.split(",").some((o) => (o.startsWith("=") ? r === o.slice(1) : r.includes(o)));
const MAX_PER_PATTERN = Number(opt("max-per-pattern", "1"));
const PASSWORD = process.env.AUDIT_PASSWORD || "";
const LOCALES = opt("locales", "en,fr").split(",").filter(Boolean);
const WITH_GUEST = opt("guest", "yes") !== "no";
const TAG = opt("tag", "run");
const COMPARE_ONLY = argv.includes("--compare");

const require = createRequire(resolve(process.cwd(), "noop.js"));
const pwPath = opt("playwright", "playwright-core");
let chromium;
if (!COMPARE_ONLY) {
  try {
    ({ chromium } = require(pwPath));
  } catch {
    console.error("playwright-core not found. Run `npm i playwright-core` in the directory you run this from (see header).");
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------------------------- routes
/** Pages with no id in the URL. Dynamic pages are discovered from links found on these (real demo ids). */
const STATIC_ROUTES = [
  "/",
  "/login",
  "/get-app",
  "/sell-online",
  "/purchase",
  "/live",
  "/legal/terms",
  "/legal/privacy",
  "/legal/returns",
  "/legal/seller",
  "/legal/shipping",
  "/shop/login",
  "/shop/register",
  "/shop/forgot",
  "/shop/reset",
  "/shop/verify-email",
  "/shop/otp",
  "/shop/categories",
  "/shop/products",
  "/shop/deals",
  "/shop/search",
  "/shop/search?q=phone",
  "/shop/search?q=zzzzqqqq",
  "/shop/cart",
  "/shop/checkout",
  "/shop/checkout/payment",
  "/shop/orders",
  "/shop/orders/success",
  "/shop/returns",
  "/shop/exchange",
  "/shop/exchanges",
  "/shop/replacements",
  "/shop/wishlist",
  "/shop/messages",
  "/shop/notifications",
  "/shop/support",
  "/shop/help",
  "/shop/account",
  "/shop/account/addresses",
  "/shop/account/delete",
  "/does-not-exist-404",
  "/shop/products/00000000-0000-0000-0000-000000000000",
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const patternOf = (path) => path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
const SKIP_PREFIX = ["/admin", "/seller", "/warehouse", "/rider"]; // other builders / other audits

// ---------------------------------------------------------------------------------------------- in-page extraction
/** Runs inside the page. Returns [{ kind, text }] of everything a person can read right now. */
function extractInPage() {
  const out = [];
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const push = (kind, text) => {
    const t = norm(text || "");
    if (t) out.push({ kind, text: t });
  };
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || n.hasAttribute("hidden")) return false;
      if (n.tagName === "NEXTJS-PORTAL" || n.id === "__next-build-watcher") return false; // dev overlay
    }
    return true;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (!p || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(p.tagName)) continue;
    if (!visible(p)) continue;
    if (p.closest("nextjs-portal")) continue;
    push("text", n.nodeValue);
  }
  for (const el of document.querySelectorAll("[placeholder],[title],[aria-label],img[alt],input[type=submit],input[type=button]")) {
    if (el.closest("nextjs-portal")) continue;
    if (!visible(el)) continue;
    if (el.getAttribute("placeholder")) push("placeholder", el.getAttribute("placeholder"));
    if (el.getAttribute("title")) push("title", el.getAttribute("title"));
    if (el.getAttribute("aria-label")) push("aria-label", el.getAttribute("aria-label"));
    if (el.tagName === "IMG" && el.getAttribute("alt")) push("alt", el.getAttribute("alt"));
    if (el.tagName === "INPUT" && ["submit", "button"].includes(el.type)) push("value", el.value);
  }
  push("document.title", document.title);
  for (const sel of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]']) {
    const m = document.querySelector(sel);
    if (m) push("meta", m.getAttribute("content"));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- triage helpers
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/g;
const wordCount = (s) => (s.match(WORD) || []).length;
const allowExact = new Set([...ALLOW_EXACT, ...ALLOW_DATA_NAMES].map((s) => s.toLowerCase()));
const isAllowed = (s) => allowExact.has(s.toLowerCase()) || ALLOW_PATTERNS.some((re) => re.test(s));

const ENGLISH_WORDS = new Set(
  "the your you and with for are this that please not yet have has can will we our from here there when what which no results found select choose enter sign in out order orders payment delivery address cart empty add remove save cancel back next continue loading error failed try again view all more less show hide search help support account password email name phone required invalid".split(" ")
);
const FRENCH_HINT = /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|une|un|vos|votre|pour|avec|sur|dans|est|pas|vous|nous|de|du|et|ou)\b/i;
/** A French-mode string made mostly of English words and with no French marker in it. */
function looksEnglish(s) {
  const words = (s.toLowerCase().match(/[a-z']{2,}/g) || []).map((w) => w.replace(/'s$/, ""));
  if (words.length < 3) return false;
  if (FRENCH_HINT.test(s)) return false;
  const hits = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return hits >= 2 && hits / words.length >= 0.3;
}

// ---------------------------------------------------------------------------------------------- crawl
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; // { account, route, state, locale, items: [{kind,text}] }
const consoleErrors = [];
mkdirSync(OUT, { recursive: true });

/** Wait for hydration (the locale provider sets <html lang>), then for the network and the first data fetch to calm down. */
async function settle(page, locale) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  if (locale) await page.waitForFunction((l) => document.documentElement.lang === l, locale, { timeout: 90000 }).catch(() => console.warn(`  ! not hydrated in ${locale}: ${page.url()}`));
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await sleep(1200);
}

async function snapshot(page, rec) {
  const items = await page.evaluate(extractInPage).catch(() => []);
  results.push({ ...rec, items });
}

/** Switch the UI language in place (what the toggle does), without reloading the page: one load serves both languages. */
async function switchLocale(page, locale) {
  await page.evaluate((l) => {
    try {
      localStorage.setItem("somba-locale", l);
    } catch {}
    window.dispatchEvent(new StorageEvent("storage", { key: "somba-locale", newValue: l }));
  }, locale);
  await page.waitForFunction((l) => document.documentElement.lang === l, locale, { timeout: 20000 }).catch(() => console.warn(`  ! language did not switch to ${locale}: ${page.url()}`));
  await sleep(700);
}

/** Open every popup trigger / tab on the page once and snapshot what appears. */
async function revealInteractive(page, rec) {
  const triggers = await page
    .locator('[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded="false"], [role="tab"], button[aria-label*="otif" i], button[aria-label*="menu" i], button[aria-label*="cart" i], button[aria-label*="panier" i]')
    .all()
    .catch(() => []);
  let i = 0;
  for (const t of triggers.slice(0, 12)) {
    try {
      if (!(await t.isVisible())) continue;
      await t.click({ timeout: 10000 });
      await sleep(700);
      // The label of a trigger is in the page's language: key the state by position so en and fr line up.
      await snapshot(page, { ...rec, state: `${rec.state}|open#${i}` });
      await page.keyboard.press("Escape").catch(() => {});
      i++;
    } catch (e) {
      console.warn(`  ! trigger skipped on ${page.url()}: ${String(e).split("\n")[0].slice(0, 80)}`);
    }
  }
}

/** Submit each form on the page empty and snapshot the validation messages. */
async function submitEmptyForms(page, rec, url) {
  const forms = await page.locator("form").count().catch(() => 0);
  for (let f = 0; f < Math.min(forms, 3); f++) {
    try {
      const form = page.locator("form").nth(f);
      if (!(await form.isVisible({ timeout: 3000 }))) continue;
      // Disable native validation so the app's own messages are what we see, then submit the form the way its button
      // would (requestSubmit fires the same submit event, without depending on the button being clickable right now).
      await form.evaluate((el) => {
        el.setAttribute("novalidate", "");
        el.requestSubmit();
      });
      await sleep(1200);
      await snapshot(page, { ...rec, state: `${rec.state}|empty-form#${f}` });
      if (new URL(page.url()).pathname + new URL(page.url()).search !== new URL(url).pathname + new URL(url).search) {
        // The submit navigated away (a search box, say): come back and restore the language.
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await settle(page, "en");
        if (rec.locale !== "en") await switchLocale(page, rec.locale);
      }
    } catch (e) {
      console.warn(`  ! form skipped on ${page.url()}: ${String(e).split("\n")[0].slice(0, 80)}`);
    }
  }
}

/** One page load, every requested language in place. */
async function crawlRoute(page, base, route, rec, discovered) {
  const url = `${base}${route}`;
  console.log(`  ${rec.account} ${route}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  } catch (e) {
    console.warn(`  ! ${route}: ${String(e).slice(0, 80)}`);
    return;
  }
  await settle(page, "en");
  // Pages that fetch on mount: scroll once so lazy lists render.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await sleep(400);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  if (discovered) {
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    for (const h of hrefs) if (h && h.startsWith("/") && !h.startsWith("//")) discovered.add(h.split("#")[0]);
  }
  let current = "en";
  for (const locale of LOCALES) {
    if (locale !== current) {
      await switchLocale(page, locale);
      current = locale;
    }
    const r2 = { ...rec, route, locale, state: "base" };
    await snapshot(page, r2);
    await revealInteractive(page, r2);
    await submitEmptyForms(page, r2, url);
  }
}

/**
 * With something in the cart: the add-to-cart toast, then the cart, checkout and payment pages (which are empty
 * states in the plain crawl). Only runs for signed-in accounts. The data is throwaway demo data.
 */
async function cartFlow(page, found, rec) {
  const product = [...found].find((h) => /^\/shop\/products\/[0-9a-f-]{36}$/i.test(h));
  if (!product || !wanted(product)) return;
  console.log(`  ${rec.account} cart flow via ${product}`);
  try {
    await page.goto(`${BASE}${product}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await settle(page, "en");
    for (const locale of LOCALES) {
      if (locale !== "en") await switchLocale(page, locale);
      const add = page.getByRole("button", { name: /add to cart|ajouter au panier/i }).first();
      if (await add.isVisible({ timeout: 3000 }).catch(() => false)) {
        await add.click({ timeout: 3000 }).catch(() => {});
        await sleep(500);
        await snapshot(page, { ...rec, route: product, state: "after-add-to-cart", locale });
      }
    }
    for (const route of ["/shop/cart", "/shop/checkout", "/shop/checkout/payment"]) {
      await crawlRoute(page, BASE, route, { ...rec, account: `${rec.account}+cart` }, null);
    }
  } catch (e) {
    console.warn(`  ! cart flow: ${String(e).slice(0, 100)}`);
  }
}

async function runAccount(browser, account, storageState) {
  const found = new Set();
  const context = await browser.newContext({ storageState, viewport: { width: 1360, height: 900 } });
  // Every page load starts in English; crawlRoute then switches to the other language in place.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("somba-locale", "en");
    } catch {}
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`${account}: ${m.text().slice(0, 160)}`);
  });
  const routes = [...STATIC_ROUTES].filter(wanted);
  const done = new Set();
  for (const r of routes) {
    done.add(r);
    await crawlRoute(page, BASE, r, { account }, found);
  }
  // Dynamic pages: a couple of real ids per pattern, taken from links the pages exposed. Pages visited here expose more
  // links (an order links to its return / exchange / tracking pages), so repeat until nothing new turns up.
  const perPattern = new Map();
  for (let round = 0; round < 3; round++) {
    const dynamic = [...found].filter((h) => UUID.test(h) && !SKIP_PREFIX.some((p) => h.startsWith(p)) && !h.startsWith("/api")).sort();
    let visited = 0;
    for (const h of dynamic) {
      const pat = patternOf(h.split("?")[0]);
      const n = perPattern.get(pat) || 0;
      if (n >= MAX_PER_PATTERN || done.has(h) || !wanted(h)) continue;
      perPattern.set(pat, n + 1);
      done.add(h);
      visited++;
      await crawlRoute(page, BASE, h, { account }, found);
    }
    if (!visited) break;
  }
  // The pages behind an order are only linked for some statuses: visit them for the first few orders directly.
  const orderIds = [...new Set([...found].map((h) => /^\/shop\/orders\/([0-9a-f-]{36})$/i.exec(h)?.[1]).filter(Boolean))].slice(0, 3);
  for (const id of orderIds) {
    for (const sub of ["return", "exchange", "dispute", "tracking", "confirmed"]) {
      const h = `/shop/orders/${id}/${sub}`;
      if (done.has(h) || !wanted(h)) continue;
      done.add(h);
      await crawlRoute(page, BASE, h, { account }, null);
    }
  }
  if (account !== "guest") await cartFlow(page, found, { account });
  // Static-looking links we did not list (e.g. /shop/stores): one visit per path, whatever its query string.
  const donePaths = new Set([...done].map((h) => h.split("?")[0]));
  for (const h of [...found]) {
    const path = h.split("?")[0];
    if (done.has(h) || donePaths.has(path) || UUID.test(h) || h === "/" || SKIP_PREFIX.some((p) => h.startsWith(p)) || h.startsWith("/api")) continue;
    if (h.length > 80 || !wanted(h)) continue;
    done.add(h);
    donePaths.add(path);
    await crawlRoute(page, BASE, h, { account }, null);
  }
  await context.close();
}

async function signIn(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("somba-locale", "en");
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000); // a busy machine can take a minute to hydrate the login page
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await settle(page, "en");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await settle(page);
  const state = await context.storageState();
  await context.close();
  return state;
}

// ---------------------------------------------------------------------------------------------- main
if (!COMPARE_ONLY) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    // launch() gives every run a brand-new temporary profile (a throwaway --user-data-dir): your own profile is never touched.
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    console.log(`Crawling ${BASE} (${LOCALES.join("+")}) as ${WITH_GUEST ? "guest + " : ""}${ACCOUNTS.length} account(s)`);
    if (WITH_GUEST) await runAccount(browser, "guest", undefined);
    for (const email of ACCOUNTS) {
      if (!PASSWORD) {
        console.warn("AUDIT_PASSWORD is not set: skipping signed-in accounts");
        break;
      }
      console.log(`Signing in ${email}`);
      const state = await signIn(browser, email);
      await runAccount(browser, email.split("@")[0], state);
    }
  } finally {
    await browser.close();
  }
  // Raw snapshots are kept so several runs (for example one process per language and account, to go faster) can be
  // merged afterwards with:  node i18n-audit.mjs --compare --out <dir>
  writeFileSync(join(OUT, `raw-${TAG}.json`), JSON.stringify({ results, consoleErrors }));
  if (argv.includes("--no-report")) process.exit(0);
} else {
  const { readdirSync, readFileSync } = await import("node:fs");
  for (const f of readdirSync(OUT).filter((n) => /^raw-.*\.json$/.test(n))) {
    const raw = JSON.parse(readFileSync(join(OUT, f), "utf8"));
    results.push(...raw.results);
    consoleErrors.push(...raw.consoleErrors);
  }
}

// ---------------------------------------------------------------------------------------------- compare
/** key = account|route|state ; value = { en: Map(text->kinds), fr: ... } */
const byKey = new Map();
for (const r of results) {
  const key = `${r.account}|${r.route}|${r.state}`;
  const e = byKey.get(key) || { en: new Map(), fr: new Map() };
  for (const it of r.items) {
    const m = e[r.locale];
    const kinds = m.get(it.text) || new Set();
    kinds.add(it.kind);
    m.set(it.text, kinds);
  }
  byKey.set(key, e);
}
const identical = new Map(); // text -> { kinds:Set, pages:Set }
const englishInFr = new Map();
for (const [key, { en, fr }] of byKey) {
  const page = key.split("|").slice(1).join("|");
  for (const [text, kinds] of fr) {
    if (isAllowed(text)) continue;
    if (wordCount(text) >= 2 && en.has(text)) {
      const e = identical.get(text) || { kinds: new Set(), pages: new Set() };
      kinds.forEach((k) => e.kinds.add(k));
      e.pages.add(page);
      identical.set(text, e);
    }
    if (looksEnglish(text)) {
      const e = englishInFr.get(text) || { kinds: new Set(), pages: new Set() };
      kinds.forEach((k) => e.kinds.add(k));
      e.pages.add(page);
      englishInFr.set(text, e);
    }
  }
}
const fmt = (m) =>
  [...m.entries()]
    .sort((a, b) => b[1].pages.size - a[1].pages.size)
    .map(([text, { kinds, pages }]) => ({ text, kinds: [...kinds], pages: [...pages].slice(0, 6), pageCount: pages.size }));
const report = {
  base: BASE,
  snapshots: results.length,
  identicalInEnAndFr: fmt(identical),
  englishLookingInFr: fmt(englishInFr),
  consoleErrors: [...new Set(consoleErrors)].slice(0, 60),
};
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
const lines = [];
lines.push(`# i18n audit ${BASE}: ${results.length} snapshots`);
lines.push(`\n## Identical in EN and FR (${report.identicalInEnAndFr.length})`);
for (const f of report.identicalInEnAndFr) lines.push(`- [${f.kinds.join(",")}] ${JSON.stringify(f.text)}  <- ${f.pages.slice(0, 3).join("  ")}${f.pageCount > 3 ? `  (+${f.pageCount - 3})` : ""}`);
lines.push(`\n## English-looking text in French mode (${report.englishLookingInFr.length})`);
for (const f of report.englishLookingInFr) lines.push(`- [${f.kinds.join(",")}] ${JSON.stringify(f.text)}  <- ${f.pages.slice(0, 3).join("  ")}`);
writeFileSync(join(OUT, "report.txt"), lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nReports written to ${OUT}`);
