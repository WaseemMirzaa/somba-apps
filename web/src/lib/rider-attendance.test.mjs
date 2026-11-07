// Run: npm test (from web/). Transpiles rider-attendance.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./rider-attendance.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("worked time reads as hours and minutes, and nothing known reads as a dash", () => {
  assert.equal(m.formatWorked(0), "0 min");
  assert.equal(m.formatWorked(45), "45 min");
  assert.equal(m.formatWorked(60), "1 h 00 min");
  assert.equal(m.formatWorked(2240), "37 h 20 min");
  assert.equal(m.formatWorked(-5), "0 min");
  assert.equal(m.formatWorked(null), "—");
  assert.equal(m.formatWorked(undefined), "—");
  assert.equal(m.formatWorked(Number.NaN), "—");
});

test("status labels in both languages, an unknown status reads as off shift", () => {
  assert.equal(m.statusLabel("on", false), "On shift");
  assert.equal(m.statusLabel("on", true), "En service");
  assert.equal(m.statusLabel("break", false), "On break");
  assert.equal(m.statusLabel("break", true), "En pause");
  assert.equal(m.statusLabel("off", true), "Hors service");
  assert.equal(m.statusLabel("weird", false), "Off shift");
});

test("badge colours", () => {
  assert.equal(m.statusVariant("on"), "success");
  assert.equal(m.statusVariant("break"), "warning");
  assert.equal(m.statusVariant("off"), "default");
});

test("only admin, operations admin and warehouse staff ask for attendance", () => {
  for (const r of ["admin", "admin_operations", "warehouse_staff"]) assert.equal(m.mayReadAttendance(r), true, r);
  for (const r of ["rider", "customer", "seller", "admin_finance", "admin_support", undefined, null, ""]) assert.equal(m.mayReadAttendance(r), false, String(r));
});
