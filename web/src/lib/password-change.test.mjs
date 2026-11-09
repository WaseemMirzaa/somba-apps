// Run: npm test (from web/). Transpiles password-change.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./password-change.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("the refusal code is the one the server sends", () => {
  assert.equal(m.PASSWORD_CHANGE_REQUIRED, "password_change_required");
  // api/src/auth/password-change.ts must keep the same word.
  const server = readFileSync(new URL("../../../api/src/auth/password-change.ts", import.meta.url), "utf8");
  assert.match(server, /PASSWORD_CHANGE_REQUIRED = 'password_change_required'/);
});

test("a failure carrying the code is recognised, anything else is not", () => {
  const err = Object.assign(new Error("x"), { code: "password_change_required" });
  assert.equal(m.isPasswordChangeRequired(err), true);
  assert.equal(m.isPasswordChangeRequired(Object.assign(new Error("x"), { code: "twofa_required" })), false);
  assert.equal(m.isPasswordChangeRequired(new Error("x")), false);
  assert.equal(m.isPasswordChangeRequired(null), false);
  assert.equal(m.isPasswordChangeRequired("password_change_required"), false);
});

test("only an explicit true holds the account at the change screen", () => {
  assert.equal(m.mustChangePassword({ mustChangePassword: true }), true);
  assert.equal(m.mustChangePassword({ mustChangePassword: false }), false);
  assert.equal(m.mustChangePassword({}), false); // an older server never says it
  assert.equal(m.mustChangePassword(null), false);
});

test("a refused call flags the signed-in user, and does nothing for nobody", () => {
  const u = { id: "u1", name: "Marc" };
  assert.deepEqual(m.heldAtPasswordChange(u), { id: "u1", name: "Marc", mustChangePassword: true });
  const already = { id: "u1", mustChangePassword: true };
  assert.equal(m.heldAtPasswordChange(already), already); // same object: no re-render
  assert.equal(m.heldAtPasswordChange(null), null);
});

test("the screen has English and French words", () => {
  const en = m.passwordChangeText(false);
  const fr = m.passwordChangeText(true);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const k of Object.keys(en)) assert.notEqual(en[k], fr[k], k);
  assert.match(fr.title, /mot de passe/);
});
