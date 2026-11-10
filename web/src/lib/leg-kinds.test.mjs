// Run: npm test (from web/). The leg kinds, their labels and the predicates every portal asks of a kind (express included).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const k = await loadTs("leg-kinds");

test("express is a kind with an English and a French label, in the long and the short map", () => {
  assert.ok(k.LEG_KINDS.includes("express"));
  assert.equal(k.pickL(k.LEG_KIND.express, false), "Express delivery");
  assert.equal(k.pickL(k.LEG_KIND.express, true), "Livraison express");
  assert.equal(k.pickL(k.LEG_KIND_SHORT.express, true), "Express");
});

test("every kind has both languages in both maps, and the two maps list the same kinds", () => {
  assert.deepEqual(Object.keys(k.LEG_KIND_SHORT).sort(), Object.keys(k.LEG_KIND).sort());
  for (const kind of k.LEG_KINDS) {
    for (const map of [k.LEG_KIND, k.LEG_KIND_SHORT]) {
      assert.ok(map[kind].en.trim() && map[kind].fr.trim(), `${kind} is named in both languages`);
    }
    assert.notEqual(k.LEG_KIND[kind].en, k.LEG_KIND[kind].fr.replace("é", "e"), `${kind}: the French is not a copy of the English`);
  }
});

test("an express run ends with the rider at the customer's door, not at a warehouse", () => {
  assert.ok(k.RIDER_FINISHED.includes("express"));
  assert.equal(k.isHubBound("express"), false);
  assert.equal(k.meetsCustomer("express"), true);
  assert.equal(k.isCustomerLeg("express"), true);
  assert.equal(k.isCustomerLeg("delivery"), true);
  assert.deepEqual(k.CUSTOMER_KINDS, ["delivery", "express"]);
});

test("the other kinds keep their meaning", () => {
  for (const kind of ["pickup", "transfer", "return_pickup", "return_transfer"]) assert.equal(k.isHubBound(kind), true, kind);
  for (const kind of ["delivery", "replacement_delivery", "return_to_seller"]) assert.ok(k.RIDER_FINISHED.includes(kind), kind);
  assert.equal(k.isCustomerLeg("replacement_delivery"), false);
  assert.equal(k.isCustomerLeg("pickup"), false);
  assert.equal(k.meetsCustomer("return_pickup"), true);
  assert.equal(k.meetsCustomer("transfer"), false);
});
