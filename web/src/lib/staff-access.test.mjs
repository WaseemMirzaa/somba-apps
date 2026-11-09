// Run: npm test (from web/). staff-access.ts mirrors api/src/common/role-groups.ts (logisticsDesk, orderDetail, orderAmounts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./staff-access.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { isDeskAdmin, canListDeliveries, canReadOrders, canSeeOrderAddress, canOpenAdminOrder, canActOnOrders } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const ADMINS = ["admin", "admin_operations", "admin_support", "admin_finance", "admin_moderation", "admin_marketing"];
const who = (fn) => ADMINS.filter((r) => fn(r));

test("the warehouse desk and the delivery task list: the super admin and operations only (plus riders and warehouse staff)", () => {
  assert.deepEqual(who(isDeskAdmin), ["admin", "admin_operations"]);
  assert.deepEqual(who(canListDeliveries), ["admin", "admin_operations"]);
  assert.equal(canListDeliveries("rider"), true);
  assert.equal(canListDeliveries("warehouse_staff"), true);
  assert.equal(canListDeliveries("customer"), false);
  assert.deepEqual(who(canActOnOrders), ["admin", "admin_operations"]);
});

test("orders: everyone but marketing reads them; only the super admin, operations and support see the delivery address", () => {
  assert.deepEqual(who(canReadOrders), ["admin", "admin_operations", "admin_support", "admin_finance", "admin_moderation"]);
  assert.deepEqual(who(canSeeOrderAddress), ["admin", "admin_operations", "admin_support"]);
  assert.deepEqual(who(canOpenAdminOrder), ["admin", "admin_operations", "admin_support", "admin_finance", "admin_moderation"]);
  for (const r of ["customer", "seller", "rider", "warehouse_staff", undefined]) assert.equal(canSeeOrderAddress(r), false);
  for (const r of ["customer", "seller", "rider", "warehouse_staff", undefined]) assert.equal(canReadOrders(r), true); // they get what they own; the server decides
});
