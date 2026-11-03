// Run: npm test (from web/). Transpiles stock-codes.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./stock-codes.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("a parcel label, in any of the spellings the floor uses, is one parcel code", () => {
  for (const raw of ["PKG-ab12cd", "pkg-AB12CD", "BC-ab12cd", "pkg:ab12cd", "PKGab12cd", "  PKG-AB12CD\r\n"]) assert.deepEqual(m.classifyScan(raw), { kind: "parcel", value: "PKG-AB12CD" }, raw);
});

test("a shelf label is a SKU in lower case, a bin label is the bin code in upper case", () => {
  assert.deepEqual(m.classifyScan("SKU-AB12CD"), { kind: "sku", value: "SKU-ab12cd" });
  assert.deepEqual(m.classifyScan("sku:ab12cd"), { kind: "sku", value: "SKU-ab12cd" });
  assert.deepEqual(m.classifyScan("BIN-a-01/3"), { kind: "bin", value: "A-01/3" });
  assert.deepEqual(m.classifyScan("bin:rack 2"), { kind: "bin", value: "RACK 2" });
});

test("order references and unknown text are told apart, and noise is cleaned", () => {
  assert.deepEqual(m.classifyScan("som-1234ab"), { kind: "order", value: "SOM-1234AB" });
  assert.deepEqual(m.classifyScan("A-01"), { kind: "unknown", value: "A-01" });
  assert.deepEqual(m.classifyScan("   "), { kind: "unknown", value: "" });
  assert.equal(m.cleanScan("AB\u0000C\u001f D"), "ABC D");
  assert.equal(m.cleanScan("x".repeat(500)).length, 120);
  assert.deepEqual(m.classifyScan("BIN-"), { kind: "unknown", value: "BIN-" });
});

test("request references are unique, short enough for the server, and carry the prefix", () => {
  const a = m.makeRef("recv");
  const b = m.makeRef("recv");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("recv:"));
  assert.ok(a.length <= 64);
});

test("signed numbers", () => {
  assert.equal(m.signed(3), "+3");
  assert.equal(m.signed(-2), "-2");
  assert.equal(m.signed(0), "0");
});

test("a camera repeating one code is accepted once per gap, a different code at once", () => {
  assert.equal(m.shouldAccept(null, "A", 1000), true);
  assert.equal(m.shouldAccept({ text: "A", at: 1000 }, "A", 1500), false);
  assert.equal(m.shouldAccept({ text: "A", at: 1000 }, "A", 2900), true);
  assert.equal(m.shouldAccept({ text: "A", at: 1000 }, "B", 1100), true);
  assert.equal(m.shouldAccept(null, "", 1000), false);
});

test("why the camera could not start: no API on http, no API on https, refused, none, busy, other", () => {
  const ok = { hasMediaDevices: true, secure: true };
  assert.equal(m.cameraProblem(null, { hasMediaDevices: false, secure: false }), "insecure");
  assert.equal(m.cameraProblem(null, { hasMediaDevices: false, secure: true }), "unsupported");
  assert.equal(m.cameraProblem({ name: "NotAllowedError" }, ok), "denied");
  assert.equal(m.cameraProblem({ name: "NotFoundError" }, ok), "none");
  assert.equal(m.cameraProblem({ name: "NotReadableError" }, ok), "busy");
  assert.equal(m.cameraProblem(new Error("boom"), ok), "failed");
  for (const k of ["unsupported", "insecure", "denied", "none", "busy", "failed"]) assert.ok(m.CAMERA_PROBLEM_TEXT[k].en && m.CAMERA_PROBLEM_TEXT[k].fr);
});

test("every ledger kind and reason the server writes has English and French wording", () => {
  for (const k of ["receive", "move", "count", "stock_out"]) assert.ok(m.KIND_TEXT[k].fr && m.KIND_TEXT[k].en);
  for (const r of ["parcel", "manual_receipt", "return_restock", "relocation", "cycle_count", "dispatch", "damaged", "lost", "sample", "seller_pickup", "other"]) assert.ok(m.REASON_TEXT[r].fr !== m.REASON_TEXT[r].en || r === "other", r);
  for (const r of [...m.OUT_REASON_LIST, ...m.RECEIVE_REASON_LIST]) assert.ok(m.REASON_TEXT[r], r);
  assert.equal(m.wording(m.KIND_TEXT, "move", true), "Déplacé");
  assert.equal(m.wording(m.KIND_TEXT, "weird", true), "weird");
});

test("a ledger line reads as one short phrase in both languages", () => {
  const base = { qty: 4, delta: 0, fromBinCode: "A-01", toBinCode: "B-02" };
  assert.equal(m.movementText({ ...base, kind: "move" }, false), "4 from A-01 to B-02");
  assert.equal(m.movementText({ ...base, kind: "move" }, true), "4 de A-01 vers B-02");
  assert.equal(m.movementText({ ...base, kind: "receive", delta: 4 }, false), "+4 into B-02");
  assert.equal(m.movementText({ ...base, kind: "stock_out", delta: -4 }, false), "-4 from A-01");
  assert.equal(m.movementText({ kind: "count", qty: 8, delta: -2, toBinCode: "A-01", expectedQty: 10, countedQty: 8 }, false), "A-01: 8 counted, 10 expected (-2)");
  assert.equal(m.movementText({ kind: "count", qty: 8, delta: -2, toBinCode: "A-01", expectedQty: 10, countedQty: 8 }, true), "A-01 : 8 compté, 10 attendu (-2)");
});

test("the count sheet: blank lines are skipped, bad numbers are not sent, variance is counted minus expected", () => {
  assert.equal(m.varianceOf(10, ""), null);
  assert.equal(m.varianceOf(10, "8"), -2);
  assert.equal(m.varianceOf(10, "12"), 2);
  assert.equal(m.varianceOf(10, "10"), 0);
  assert.equal(m.varianceOf(10, "-1"), null);
  assert.equal(m.varianceOf(10, "1.5"), null);
  assert.equal(m.varianceOf(10, "abc"), null);
  const sent = m.countLines([
    { productId: "p1", variant: "Default", expected: 10, counted: "8" },
    { productId: "p2", variant: "Default", expected: 3, counted: "" },
    { productId: "p3", variant: "Size: M", expected: 0, counted: "0" },
    { productId: "p4", variant: "Default", expected: 1, counted: "x" },
  ]);
  assert.deepEqual(sent, [
    { productId: "p1", variant: "Default", counted: 8, expected: 10 },
    { productId: "p3", variant: "Size: M", counted: 0, expected: 0 },
  ]);
});

test("units typed in a form: whole numbers from 1", () => {
  assert.equal(m.wholeUnits("5"), 5);
  assert.equal(m.wholeUnits(" 12 "), 12);
  for (const bad of ["", "0", "-1", "1.5", "a", "2000000", "1 2"]) assert.equal(m.wholeUnits(bad), null, bad);
});
