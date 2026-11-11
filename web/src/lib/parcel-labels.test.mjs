// Run: npm test (from web/). The seller's parcel labels: box-count clamp, paper CSS (A6 label, A4 grid), label text, grid math.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const p = await loadTs("parcel-labels");

test("a box count is clamped to 1-20 and junk reads as 1", () => {
  assert.equal(p.clampBoxes(0), 1);
  assert.equal(p.clampBoxes(-4), 1);
  assert.equal(p.clampBoxes(1), 1);
  assert.equal(p.clampBoxes(20), 20);
  assert.equal(p.clampBoxes(99), 20);
  assert.equal(p.clampBoxes("7"), 7);
  assert.equal(p.clampBoxes(" 3 "), 3);
  assert.equal(p.clampBoxes(2.9), 2);
  for (const junk of ["", "abc", null, undefined, NaN, Infinity]) assert.equal(p.clampBoxes(junk), 1, String(junk));
});

test("the A6 paper prints one 100 x 150 mm label per page with no margin", () => {
  const css = p.paperCss("a6");
  assert.match(css, /@page \{ size: 100mm 150mm; margin: 0 \}/);
  assert.match(css, /break-after: page/);
  assert.match(css, /:last-child \{ break-after: auto/);
  assert.equal(p.labelsPerPage("a6"), 1);
  assert.equal(p.pageCount("a6", 3), 3);
});

test("the A4 paper prints a 2-column grid, 4 labels a sheet, 5 mm margin", () => {
  const css = p.paperCss("a4");
  assert.match(css, /@page \{ size: A4; margin: 5mm \}/);
  assert.match(css, /grid-template-columns: repeat\(2, 100mm\)/);
  assert.doesNotMatch(css, /break-after: page/);
  assert.equal(p.labelsPerPage("a4"), 4);
  assert.equal(p.pageCount("a4", 0), 0);
  assert.equal(p.pageCount("a4", 4), 1);
  assert.equal(p.pageCount("a4", 5), 2);
  assert.equal(p.pageCount("a4", 20), 5);
});

test("both papers fit their page", () => {
  assert.ok(p.gridFits("a6"));
  assert.ok(p.gridFits("a4"));
  assert.equal(p.PAPERS.a4.labelWidthMm, 100);
  assert.equal(p.PAPERS.a4.labelHeightMm, 142);
});

test("the print CSS hides everything except the sheet, its ancestors and its content", () => {
  for (const id of p.PAPER_ORDER) assert.match(p.paperCss(id), /body :not\(\.parcel-sheet\):not\(:has\(\.parcel-sheet\)\):not\(\.parcel-sheet \*\) \{ display: none !important/);
});

test("a stored paper choice falls back to A6", () => {
  assert.equal(p.readPaper("a4"), "a4");
  assert.equal(p.readPaper("a6"), "a6");
  for (const v of [null, undefined, "", "letter", 4]) assert.equal(p.readPaper(v), "a6");
});

test("label text in English and French", () => {
  assert.equal(p.boxText(1, 3, false), "Box 1/3");
  assert.equal(p.boxText(1, 3, true), "Colis 1/3");
  assert.equal(p.labelsReadyToast(2, false), "Labels ready: 2 boxes");
  assert.equal(p.labelsReadyToast(1, false), "Labels ready: 1 box");
  assert.equal(p.labelsReadyToast(2, true), "Étiquettes prêtes : 2 boîtes");
  assert.match(p.qrAlt({ code: "PKG-7KQ2M9XA", boxNo: 1, boxCount: 3 }, false), /PKG-7KQ2M9XA/);
  assert.match(p.qrAlt({ code: "PKG-7KQ2M9XA", boxNo: 1, boxCount: 3 }, true), /Code QR/);
  assert.notEqual(p.BOXES_LOCKED_COPY.en, p.BOXES_LOCKED_COPY.fr);
});

test("labels come out in box order, once each", () => {
  const l = (code, boxNo) => ({ code, boxNo, boxCount: 3, orderReference: "ORD-1" });
  assert.deepEqual(p.orderedLabels([l("C", 3), l("A", 1), l("B", 2), l("A", 1)]).map((x) => x.code), ["A", "B", "C"]);
});
