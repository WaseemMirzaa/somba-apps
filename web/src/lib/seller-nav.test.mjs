// Run: npm test (from web/). Reads the seller menu entries from seller-nav.ts and checks them against the permission
// matrix of docs/contracts/seller-platform.md §0: each team role sees only the pages its permissions open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./seller-nav.ts", import.meta.url), "utf8");
const entries = [...src.matchAll(/\{ href: "([^"]+)"[^}]*?perm: "([a-z_]+)" \}/g)].map((m) => ({ href: m[1], perm: m[2], section: /section: "([a-z]+)"/.exec(m[0])?.[1] ?? null }));

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
/** The menu of a role; `on` lists the after-sale sections admin switched on for the store (all off by default: §13). */
const menu = (role, on = []) => entries.filter((e) => GRANTS[e.perm]?.includes(role) && (!e.section || on.includes(e.section))).map((e) => e.href.replace("/seller", "") || "/");

test("the menu has every seller page with a known permission", () => {
  assert.ok(entries.length >= 15, `parsed ${entries.length} entries`);
  for (const e of entries) assert.ok(GRANTS[e.perm], `${e.href} uses an unknown permission ${e.perm}`);
});

test("support: support, Q&A, reviews: not chat, products, promotions, coupons or flash sales", () => {
  const m = menu("support");
  for (const ok of ["/questions", "/reviews", "/support"]) assert.ok(m.includes(ok), `support should see ${ok}`);
  for (const no of ["/messages", "/products", "/inventory", "/promotions", "/coupons", "/flash-sales", "/orders", "/finance", "/team"]) assert.ok(!m.includes(no), `support must not see ${no}`);
});

test("catalog: products, inventory, promotions, coupons, flash sales", () => {
  const m = menu("catalog");
  for (const ok of ["/products", "/inventory", "/promotions", "/coupons", "/flash-sales"]) assert.ok(m.includes(ok), `catalog should see ${ok}`);
  for (const no of ["/orders", "/finance", "/messages", "/reviews", "/team", "/storefront"]) assert.ok(!m.includes(no), `catalog must not see ${no}`);
});

test("orders: orders and shipping, and no after-sale page until admin switches a section on for the store", () => {
  const m = menu("orders");
  for (const ok of ["/orders", "/shipping"]) assert.ok(m.includes(ok), `orders should see ${ok}`);
  for (const no of ["/returns", "/disputes", "/replacements", "/exchanges"]) assert.ok(!m.includes(no), `orders must not see ${no} while it is off`);
  for (const no of ["/products", "/promotions", "/finance", "/messages", "/team"]) assert.ok(!m.includes(no), `orders must not see ${no}`);
});

test("a section switched on shows its page, only that one, and only to the roles that handle orders (owner, manager, orders)", () => {
  const on = (role, sections) => menu(role, sections);
  assert.deepEqual(on("owner", ["returns"]).filter((p) => ["/returns", "/exchanges", "/replacements"].includes(p)), ["/returns"]);
  assert.deepEqual(on("manager", ["returns", "exchanges", "replacements"]).filter((p) => ["/returns", "/exchanges", "/replacements"].includes(p)), ["/returns", "/exchanges", "/replacements"]);
  assert.ok(on("orders", ["exchanges"]).includes("/exchanges"));
  for (const role of ["catalog", "finance", "support"]) {
    for (const page of ["/returns", "/exchanges", "/replacements"]) assert.ok(!on(role, ["returns", "exchanges", "replacements"]).includes(page), `${role} must not see ${page}`);
  }
  // express is a card in Store settings, not a menu page
  assert.ok(!entries.some((e) => e.section === "express"));
});

test("finance sees finance and analytics only; a manager sees everything but the team", () => {
  const f = menu("finance");
  assert.ok(f.includes("/finance") && f.includes("/analytics"));
  assert.ok(!f.includes("/products") && !f.includes("/orders"));
  const mg = menu("manager");
  assert.ok(!mg.includes("/team"));
  for (const ok of ["/products", "/orders", "/finance", "/storefront", "/analytics"]) assert.ok(mg.includes(ok), `manager should see ${ok}`);
});

test("disputes and messages stay removed; returns, exchanges and replacements are read-only pages gated by the store's access", () => {
  for (const role of ["owner", "manager", "catalog", "orders", "finance", "support"]) {
    const m = menu(role, ["returns", "exchanges", "replacements"]);
    for (const page of ["disputes", "messages"]) assert.ok(!m.includes(`/${page}`), `${role} must not have /${page}`);
  }
  for (const page of ["disputes", "messages"]) assert.ok(!entries.some((e) => e.href.startsWith(`/seller/${page}`)), page);
  const sections = Object.fromEntries(entries.filter((e) => e.section).map((e) => [e.href, e.section]));
  assert.deepEqual(sections, { "/seller/returns": "returns", "/seller/exchanges": "exchanges", "/seller/replacements": "replacements" });
  // Only disputes and messages still redirect at build level: the three sections send the store back themselves when they are off.
  const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /\["disputes", "messages"\]/);
  assert.doesNotMatch(config, /\["returns"/);
  assert.match(config, /destination: "\/seller"/);
  assert.match(config, /source: `\/seller\/\$\{page\}\/:path\*`/);
  for (const dir of ["returns", "exchanges", "replacements"]) {
    for (const f of [`../app/seller/${dir}/page.tsx`, `../app/seller/${dir}/[id]/page.tsx`]) {
      const page = readFileSync(new URL(f, import.meta.url), "utf8");
      assert.match(page, /<SectionGate kind="/, `${f} is gated`);
      assert.doesNotMatch(page, /respond|decide|setStatus/i, `${f} is read-only`);
    }
  }
});

test("the sidebar fallback in the dashboard layout has no removed entry either", () => {
  const layout = readFileSync(new URL("../components/layout/dashboard-layout.tsx", import.meta.url), "utf8");
  for (const page of ["returns", "disputes", "exchanges", "replacements", "messages"]) assert.ok(!layout.includes(`/seller/${page}`), page);
  // the seller portal passes its own menu (seller-nav.ts), which is where the gated sections live
  assert.match(layout, /navItems/);
});
