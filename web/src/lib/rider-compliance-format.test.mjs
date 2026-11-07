// Run: npm test (from web/). Transpiles rider-compliance-format.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./rider-compliance-format.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const lib = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const vehicle = { model: "Honda CG 125", type: "motorbike", plate: "KN 4821 A", colour: "Black", odometerKm: 18240, fuel: "petrol", insuranceValidUntil: "2026-09-30", lastServiceOn: "2026-05-12", nextServiceOn: null };

test("expiry badges: amber when expiring, red when expired, nothing otherwise", () => {
  assert.deepEqual(lib.expiryBadge({ state: "expiring", daysLeft: 12 }, false), { text: "Expires · in 12 d", variant: "warning" });
  assert.deepEqual(lib.expiryBadge({ state: "expiring", daysLeft: 0 }, true), { text: "Expire · aujourd'hui", variant: "warning" });
  assert.deepEqual(lib.expiryBadge({ state: "expired", daysLeft: -3 }, false), { text: "Expired · 3 d ago", variant: "danger" });
  assert.deepEqual(lib.expiryBadge({ state: "expired", daysLeft: -3 }, true), { text: "Expiré · depuis 3 j", variant: "danger" });
  assert.deepEqual(lib.expiryBadge({ state: "expired", daysLeft: -9 }, false, "service"), { text: "Overdue · 9 d ago", variant: "danger" });
  assert.deepEqual(lib.expiryBadge({ state: "expiring", daysLeft: 5 }, true, "service"), { text: "À faire · dans 5 j", variant: "warning" });
  assert.equal(lib.expiryBadge({ state: "valid", daysLeft: 200 }, false), null);
  assert.equal(lib.expiryBadge({ state: "none", daysLeft: null }, false), null);
  assert.equal(lib.expiryBadge(null, false), null);
});

test("the summary counts live documents; a rejected one is not 'expired'", () => {
  const d = (status, state) => ({ status, expiry: { state, daysLeft: 0 } });
  assert.deepEqual(lib.summarize([d("approved", "expired"), d("pending", "expiring"), d("rejected", "expired"), d("approved", "valid")]), { expired: 1, expiring: 1, pending: 1, rejected: 1 });
  assert.deepEqual(lib.summarize([]), { expired: 0, expiring: 0, pending: 0, rejected: 0 });
});

test("labels exist in both languages for every type the server knows", () => {
  for (const k of ["motorbike", "scooter", "bicycle", "car", "van", "truck", "other"]) assert.ok(lib.VEHICLE_TYPES[k].en && lib.VEHICLE_TYPES[k].fr);
  for (const k of ["petrol", "diesel", "electric", "hybrid", "none"]) assert.ok(lib.FUEL_TYPES[k].en && lib.FUEL_TYPES[k].fr);
  for (const k of ["driver_licence", "vehicle_insurance", "vehicle_registration", "id_card", "other"]) assert.ok(lib.DOCUMENT_TYPES[k].en && lib.DOCUMENT_TYPES[k].fr);
  for (const k of ["pending", "approved", "rejected"]) assert.ok(lib.DOC_STATUS[k].en && lib.DOC_STATUS[k].fr);
  assert.equal(lib.pickL(lib.DOC_STATUS.pending, true), "À examiner");
  assert.equal(lib.pickL(undefined, true, "x"), "x");
  assert.equal(lib.statusVariant("approved"), "success");
  assert.equal(lib.statusVariant("rejected"), "danger");
  assert.equal(lib.statusVariant("pending"), "warning");
});

test("days are shown as written, whatever the time zone", () => {
  assert.match(lib.fmtDay("2026-09-30", false), /^30 Sep\w* 2026$/);
  assert.equal(lib.fmtDay(null, false), "—");
  assert.equal(lib.fmtDay("garbage", true), "—");
  assert.match(lib.fmtDay("2026-01-01", true), /1 janv\. 2026|1 janvier 2026/);
});

test("the form is the vehicle as text, and an unchanged form sends nothing", () => {
  const f = lib.vehicleToForm(vehicle);
  assert.equal(f.odometerKm, "18240");
  assert.equal(f.nextServiceOn, "");
  assert.equal(lib.vehicleProblem(f, false), null);
  assert.deepEqual(lib.vehicleToPatch(f, vehicle), {});
});

test("only what changed is sent: numbers as numbers, a cleared field as null", () => {
  const f = { ...lib.vehicleToForm(vehicle), odometerKm: " 19000 ", colour: "", nextServiceOn: "2026-12-01", model: "Honda CG 150" };
  assert.deepEqual(lib.vehicleToPatch(f, vehicle), { odometerKm: 19000, colour: null, nextServiceOn: "2026-12-01", model: "Honda CG 150" });
});

test("the form refuses what the server refuses, in English and French", () => {
  const f = lib.vehicleToForm(vehicle);
  assert.match(lib.vehicleProblem({ ...f, odometerKm: "12.5" }, false), /whole number/);
  assert.match(lib.vehicleProblem({ ...f, odometerKm: "-1" }, true), /entier/);
  assert.match(lib.vehicleProblem({ ...f, odometerKm: "6000000" }, false), /5,000,000/);
  assert.match(lib.vehicleProblem({ ...f, lastServiceOn: "2026-02-30" }, false), /Last service must be a valid date/);
  assert.match(lib.vehicleProblem({ ...f, insuranceValidUntil: "31/12/2026" }, true), /fin de l'assurance/);
  assert.match(lib.vehicleProblem({ ...f, model: "x".repeat(81) }, false), /80 characters/);
  assert.match(lib.vehicleProblem({ ...f, plate: "x".repeat(21) }, true), /20 caractères/);
});

test("a rejection reason is 3 to 300 characters", () => {
  assert.equal(lib.reasonProblem("Blurry", false), null);
  assert.match(lib.reasonProblem("  no ", false), /3 to 300/);
  assert.match(lib.reasonProblem("x".repeat(301), true), /3 à 300/);
  assert.match(lib.reasonProblem("", true), /motif/);
});
