// Run: npm test (from web/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./translate-auto.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { shouldAutoTranslate } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const base = { auto: true, translationOn: true, alreadyReadable: false, hasText: true, started: false };

test("translates by itself when asked to, with a service, a text and nothing started yet", () => {
  assert.equal(shouldAutoTranslate(base), true);
});

test("never without the automatic flag (reviews and chat stay on the link)", () => {
  assert.equal(shouldAutoTranslate({ ...base, auto: false }), false);
});

test("never without a translation service on the server", () => {
  assert.equal(shouldAutoTranslate({ ...base, translationOn: false }), false);
});

test("never for text already in the viewer's language, nor for an empty text", () => {
  assert.equal(shouldAutoTranslate({ ...base, alreadyReadable: true }), false);
  assert.equal(shouldAutoTranslate({ ...base, hasText: false }), false);
});

test("not again once there is an answer, a failure or the viewer's choice for this language; a new language starts over", () => {
  assert.equal(shouldAutoTranslate({ ...base, started: true }), false);
  // The component keys its state by record and language: a language switch has nothing started.
  assert.equal(shouldAutoTranslate({ ...base, started: false }), true);
});
