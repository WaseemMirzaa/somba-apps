// Run: npm test (from web/). Transpiles admin-access.ts with the project's own `typescript` (icons stubbed) and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./admin-access.ts", import.meta.url), "utf8");
let { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const icons = /import \{([^}]*)\} from "lucide-react";/.exec(outputText)[1].split(",").map((s) => s.trim()).filter(Boolean);
outputText = outputText.replace(/import \{[^}]*\} from "lucide-react";/, `const ${icons.map((i) => `${i} = null`).join(", ")};`);
const { canAdminAccess, getAdminSections, getAdminHome } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const DEPARTMENTS = ["super", "finance", "operations", "warehouse", "moderation", "marketing", "support"];
const hrefs = (dept) => getAdminSections(dept).flatMap((s) => s.items.map((i) => i.href));

test("every admin reaches their own account page and has it in the menu", () => {
  for (const d of DEPARTMENTS) {
    assert.equal(canAdminAccess(d, "/admin/account"), true, d);
    assert.ok(hrefs(d).includes("/admin/account"), `${d} menu`);
  }
});

test("Support sees the fraud page, because the server lets Support suspend accounts (align with customers:setActive)", () => {
  assert.equal(canAdminAccess("support", "/admin/fraud"), true);
  assert.ok(hrefs("support").includes("/admin/fraud"));
  assert.equal(getAdminHome("support"), "/admin/support"); // the landing page did not move
});

test("departments with no business in fraud still do not see it; Finance and the Super Admin do", () => {
  for (const d of ["marketing", "warehouse"]) assert.equal(canAdminAccess(d, "/admin/fraud"), false, d);
  assert.equal(canAdminAccess("finance", "/admin/fraud"), true);
  assert.equal(canAdminAccess("super", "/admin/fraud"), true);
});

test("Support, Finance and Moderation open one order read-only (their 'View order' links); the Orders list stays with Operations", () => {
  for (const d of ["support", "finance", "moderation"]) {
    assert.equal(canAdminAccess(d, "/admin/orders/abc-123"), true, `${d} opens an order`);
    assert.equal(canAdminAccess(d, "/admin/orders"), false, `${d} has no Orders list`);
    assert.equal(canAdminAccess(d, "/admin/orders/abc/extra"), false, `${d}: only the order page itself`);
  }
  for (const d of ["marketing", "warehouse"]) assert.equal(canAdminAccess(d, "/admin/orders/abc-123"), false, `${d} has no business with an order`);
  for (const d of ["super", "operations"]) assert.equal(canAdminAccess(d, "/admin/orders/abc-123"), true, d);
  assert.equal(canAdminAccess("support", "/admin/fulfillment/desk"), false); // the desk stays closed
});

test("Support reaches the replacements and exchanges pages (it may answer them on a seller's behalf); finance, marketing and moderation do not", () => {
  for (const p of ["/admin/replacements", "/admin/exchanges", "/admin/replacements/r1", "/admin/exchanges/e1"]) {
    assert.equal(canAdminAccess("support", p), true, p);
    assert.equal(canAdminAccess("operations", p), true, p);
    for (const d of ["finance", "marketing", "moderation"]) assert.equal(canAdminAccess(d, p), false, `${d} ${p}`);
  }
  assert.ok(hrefs("support").includes("/admin/exchanges") && hrefs("support").includes("/admin/replacements"));
  assert.equal(getAdminHome("support"), "/admin/support"); // the landing page did not move
});

test("Store policies belong to Moderation and the Super Admin only (server group storePolicy)", () => {
  for (const p of ["/admin/policies", "/admin/policies?seller=s1"].map((x) => x.split("?")[0])) {
    for (const d of ["super", "moderation"]) assert.equal(canAdminAccess(d, p), true, `${d} ${p}`);
    for (const d of ["support", "finance", "operations", "marketing", "warehouse"]) assert.equal(canAdminAccess(d, p), false, `${d} ${p}`);
  }
  assert.ok(hrefs("moderation").includes("/admin/policies"));
  assert.equal(getAdminHome("moderation"), "/admin/moderation"); // the landing page did not move
  for (const d of ["support", "operations", "finance", "marketing", "warehouse"]) assert.ok(!hrefs(d).includes("/admin/policies"), d);
});

test("Chats (read-only) belong to Support and the Super Admin only (server group support)", () => {
  for (const p of ["/admin/chats", "/admin/chats/c1"]) {
    for (const d of ["super", "support"]) assert.equal(canAdminAccess(d, p), true, `${d} ${p}`);
    for (const d of ["moderation", "finance", "operations", "marketing", "warehouse"]) assert.equal(canAdminAccess(d, p), false, `${d} ${p}`);
  }
  assert.ok(hrefs("support").includes("/admin/chats"));
  assert.equal(getAdminHome("support"), "/admin/support");
});

test("Operations reaches the stores list and a store page, for the express toggle (server group logisticsDesk); Marketing and Warehouse do not", () => {
  for (const p of ["/admin/sellers", "/admin/sellers/s1"]) {
    for (const d of ["super", "operations", "moderation"]) assert.equal(canAdminAccess(d, p), true, `${d} ${p}`);
    for (const d of ["marketing", "warehouse", "finance", "support"]) assert.equal(canAdminAccess(d, p), false, `${d} ${p}`);
  }
  assert.ok(hrefs("operations").includes("/admin/sellers"));
  assert.equal(getAdminHome("operations"), "/admin/orders");
  // the Super Admin lists the Stores page once (under Moderation)
  assert.equal(hrefs("super").filter((h) => h === "/admin/sellers").length, 1);
});

test("the new menu labels exist in English and French", () => {
  const i18n = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
  for (const key of ["storePolicies", "chatsReadOnly", "sellerPortal"]) assert.equal([...i18n.matchAll(new RegExp(`\\b${key}: "`, "g"))].length, 2, key);
});

test("the Seller portal page (after-sale sections) is for the Super Admin, Operations and Support only; listed once for the Super Admin", () => {
  for (const d of ["super", "operations", "support"]) {
    assert.equal(canAdminAccess(d, "/admin/seller-portal"), true, d);
    assert.ok(hrefs(d).includes("/admin/seller-portal"), `${d} menu`);
  }
  for (const d of ["finance", "marketing", "moderation", "warehouse"]) assert.equal(canAdminAccess(d, "/admin/seller-portal"), false, d);
  assert.equal(hrefs("super").filter((h) => h === "/admin/seller-portal").length, 1);
});
