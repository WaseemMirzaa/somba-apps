// Run: npm test (from web/). Transpiles order-journey.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./order-journey.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { customerJourney } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

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
