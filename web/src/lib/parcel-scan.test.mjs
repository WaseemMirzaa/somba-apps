// Run: npm test (from web/). Transpiles parcel-scan.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./parcel-scan.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const box = (code, n, of, p = null, d = null) => ({ code, boxNo: n, boxCount: of, pickupScannedAt: p, dropoffScannedAt: d });
const T = "2026-01-01T00:00:00Z";
const three = [box("PKG-AAAAAAA2", 1, 3, T), box("PKG-BBBBBBB3", 2, 3, T), box("PKG-CCCCCCC4", 3, 3)];

test("a box code is PKG- plus 8 characters without 0, O, 1, I; typing is forgiving, the old 6-char leg code is not a box", () => {
  assert.equal(m.normalizeBoxCode("PKG-7KQ2M9XA"), "PKG-7KQ2M9XA");
  assert.equal(m.normalizeBoxCode("  pkg-7kq2m9xa \n"), "PKG-7KQ2M9XA");
  assert.equal(m.normalizeBoxCode("PKG7KQ2M9XA"), "PKG-7KQ2M9XA");
  assert.equal(m.normalizeBoxCode("PKG-7KQ2M9X0"), null, "zero is not in the alphabet");
  assert.equal(m.normalizeBoxCode("PKG-7KQ2M9XO"), null);
  assert.equal(m.normalizeBoxCode("PKG-7KQ2M9X1"), null);
  assert.equal(m.normalizeBoxCode("PKG-7KQ2M9XI"), null);
  assert.equal(m.normalizeBoxCode("PKG-AB12CD"), null, "the legacy per-leg code stays a desk lookup");
  assert.equal(m.normalizeBoxCode("SOM-12345"), null);
  assert.equal(m.isBoxCode("PKG-7KQ2M9XA"), true);
});

test("the rider scans pickup while assigned and drop-off once collected, nothing otherwise", () => {
  assert.equal(m.scanStageFor("assigned"), "pickup");
  assert.equal(m.scanStageFor("picked_up"), "dropoff");
  assert.equal(m.scanStageFor("in_transit"), "dropoff");
  for (const s of ["unassigned", "delivered", "failed"]) assert.equal(m.scanStageFor(s), null, s);
});

test("counts per stage", () => {
  assert.deepEqual(m.stageCounts(three, "pickup"), { scanned: 2, total: 3 });
  assert.deepEqual(m.stageCounts(three, "dropoff"), { scanned: 0, total: 3 });
  assert.deepEqual(m.stageCounts(undefined, "pickup"), { scanned: 0, total: 0 });
  assert.equal(m.stageComplete(three, "pickup"), false);
  assert.equal(m.stageComplete([], "pickup"), true, "no boxes: nothing to scan");
});

test("a button waits only while scanning is required and boxes are missing", () => {
  assert.deepEqual(m.scanGate({ parcels: three, scanRequired: true }, "pickup"), { blocked: true, scanned: 2, total: 3 });
  assert.equal(m.scanGate({ parcels: three, scanRequired: false }, "pickup").blocked, false, "rule off");
  assert.equal(m.scanGate({ parcels: [], scanRequired: true }, "pickup").blocked, false, "no labelled boxes");
  assert.equal(m.scanGate({ scanRequired: true }, "pickup").blocked, false, "older server");
  const done = three.map((p) => ({ ...p, pickupScannedAt: T }));
  assert.equal(m.scanGate({ parcels: done, scanRequired: true }, "pickup").blocked, false);
});

test("which actions are gated: picked up needs pickup, delivered and the warehouse hand-over need drop-off, 'on my way' none", () => {
  const leg = { parcels: three, scanRequired: true };
  assert.equal(m.actionGate(leg, "picked_up").blocked, true);
  assert.equal(m.actionGate(leg, "in_transit").blocked, false);
  assert.equal(m.actionGate(leg, "deliver").blocked, true, "no drop-off scan yet");
  assert.equal(m.actionGate(leg, "handover").blocked, true);
  const dropped = three.map((p) => ({ ...p, dropoffScannedAt: T }));
  assert.equal(m.actionGate({ parcels: dropped, scanRequired: true }, "deliver").blocked, false);
});

test("counter and refusal text in English and French", () => {
  assert.equal(m.scanCounterText(2, 3, false), "2 of 3 scanned");
  assert.equal(m.scanCounterText(2, 3, true), "2 sur 3 scannés");
  assert.equal(m.scanFirstText(2, 3, false), "Scan every parcel first: 2 of 3 scanned.");
  assert.equal(m.scanFirstText(2, 3, true), "Scannez tous les colis d'abord : 2 sur 3 scannés.");
  assert.equal(m.boxText(three[1], false), "Box 2/3");
  assert.equal(m.boxText(three[1], true), "Carton 2/3");
  assert.equal(m.boxesWord(1, false), "1 box");
  assert.equal(m.boxesWord(2, false), "2 boxes");
});

