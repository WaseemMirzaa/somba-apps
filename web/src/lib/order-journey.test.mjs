// Run: npm test (from web/). Transpiles order-journey.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const { customerJourney } = await loadTs("order-journey");

const hubs = new Map([
  ["L", { id: "L", name: "Entrepôt Limete", city: "Kinshasa" }],
  ["K", { id: "K", name: "Entrepôt Kinshasa", city: "Kinshasa" }],
  ["W", { id: "W", name: "Entrepôt Kikwit", city: "Kikwit" }],
]);
const base = {
  status: "shipped",
  items: [{ sellerId: "s1", sellerName: "Limete Shop", fulfilment: "received" }],
  originHubIds: ["L"],
  destinationHubId: "W",
  createdAt: "2026-10-26T08:00:00Z",
  updatedAt: "2026-10-26T09:00:00Z",
};

test("one step per hop, each with its own driver (English)", () => {
  const steps = customerJourney(
    {
      ...base,
      tracking: {
        legs: [
          { id: "t1", kind: "transfer", status: "delivered", hop: 1, hops: 2, fromHub: { id: "L", name: "Entrepôt Limete" }, toHub: { id: "K", name: "Entrepôt Kinshasa" }, riderFirstName: "Patrick", createdAt: "2026-10-26T09:00:00Z" },
          { id: "t2", kind: "transfer", status: "in_transit", hop: 2, hops: 2, fromHub: { id: "K", name: "Entrepôt Kinshasa" }, toHub: { id: "W", name: "Entrepôt Kikwit" }, riderFirstName: "Joel", runReference: "TR-0042", createdAt: "2026-10-26T12:00:00Z" },
        ],
      },
    },
    hubs,
    false,
  );
  const labels = steps.map((s) => s.label);
  assert.deepEqual(labels.slice(2, 5), ["In transfer to Entrepôt Kinshasa", "At Entrepôt Kinshasa", "In transfer to Entrepôt Kikwit"]);
  assert.ok(labels.includes("At Entrepôt Kikwit, ready to leave"));
  assert.equal(labels.filter((l) => l.startsWith("At Entrepôt Kikwit")).length, 1, "the customer's warehouse is not repeated");
  const hop1 = steps.find((s) => s.key === "hop-t1");
  const hop2 = steps.find((s) => s.key === "hop-t2");
  assert.equal(hop1.state, "done");
  assert.match(hop1.hint, /Hop 1 of 2 · Entrepôt Limete → Entrepôt Kinshasa · driver Patrick/);
  assert.equal(hop2.state, "current");
  assert.match(hop2.hint, /driver Joel · run TR-0042/);
  assert.equal(steps.find((s) => s.key === "at-t1").state, "done");
  // The destination warehouse step waits until every hop has arrived.
  assert.equal(steps.find((s) => s.key === "warehouse").state, "todo");
});

test("French labels and a driver not chosen yet", () => {
  const steps = customerJourney(
    { ...base, tracking: { legs: [{ id: "t1", kind: "transfer", status: "assigned", hop: 1, hops: 1, fromHub: { id: "L", name: "Entrepôt Limete" }, toHub: { id: "W", name: "Entrepôt Kikwit" }, createdAt: "2026-10-26T09:00:00Z" }] } },
    hubs,
    true,
  );
  const hop = steps.find((s) => s.key === "hop-t1");
  assert.equal(hop.label, "En transfert vers Entrepôt Kikwit");
  assert.match(hop.hint, /chauffeur pas encore choisi/);
  assert.equal(hop.state, "current");
});

test("an order without transfer legs keeps the single transfer step", () => {
  const steps = customerJourney(base, hubs, false);
  assert.ok(steps.some((s) => s.key === "transfer" && s.label.includes("Entrepôt Limete → Entrepôt Kikwit")));
  assert.ok(!steps.some((s) => s.key.startsWith("hop-")));
});

// ── final tracking legs (docs/contracts/areas.md): flat names, hop/hops, runReference, riderFirstName ──

test("flat customer legs (names only, no nested hub objects) give one step per hop with driver and run", () => {
  const steps = customerJourney(
    {
      ...base,
      tracking: {
        legs: [
          { id: "t1", kind: "transfer", status: "delivered", hop: 1, hops: 2, fromHubName: "Entrepôt Limete", toHubName: "Entrepôt Kinshasa", riderFirstName: "Patrick", runReference: "TR-0041", createdAt: "2026-10-26T09:00:00Z" },
          { id: "t2", kind: "transfer", status: "in_transit", hop: 2, hops: 2, fromHubName: "Entrepôt Kinshasa", toHubName: "Entrepôt Kikwit", riderFirstName: "Joel", runReference: "TR-0042", createdAt: "2026-10-26T12:00:00Z" },
        ],
      },
    },
    hubs,
    false,
  );
  const labels = steps.map((s) => s.label);
  assert.deepEqual(labels.slice(2, 5), ["In transfer to Entrepôt Kinshasa", "At Entrepôt Kinshasa", "In transfer to Entrepôt Kikwit"]);
  assert.match(steps.find((s) => s.key === "hop-t1").hint, /Hop 1 of 2 · Entrepôt Limete → Entrepôt Kinshasa · driver Patrick · run TR-0041/);
  assert.match(steps.find((s) => s.key === "hop-t2").hint, /driver Joel · run TR-0042/);
  assert.equal(labels.filter((l) => l.startsWith("At Entrepôt Kikwit")).length, 1, "the customer's warehouse is not repeated");
});

