// Run: npm test (from web/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./text-i18n.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { pickI18n, isMachine, freshI18n, previewText, shownText } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const fr = { sourceLang: "fr", fr: "Très bon produit", en: "Very good product" };
const ORIGINAL_FR = "Très bon produit";

test("a page in English shows the English text and flags it as a machine translation of French", () => {
  assert.deepEqual(pickI18n(fr, "en", ORIGINAL_FR), { text: "Very good product", machine: true });
});

test("a language switch swaps the text from the same payload", () => {
  assert.deepEqual(pickI18n(fr, "fr", ORIGINAL_FR), { text: "Très bon produit", machine: false });
  assert.deepEqual(pickI18n(fr, "en", ORIGINAL_FR), { text: "Very good product", machine: true });
});

test("source language equals the page language: no machine flag (no note, no link)", () => {
  const en = { sourceLang: "en", en: "Great", fr: "Super" };
  assert.deepEqual(pickI18n(en, "en", "Great"), { text: "Great", machine: false });
  assert.equal(isMachine(en, "en"), false);
  assert.equal(isMachine(en, "fr"), true);
});

test("unknown source language: the text is shown, never flagged as machine", () => {
  const o = { sourceLang: null, en: "Hello", fr: "Bonjour" };
  assert.deepEqual(pickI18n(o, "fr", "Hello"), { text: "Bonjour", machine: false });
  assert.equal(isMachine(o, "fr"), false);
});

test("a missing key for the page language falls back (null): the on-demand fetch takes over", () => {
  assert.equal(pickI18n({ sourceLang: "fr", fr: "Salut" }, "en", "Salut"), null);
  assert.equal(pickI18n({ sourceLang: null }, "en", "x"), null);
  assert.equal(pickI18n({ sourceLang: "fr", fr: "Salut", en: "   " }, "en", "Salut"), null);
});

test("an absent object falls back", () => {
  assert.equal(pickI18n(undefined, "en", "x"), null);
  assert.equal(pickI18n(null, "en", "x"), null);
});

test("a language other than en / fr has no key: falls back", () => {
  assert.equal(pickI18n(fr, "es", ORIGINAL_FR), null);
});

test("another source language (e.g. Spanish): both en and fr are machine translations", () => {
  const es = { sourceLang: "es", en: "Good", fr: "Bon" };
  assert.deepEqual(pickI18n(es, "en", "Bueno"), { text: "Good", machine: true });
  assert.deepEqual(pickI18n(es, "fr", "Bueno"), { text: "Bon", machine: true });
});

test("a stale object (the text was edited, the old translations came along) is ignored", () => {
  assert.equal(pickI18n(fr, "en", "Produit moyen finalement"), null);
  assert.equal(freshI18n(fr, "Produit moyen finalement"), null);
});

test("the copy of the author's language is compared trimmed, so whitespace does not make it stale", () => {
  assert.deepEqual(pickI18n(fr, "en", `  ${ORIGINAL_FR}\n`), { text: "Very good product", machine: true });
  assert.equal(freshI18n(fr, ORIGINAL_FR), fr);
});

test("without a copy for the source language there is nothing to compare: the object is trusted", () => {
  const o = { sourceLang: "fr", en: "Very good product" };
  assert.deepEqual(pickI18n(o, "en", "whatever"), { text: "Very good product", machine: true });
});

test("preview: the viewer-language text when the payload has it, else the preview as sent", () => {
  const i = { sourceLang: "fr", fr: "Bonjour, est-il disponible ?", en: "Hello, is it available?" };
  assert.equal(previewText(i, "en", "Bonjour, est-i…"), "Hello, is it available?");
  assert.equal(previewText(i, "fr", "Bonjour, est-i…"), "Bonjour, est-il disponible ?");
  assert.equal(previewText({ sourceLang: "fr", fr: "Salut" }, "en", "Salut"), "Salut");
  assert.equal(previewText(undefined, "en", "As sent"), "As sent");
  assert.equal(previewText(null, "en", null), "");
});

test("a ticket subject in a title: the page language when the payload has it and it is fresh, else as written (no request)", () => {
  const subject = { sourceLang: "fr", fr: "Où est ma commande ?", en: "Where is my order?" };
  assert.equal(shownText(subject, "en", "Où est ma commande ?"), "Where is my order?");
  assert.equal(shownText(subject, "fr", "Où est ma commande ?"), "Où est ma commande ?");
  assert.equal(shownText(subject, "en", "Edited since"), "Edited since"); // stale object: the written text
  assert.equal(shownText(undefined, "en", "As written"), "As written");
  assert.equal(shownText(null, "fr", null), "");
});
