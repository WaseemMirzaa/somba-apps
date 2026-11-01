// Run: npm test (from web/). Transpiles staff-active.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./staff-active.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { staffActiveCopy } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("a rider: Deactivate / Reactivate, the confirmation and the toast in English and French", () => {
  const off = staffActiveCopy("rider", false, false);
  assert.equal(off.button, "Deactivate");
  assert.equal(off.title, "Deactivate this rider?");
  assert.match(off.body, /signed out at once/);
  assert.match(off.body, /nearest staffed warehouse/);
  assert.equal(off.done(0), "Rider deactivated");
  const on = staffActiveCopy("rider", true, false);
  assert.deepEqual([on.button, on.title, on.done(0)], ["Reactivate", "Reactivate this rider?", "Rider reactivated"]);
  const offFr = staffActiveCopy("rider", false, true);
  assert.deepEqual([offFr.button, offFr.title, offFr.done(0)], ["Désactiver", "Désactiver ce livreur ?", "Livreur désactivé"]);
  assert.match(offFr.body, /déconnectée aussitôt/);
  assert.match(offFr.body, /admins sont alertés/);
  const onFr = staffActiveCopy("rider", true, true);
  assert.deepEqual([onFr.button, onFr.title, onFr.done(0)], ["Réactiver", "Réactiver ce livreur ?", "Livreur réactivé"]);
});

test("a warehouse employee reads as an employee, not a rider", () => {
  assert.equal(staffActiveCopy("warehouse_staff", false, false).title, "Deactivate this employee?");
  assert.equal(staffActiveCopy("warehouse_staff", false, true).title, "Désactiver cet employé ?");
  assert.equal(staffActiveCopy("warehouse_staff", true, false).done(0), "Employee reactivated");
  assert.equal(staffActiveCopy("warehouse_staff", false, true).done(3), "Employé désactivé"); // tasks are a rider's matter
  assert.doesNotMatch(staffActiveCopy("warehouse_staff", false, false).body, /rider/);
});

test("the toast says how many open tasks the warehouse must hand over", () => {
  assert.equal(staffActiveCopy("rider", false, false).done(1), "Rider deactivated · 1 open task to hand over");
  assert.equal(staffActiveCopy("rider", false, false).done(3), "Rider deactivated · 3 open tasks to hand over");
  assert.equal(staffActiveCopy("rider", false, true).done(1), "Livreur désactivé · 1 tâche ouverte à réassigner");
  assert.equal(staffActiveCopy("rider", false, true).done(2), "Livreur désactivé · 2 tâches ouvertes à réassigner");
  assert.equal(staffActiveCopy("rider", true, false).done(5), "Rider reactivated"); // switching on has no tasks to mention
});
