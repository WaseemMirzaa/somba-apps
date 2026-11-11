// Run: npm test (from web/). Transpiles fraud-alerts.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./fraud-alerts.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { fraudTypeLabel, fraudReason, FRAUD_TYPE_LABEL } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("every rule the server raises has an English and a French name", () => {
  for (const t of ["failed_payments", "new_account_orders", "shared_identity", "return_rate", "address_changes"]) {
    const l = FRAUD_TYPE_LABEL[t];
    assert.ok(l, t);
    assert.ok(l.en && l.fr && l.en !== l.fr, t);
    assert.equal(fraudTypeLabel(t, false), l.en);
    assert.equal(fraudTypeLabel(t, true), l.fr);
  }
});

test("an unknown or older type is shown readably", () => {
  assert.equal(fraudTypeLabel("brand_new_rule", false), "brand new rule");
  assert.equal(fraudTypeLabel("otp_fail", true), "Échec OTP");
});

test("the reason follows the language and falls back", () => {
  const a = { reason: "5 failed payment attempts in the last 24 hours (limit 5).", reasonFr: "5 tentatives de paiement échouées (limite 5)." };
  assert.equal(fraudReason(a, false), a.reason);
  assert.equal(fraudReason(a, true), a.reasonFr);
  assert.equal(fraudReason({ reason: "Only English" }, true), "Only English");
});

test("an alert from before reasons existed says so instead of showing nothing", () => {
  assert.match(fraudReason({}, false), /No reason recorded/);
  assert.match(fraudReason({ reason: null, reasonFr: null }, true), /Raison non enregistrée/);
  assert.match(fraudReason({ reason: "  " }, false), /No reason recorded/);
});
