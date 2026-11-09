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
