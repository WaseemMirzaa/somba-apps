// Run: npm test (from web/). Transpiles countries.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./countries.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { countryCode, countryName, countryFromGoogle, addressCountryCode, addressCountryText, addressLine } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("a DRC address reads as the DR Congo in both languages, from a code or any spelling", () => {
  for (const raw of ["CD", "cd", "DRC", "RDC", "RD Congo", "DR Congo", "D.R. Congo", "Congo (Kinshasa)", "Democratic Republic of the Congo", "République démocratique du Congo", "republique democratique du congo"]) {
    assert.equal(countryCode(raw), "CD", raw);
    assert.equal(countryName(raw, true), "République démocratique du Congo", raw);
    assert.equal(countryName(raw, false), "Democratic Republic of the Congo", raw);
  }
});

test("short forms for tight spaces", () => {
  assert.equal(countryName("CD", true, true), "RD Congo");
  assert.equal(countryName("CD", false, true), "DR Congo");
  assert.equal(countryName("FR", true, true), "France");
});

test("France stays France, the other Congo stays the other Congo", () => {
  assert.equal(countryName("FR", false), "France");
  assert.equal(countryName("France", true), "France");
  assert.equal(countryName("CG", true), "République du Congo");
  assert.equal(countryName("Congo", false), "Republic of the Congo");
  assert.equal(countryName("BE", true), "Belgique");
});

test("a missing country is never invented", () => {
  assert.equal(countryName(null, true), "");
  assert.equal(countryName(undefined, false), "");
  assert.equal(countryName("   ", true), "");
  assert.equal(countryCode(""), null);
  assert.equal(addressCountryText({ country: null, city: "Kinshasa" }, true), "");
  assert.equal(addressCountryText({ city: "Paris" }, false), "");
  assert.equal(addressCountryCode({ country: "", city: "Kinshasa" }), null);
});

test("text that is not a known country is shown as typed", () => {
  assert.equal(countryName("Zimbabwe", true), "Zimbabwe");
  assert.equal(countryCode("Zimbabwe"), null);
  assert.equal(addressCountryText({ country: "Zimbabwe", city: "Harare" }, false), "Zimbabwe");
});

test("the old web default 'France' next to a Congolese city is read as the DR Congo; a real French address is not touched", () => {
  assert.equal(addressCountryCode({ country: "France", city: "Kinshasa" }), "CD");
  assert.equal(addressCountryText({ country: "France", city: "Kinshasa" }, true), "République démocratique du Congo");
  assert.equal(addressCountryText({ country: "France", city: "kinshasa " }, false), "Democratic Republic of the Congo");
  assert.equal(addressCountryText({ country: "France", city: "Lubumbashi" }, false), "Democratic Republic of the Congo");
  assert.equal(addressCountryText({ country: "France", city: "Paris" }, true), "France");
  assert.equal(addressCountryText({ country: "FR", city: "Lyon" }, false), "France");
  // Only "France" is repaired: a country that is already right or unknown is left alone.
  assert.equal(addressCountryText({ country: "CD", city: "Kinshasa" }, true), "République démocratique du Congo");
  assert.equal(addressCountryText({ country: "Belgium", city: "Kinshasa" }, false), "Belgium");
});

test("the address line leaves out the empty parts", () => {
  const a = { line1: "12 Avenue de la Paix", commune: "Gombe", city: "Kinshasa", country: "CD" };
  assert.equal(addressLine(a, true), "12 Avenue de la Paix, Gombe, Kinshasa, République démocratique du Congo");
  assert.equal(addressLine(a, false, true), "12 Avenue de la Paix, Gombe, Kinshasa, DR Congo");
  assert.equal(addressLine({ ...a, commune: null, country: null }, true), "12 Avenue de la Paix, Kinshasa");
  assert.equal(addressLine({ ...a, country: "France" }, false), "12 Avenue de la Paix, Gombe, Kinshasa, Democratic Republic of the Congo");
});

test("a map pick stores the ISO code Google gives, whatever the language of its names", () => {
  assert.equal(countryFromGoogle("Democratic Republic of the Congo", "CD"), "CD");
  assert.equal(countryFromGoogle("République démocratique du Congo", "cd"), "CD");
  assert.equal(countryFromGoogle("France", "FR"), "FR");
  // No usable short name: the long one is recognised, else kept as Google wrote it, else nothing (never a default).
  assert.equal(countryFromGoogle("Congo (Kinshasa)", ""), "CD");
  assert.equal(countryFromGoogle("Zimbabwe", undefined), "Zimbabwe");
  assert.equal(countryFromGoogle("", ""), undefined);
  assert.equal(countryFromGoogle(undefined, undefined), undefined);
});
