// Run: npm test (from web/). Old customer-seller chats for support: read-only list and thread.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const load = async (file) => {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript,${encodeURIComponent(outputText)}`);
};
const chats = await load("./admin-chats.ts");
const controls = await load("./admin-controls.ts");

test("the list body carries the search, the page size and the offset", () => {
  assert.deepEqual(chats.chatListBody("", 0), { limit: 50, offset: 0 });
  assert.deepEqual(chats.chatListBody("  Mama ", 50), { q: "Mama", limit: 50, offset: 50 });
});

test("older messages are asked before the oldest one shown, then merged in front without duplicates", () => {
  assert.deepEqual(chats.chatOlderBody("c1", []), { conversationId: "c1", limit: 50 });
  assert.deepEqual(chats.chatOlderBody("c1", [{ id: "m5" }, { id: "m6" }]), { conversationId: "c1", before: "m5", limit: 50 });
  const merged = chats.prependOlder([{ id: "m5" }, { id: "m6" }], [{ id: "m3" }, { id: "m4" }, { id: "m5" }]);
  assert.deepEqual(merged.map((m) => m.id), ["m3", "m4", "m5", "m6"]);
});

test("who may read chats, review policies, switch express and decide exchanges mirrors the server's role groups", () => {
  assert.equal(controls.canReadChats("admin_support"), true);
  assert.equal(controls.canReadChats("admin"), true);
  for (const r of ["admin_operations", "admin_moderation", "admin_finance", "admin_marketing", "customer", "seller"]) assert.equal(controls.canReadChats(r), false, r);
  assert.equal(controls.canReviewPolicies("admin_moderation"), true);
  assert.equal(controls.canReviewPolicies("admin_support"), false);
  assert.equal(controls.canSetExpress("admin_operations"), true);
  assert.equal(controls.canSetExpress("admin_moderation"), false);
  assert.equal(controls.canDecideExchange("admin_support"), true);
  assert.equal(controls.canDecideExchange("admin_finance"), false);
  assert.equal(controls.canDecideReturn("admin_finance"), true);
  assert.equal(controls.canDecideReturn("admin_marketing"), false);
});

test("the role groups match api/src/common/role-groups.ts", () => {
  const server = readFileSync(new URL("../../../api/src/common/role-groups.ts", import.meta.url), "utf8");
  const group = (name) => [...server.match(new RegExp(`${name}: \\[([^\\]]*)\\]`))[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const roles = ["admin", "admin_operations", "admin_support", "admin_finance", "admin_moderation", "admin_marketing"];
  const allowed = (fn) => roles.filter(fn).sort();
  assert.deepEqual(allowed(controls.canReadChats), group("support"));
  assert.deepEqual(allowed(controls.canReviewPolicies), group("storePolicy"));
  assert.deepEqual(allowed(controls.canSetExpress), group("logisticsDesk"));
  assert.deepEqual(allowed(controls.canDecideExchange), group("exchangeDecide"));
  assert.deepEqual(allowed(controls.canDecideReturn), group("disputeDesk"));
});

test("the chat pages have no composer and call only the two read events", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const thread = read("../app/admin/chats/[id]/page.tsx");
  const list = read("../app/admin/chats/page.tsx");
  assert.doesNotMatch(thread + list, /chat:send|chat:start|chat:markRead|<textarea/);
  assert.match(thread, /chat:adminMessages/);
  assert.match(list, /chat:adminList/);
  assert.match(thread, /chat-read-only/);
});

test("the admin express toggle calls sellers:setExpress and shows the server's pin message", () => {
  const toggle = readFileSync(new URL("../components/admin/express-toggle.tsx", import.meta.url), "utf8");
  assert.match(toggle, /sellers:setExpress/);
  assert.match(toggle, /setError\(msg\)/);
  assert.match(toggle, /no pinned pickup location/);
  const store = readFileSync(new URL("../app/admin/sellers/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(store, /<ExpressToggle/);
  // the seller's own switch is gone
  assert.doesNotMatch(readFileSync(new URL("../components/seller/account-storefront-forms.tsx", import.meta.url), "utf8"), /expressDelivery|ExpressForm/);
});

test("support decides every exchange: the admin-only gate is gone", () => {
  const page = readFileSync(new URL("../components/admin/after-sale-requests.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /needsDesk|only operations can approve|seules les opérations peuvent l'approuver/i);
  assert.match(page, /KOMORIKO support decides this request/);
});
