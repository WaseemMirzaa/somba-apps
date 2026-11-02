// Run: npm test (from web/). Transpiles cash-amount.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./cash-amount.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { parseCashAmount } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("reads dollars and cents with a point or a comma", () => {
  assert.equal(parseCashAmount("25.50"), 25.5);
  assert.equal(parseCashAmount("25,50"), 25.5);
  assert.equal(parseCashAmount(" 40 "), 40);
  assert.equal(parseCashAmount("0.01"), 0.01);
});

test("refuses empty, zero, negative, text and sub-cent amounts", () => {
  for (const bad of ["", "  ", "0", "0.00", "-5", "abc", "12.345", "1e3x", "."]) assert.equal(parseCashAmount(bad), null, bad);
});
