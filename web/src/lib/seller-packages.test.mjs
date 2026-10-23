// Run: npm test (from web/). seller-packages.ts is pure (type-only imports), so it is
// transpiled with the project's own `typescript` and imported, like dates.test.mjs does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./seller-packages.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const line = (over = {}) => ({ id: "i1", productId: "p1", productName: "Shoe", variant: "", qty: 1, priceUsd: 10, fulfilment: "open", ...over });

test("package status labels in EN and FR", () => {
  const expected = {
    pending: ["Awaiting payment", "En attente de paiement"],
    to_pack: ["To pack", "À préparer"],
    ready: ["Ready for pickup", "Prêt pour enlèvement"],
    at_hub: ["At the hub", "Au hub"],
    shipped: ["Shipped", "Expédié"],
    out_for_delivery: ["Out for delivery", "En cours de livraison"],
    delivered: ["Delivered", "Livré"],
    returned: ["Returned", "Retourné"],
    cancelled: ["Cancelled", "Annulé"],
  };
  for (const [k, [en, fr]] of Object.entries(expected)) {
    assert.equal(m.packageStatusLabel(k, false), en);
    assert.equal(m.packageStatusLabel(k, true), fr);
  }
  assert.equal(m.packageStatusLabel("weird_state", false), "Weird State");
  assert.equal(m.PACKAGE_STATUS_OPTIONS.length, 9);
  assert.equal(m.packageStatusTone("delivered"), "success");
  assert.equal(m.packageStatusTone("cancelled"), "danger");
});

test("shipping status is derived from the package status", () => {
  assert.equal(m.shippingStatusFromPackage("to_pack"), "awaiting_pickup");
  assert.equal(m.shippingStatusFromPackage("ready"), "ready");
  assert.equal(m.shippingStatusFromPackage("at_hub"), "at_hub");
  assert.equal(m.shippingStatusFromPackage("shipped"), "picked_up");
  assert.equal(m.shippingStatusFromPackage("out_for_delivery"), "in_transit");
  assert.equal(m.shippingStatusFromPackage("pending"), "pending");
  assert.equal(m.shippingStatusFromPackage("delivered"), "delivered");
});

test("line state and labels", () => {
  assert.equal(m.lineState({ fulfilment: "open" }), "to_pack");
  assert.equal(m.lineState({}), "to_pack");
  assert.equal(m.lineState({ fulfilment: "ready" }), "ready");
  assert.equal(m.lineState({ fulfilment: "received" }), "at_hub");
  assert.equal(m.lineState({ fulfilment: "cancelled" }), "cancelled");
  assert.equal(m.lineStateLabel("cancelled", true), "Annulé");
});

test("amounts exclude cancelled lines", () => {
  const items = [line({ qty: 2, priceUsd: 10 }), line({ id: "i2", priceUsd: 5.5, fulfilment: "cancelled", refundedUsd: 5.5 }), line({ id: "i3", priceUsd: 0.1, qty: 3, fulfilment: "ready" })];
  assert.equal(m.liveAmount(items), 20.3);
  assert.equal(m.orderAmount({ items, subtotalUsd: 999 }), 20.3);
  assert.equal(m.orderAmount({ items: [line({ fulfilment: "cancelled" })], subtotalUsd: 10 }), 0);
  assert.equal(m.orderAmount({ items: [], subtotalUsd: 12 }), 12);
  assert.equal(m.liveQty(items), 5);
  assert.equal(m.refundedAmount(items), 5.5);
});

test("sales and pending work (unpaid non-COD pending orders are neither)", () => {
  assert.equal(m.countsAsSale({ status: "confirmed", packageStatus: "to_pack" }), true);
  assert.equal(m.countsAsSale({ status: "pending", packageStatus: "pending" }), false);
  assert.equal(m.countsAsSale({ status: "pending", packageStatus: "to_pack" }), false); // pending COD: work, not yet a sale
  assert.equal(m.countsAsSale({ status: "confirmed", packageStatus: "cancelled" }), false);
  assert.equal(m.countsAsSale({ status: "returned", packageStatus: "returned" }), false);
  assert.equal(m.isPendingWork({ packageStatus: "to_pack" }), true);
  assert.equal(m.isPendingWork({ packageStatus: "pending" }), false);
  assert.equal(m.isPendingWork({ packageStatus: "ready" }), false);
});

test("package readyAt only once every live line is ready", () => {
  assert.equal(m.packageReadyAt([line({ fulfilment: "ready", readyAt: "2026-01-01T10:00:00Z" }), line({ fulfilment: "open" })]), null);
  assert.equal(
    m.packageReadyAt([
      line({ fulfilment: "ready", readyAt: "2026-01-01T10:00:00Z" }),
      line({ fulfilment: "received", readyAt: "2026-01-01T11:00:00Z" }),
      line({ fulfilment: "cancelled" }),
    ]),
    "2026-01-01T11:00:00Z",
  );
  assert.equal(m.packageReadyAt([line({ fulfilment: "cancelled" })]), null);
});

