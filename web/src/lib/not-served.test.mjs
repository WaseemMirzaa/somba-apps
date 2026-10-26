// Run: npm test (from web/). Transpiles not-served.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./not-served.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

/** What the final API sends on a `delivery:quote` / `orders:create` refusal (docs/contracts/areas.md). */
const ack = {
  ok: false,
  error: "We don't deliver to Haut-Katanga yet.",
  code: "not_served",
  areaId: "a-hk",
  areaName: "Haut-Katanga",
  areaNameEn: "Upper Katanga",
  servedCities: [
    { id: "c1", name: "Kinshasa", nameEn: "Kinshasa" },
    { id: "c2", name: "Kolwezi", nameEn: null },
  ],
};

test("the structured refusal is read from the ack", () => {
  const info = m.notServedFromAck(ack);
  assert.equal(info.area, "Haut-Katanga");
  assert.equal(info.areaEn, "Upper Katanga");
  assert.equal(info.areaId, "a-hk");
  assert.equal(info.servedCities.length, 2);
  assert.equal(m.notServedFromAck({ ok: false, error: "Not allowed." }), null);
  assert.equal(m.notServedFromAck(null), null);
});

test("the sentence follows the UI language, with the served cities", () => {
  const info = m.notServedFromAck(ack);
  assert.equal(
    m.notServedText(m.notServedArea(info, false), m.notServedCityNames(info, false), false),
    "We don't deliver to Upper Katanga yet. We currently deliver in: Kinshasa, Kolwezi.",
  );
  assert.equal(
    m.notServedText(m.notServedArea(info, true), m.notServedCityNames(info, true), true),
    "Nous ne livrons pas encore à Haut-Katanga. Nous livrons actuellement à : Kinshasa, Kolwezi.",
  );
});

test("a city without an English name falls back to the French one", () => {
  const info = m.notServedFromAck({ ...ack, areaNameEn: null });
  assert.equal(m.notServedArea(info, false), "Haut-Katanga");
  assert.deepEqual(m.notServedCityNames(info, false), ["Kinshasa", "Kolwezi"]);
});

test("an error thrown by the socket client keeps its structured fields", () => {
  const err = Object.assign(new Error("Nous ne livrons pas encore à Haut-Katanga."), { raw: ack.error, code: "not_served", ack });
  const info = m.notServedFromError(err);
  assert.equal(info.areaEn, "Upper Katanga");
  assert.equal(info.servedCities.length, 2);
});

test("an old server: only the sentence is parsed (English or French), without cities", () => {
  const old = Object.assign(new Error("Nous ne livrons pas encore à Lubumbashi."), { raw: "We don't deliver to Lubumbashi yet." });
  assert.deepEqual(m.notServedFromError(old), { area: "Lubumbashi" });
  assert.deepEqual(m.notServedFromError(new Error("We don’t deliver to Masina yet.")), { area: "Masina" });
  assert.deepEqual(m.notServedFromError(new Error("Nous ne livrons pas encore à Goma.")), { area: "Goma" });
  assert.equal(m.notServedFromError(new Error("Not allowed.")), null);
  assert.equal(m.notServedFromError(null), null);
});

test("'this area' (nothing matched) reads as unnamed", () => {
  assert.deepEqual(m.notServedFromError(new Error("We don't deliver to this area yet.")), { area: "" });
  const info = m.notServedFromAck({ ...ack, areaId: null, areaName: null, areaNameEn: null });
  assert.equal(info.area, "");
  assert.equal(m.notServedText("", ["Kinshasa"], false), "We don't deliver to this area yet. We currently deliver in: Kinshasa.");
  assert.equal(m.notServedText("", [], true), "Nous ne livrons pas encore dans cette zone.");
});

test("an empty list of cities is trusted as sent (no list in the sentence)", () => {
  const info = m.notServedFromAck({ ...ack, servedCities: [] });
  assert.deepEqual(m.notServedCityNames(info, true), []);
  assert.equal(m.notServedText(m.notServedArea(info, true), m.notServedCityNames(info, true), true), "Nous ne livrons pas encore à Haut-Katanga.");
});

test("old server: the English name is found in the cached tree (no geo:search)", () => {
  const tree = {
    name: "République démocratique du Congo",
    nameEn: "Democratic Republic of the Congo",
    children: [
      { name: "Équateur", nameEn: "Equator", googleName: "Équateur", googleNameEn: "Equator", children: [] },
      { name: "Nord-Kivu", nameEn: "North Kivu", aliases: ["North-Kivu"], children: [{ name: "Goma", nameEn: null, children: [] }] },
    ],
  };
  assert.equal(m.englishAreaName(tree, "Nord-Kivu"), "North Kivu");
  assert.equal(m.englishAreaName(tree, "equateur"), "Equator");
  assert.equal(m.englishAreaName(tree, "Goma"), "Goma");
  assert.equal(m.englishAreaName(tree, "Nowhere"), null);
  assert.equal(m.englishAreaName(null, "Goma"), null);
});

test("the seller-area refusal is recognised in English and in French, by the raw text or the shown message", () => {
  assert.equal(m.isSellerAreaRefusal({ raw: "One seller in your cart cannot ship from their area yet.", message: "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone." }), true);
  assert.equal(m.isSellerAreaRefusal({ message: "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone." }), true);
  assert.equal(m.isSellerAreaRefusal({ message: "One seller in your cart cannot ship from their area yet" }), true);
  assert.equal(m.isSellerAreaRefusal(new Error("One seller in your cart cannot ship from their area yet.")), true);
  assert.equal(m.isSellerAreaRefusal("One seller in your cart cannot ship from their area yet."), true);
  // not the same thing as an unserved address, nor any other failure
  assert.equal(m.isSellerAreaRefusal({ raw: "We don't deliver to Goma yet.", message: "Nous ne livrons pas encore à Goma." }), false);
  assert.equal(m.isSellerAreaRefusal(new Error("Request failed.")), false);
  assert.equal(m.isSellerAreaRefusal(null), false);
  assert.equal(m.isSellerAreaRefusal(undefined), false);
});
