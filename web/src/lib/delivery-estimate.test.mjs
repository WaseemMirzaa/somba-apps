// Run: npm test (from web/). Delivery time = preparation + route: the prep fallback and which estimate the screens show.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./ts-load.mjs";

const e = await loadTs("delivery-estimate");

test("a product's prep days come from prepDays, and 0 is a real answer", () => {
  assert.equal(e.prepDaysOf({ prepDays: 4, deliveryDays: 9 }), 4);
  assert.equal(e.prepDaysOf({ prepDays: 0, deliveryDays: 5 }), 0);
  assert.equal(e.prepDaysOf({ prepDays: "3" }), 3);
  assert.equal(e.prepDaysOf({ prepDays: 30 }), 30);
});

test("an old server only has deliveryDays (prep + local): the platform's local days come off", () => {
  assert.equal(e.prepDaysOf({ deliveryDays: 4 }, 1), 3);
  assert.equal(e.prepDaysOf({ deliveryDays: 4 }, 2), 2);
  assert.equal(e.prepDaysOf({ deliveryDays: 4 }), 3); // default local = 1
  assert.equal(e.prepDaysOf({ deliveryDays: 1 }, 1), 0);
  assert.equal(e.prepDaysOf({ deliveryDays: 1 }, 5), 0); // never below 0
  assert.equal(e.prepDaysOf({ deliveryDays: 30 }, 0), 30);
  assert.equal(e.prepDaysOf({ prepDays: null, deliveryDays: 6 }, 1), 5);
});

test("nothing usable: the default prep time", () => {
  assert.equal(e.prepDaysOf({}), 2);
  assert.equal(e.prepDaysOf(null), 2);
  assert.equal(e.prepDaysOf({ prepDays: "", deliveryDays: null }), 2);
  assert.equal(e.prepDaysOf({ prepDays: 31 }), 2); // out of range and no legacy value
  assert.equal(e.prepDaysOf({ prepDays: -1, deliveryDays: 0 }), 2);
});

test("prep days are whole numbers from 0 to 30", () => {
  for (const ok of [0, 1, 30, "7"]) assert.equal(e.isPrepDays(ok), true, String(ok));
  for (const bad of [-1, 31, 1.5, "", null, undefined, "abc"]) assert.equal(e.isPrepDays(bad), false, String(bad));
  assert.deepEqual({ ...e.PREP_DAYS }, { min: 0, max: 30, fallback: 2 });
});

test("the server's date wins when it sends one; otherwise the client's own estimate", () => {
  const fallback = () => "2026-11-20";
  assert.equal(e.chooseEstimate("2026-11-15", fallback), "2026-11-15");
  assert.equal(e.chooseEstimate(null, fallback), "2026-11-20");
  assert.equal(e.chooseEstimate(undefined, fallback), "2026-11-20");
  assert.equal(e.chooseEstimate("", fallback), "2026-11-20");
  assert.equal(e.chooseEstimate("15/11/2026", fallback), "2026-11-20"); // malformed: not trusted
});

test("the fallback is not computed when the server date is there", () => {
  let called = 0;
  e.chooseEstimate("2026-11-15", () => (called++, "x"));
  assert.equal(called, 0);
});

test("the old client-side estimate still works as the fallback", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  assert.equal(e.estimateFor([3], now), "2026-11-13");
  assert.equal(e.estimateFor([3, 5], now, 2), "2026-11-17");
  assert.equal(e.dayLabel("2026-11-13", false), "Fri 13 Nov");
});