test("a card lists the boxes and marks the scanned ones", () => {
  assert.equal(m.boxesSummary(three.slice(0, 2), "pickup", false), "2 boxes: PKG-AAAAAAA2 (scanned), PKG-BBBBBBB3 (scanned)");
  assert.equal(m.boxesSummary(three.slice(1, 3), "pickup", false), "2 boxes: PKG-BBBBBBB3 (scanned), PKG-CCCCCCC4");
  assert.equal(m.boxesSummary(three.slice(2), null, true), "1 carton: PKG-CCCCCCC4");
  assert.equal(m.boxesSummary([], "pickup", false), "");
});

test("the rider's line after a scan, including a harmless repeat", () => {
  assert.equal(m.riderScanText({ code: "PKG-AAAAAAA2", scanned: 1, total: 3 }, "x", false), "PKG-AAAAAAA2 scanned · 1 of 3 scanned");
  assert.equal(m.riderScanText({ code: "PKG-AAAAAAA2", scanned: 1, total: 3, already: true }, "x", true), "PKG-AAAAAAA2 déjà scanné · 1 sur 3 scannés");
  assert.equal(m.riderScanText({ code: "PKG-CCCCCCC4", scanned: 3, total: 3 }, "x", false), "PKG-CCCCCCC4 scanned. All 3 boxes are scanned.");
});

test("the desk's line after a box scan: boxes so far, or the leg is done", () => {
  const arrived = [box("PKG-AAAAAAA2", 1, 2, T, T), box("PKG-BBBBBBB3", 2, 2, T)];
  assert.equal(m.staffScanText({ code: "PKG-AAAAAAA2", completed: false, parcels: arrived }, "in", false), "PKG-AAAAAAA2 received · 1 of 2 boxes in");
  assert.equal(m.staffScanText({ code: "PKG-AAAAAAA2", completed: false, parcels: arrived }, "in", true), "PKG-AAAAAAA2 reçu · 1 sur 2 cartons arrivés");
  assert.equal(m.staffScanText({ code: "PKG-BBBBBBB3", completed: true, parcels: arrived }, "in", false), "Leg scanned in");
  assert.equal(m.staffScanText({ code: "PKG-AAAAAAA2", completed: false, parcels: arrived }, "out", false), "PKG-AAAAAAA2 handed over · 2 of 2 boxes out");
  assert.equal(m.staffScanText({ code: "PKG-BBBBBBB3", completed: true }, "out", false), "Leg handed to the rider");
});

test("a hand-marked box needs a reason of 3 characters", () => {
  assert.equal(m.reasonValid("  "), false);
  assert.equal(m.reasonValid("ab"), false);
  assert.equal(m.reasonValid(" label torn "), true);
  assert.equal(m.handMarkStage("assigned"), "pickup");
  assert.equal(m.handMarkStage("in_transit"), "dropoff");
});

test("what a scan just answered stays on top of what the screen was given", () => {
  const given = [box("PKG-AAAAAAA2", 1, 2), box("PKG-BBBBBBB3", 2, 2)];
  const live = [box("PKG-AAAAAAA2", 1, 2, T), box("PKG-ZZZZZZZ9", 9, 9, T)];
  const out = m.overlayBoxes(given, live);
  assert.equal(out.length, 2, "boxes the screen no longer lists are dropped");
  assert.equal(out[0].pickupScannedAt, T);
  assert.equal(out[1].pickupScannedAt, null);
  assert.deepEqual(m.overlayBoxes([], live), live, "the scan's list is used when the screen has none yet");
  assert.deepEqual(m.overlayBoxes(given, null), given);
  assert.equal(m.mergeBoxes([{ parcels: given }, { parcels: live }, {}]).length, 3, "the box both lists carry counts once");
});

test("sibling legs list the same box: it counts once and is scanned only when every leg has the scan", () => {
  const a = [box("PKG-AAAAAAAA", 1, 2, T), box("PKG-BBBBBBBB", 2, 2)];
  const b = [box("PKG-AAAAAAAA", 1, 2, T), box("PKG-BBBBBBBB", 2, 2, T)];
  const merged = m.mergeBoxes([{ parcels: a }, { parcels: b }]);
  assert.equal(merged.length, 2);
  assert.equal(m.stageCounts(merged, "pickup").total, 2);
  assert.equal(merged.find((x) => x.code === "PKG-AAAAAAAA").pickupScannedAt, T);
  assert.equal(merged.find((x) => x.code === "PKG-BBBBBBBB").pickupScannedAt, null);
});

test("the contents of sibling legs are listed once", () => {
  const line = (name, qty, ref, variant = null) => ({ name, variant, qty, orderReference: ref });
  const same = [line("Lamp", 1, "SOM-1"), line("Cap", 2, "SOM-2", "One size")];
  const out = m.mergeContents([{ parcelContents: same }, { parcelContents: same }, {}]);
  assert.equal(out.length, 2);
  assert.deepEqual(m.mergeContents([]), []);
});
