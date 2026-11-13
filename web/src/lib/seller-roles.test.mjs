// Run: npm test (from web/). The seller portal's role table must be the server's: the menu, the per-path guard, the
// notification switches and the dashboard blocks all follow `ROLE_PERMISSIONS` in api/src/sellers/seller-permissions.ts,
// so a team member never opens a page (or sees a control) the server would only refuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const server = read("../../../api/src/sellers/seller-permissions.ts");
const nav = read("./seller-nav.ts");
const account = read("./seller-account.ts");
const dashboard = read("../app/seller/page.tsx");
const plan = read("../components/seller/plan-summary.tsx");
const prefs = read("../components/seller/account-prefs.tsx");

const ALL = [...server.match(/export const ALL_PERMISSIONS[^=]*=\s*\[([\s\S]*?)\];/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const table = {};
const block = server.match(/export const ROLE_PERMISSIONS[\s\S]*?\n\};/)[0];
for (const m of block.matchAll(/^\s{2}([a-z]+): (ALL_PERMISSIONS|\[([^\]]*)\])/gm)) {
  table[m[1]] = m[2] === "ALL_PERMISSIONS" ? ALL : [...m[3].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}
const entries = [...nav.matchAll(/\{ href: "([^"]+)"[^}]*?perm: "([a-z_]+)" \}/g)].map((m) => ({ href: m[1], perm: m[2] }));

test("the role table was read from the server", () => {
  assert.deepEqual(Object.keys(table).sort(), ["catalog", "finance", "manager", "orders", "owner", "support"]);
  assert.deepEqual(table.support, ["any", "catalog_read", "support"]);
});

test("every menu entry uses a permission the server knows", () => {
  for (const e of entries) assert.ok(ALL.includes(e.perm), `${e.href}: ${e.perm}`);
});

test("support opens exactly: dashboard, questions, notifications, reviews, support, settings (no chat: customers contact KOMORIKO support)", () => {
  const open = entries.filter((e) => table.support.includes(e.perm)).map((e) => e.href);
  assert.deepEqual(open.sort(), ["/seller", "/seller/notifications", "/seller/questions", "/seller/reviews", "/seller/settings", "/seller/support"]);
});

test("no role is offered a menu entry its permissions do not open, and every page needs a permission some role has", () => {
  for (const [role, perms] of Object.entries(table)) {
    for (const e of entries.filter((x) => perms.includes(x.perm))) assert.ok(ALL.includes(e.perm), `${role} ${e.href}`);
  }
  for (const e of entries) assert.ok(Object.values(table).some((p) => p.includes(e.perm)), `${e.href} is opened by nobody`);
});

test("each notification switch needs the permission the server gives that kind of notice", () => {
  const kinds = Object.fromEntries([...account.match(/NOTIFY_PERMISSION[^=]*=\s*\{([\s\S]*?)\};/)[1].matchAll(/([a-z]+): "([a-z_]+)"/g)].map((m) => [m[1], m[2]]));
  // server: permissionForNotice(type) for a notice type of each category (api/src/users/notify-prefs.ts maps type -> kind)
  // (no "message" switch any more: customer chat is closed)
  const serverFor = { order: "orders", payout: "finance", stock: "catalog", review: "support", question: "support", product: "catalog", promo: "catalog" };
  assert.deepEqual(kinds, serverFor);
  for (const [type, perm] of Object.entries({ order: "orders", payout: "finance", stock: "catalog", review: "support", question: "support", product: "catalog", promo: "catalog" })) {
    assert.match(server, new RegExp(`case '${type}':[\\s\\S]*?return '${perm}'`), `server: ${type} -> ${perm}`);
  }
  // a store policy notice has no switch of its own: the server's default permission is the storefront's
  assert.match(server, /default:\s*return 'storefront';/);
  assert.match(prefs, /NOTIFY_KINDS\.filter\(\(k\) => access\.can\(NOTIFY_PERMISSION\[k\]\)\)/);
});

test("the dashboard hides what the role cannot use: analytics (insight), pickup edit (storefront), plan change (account)", () => {
  assert.match(dashboard, /\{access\.can\("insight"\) && \(\s*<div className="flex flex-wrap items-center justify-between gap-3">/);
  assert.match(dashboard, /needsPickup && access\.can\("storefront"\)/);
  assert.match(dashboard, /<PickupAreaBanner withLink=\{access\.can\("storefront"\)\} \/>/);
  assert.match(dashboard, /\{access\.can\("insight"\) && \(\s*<Card className="lg:col-span-1">/);
  assert.match(plan, /useSellerAccess\(\)\.can\("account"\)/);
  assert.match(plan, /\{canChange && \(/);
});

test("after-sale and chat notices are owner-only on the server, and the team role texts no longer promise them", () => {
  assert.match(server, /case 'dispute':[\s\S]*?case 'chat':\s*return 'team';/);
  const access = read("./seller-access.ts");
  const orders = access.match(/orders: \{[^\n]*\}/)[0];
  const support = access.match(/support: \{[^\n]*\}/)[0];
  assert.doesNotMatch(orders, /returns|disputes|replacements|exchanges|retours|litiges|remplacements|échanges/i);
  assert.doesNotMatch(support, /chat|messages clients/i);
});

test("no seller dashboard tile or notice link points at the removed pages (disputes, messages); the read-only sections are reached by their own notice types only", () => {
  assert.doesNotMatch(dashboard, /returnRatePct|disputeRatePct/);
  const links = read("./notice-links.ts");
  assert.doesNotMatch(links, /\/seller\/(disputes|messages)/);
  // the old owner's-own-purchase types (`return`, `exchange`, ...) never open a seller page; only the `seller_*` notice types do (§13)
  const seller = links.slice(links.indexOf('case "seller":'), links.indexOf('case "admin":'));
  for (const m of seller.matchAll(/t === "(\w+)"\)[^\n]*\/seller\/(returns|exchanges|replacements)/g)) assert.match(m[1], /^seller_/);
});
