import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./admin-questions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { canReadQuestions, canAnswerQuestions, questionProductName } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("who reads and who answers product questions", () => {
  for (const r of ["admin", "admin_operations", "admin_moderation", "admin_support"]) assert.equal(canReadQuestions(r), true, r);
  for (const r of ["admin_finance", "admin_marketing", "seller", "customer", "guest"]) assert.equal(canReadQuestions(r), false, r);
  for (const r of ["admin", "admin_operations", "admin_moderation"]) assert.equal(canAnswerQuestions(r), true, r);
  assert.equal(canAnswerQuestions("admin_support"), false);
});

test("the product name never throws on null fields", () => {
  assert.equal(questionProductName({ productName: "Phone", productNameFr: "Téléphone", productId: "abcdef123" }, true), "Téléphone");
  assert.equal(questionProductName({ productName: "Phone", productNameFr: null, productId: "abcdef123" }, true), "Phone");
  assert.equal(questionProductName({ productName: null, productNameFr: null, productId: "abcdef123" }, false), "abcdef12");
});
