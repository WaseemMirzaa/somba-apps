// Run: npm test (from web/). Transpiles fraud-block.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./fraud-block.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { canSuspendAccounts, fraudDialogText } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("only the roles that may suspend accounts see Block", () => {
  assert.equal(canSuspendAccounts("admin"), true);
  assert.equal(canSuspendAccounts("admin_support"), true);
  for (const r of ["admin_finance", "admin_operations", "admin_moderation", "admin_marketing", "warehouse_staff", "rider", "seller", "customer", "", null, undefined]) {
    assert.equal(canSuspendAccounts(r), false, String(r));
  }
});

test("the confirmation says what blocking does, in English and French", () => {
  const en = fraudDialogText("block", "Awa", false);
  assert.match(en.body, /suspends Awa's account/);
  assert.match(en.body, /audit log/);
  assert.equal(en.confirm, "Block account");
  const fr = fraudDialogText("block", "Awa", true);
  assert.match(fr.body, /suspend le compte de Awa/);
  assert.equal(fr.confirm, "Bloquer le compte");
  assert.notEqual(fr.title, en.title);
});

test("unblocking says it reactivates the account, in both languages", () => {
  assert.match(fraudDialogText("unblock", "Awa", false).body, /reactivates Awa's account/);
  assert.match(fraudDialogText("unblock", "Awa", true).body, /réactive le compte de Awa/);
  assert.equal(fraudDialogText("unblock", "Awa", false).done, "Awa's account was reactivated");
  assert.equal(fraudDialogText("unblock", "Awa", true).done, "Compte de Awa réactivé");
});
