// Run: npm test (from web/). Transpiles code-lock.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./code-lock.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { canUnlockDeliveryCode, isDeliveryCodeLocked, codeLockEndsAt, codeLockLabel, showUnlockCode } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const NOW = new Date(2026, 10, 9, 14, 20, 0).getTime();
const at = (h, m) => new Date(2026, 10, 9, h, m, 0).toISOString();

test("who may unlock mirrors resetCodeLock: admins, operations admins, supervisor and manager staff", () => {
  assert.equal(canUnlockDeliveryCode("admin", null), true);
  assert.equal(canUnlockDeliveryCode("admin_operations", undefined), true);
  assert.equal(canUnlockDeliveryCode("warehouse_staff", "supervisor"), true);
  assert.equal(canUnlockDeliveryCode("warehouse_staff", "manager"), true);
  assert.equal(canUnlockDeliveryCode("warehouse_staff", "operator"), false);
  assert.equal(canUnlockDeliveryCode("warehouse_staff", null), false);
  assert.equal(canUnlockDeliveryCode("admin_support", "manager"), false);
  assert.equal(canUnlockDeliveryCode("admin_finance", null), false);
  assert.equal(canUnlockDeliveryCode("rider", "supervisor"), false);
  assert.equal(canUnlockDeliveryCode("seller", "manager"), false);
  assert.equal(canUnlockDeliveryCode(null, null), false);
});

test("locked means the server says so and a timed lock has not run out", () => {
  assert.equal(isDeliveryCodeLocked({ codeLocked: false, codeFailures: 2 }, NOW), false);
  assert.equal(isDeliveryCodeLocked({}, NOW), false);
  assert.equal(isDeliveryCodeLocked({ codeLocked: true, codeLockedUntil: at(14, 35) }, NOW), true);
  assert.equal(isDeliveryCodeLocked({ codeLocked: true, codeLockedUntil: at(14, 10) }, NOW), false);
  assert.equal(isDeliveryCodeLocked({ codeLocked: true, codeLockedUntil: null }, NOW), true);
});

test("the lock end is a timestamp only for a running timed lock", () => {
  assert.equal(codeLockEndsAt({ codeLocked: true, codeLockedUntil: at(14, 35) }, NOW), new Date(at(14, 35)).getTime());
  assert.equal(codeLockEndsAt({ codeLocked: true, codeLockedUntil: null }, NOW), null);
  assert.equal(codeLockEndsAt({ codeLocked: false, codeLockedUntil: at(14, 35) }, NOW), null);
});

test("badge text: time of day, supervisor wording, French, nothing when unlocked", () => {
  assert.equal(codeLockLabel({ codeLocked: true, codeLockedUntil: at(14, 35) }, false, NOW), "Code locked until 14:35");
  assert.equal(codeLockLabel({ codeLocked: true, codeLockedUntil: at(9, 5) }, false, new Date(2026, 10, 9, 8, 0).getTime()), "Code locked until 09:05");
  assert.equal(codeLockLabel({ codeLocked: true, codeLockedUntil: at(14, 35) }, true, NOW), "Code verrouillé jusqu'à 14:35");
  assert.equal(codeLockLabel({ codeLocked: true, codeLockedUntil: null }, false, NOW), "Code locked until a supervisor unlocks it");
  assert.match(codeLockLabel({ codeLocked: true }, true, NOW), /superviseur/);
  assert.equal(codeLockLabel({ codeLocked: false }, false, NOW), null);
  assert.equal(codeLockLabel({ codeLocked: true, codeLockedUntil: at(14, 10) }, false, NOW), null);
});

test("the button shows only for an allowed role on a locked task", () => {
  const locked = { codeLocked: true, codeLockedUntil: null };
  assert.equal(showUnlockCode(locked, "warehouse_staff", "supervisor", NOW), true);
  assert.equal(showUnlockCode(locked, "admin", null, NOW), true);
  assert.equal(showUnlockCode(locked, "warehouse_staff", "operator", NOW), false);
  assert.equal(showUnlockCode({ codeLocked: false }, "admin", null, NOW), false);
  assert.equal(showUnlockCode({ codeLocked: true, codeLockedUntil: at(14, 10) }, "admin", null, NOW), false);
});
