// Run: npm test (from web/). Transpiles replacement-condition.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./replacement-condition.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { replacementConditionLabel, REPLACEMENT_CONDITION } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("every condition the web form sends reads in French and in English", () => {
  // the values of the form on /shop/orders/:id/exchange
  assert.equal(replacementConditionLabel("Damaged", true), "Endommagé");
  assert.equal(replacementConditionLabel("Damaged", false), "Damaged");
  assert.equal(replacementConditionLabel("Defective", true), "Défectueux");
  assert.equal(replacementConditionLabel("Defective", false), "Defective");
  assert.equal(replacementConditionLabel("Wrong item", true), "Mauvais article");
  assert.equal(replacementConditionLabel("Wrong item", false), "Wrong item");
  assert.equal(replacementConditionLabel("Other", true), "Autre");
  assert.equal(replacementConditionLabel("Other", false), "Other");
});

test("the mobile app's codes (damaged, defective, wrong_item, other) read the same", () => {
  assert.equal(replacementConditionLabel("damaged", true), "Endommagé");
  assert.equal(replacementConditionLabel("defective", true), "Défectueux");
  assert.equal(replacementConditionLabel("wrong_item", true), "Mauvais article");
  assert.equal(replacementConditionLabel("wrong_item", false), "Wrong item");
  assert.equal(replacementConditionLabel("other", true), "Autre");
  assert.equal(replacementConditionLabel("  WRONG-ITEM ", true), "Mauvais article");
});

test("nothing is left in English in the French map, and the two languages differ", () => {
  for (const [key, l] of Object.entries(REPLACEMENT_CONDITION)) {
    assert.ok(l.fr.trim() && l.en.trim(), key);
    assert.notEqual(l.fr, l.en, key);
  }
  assert.deepEqual(Object.keys(REPLACEMENT_CONDITION).sort(), ["damaged", "defective", "other", "wrong_item"]);
});

test("a value that is none of these is shown as written; no value is a dash", () => {
  assert.equal(replacementConditionLabel("Screen cracked in the corner", true), "Screen cracked in the corner");
  assert.equal(replacementConditionLabel(" Broken hinge ", false), "Broken hinge");
  for (const v of [null, undefined, "", "   "]) assert.equal(replacementConditionLabel(v, true), "—");
});
