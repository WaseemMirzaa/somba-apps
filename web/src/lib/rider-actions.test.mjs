// Run: npm test (from web/). Transpiles rider-actions.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./rider-actions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const leg = (status, hubBound = false) => ({ status, hubBound });

test("the next step follows the leg: picked up, on the way, then delivered (or the warehouse's scan)", () => {
  assert.equal(m.nextStep(leg("assigned")), "picked_up");
  assert.equal(m.nextStep(leg("picked_up")), "in_transit");
  assert.equal(m.nextStep(leg("in_transit")), "deliver");
  assert.equal(m.nextStep(leg("delivered")), "none");
  assert.equal(m.nextStep(leg("failed")), "none");
  assert.equal(m.nextStep(leg("unassigned")), "none", "a task nobody assigned is never the rider's");
});

test("a leg that ends at a warehouse is never delivered by the rider: the staff scan it in", () => {
  assert.equal(m.nextStep(leg("assigned", true)), "picked_up");
  assert.equal(m.nextStep(leg("picked_up", true)), "in_transit");
  assert.equal(m.nextStep(leg("in_transit", true)), "handover");
});

test("a failure can be reported on any open leg, and on none that is over", () => {
  for (const s of ["assigned", "picked_up", "in_transit"]) assert.equal(m.canReportFailure({ status: s }), true, s);
  for (const s of ["delivered", "failed", "unassigned"]) assert.equal(m.canReportFailure({ status: s }), false, s);
});

test("a failure report is 'Reason: notes' cut to 200 characters, sent with the failed status", () => {
  assert.equal(m.failureText("Wrong address", ""), "Wrong address");
  assert.equal(m.failureText("Wrong address", "  gate is locked "), "Wrong address: gate is locked");
  assert.equal(m.failureText("Other", "x".repeat(500)).length, 200);
  assert.deepEqual(m.failedPayload("t1", "Customer not reachable", "no answer"), { taskId: "t1", status: "failed", reason: "Customer not reachable: no answer" });
});

test("the reasons offered are the ones the server and the app know, each in French too", () => {
  assert.equal(m.FAIL_REASONS.length, 8);
  for (const r of m.FAIL_REASONS) {
    assert.ok(r.value && r.fr, r.value);
    assert.notEqual(r.value, r.fr);
  }
  assert.deepEqual(m.stepPayload("t1", "picked_up"), { taskId: "t1", status: "picked_up" });
  assert.deepEqual(m.stepPayload("t1", "in_transit"), { taskId: "t1", status: "in_transit" });
});

test("an express run: the rider is told to go seller -> customer, ask the code", () => {
  const task = { kind: "express", needsCode: true };
  const en = m.riderBrief(task, false);
  assert.equal(en.length, 3);
  assert.match(en[0], /straight to the customer/);
  assert.ok(en.some((l) => /4-digit code/.test(l)));
  const fr = m.riderBrief(task, true);
  assert.match(fr[0], /directement chez le client/);
  assert.ok(fr.some((l) => /code à 4 chiffres/.test(l)));
});

test("the code is not mentioned while the platform does not require it", () => {
  const lines = m.riderBrief({ kind: "express", needsCode: true }, false, { requireCode: false });
  assert.ok(!lines.some((l) => /code/.test(l)));
});

test("a plain delivery meets the customer too; a partial one says only some items; a warehouse leg says nothing", () => {
  assert.ok(m.riderBrief({ kind: "delivery", needsCode: true }, false)[0].includes("in person"));
  assert.ok(!m.riderBrief({ kind: "delivery" }, false).some((l) => /Express/.test(l)));
  assert.ok(m.riderBrief({ kind: "delivery", partial: true }, false).some((l) => /Partial delivery/.test(l)));
  assert.ok(m.riderBrief({ kind: "delivery", partial: true }, true).some((l) => /Livraison partielle/.test(l)));
  for (const kind of ["pickup", "transfer", "return_pickup", "return_to_seller"]) assert.deepEqual(m.riderBrief({ kind, needsCode: true }, false), [], kind);
});

test("an express run is delivered by the rider, not handed over to a warehouse", () => {
  assert.equal(m.nextStep({ status: "in_transit", hubBound: false }), "deliver");
  assert.equal(m.nextStep({ status: "assigned", hubBound: false }), "picked_up");
});
