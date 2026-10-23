// Run: npm test (from web/). The web app has no TS test runner, so this
// transpiles shop-packages.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./shop-packages.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { groupBySeller, sellerCount, packageStatus, buildPackages, refundedTotal, hasCancelledLines, cancelledCount, shouldShowPackages } = await import(
  `data:text/javascript,${encodeURIComponent(outputText)}`
);

const line = (sellerId, fulfilment, extra = {}) => ({ sellerId, sellerName: `Seller ${sellerId}`, fulfilment, ...extra });
const paid = (status) => ({ status, paymentMethod: "wallet" });

test("groupBySeller keeps first-appearance order and merges lines of one seller", () => {
  const g = groupBySeller([line("a", "open"), line("b", "open"), line("a", "ready")]);
  assert.deepEqual(g.map((x) => x.sellerId), ["a", "b"]);
  assert.equal(g[0].items.length, 2);
});

test("lines without a seller share one group", () => {
  const g = groupBySeller([{ qty: 1 }, { qty: 2 }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].sellerName, null);
  assert.equal(sellerCount([{ qty: 1 }]), 1);
});

test("all lines cancelled -> cancelled, even when the order is live", () => {
  assert.equal(packageStatus(paid("processing"), [line("a", "cancelled"), line("a", "cancelled")]), "cancelled");
});

test("cancelled order -> cancelled", () => {
  assert.equal(packageStatus(paid("cancelled"), [line("a", "open")]), "cancelled");
});

test("unpaid pending non-COD order -> pending; COD pending is packed normally", () => {
  assert.equal(packageStatus({ status: "pending", paymentMethod: "airtel_money" }, [line("a", "open")]), "pending");
  assert.equal(packageStatus({ status: "pending", paymentMethod: "cod" }, [line("a", "open")]), "to_pack");
});

test("all live lines received -> at_hub until the order ships, then the order status", () => {
  const lines = [line("a", "received"), line("a", "cancelled")];
  assert.equal(packageStatus(paid("processing"), lines), "at_hub");
  assert.equal(packageStatus(paid("confirmed"), lines), "at_hub");
  for (const s of ["shipped", "out_for_delivery", "delivered", "returned"]) assert.equal(packageStatus(paid(s), lines), s);
});

test("ready or received (but not all received) -> ready", () => {
  assert.equal(packageStatus(paid("confirmed"), [line("a", "ready"), line("a", "received")]), "ready");
  assert.equal(packageStatus(paid("confirmed"), [line("a", "ready"), line("a", "cancelled")]), "ready");
});

test("any open live line -> to_pack; missing fulfilment counts as open", () => {
  assert.equal(packageStatus(paid("confirmed"), [line("a", "ready"), line("a", "open")]), "to_pack");
  assert.equal(packageStatus(paid("confirmed"), [{ sellerId: "a" }]), "to_pack");
});

test("buildPackages numbers packages and derives each status", () => {
  const pkgs = buildPackages(paid("processing"), [line("a", "received"), line("b", "open"), line("c", "cancelled")]);
  assert.deepEqual(pkgs.map((p) => [p.index, p.total, p.status]), [
    [1, 3, "at_hub"],
    [2, 3, "to_pack"],
    [3, 3, "cancelled"],
  ]);
});

test("refunded total, cancelled counts and when packages are shown", () => {
  const items = [line("a", "cancelled", { refundedUsd: 10.1 }), line("a", "open", { refundedUsd: 0 }), line("a", "cancelled", { refundedUsd: 0.2 })];
  assert.equal(refundedTotal(items), 10.3);
  assert.equal(cancelledCount(items), 2);
  assert.equal(hasCancelledLines(items), true);
  assert.equal(shouldShowPackages(items), true);
  assert.equal(shouldShowPackages([line("a", "open"), line("a", "open")]), false);
  assert.equal(shouldShowPackages([line("a", "open"), line("b", "open")]), true);
});
