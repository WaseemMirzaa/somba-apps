// Run: npm test (from web/). The seller portal's read-only after-sale view (docs/contracts/admin-controls.md §13): who manages it,
// what the pages read, and that nothing on the seller side can write a case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const load = async (file) => {
  const { outputText } = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript,${encodeURIComponent(outputText)}`);
};
const controls = await load("./admin-controls.ts");

test("admin, operations and support manage the sections and write in the seller thread; finance only reads it; nobody else", () => {
  for (const r of ["admin", "admin_operations", "admin_support"]) {
    assert.equal(controls.canManageSellerPortal(r), true, r);
    assert.equal(controls.canReadSellerThread(r), true, r);
  }
  assert.equal(controls.canManageSellerPortal("admin_finance"), false);
  assert.equal(controls.canReadSellerThread("admin_finance"), true);
  for (const r of ["admin_marketing", "admin_moderation", "seller", "customer", "warehouse_staff", "rider", "guest"]) {
    assert.equal(controls.canManageSellerPortal(r), false, r);
    assert.equal(controls.canReadSellerThread(r), false, r);
  }
});

test("the seller pages read the store's cases with the store scope and never send a decision", () => {
  const lib = read("./seller-aftersale.ts");
  assert.match(lib, /scope: "store"/);
  for (const ev of ["returns:list", "disputes:get", "exchanges:list", "exchanges:get", "replacements:list", "replacements:get", "caseThread:unread"]) assert.ok(lib.includes(`"${ev}"`), ev);
  const pages = [read("../components/seller/aftersale-section.tsx"), read("../components/shared/case-thread-panel.tsx"), read("../components/seller/express-card.tsx")].join("\n");
  for (const ev of ["returns:respond", "returns:decide", "disputes:decide", "disputes:reply", "exchanges:respond", "replacements:respond", "exchanges:setStatus", "replacements:setStatus", "sellers:setExpress", "sellers:update"]) {
    assert.ok(!pages.includes(ev), `the seller view must not call ${ev}`);
  }
  // the only write it has is a message to support
  assert.ok(pages.includes('"caseThread:send"'));
});

test("the banner, the Talk to support pane and the read-only Express card carry their wording in English and French", () => {
  const lib = read("./seller-aftersale.ts");
  assert.ok(lib.includes("KOMORIKO support handles this request. You can follow it here and message support."));
  assert.ok(lib.includes("Le support KOMORIKO traite cette demande. Vous pouvez la suivre ici et écrire au support."));
  const section = read("../components/seller/aftersale-section.tsx");
  assert.ok(section.includes("Talk to support") && section.includes("Parler au support"));
  const card = read("../components/seller/express-card.tsx");
  assert.ok(card.includes("Managed by KOMORIKO. Contact support to change it.") && card.includes("Géré par KOMORIKO. Contactez le support pour le modifier."));
  assert.ok(!/role="switch"|onClick|<input|<select/.test(card), "the Express card has no control");
  assert.match(card, /if \(!access\.express/);
});

test("the Express card sits in Store settings, the nav badges follow the thread unread counts, notice links open the pages", () => {
  assert.match(read("../app/seller/storefront/page.tsx"), /<ExpressCard \/>/);
  assert.match(read("./seller-nav.ts"), /useThreadUnread/);
  const links = read("./notice-links.ts");
  for (const [t, p] of [["seller_return", "returns"], ["seller_exchange", "exchanges"], ["seller_replacement", "replacements"]]) assert.ok(links.includes(`t === "${t}"`) && links.includes(`/seller/${p}/`), t);
});

test("the admin side: four default toggles in Settings, four Follow default / On / Off selects on the store page, the Seller thread beside the customer thread", () => {
  const defaults = read("../components/admin/seller-portal-access.tsx");
  assert.ok(defaults.includes("sellerAccess:defaults:set") && defaults.includes("sellers:setAfterSaleAccess"));
  assert.ok(defaults.includes("Follow default (") && defaults.includes("Suivre le défaut ("));
  assert.match(read("../app/admin/settings/page.tsx"), /<SellerPortalDefaults \/>/);
  assert.match(read("../app/admin/settings/page.tsx"), /Seller portal: after-sale sections/);
  const store = read("../app/admin/sellers/[id]/page.tsx");
  assert.match(store, /<SellerPortalAccessSelects/);
  assert.ok(store.includes("Seller portal access") && store.includes("Accès au portail vendeur"));
  assert.match(read("../components/admin/dispute-case.tsx"), /<ThreadTabs/);
  assert.match(read("../components/admin/after-sale-requests.tsx"), /<SellerThreadSection/);
  const tabs = read("../components/admin/seller-thread-tabs.tsx");
  assert.ok(tabs.includes("Seller thread") && tabs.includes("Fil vendeur") && tabs.includes('role="tablist"'));
});

test("the new server sentences have their French in the web error map, and the stored kind is translatable", () => {
  const errors = read("./api-errors.ts");
  for (const [en, fr] of [
    ["This section is turned off for your store.", "Cette section est désactivée pour votre boutique."],
    ["Choose On or Off for each section.", "Choisissez Activé ou Désactivé pour chaque section."],
    ["Choose Follow default, On or Off for each section.", "Choisissez Suivre le défaut, Activé ou Désactivé pour chaque section."],
    ["Request not found.", "Demande introuvable."],
    ["Messages are at most 2000 characters.", "Les messages font 2000 caractères au plus."],
  ]) assert.ok(errors.includes(`"${en}": "${fr}"`), en);
  assert.ok(read("../components/shop/translatable-text.tsx").includes('"case_seller_message"'));
});