test("ready eligibility follows the server package status", () => {
  assert.equal(m.canMarkReady({ packageStatus: "to_pack", items: [line()] }), true);
  assert.equal(m.canMarkReady({ packageStatus: "ready", items: [line({ fulfilment: "ready" })] }), false);
  assert.equal(m.canMarkReady({ packageStatus: "pending", items: [line()] }), false);
  assert.equal(m.canMarkReady({ packageStatus: "to_pack", items: [line({ fulfilment: "cancelled" })] }), false);
});

test("cancel eligibility: only open/ready lines on an order that has not left", () => {
  const items = [line({ id: "a" }), line({ id: "b", fulfilment: "ready" }), line({ id: "c", fulfilment: "received" }), line({ id: "d", fulfilment: "cancelled" })];
  assert.deepEqual(m.cancellableLines({ status: "confirmed", packageStatus: "to_pack", items }).map((i) => i.id), ["a", "b"]);
  assert.equal(m.canCancelItems({ status: "processing", packageStatus: "ready", items }), true);
  assert.equal(m.canCancelItems({ status: "shipped", packageStatus: "shipped", items }), false);
  assert.equal(m.canCancelItems({ status: "confirmed", packageStatus: "at_hub", items }), false);
  assert.equal(m.canCancelItems({ status: "cancelled", packageStatus: "cancelled", items }), false);
  assert.equal(m.canCancelItems({ status: "confirmed", packageStatus: "to_pack", items: [line({ fulfilment: "received" })] }), false);
});

test("waiting for other sellers", () => {
  assert.equal(m.waitingForOtherSellers({ sellerCount: 2, packageStatus: "ready" }), true);
  assert.equal(m.waitingForOtherSellers({ sellerCount: 1, packageStatus: "ready" }), false);
  assert.equal(m.waitingForOtherSellers({ sellerCount: 3, packageStatus: "to_pack" }), false);
  // The server's exact count wins over the guess.
  assert.equal(m.waitingForOtherSellers({ sellerCount: 2, packageStatus: "ready", otherSellersPacking: 0 }), false);
  assert.equal(m.waitingForOtherSellers({ sellerCount: 3, packageStatus: "ready", otherSellersPacking: 1 }), true);
});

test("cancel reason: presets send their label, Other needs 3+ chars", () => {
  assert.equal(m.buildCancelReason("", ""), null);
  assert.equal(m.buildCancelReason("out_of_stock", ""), "Out of stock");
  assert.equal(m.buildCancelReason("damaged", "ignored"), "Damaged");
  assert.equal(m.buildCancelReason("price_error", ""), "Price error");
  assert.equal(m.buildCancelReason("other", "  ab "), null);
  assert.equal(m.buildCancelReason("other", "  Lost in warehouse "), "Lost in warehouse");
  assert.deepEqual(m.CANCEL_REASONS.map((r) => r.key), ["out_of_stock", "damaged", "price_error", "other"]);
});

test("normalizeOrder fills package status / seller count for a full order", () => {
  const base = { id: "o1", reference: "ORD-1", paymentMethod: "wallet", createdAt: "x", customerName: "A B", totalUsd: 30, items: [line({ qty: 2 })] };
  assert.equal(m.normalizeOrder({ ...base, status: "confirmed" }).packageStatus, "to_pack");
  assert.equal(m.normalizeOrder({ ...base, status: "pending" }).packageStatus, "pending");
  assert.equal(m.normalizeOrder({ ...base, status: "pending", paymentMethod: "cod" }).packageStatus, "to_pack");
  assert.equal(m.normalizeOrder({ ...base, status: "delivered" }).packageStatus, "delivered");
  assert.equal(m.normalizeOrder({ ...base, status: "confirmed", items: [line({ fulfilment: "ready" })] }).packageStatus, "ready");
  assert.equal(m.normalizeOrder({ ...base, status: "confirmed", items: [line({ fulfilment: "received" })] }).packageStatus, "at_hub");
  assert.equal(m.normalizeOrder({ ...base, status: "confirmed", items: [line({ fulfilment: "cancelled" })] }).packageStatus, "cancelled");
  const n = m.normalizeOrder({ ...base, status: "confirmed", packageStatus: "ready", sellerCount: 3, subtotalUsd: 5 });
  assert.equal(n.packageStatus, "ready");
  assert.equal(n.sellerCount, 3);
  assert.equal(n.subtotalUsd, 5);
  assert.equal(m.normalizeOrder({ ...base, status: "confirmed" }).sellerCount, 1);
});

test("applySellerReady flags open lines ready and the package ready", () => {
  const o = { packageStatus: "to_pack", items: [line({ id: "a" }), line({ id: "b", fulfilment: "cancelled" })] };
  const r = m.applySellerReady(o, "2026-01-01T00:00:00Z");
  assert.equal(r.packageStatus, "ready");
  assert.equal(r.items[0].fulfilment, "ready");
  assert.equal(r.items[0].readyAt, "2026-01-01T00:00:00Z");
  assert.equal(r.items[1].fulfilment, "cancelled");
  assert.equal(o.items[0].fulfilment, "open"); // input untouched
  assert.equal(m.applySellerReady({ packageStatus: "at_hub", items: [] }, "x").packageStatus, "at_hub");
});
