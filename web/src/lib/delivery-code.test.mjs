// Run: npm test (from web/). When the customer's code is asked for, when it is fetched again, and the failed-attempt line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const d = await loadTs("delivery-code");

test("the code is asked for whenever the order is not over: a failed attempt puts it back to confirmed", () => {
  for (const s of ["confirmed", "processing", "shipped", "out_for_delivery"]) assert.equal(d.hasDeliveryCodeStage(s), true, s);
  for (const s of ["pending", "cancelled", "returned", "delivered"]) assert.equal(d.hasDeliveryCodeStage(s), false, s);
});

test("the code is fetched again when a leg changes or is delivered, not only when the status does", () => {
  const leg = (status, updatedAt, deliveredAt = null) => ({ id: "l1", status, updatedAt, deliveredAt });
  const a = d.codeRefreshKey({ status: "out_for_delivery", tracking: { legs: [leg("in_transit", "t1")] } });
  const b = d.codeRefreshKey({ status: "out_for_delivery", tracking: { legs: [leg("delivered", "t2", "t2")] } });
  const c = d.codeRefreshKey({ status: "out_for_delivery", tracking: { legs: [leg("delivered", "t2", "t2"), { id: "l2", status: "unassigned", updatedAt: "t3" }] } });
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.equal(a, d.codeRefreshKey({ status: "out_for_delivery", tracking: { legs: [leg("in_transit", "t1")] } }));
  assert.equal(d.codeRefreshKey(undefined), "");
});

const legs = (...l) => ({ status: "confirmed", tracking: { legs: l } });
const f = { id: "a", kind: "delivery", status: "failed", createdAt: "1", attempts: 1, failureReason: "Customer not reachable" };

test("a failed customer attempt is reported with its reason, and says the rider will try again once the leg is re-opened", () => {
  const a = d.failedAttempt(legs(f, { id: "b", kind: "delivery", status: "unassigned", createdAt: "2", attempts: 2 }));
  assert.deepEqual(a, { attempt: 1, reason: "Customer not reachable", retry: true });
  assert.equal(d.failedAttemptText(a, false), "Delivery attempt 1 failed: Customer not reachable. The rider will try again.");
  assert.match(d.failedAttemptText(a, true), /Tentative de livraison 1 échouée/);
});

test("no failed-attempt line for a pickup, a leg returned to the seller, a finished order, or a clean order", () => {
  assert.equal(d.failedAttempt(legs({ ...f, kind: "pickup" })), null);
  assert.equal(d.failedAttempt(legs({ ...f, failureReason: "Returned to seller" })), null);
  assert.equal(d.failedAttempt({ ...legs(f), status: "delivered" }), null);
  assert.equal(d.failedAttempt(legs({ id: "a", kind: "delivery", status: "in_transit", createdAt: "1" })), null);
  assert.equal(d.failedAttempt(null), null);
  assert.equal(d.failedAttempt(legs({ ...f, kind: "express" })).retry, false);
});

test("a reason that already ends with a full stop does not double it", () => {
  assert.equal(d.failedAttemptText({ attempt: 2, reason: "Nobody opened the door.", retry: true }, false), "Delivery attempt 2 failed: Nobody opened the door. The rider will try again.");
});
