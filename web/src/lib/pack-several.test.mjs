// Run: npm test (from web/). "Pack and label several orders": which orders are ticked and the label-only button text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const p = await loadTs("pack-several");
const order = (id) => ({ id, reference: `SOM-${id}`, createdAt: "2026-11-12T08:00:00Z", customerFirstName: "Ada", packageStatus: "to_pack", groupId: null, items: [] });

test("the ticked orders come out in the cluster's order", () => {
  const orders = [order("1"), order("2"), order("3")];
  assert.deepEqual(p.clusterSelection(orders, new Set(["3", "1"])).map((o) => o.id), ["1", "3"]);
  assert.deepEqual(p.clusterSelection(orders, new Set()), []);
  assert.deepEqual(p.clusterSelection(orders, new Set(["x"])), []);
});

test("the pack button is label-only and counts the orders, in both languages", () => {
  assert.equal(p.packButtonText(3, false), "Pack and label 3 orders");
  assert.equal(p.packButtonText(3, true), "Préparer et étiqueter 3 commandes");
  assert.equal(p.packButtonText(1, false), "Pack and label the order");
  assert.equal(p.packButtonText(0, true), "Préparer et étiqueter la commande");
  for (const fr of [false, true]) assert.doesNotMatch(p.packButtonText(2, fr), /[\u{1F300}-\u{1FAFF}←-➿]/u);
});
