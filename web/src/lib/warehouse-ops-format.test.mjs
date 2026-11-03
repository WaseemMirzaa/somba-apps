// Run: npm test (from web/). Transpiles warehouse-ops-format.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./warehouse-ops-format.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const lib = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const current = { workStart: "08:00", workEnd: "18:00", workDays: [1, 2, 3, 4, 5, 6], timezone: "Africa/Kinshasa", batchSize: 20, autoAssign: false, agedLevels: [24, 48, 72], deliveryTargetHours: 24 };

test("the form is the settings as text, and an unchanged form sends nothing", () => {
  const form = lib.settingsToForm(current);
  assert.deepEqual(form, { workStart: "08:00", workEnd: "18:00", workDays: [1, 2, 3, 4, 5, 6], timezone: "Africa/Kinshasa", batchSize: "20", autoAssign: false, agedLevels: ["24", "48", "72"], deliveryTargetHours: "24" });
  assert.equal(lib.formProblem(form, false), null);
  assert.deepEqual(lib.formToPatch(form, current), {});
});

test("only what changed is sent, with numbers as numbers and weekdays sorted", () => {
  const form = { ...lib.settingsToForm(current), autoAssign: true, batchSize: "35", workDays: [6, 1, 3], agedLevels: ["12", "30", "60"], deliveryTargetHours: "18,5", timezone: " Africa/Lubumbashi " };
  assert.deepEqual(lib.formToPatch(form, current), { autoAssign: true, batchSize: 35, workDays: [1, 3, 6], agedLevels: [12, 30, 60], deliveryTargetHours: 18.5, timezone: "Africa/Lubumbashi" });
});

test("the form refuses what the server refuses, in English and French", () => {
  const base = lib.settingsToForm(current);
  const cases = [
    [{ workStart: "8:00" }, /valid times/, /heures valides/],
    [{ workStart: "19:00" }, /after opening/, /après l'heure d'ouverture/],
    [{ workDays: [] }, /at least one working day/, /au moins un jour/],
    [{ timezone: "  " }, /time zone/, /fuseau horaire/],
    [{ batchSize: "0" }, /between 1 and 200/, /entre 1 et 200/],
    [{ batchSize: "201" }, /between 1 and 200/, /entre 1 et 200/],
    [{ batchSize: "2.5" }, /between 1 and 200/, /entre 1 et 200/],
    [{ batchSize: "" }, /between 1 and 200/, /entre 1 et 200/],
    [{ agedLevels: ["0", "48", "72"] }, /between 1 and 720/, /entre 1 et 720/],
    [{ agedLevels: ["24", "48", "721"] }, /between 1 and 720/, /entre 1 et 720/],
    [{ agedLevels: ["24", "24", "72"] }, /must increase/, /doivent augmenter/],
    [{ agedLevels: ["72", "48", "24"] }, /must increase/, /doivent augmenter/],
    [{ deliveryTargetHours: "0" }, /between 1 and 240/, /entre 1 et 240/],
    [{ deliveryTargetHours: "abc" }, /between 1 and 240/, /entre 1 et 240/],
  ];
  for (const [patch, en, fr] of cases) {
    assert.match(lib.formProblem({ ...base, ...patch }, false), en, JSON.stringify(patch));
    assert.match(lib.formProblem({ ...base, ...patch }, true), fr, JSON.stringify(patch));
  }
});

test("alert level of a leg against the warehouse's ages", () => {
  assert.equal(lib.levelOfAge(0, [24, 48, 72]), 0);
  assert.equal(lib.levelOfAge(23.9, [24, 48, 72]), 0);
  assert.equal(lib.levelOfAge(24, [24, 48, 72]), 1);
  assert.equal(lib.levelOfAge(50, [24, 48, 72]), 2);
  assert.equal(lib.levelOfAge(500, [24, 48, 72]), 3);
  assert.equal(lib.levelOfAge(5, [2, 4, 6]), 2);
});

test("age text switches to days after two days, in both languages", () => {
  assert.equal(lib.ageText(26.4, false), "26 h");
  assert.equal(lib.ageText(47.6, true), "48 h");
  assert.equal(lib.ageText(50, false), "2 d");
  assert.equal(lib.ageText(80, true), "3 j");
});

test("only a customer-bound leg still at the warehouse can be returned to its seller", () => {
  assert.equal(lib.canReturnLeg({ kind: "delivery", status: "unassigned" }), true);
  assert.equal(lib.canReturnLeg({ kind: "delivery", status: "assigned" }), true);
  assert.equal(lib.canReturnLeg({ kind: "replacement_delivery", status: "unassigned" }), true);
  assert.equal(lib.canReturnLeg({ kind: "delivery", status: "picked_up" }), false);
  assert.equal(lib.canReturnLeg({ kind: "delivery", status: "in_transit" }), false);
  assert.equal(lib.canReturnLeg({ kind: "delivery", status: "unassigned", runId: "r1" }), false);
  for (const kind of ["pickup", "transfer", "return_pickup", "return_transfer", "return_to_seller"]) assert.equal(lib.canReturnLeg({ kind, status: "unassigned" }), false, kind);
});

test("the default period is the last 30 days, today included; typed periods are checked", () => {
  assert.deepEqual(lib.defaultRange(new Date("2026-11-03T10:00:00Z")), { from: "2026-10-05", to: "2026-11-03" });
  assert.equal(lib.rangeProblem("2026-10-05", "2026-11-03", false), null);
  assert.equal(lib.rangeProblem("2026-11-03", "2026-11-03", false), null);
  assert.match(lib.rangeProblem("2026-11-04", "2026-11-03", false), /before the end date/);
  assert.match(lib.rangeProblem("2026-11-04", "2026-11-03", true), /précéder/);
  assert.match(lib.rangeProblem("", "2026-11-03", false), /Choose a start date/);
  assert.match(lib.rangeProblem("2026-13-01", "2026-11-03", true), /date de début/);
  assert.match(lib.rangeProblem("2025-01-01", "2026-11-03", false), /at most a year/);
});

test("hours and percentages read well, and show a dash when there is no sample", () => {
  assert.equal(lib.hoursText(null, false), "—");
  assert.equal(lib.hoursText(0.5, false), "30 min");
  assert.equal(lib.hoursText(0.001, false), "1 min");
  assert.equal(lib.hoursText(10.74, false), "10.7 h");
  assert.equal(lib.pctText(null), "—");
  assert.equal(lib.pctText(87.5), "87.5%");
});

test("the analytics client never asks for or shows pay (riders are salaried)", () => {
  const files = ["./warehouse-ops.ts", "../components/warehouse/hub-ops-settings.tsx", "../components/warehouse/ops-performance.tsx"].map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(files, /earning|salary|wage|commission|payout|perTask|Usd\b/i);
});
