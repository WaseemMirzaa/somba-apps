// Run: npm test (from web/). Transpiles area-names.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./area-names.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { areaName, chainText, deliveryAreaText } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const a = (level, name, nameEn = null) => ({ level, name, nameEn });
const chain = (commune, communeEn = null) => [
  a("country", "République démocratique du Congo", "Democratic Republic of the Congo"),
  a("province", "Kinshasa"),
  a("city", "Kinshasa"),
  a("district", "Lukunga"),
  a("commune", commune, communeEn),
];

test("areaName: French is the official name, English falls back to it", () => {
  assert.equal(areaName(a("city", "Kinshasa"), true), "Kinshasa");
  assert.equal(areaName(a("commune", "Kalamu", null), false), "Kalamu");
  assert.equal(areaName(a("province", "Haut-Katanga", "Upper Katanga"), false), "Upper Katanga");
  assert.equal(areaName(a("province", "Haut-Katanga", "Upper Katanga"), true), "Haut-Katanga");
  assert.equal(areaName(null, true), "");
});

test("chainText: most specific first, no country, a repeated name once", () => {
  assert.equal(chainText(chain("Gombe"), true), "Gombe, Lukunga, Kinshasa");
  assert.equal(chainText(chain("Gombe"), true, { skipLevels: ["district"] }), "Gombe, Kinshasa");
});

test("the order's stored area wins over the quote (bug 4: a Gombe order named Barumbu)", () => {
  const stored = chain("Gombe");
  const quote = { destinationAreaChain: chain("Barumbu"), destinationArea: a("commune", "Barumbu") };
  assert.equal(deliveryAreaText(stored, quote, false), "Gombe, Kinshasa");
  assert.equal(deliveryAreaText(stored, quote, true), "Gombe, Kinshasa");
  assert.equal(deliveryAreaText(stored, null, true), "Gombe, Kinshasa");
});

test("the area is named in the viewer's language, with its city", () => {
  const stored = [a("country", "RDC"), a("province", "Haut-Katanga", "Upper Katanga"), a("city", "Lubumbashi"), a("commune", "Kampemba", "Kampemba East")];
  assert.equal(deliveryAreaText(stored, null, true), "Kampemba, Lubumbashi, Haut-Katanga");
  assert.equal(deliveryAreaText(stored, null, false), "Kampemba East, Lubumbashi, Upper Katanga");
});

test("an order without a stored area falls back to the quote, then to a dash", () => {
  const quote = { destinationAreaChain: chain("Barumbu"), destinationArea: a("commune", "Barumbu") };
  assert.equal(deliveryAreaText(null, quote, true), "Barumbu, Kinshasa");
  assert.equal(deliveryAreaText([], quote, false), "Barumbu, Kinshasa");
  assert.equal(deliveryAreaText(undefined, { destinationArea: a("commune", "Barumbu") }, true), "Barumbu");
  assert.equal(deliveryAreaText(null, { destinationAreaChain: [] }, true), "—");
  assert.equal(deliveryAreaText(null, null, false), "—");
});
