// Run: npm test (from web/). The admin's delivery-model settings: the eight keys, their ranges (the API's), both languages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const d = await loadTs("delivery-settings");
const byKey = Object.fromEntries(d.DELIVERY_MODEL_FIELDS.map((f) => [f.key, f]));

test("the eight settings of the delivery model are all there", () => {
  assert.deepEqual(
    d.DELIVERY_MODEL_FIELDS.map((f) => f.key),
    ["localDeliveryDays", "splitDeliveryAfterHours", "expressDeliveryEnabled", "expressDeliveryDays", "expressBaseUsd", "expressPerKmUsd", "expressMaxUsd", "expressMaxKm"],
  );
});

test("each has a label and help text in English and French", () => {
  for (const f of d.DELIVERY_MODEL_FIELDS) {
    for (const t of [f.label, f.labelFr, f.hint, f.hintFr]) assert.ok(t.trim().length > 3, f.key);
    assert.notEqual(f.label, f.labelFr, `${f.key}: labels differ`);
  }
  assert.equal(d.DELIVERY_MODEL_TITLE.fr, "Modèle de livraison");
});

test("the ranges match the API (settings.service.ts)", () => {
  const want = {
    localDeliveryDays: [0, 30, true],
    splitDeliveryAfterHours: [0, 720, true],
    expressDeliveryDays: [0, 30, true],
    expressBaseUsd: [0, 100, undefined],
    expressPerKmUsd: [0, 50, undefined],
    expressMaxUsd: [0, 500, undefined],
    expressMaxKm: [0, 100, undefined],
  };
  for (const [key, [min, max, integer]] of Object.entries(want)) {
    assert.deepEqual({ ...byKey[key].range }, integer ? { min, max, integer } : { min, max }, key);
  }
  assert.equal(byKey.expressDeliveryEnabled.kind, "toggle");
  assert.equal(byKey.expressDeliveryEnabled.range, undefined);
});

test("the express settings show only while express delivery is on", () => {
  const off = d.visibleDeliveryFields("false").map((f) => f.key);
  assert.deepEqual(off, ["localDeliveryDays", "splitDeliveryAfterHours", "expressDeliveryEnabled"]);
  for (const v of [undefined, null, "", "nope"]) assert.deepEqual(d.visibleDeliveryFields(v).map((f) => f.key), off);
  assert.equal(d.visibleDeliveryFields("true").length, 8);
  assert.equal(d.visibleDeliveryFields(" TRUE ").length, 8);
});

test("a value outside its range is refused with a sentence in the admin's language", () => {
  const r = byKey.localDeliveryDays.range;
  assert.equal(d.rangeProblem(r, "1", false), null);
  assert.equal(d.rangeProblem(r, "0", false), null);
  assert.equal(d.rangeProblem(r, "30", false), null);
  assert.equal(d.rangeProblem(r, "31", false), "Enter a whole number between 0 and 30.");
  assert.equal(d.rangeProblem(r, "1.5", true), "Saisissez un nombre entier entre 0 et 30.");
  assert.equal(d.rangeProblem(r, "", false), "Enter a whole number between 0 and 30.");
  assert.equal(d.rangeProblem(r, "abc", true), "Saisissez un nombre entier entre 0 et 30.");
  const fee = byKey.expressBaseUsd.range;
  assert.equal(d.rangeProblem(fee, "2,5", false), null); // a decimal comma is fine
  assert.equal(d.rangeProblem(fee, "100.01", false), "Enter a number between 0 and 100.");
  assert.equal(d.rangeProblem(fee, "-1", true), "Saisissez un nombre entre 0 et 100.");
});
