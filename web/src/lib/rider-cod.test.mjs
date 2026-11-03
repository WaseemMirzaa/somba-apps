// Run: npm test (from web/). Transpiles rider-cod.ts and rider-alerts.ts with the project's own `typescript` and imports them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function load(file) {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript,${encodeURIComponent(outputText)}`);
}
const m = await load("./rider-cod.ts");
const a = await load("./rider-alerts.ts");

const task = (codAmount, status = "assigned") => ({ codAmount, status });

test("the public setting is read the way the API sends it", () => {
  assert.equal(m.parseCodEnabled("true"), true);
  assert.equal(m.parseCodEnabled(" True "), true);
  assert.equal(m.parseCodEnabled(true), true);
  for (const off of ["false", "", undefined, null, 0, "0", "yes"]) assert.equal(m.parseCodEnabled(off), false, String(off));
});

test("cash card, receipts and note follow the setting and nothing else", () => {
  assert.equal(m.showCashSummary(true), true);
  assert.equal(m.showCashSummary(false), false);
});

test("COD off: no COD badge or cash field on a task that has nothing due", () => {
  assert.equal(m.showTaskCash(false, task(0)), false);
  assert.equal(m.showTaskCash(true, task(0)), false, "a prepaid task never shows cash, even with COD on");
  assert.equal(m.showTaskCash(true, task(25.5)), true);
});

test("COD off: an open task that still has cash due keeps its cash field (the server needs the amount), a finished one hides it", () => {
  for (const s of ["assigned", "picked_up", "in_transit"]) assert.equal(m.showTaskCash(false, task(25.5, s)), true, s);
  for (const s of ["delivered", "failed"]) assert.equal(m.showTaskCash(false, task(25.5, s)), false, s);
});

test("COD off: an order paid by COD is not labelled 'Cash on delivery' once nothing is due", () => {
  assert.equal(m.riderPaymentLabel(false, "cod", "Cash on delivery", task(0, "delivered")), "—");
  assert.equal(m.riderPaymentLabel(false, "cod", "Cash on delivery", task(25.5, "in_transit")), "Cash on delivery");
  assert.equal(m.riderPaymentLabel(true, "cod", "Cash on delivery", task(0, "delivered")), "Cash on delivery");
  assert.equal(m.riderPaymentLabel(false, "wallet", "Wallet", task(0, "delivered")), "Wallet");
});

test("the alerts card: every browser state has one answer", () => {
  assert.equal(a.alertsCardState({ permission: "unsupported", configured: true, registered: false }), "hidden");
  assert.equal(a.alertsCardState({ permission: "default", configured: false, registered: false }), "ask");
  assert.equal(a.alertsCardState({ permission: "denied", configured: true, registered: false }), "blocked");
  assert.equal(a.alertsCardState({ permission: "granted", configured: true, registered: true }), "on-push");
  assert.equal(a.alertsCardState({ permission: "granted", configured: true, registered: false }), "on-tab");
  assert.equal(a.alertsCardState({ permission: "granted", configured: false, registered: true }), "on-tab", "no Firebase config: never claim push");
});
