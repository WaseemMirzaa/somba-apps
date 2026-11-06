// Run: npm test (from web/). Transpiles staff-twofa.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./staff-twofa.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { staffTwoFaDecision, ADMIN_ACCOUNT_PATH } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("the account page is where an admin enrols", () => {
  assert.equal(ADMIN_ACCOUNT_PATH, "/admin/account");
});

test("nothing is held while the platform does not require two-factor authentication", () => {
  assert.equal(staffTwoFaDecision({ enabled: false, required: false }, "/admin/orders"), "ok");
  assert.equal(staffTwoFaDecision({ enabled: true, required: false }, "/admin"), "ok");
});

test("an admin without it is sent to the account page, and stays there", () => {
  assert.equal(staffTwoFaDecision({ enabled: false, required: true }, "/admin"), "enrol");
  assert.equal(staffTwoFaDecision({ enabled: false, required: true }, "/admin/orders/123"), "enrol");
  assert.equal(staffTwoFaDecision({ enabled: false, required: true }, "/admin/account"), "stay");
  assert.equal(staffTwoFaDecision({ enabled: false, required: true }, "/admin/accounting"), "enrol"); // a different page that merely starts with the same letters
});

test("an admin who has it is never held, even when it is required", () => {
  assert.equal(staffTwoFaDecision({ enabled: true, required: true }, "/admin/finance"), "ok");
});

test("an unknown status does not lock the page: the server enforces the rule", () => {
  assert.equal(staffTwoFaDecision(null, "/admin/orders"), "ok");
  assert.equal(staffTwoFaDecision(undefined, "/admin/orders"), "ok");
});
