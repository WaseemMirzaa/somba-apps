// Run: npm test (from web/). A stock line's option text ("Colour: Black") reads in the viewer's language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const { stockVariantText, variantLabels } = await loadTs("seller-stock");

const product = {
  variantGroups: [{ name: "Colour", options: ["Black", "Blue"] }],
  variantLabelSet: {
    en: [{ name: "Colour", options: ["Black", "Blue"] }],
    fr: [{ name: "Couleur", options: ["Noir", "Bleu"] }],
  },
};

test("the option text follows the product's own labels in French and English", () => {
  assert.equal(stockVariantText("Colour: Black", product, true), "Couleur: Noir");
  assert.equal(stockVariantText("Colour: Blue", product, false), "Colour: Blue");
});

test("a product without labels (or an unknown product) still gets the well-known words in French, English is untouched", () => {
  assert.equal(stockVariantText("Colour: Black", undefined, true), "Couleur : Noir");
  assert.equal(stockVariantText("Size: XL", { variantGroups: [] }, true), "Taille : XL");
  assert.equal(stockVariantText("Colour: Black", { variantGroups: product.variantGroups, variantLabelSet: null }, true), "Couleur : Noir");
  assert.equal(stockVariantText("Colour: Black", undefined, false), "Colour: Black");
  assert.equal(stockVariantText("Default", undefined, true), "Par défaut");
});

test("the canonical keys stay the keys of the stock split", () => {
  assert.deepEqual(variantLabels({ variantStock: { "Colour: Blue": 2, "Colour: Black": 5 } }), ["Colour: Black", "Colour: Blue"]);
});
