// Run: npm test (from web/). Split delivery and express as the order pages read them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const s = await loadTs("split-delivery");

const lines = [
  { fulfilment: "received", deliveredAt: "2026-11-10T09:00:00Z", name: "Shirt" },
  { fulfilment: "received", deliveredAt: null, name: "Lamp" },
  { fulfilment: "cancelled", deliveredAt: null, name: "Gone" },
];

test("lines split into delivered and still coming; cancelled lines count for neither", () => {
  const { delivered, coming } = s.splitLines(lines);
  assert.deepEqual(delivered.map((l) => l.name), ["Shirt"]);
  assert.deepEqual(coming.map((l) => l.name), ["Lamp"]);
  assert.deepEqual(s.splitLines(null), { delivered: [], coming: [] });
});

test("partly delivered: the server's flag, else the lines; a finished order never is", () => {
  assert.equal(s.isPartiallyDelivered({ status: "shipped", items: lines }), true);
  assert.equal(s.isPartiallyDelivered({ status: "shipped", partiallyDelivered: false, items: lines }), false);
  assert.equal(s.isPartiallyDelivered({ status: "shipped", partiallyDelivered: true, items: [] }), true);
  assert.equal(s.isPartiallyDelivered({ status: "delivered", partiallyDelivered: true, items: lines }), false);
  assert.equal(s.isPartiallyDelivered({ status: "cancelled", items: lines }), false);
  assert.equal(s.isPartiallyDelivered({ status: "shipped", items: [lines[0]] }), false); // nothing is coming
  assert.equal(s.isPartiallyDelivered({ status: "shipped", items: [lines[1]] }), false); // nothing was delivered
});

const legs = [
  { id: "b", kind: "delivery", status: "in_transit", createdAt: "2026-11-10T12:00:00Z", completesOrder: true },
  { id: "a", kind: "delivery", status: "delivered", createdAt: "2026-11-10T08:00:00Z", completesOrder: false },
  { id: "t", kind: "transfer", status: "delivered", createdAt: "2026-11-09T08:00:00Z" },
  { id: "p", kind: "pickup", status: "delivered", createdAt: "2026-11-09T07:00:00Z" },
];

test("customer legs are the deliveries (and express runs), oldest first", () => {
  assert.deepEqual(s.customerLegs(legs).map((l) => l.id), ["a", "b"]);
  assert.deepEqual(s.customerLegs([{ id: "x", kind: "express", createdAt: "2026-11-10" }]).map((l) => l.id), ["x"]);
  assert.deepEqual(s.customerLegs(undefined), []);
});

test("the open customer leg is the one on the road", () => {
  assert.equal(s.openCustomerLeg(legs)?.id, "b");
  assert.equal(s.openCustomerLeg([{ kind: "delivery", status: "assigned" }]), null);
  assert.equal(s.openCustomerLeg([{ kind: "express", status: "picked_up" }])?.kind, "express");
});

test("an order is split when it has several deliveries or one that does not complete it", () => {
  assert.equal(s.hasSplitLegs(legs), true);
  assert.equal(s.hasSplitLegs([{ kind: "delivery", status: "assigned", completesOrder: false }]), true);
  assert.equal(s.hasSplitLegs([{ kind: "delivery", status: "assigned", completesOrder: true }]), false);
  assert.equal(s.hasSplitLegs([{ kind: "delivery", status: "failed" }, { kind: "delivery", status: "assigned" }]), false); // a retry is not a split
  assert.equal(s.hasSplitLegs(null), false);
});

test("express: the server's deliveryMode, else an express leg", () => {
  assert.equal(s.isExpressOrder({ deliveryMode: "express" }), true);
  assert.equal(s.isExpressOrder({ deliveryMode: "standard", tracking: { legs: [{ kind: "express" }] } }), false);
  assert.equal(s.isExpressOrder({ tracking: { legs: [{ kind: "pickup" }, { kind: "express" }] } }), true);
  assert.equal(s.isExpressOrder({ tracking: { legs: [{ kind: "delivery" }] } }), false);
  assert.equal(s.isExpressOrder({}), false);
});

test("the banner words, in English and French, for the customer, a seller and staff", () => {
  assert.equal(s.partialTitle("customer", false), "Part of your order was delivered");
  assert.equal(s.partialTitle("customer", true), "Une partie de votre commande a été livrée");
  assert.equal(s.partialTitle("seller", false), "Your package was delivered");
  assert.equal(s.partialTitle("staff", true), "Une partie de la commande a été livrée");
  for (const a of ["customer", "seller", "staff"]) {
    assert.ok(s.partialHint(a, false).length > 10 && s.partialHint(a, true).length > 10, a);
  }
  assert.equal(s.EXPRESS_LABEL.en, "Express");
});

test("a customer leg lists its lines as ids and quantities: the names come from the order's lines", () => {
  const orderLines = [{ id: "i1", name: "Kettle" }, { id: "i2", name: "Lamp" }];
  assert.equal(s.legCargoText([{ orderItemId: "i1", qty: 1 }, { orderItemId: "i2", qty: 2 }], orderLines, false), "1 × Kettle, 2 × Lamp");
  // Staff views already carry names (in both languages): the French one wins in French.
  assert.equal(s.legCargoText([{ orderItemId: "i1", name: "Kettle", nameFr: "Bouilloire", qty: 1 }], orderLines, true), "1 × Bouilloire");
  assert.equal(s.legCargoText([{ orderItemId: "i1", name: "Kettle", qty: 1 }], orderLines, true), "1 × Kettle");
  // A line we cannot name still shows its quantity, and no cargo is an empty text.
  assert.equal(s.legCargoText([{ orderItemId: "zz", qty: 3 }], orderLines, false), "3 ×");
  assert.equal(s.legCargoText(null, orderLines, false), "");
});