test("the last hop ends at the customer's warehouse even when the hub directory does not know it", () => {
  const noDest = new Map([["L", { id: "L", name: "Entrepôt Limete", city: "Kinshasa" }]]);
  const steps = customerJourney(
    { ...base, tracking: { legs: [{ id: "t1", kind: "transfer", status: "assigned", hop: 1, hops: 1, fromHubName: "Entrepôt Limete", toHubName: "Entrepôt Kikwit", createdAt: "2026-10-26T09:00:00Z" }] } },
    noDest,
    true,
  );
  assert.ok(!steps.some((s) => s.key === "at-t1"), "no extra 'À …' step for the destination");
  assert.equal(steps.find((s) => s.key === "hop-t1").label, "En transfert vers Entrepôt Kikwit");
});

test("old shape (nested fromHub/toHub only) still reads, French labels included", () => {
  const steps = customerJourney(
    {
      ...base,
      tracking: {
        legs: [
          { id: "t1", kind: "transfer", status: "picked_up", fromHub: { id: "L", name: "Entrepôt Limete" }, toHub: { id: "W", name: "Entrepôt Kikwit" }, riderFirstName: "Patrick", createdAt: "2026-10-26T09:00:00Z" },
        ],
      },
    },
    hubs,
    true,
  );
  const hop = steps.find((s) => s.key === "hop-t1");
  assert.equal(hop.label, "En transfert vers Entrepôt Kikwit");
  assert.match(hop.hint, /Entrepôt Limete → Entrepôt Kikwit · chauffeur Patrick/);
  assert.equal(hop.state, "current");
});

test("an express order has no warehouse step: seller -> rider -> customer", () => {
  const order = {
    status: "shipped",
    deliveryMode: "express",
    items: [{ sellerId: "s1", sellerName: "Limete Shop", fulfilment: "received" }],
    originHubIds: ["L"],
    destinationHubId: "L",
    createdAt: "2026-10-26T08:00:00Z",
    updatedAt: "2026-10-26T09:00:00Z",
  };
  const steps = customerJourney(order, hubs, false);
  assert.deepEqual(steps.map((x) => x.key), ["placed", "pickup-s1", "express", "delivered"]);
  assert.ok(!steps.some((x) => /warehouse|Entrepôt|At /i.test(x.label)), "no warehouse in an express journey");
  assert.equal(steps[1].state, "done"); // the rider has it
  assert.equal(steps[2].state, "current"); // on its way to the customer
  assert.equal(steps[3].state, "todo");
  const fr = customerJourney(order, hubs, true);
  assert.match(fr[2].label, /directement depuis le vendeur/);
});

test("express: before the rider comes the seller is packing, and a delivered order is all done", () => {
  const base = { deliveryMode: "express", items: [{ sellerId: "s1", sellerName: "Shop", fulfilment: "open" }], originHubIds: [], destinationHubId: null, createdAt: "2026-10-26T08:00:00Z", updatedAt: "2026-10-26T09:00:00Z" };
  const packing = customerJourney({ ...base, status: "confirmed" }, hubs, false);
  assert.equal(packing[1].state, "current");
  assert.match(packing[1].hint, /packing/);
  const done = customerJourney({ ...base, status: "delivered", items: [{ sellerId: "s1", sellerName: "Shop", fulfilment: "received" }] }, hubs, false);
  assert.deepEqual(done.map((x) => x.state), ["done", "done", "done", "done"]);
  // An express leg in the tracking is enough, even without deliveryMode.
  const byLeg = customerJourney({ ...base, deliveryMode: undefined, status: "processing", tracking: { legs: [{ id: "x", kind: "express", status: "assigned", createdAt: "2026-10-26T08:00:00Z" }] } }, hubs, false);
  assert.ok(byLeg.some((x) => x.key === "express"));
});

test("a split order: a partial leg on the road makes the delivery step current with a hint", () => {
  const order = {
    status: "shipped",
    items: [{ sellerId: "s1", sellerName: "A", fulfilment: "received" }, { sellerId: "s2", sellerName: "B", fulfilment: "ready" }],
    originHubIds: ["L"],
    destinationHubId: "L",
    createdAt: "2026-10-26T08:00:00Z",
    updatedAt: "2026-10-26T09:00:00Z",
    tracking: { legs: [{ id: "d1", kind: "delivery", status: "in_transit", createdAt: "2026-10-26T10:00:00Z", completesOrder: false }] },
  };
  const steps = customerJourney(order, hubs, false);
  const delivery = steps.find((x) => x.key === "delivery");
  assert.equal(delivery.state, "current");
  assert.match(delivery.hint, /on its way/);
  assert.equal(steps.find((x) => x.key === "warehouse").state, "done");
  assert.equal(steps.at(-1).state, "todo"); // the order is not delivered yet
});

test("a split order: after the first part was delivered the hint says so (English and French)", () => {
  const order = {
    status: "shipped",
    partiallyDelivered: true,
    items: [{ sellerId: "s1", sellerName: "A", fulfilment: "received" }, { sellerId: "s2", sellerName: "B", fulfilment: "received" }],
    originHubIds: ["L"],
    destinationHubId: "L",
    createdAt: "2026-10-26T08:00:00Z",
    updatedAt: "2026-10-26T09:00:00Z",
    tracking: { legs: [{ id: "d1", kind: "delivery", status: "delivered", createdAt: "2026-10-26T10:00:00Z" }] },
  };
  assert.match(customerJourney(order, hubs, false).find((x) => x.key === "delivery").hint, /Part of your order was delivered/);
  assert.match(customerJourney(order, hubs, true).find((x) => x.key === "delivery").hint, /Une partie de votre commande a été livrée/);
});

test("an ordinary order is unchanged: no hint on the delivery step", () => {
  const steps = customerJourney({ ...base, status: "out_for_delivery", destinationHubId: "L" }, hubs, false);
  assert.equal(steps.find((x) => x.key === "delivery").hint, undefined);
  assert.equal(steps.find((x) => x.key === "delivery").state, "current");
});
