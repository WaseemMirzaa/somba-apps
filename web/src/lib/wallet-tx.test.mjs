// Run: npm test (from web/). Transpiles wallet-tx.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./wallet-tx.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { walletTypeLabel, walletSigned } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("every ledger type has an English and a French label; unknown types are shown as they are", () => {
  for (const t of ["topup", "credit", "cashback", "refund", "debit"]) {
    assert.notEqual(walletTypeLabel(t, false), t);
    if (t !== "cashback") assert.notEqual(walletTypeLabel(t, true), walletTypeLabel(t, false)); // "Cashback" is the French word too
  }
  assert.equal(walletTypeLabel("adjustment", true), "adjustment");
});

test("only a debit subtracts", () => {
  assert.equal(walletSigned("debit", 12), -12);
  for (const t of ["topup", "credit", "cashback", "refund"]) assert.equal(walletSigned(t, 12), 12);
});
