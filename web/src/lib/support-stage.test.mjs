// Run: npm test (from web/). Returns and disputes start with KOMORIKO support; the old seller stages read like it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const load = async (file) => {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return outputText;
};
const stage = await import(`data:text/javascript,${encodeURIComponent(await load("./support-stage.ts"))}`);

test("every legacy seller stage and `escalated` normalise to awaiting_support; the rest are untouched", () => {
  for (const s of ["awaiting_seller", "seller_replied", "seller_rejected", "seller_timeout", "escalated", "awaiting_support", undefined, null, ""]) {
    assert.equal(stage.normalizeStage(s), "awaiting_support", String(s));
  }
  for (const s of ["approved", "pickup", "received", "closed"]) assert.equal(stage.normalizeStage(s), s);
});

test("undecided = awaiting support, escalated or any legacy seller stage", () => {
  for (const s of ["awaiting_support", "escalated", "awaiting_seller", "seller_rejected", "seller_timeout", "seller_replied"]) assert.equal(stage.isUndecidedStage(s), true, s);
  for (const s of ["approved", "pickup", "received", "closed", undefined, null]) assert.equal(stage.isUndecidedStage(s), false, String(s));
});

test("the admin and warehouse stage tables show the legacy stages as 'With support'", () => {
  const admin = readFileSync(new URL("./admin-live.ts", import.meta.url), "utf8");
  const wh = readFileSync(new URL("./warehouse-returns.ts", import.meta.url), "utf8");
  for (const [name, text] of [["admin", admin], ["warehouse", wh]]) {
    assert.match(text, /awaiting_support: \{ en: "Waiting for support", fr: "En attente du support" \}/, name);
    for (const k of ["awaiting_seller", "seller_replied", "seller_rejected", "seller_timeout"]) assert.match(text, new RegExp(`${k}: WITH_SUPPORT`), `${name} ${k}`);
  }
  assert.match(stage.WITH_SUPPORT.en, /With support/);
  assert.equal(stage.WITH_SUPPORT.fr, "Chez le support");
  // an open return in an old seller stage is still undecided for the admin buttons
  assert.match(admin, /RETURN_UNDECIDED: readonly string\[\] = UNDECIDED_STAGES/);
});

test("the dispute stage type lists awaiting_support", () => {
  assert.match(readFileSync(new URL("./realtime/types.ts", import.meta.url), "utf8"), /\| "awaiting_support"/);
});
