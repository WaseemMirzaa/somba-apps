// Run: npm test (from web/). Transpiles leg-items.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./leg-items.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { legItemName, legItemsText } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const cargo = [
  { orderItemId: "i1", name: "Blue Cotton T-Shirt", nameFr: "T-shirt bleu en coton", qty: 1 },
  { orderItemId: "i2", name: "Dyson V15 Vacuum", nameFr: "Aspirateur Dyson V15", qty: 2 },
];

test("the desk and the rider portal read the cargo in the viewer's language (bug 2)", () => {
  assert.equal(legItemsText(cargo, true), "1 × T-shirt bleu en coton, 2 × Aspirateur Dyson V15");
  assert.equal(legItemsText(cargo, false), "1 × Blue Cotton T-Shirt, 2 × Dyson V15 Vacuum");
});

test("a French-written product keeps its own name in French; English shows the translation", () => {
  const shoes = [{ name: "Lightweight running shoes", nameFr: "Baskets de running légères", qty: 1 }];
  assert.equal(legItemsText(shoes, true), "1 × Baskets de running légères");
  assert.equal(legItemsText(shoes, false), "1 × Lightweight running shoes");
});

test("a leg created before the fix (no nameFr) still renders, with the base name in both languages", () => {
  const old = [{ orderItemId: "i1", productId: "p1", name: "Blue Cotton T-Shirt", qty: 3 }];
  assert.equal(legItemsText(old, true), "3 × Blue Cotton T-Shirt");
  assert.equal(legItemsText(old, false), "3 × Blue Cotton T-Shirt");
});

test("an empty or blank French name falls back to the base name", () => {
  assert.equal(legItemName({ name: "Lamp", nameFr: "" }, true), "Lamp");
  assert.equal(legItemName({ name: "Lamp", nameFr: "   " }, true), "Lamp");
  assert.equal(legItemName({ name: "Lamp", nameFr: null }, true), "Lamp");
  assert.equal(legItemName({ name: "Lamp", nameFr: " Lampe " }, true), "Lampe");
  assert.equal(legItemName({ name: "Lamp", nameFr: "Lampe" }, false), "Lamp");
});

test("no cargo is a dash", () => {
  assert.equal(legItemsText([], true), "—");
  assert.equal(legItemsText(undefined, false), "—");
});
