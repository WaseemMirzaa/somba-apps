// Run: npm test (from web/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./alerts-prompt.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { alertsPromptDecision, alertsPromptExcludedPath, ALERTS_PROMPT_SNOOZE_MS } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const NOW = 1_800_000_000_000;
const base = { permission: "default", secureContext: true, dismissedAt: null, now: NOW, role: "admin", pathname: "/admin" };
const d = (o) => alertsPromptDecision({ ...base, ...o });

test("shows the banner for every signed-in role when permission is default", () => {
  for (const role of ["admin", "seller", "warehouse", "rider", "customer"]) assert.equal(d({ role }), "show");
});
test("hides when signed out or guest", () => {
  assert.equal(d({ role: null }), "hide");
  assert.equal(d({ role: "guest" }), "hide");
});
test("hides when already granted or denied (no nagging)", () => {
  assert.equal(d({ permission: "granted" }), "hide");
  assert.equal(d({ permission: "denied" }), "hide");
});
test("Not now hides for 7 days, then asks again", () => {
  assert.equal(d({ dismissedAt: NOW - 1000 }), "hide");
  assert.equal(d({ dismissedAt: NOW - ALERTS_PROMPT_SNOOZE_MS + 1 }), "hide");
  assert.equal(d({ dismissedAt: NOW - ALERTS_PROMPT_SNOOZE_MS }), "show");
});
test("a dismissal stamped in the future (clock change) is ignored", () => {
  assert.equal(d({ dismissedAt: NOW + 5000 }), "show");
});
test("insecure context or unsupported browser shows the https hint, dismissible the same way", () => {
  assert.equal(d({ secureContext: false }), "hint");
  assert.equal(d({ permission: "unsupported" }), "hint");
  assert.equal(d({ secureContext: false, dismissedAt: NOW - 1000 }), "hide");
});
test("never on public, login or checkout pages", () => {
  for (const pathname of ["/", "/login", "/shop/login", "/shop/register", "/shop/cart", "/shop/checkout", "/shop/checkout/payment", "/rider/first-password", "/seller/register", "/sell-online", "/legal/terms"])
    assert.equal(d({ pathname }), "hide", pathname);
  for (const pathname of ["/shop", "/shop/orders", "/rider/tasks", "/warehouse/desk", "/seller/orders"]) assert.equal(d({ pathname }), "show", pathname);
  assert.equal(alertsPromptExcludedPath("/shop/checkout/"), true);
});
