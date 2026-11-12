// Run: npm test (from web/). A shopper without a working map can still pin the address at the centre of the chosen commune.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./area-centre.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { areaCentre } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const province = { level: "province", name: "Kinshasa", lat: -4.3, lng: 15.3 };
const city = { level: "city", name: "Kinshasa", lat: -4.32, lng: 15.31 };
const commune = { level: "commune", name: "Gombe", nameEn: "Gombe", lat: -4.309, lng: 15.3 };

test("the commune wins over the city and the province", () => {
  assert.deepEqual(areaCentre([province, city, commune], true), { lat: -4.309, lng: 15.3, name: "Gombe", level: "commune" });
});

test("a quartier with coordinates is more precise than its commune", () => {
  const q = { level: "quartier", name: "Quartier A", lat: -4.31, lng: 15.29 };
  assert.equal(areaCentre([province, city, commune, q], false).level, "quartier");
});

test("a commune without coordinates falls back to the city; a province alone is not a pin", () => {
  assert.equal(areaCentre([province, city, { ...commune, lat: null, lng: null }], false).level, "city");
  assert.equal(areaCentre([province], false), null);
});

test("nothing chosen, or impossible coordinates, gives no pin", () => {
  assert.equal(areaCentre(null, false), null);
  assert.equal(areaCentre([], true), null);
  assert.equal(areaCentre([{ level: "commune", name: "X", lat: 200, lng: 0 }], true), null);
  assert.equal(areaCentre([{ level: "commune", name: "X", lat: Number.NaN, lng: 0 }], true), null);
});

test("the name follows the language", () => {
  assert.equal(areaCentre([{ ...commune, name: "Ville", nameEn: "Town" }], false).name, "Town");
  assert.equal(areaCentre([{ ...commune, name: "Ville", nameEn: "Town" }], true).name, "Ville");
});
