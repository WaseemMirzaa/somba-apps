// Run: npm test (from web/). Reads the seller menu entries from seller-nav.ts and checks them against the permission
// matrix of docs/contracts/seller-platform.md §0: each team role sees only the pages its permissions open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./seller-nav.ts", import.meta.url), "utf8");
const entries = [...src.matchAll(/\{ href: "([^"]+)"[^}]*?perm: "([a-z_]+)" \}/g)].map((m) => ({ href: m[1], perm: m[2] }));

// The matrix of the contract (permission -> roles that have it).
const GRANTS = {
  any: ["owner", "manager", "catalog", "orders", "finance", "support"],
  insight: ["owner", "manager", "finance"],
  catalog_read: ["owner", "manager", "catalog", "orders", "support"],
  catalog: ["owner", "manager", "catalog"],
  orders: ["owner", "manager", "orders"],
  finance: ["owner", "manager", "finance"],
  support: ["owner", "manager", "support"],
  storefront: ["owner", "manager"],
  team: ["owner"],
};
const menu = (role) => entries.filter((e) => GRANTS[e.perm]?.includes(role)).map((e) => e.href.replace("/seller", "") || "/");

test("the menu has every seller page with a known permission", () => {
  assert.ok(entries.length >= 20, `parsed ${entries.length} entries`);
  for (const e of entries) assert.ok(GRANTS[e.perm], `${e.href} uses an unknown permission ${e.perm}`);
});

test("support: support, Q&A, reviews, chat: not products, promotions, coupons or flash sales", () => {
  const m = menu("support");
  for (const ok of ["/messages", "/questions", "/reviews", "/support"]) assert.ok(m.includes(ok), `support should see ${ok}`);
  for (const no of ["/products", "/inventory", "/promotions", "/coupons", "/flash-sales", "/orders", "/finance", "/team"]) assert.ok(!m.includes(no), `support must not see ${no}`);
});

test("catalog: products, inventory, promotions, coupons, flash sales", () => {
  const m = menu("catalog");
  for (const ok of ["/products", "/inventory", "/promotions", "/coupons", "/flash-sales"]) assert.ok(m.includes(ok), `catalog should see ${ok}`);
  for (const no of ["/orders", "/finance", "/messages", "/reviews", "/team", "/storefront"]) assert.ok(!m.includes(no), `catalog must not see ${no}`);
});

test("orders: orders, returns, shipping, disputes, replacements, exchanges", () => {
  const m = menu("orders");
  for (const ok of ["/orders", "/returns", "/shipping", "/disputes", "/replacements", "/exchanges"]) assert.ok(m.includes(ok), `orders should see ${ok}`);
  for (const no of ["/products", "/promotions", "/finance", "/messages", "/team"]) assert.ok(!m.includes(no), `orders must not see ${no}`);
});

test("finance sees finance and analytics only; a manager sees everything but the team", () => {
  const f = menu("finance");
  assert.ok(f.includes("/finance") && f.includes("/analytics"));
  assert.ok(!f.includes("/products") && !f.includes("/orders"));
  const mg = menu("manager");
  assert.ok(!mg.includes("/team"));
  for (const ok of ["/products", "/orders", "/finance", "/messages", "/storefront", "/analytics"]) assert.ok(mg.includes(ok), `manager should see ${ok}`);
});
