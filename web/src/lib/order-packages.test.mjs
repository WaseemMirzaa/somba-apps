// Run: npm test (from web/). Transpiles order-packages.ts with the project's own `typescript`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./order-packages.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { derivePackageStatus, groupPackages, orderSellers, sellerSummary, totalLineRefunds } = await import(
  `data:text/javascript,${encodeURIComponent(outputText)}`
);

const line = (fulfilment, extra = {}) => ({ fulfilment, priceUsd: 10, qty: 1, ...extra });
const paid = (status, paymentMethod = "stripe_card") => ({ status, paymentMethod, paid: true });

test("all lines cancelled -> cancelled", () => {
  assert.equal(derivePackageStatus(paid("confirmed"), [line("cancelled"), line("cancelled")]), "cancelled");
});

test("cancelled order -> cancelled", () => {
  assert.equal(derivePackageStatus(paid("cancelled"), [line("ready")]), "cancelled");
});

test("unpaid pending non-COD -> pending; COD or paid is not", () => {
  assert.equal(derivePackageStatus({ status: "pending", paymentMethod: "stripe_card" }, [line("open")]), "pending");
  assert.equal(derivePackageStatus({ status: "pending", paymentMethod: "cod" }, [line("open")]), "to_pack");
  assert.equal(derivePackageStatus(paid("pending"), [line("open")]), "to_pack");
});

test("all live lines received -> order delivery status, else at hub", () => {
  const received = [line("received"), line("cancelled")];
  assert.equal(derivePackageStatus(paid("processing"), received), "at_hub");
  assert.equal(derivePackageStatus(paid("shipped"), received), "shipped");
  assert.equal(derivePackageStatus(paid("out_for_delivery"), received), "out_for_delivery");
  assert.equal(derivePackageStatus(paid("delivered"), received), "delivered");
  assert.equal(derivePackageStatus(paid("returned"), received), "returned");
});

test("all live lines ready/received -> ready; otherwise to pack", () => {
  assert.equal(derivePackageStatus(paid("processing"), [line("ready"), line("received")]), "ready");
  assert.equal(derivePackageStatus(paid("processing"), [line("ready"), line("open")]), "to_pack");
  assert.equal(derivePackageStatus(paid("processing"), [{ priceUsd: 1, qty: 1 }]), "to_pack");
});

test("groupPackages splits by seller and totals refunds", () => {
  const items = [
    line("ready", { sellerId: "s1", sellerName: "Alpha", readyAt: "2026-01-01T10:00:00Z" }),
    line("ready", { sellerId: "s1", sellerName: "Alpha", readyAt: "2026-01-01T12:00:00Z" }),
    line("cancelled", { sellerId: "s2", sellerName: "Beta", qty: 2, refundedUsd: 20 }),
  ];
  const pk = groupPackages(paid("processing"), items);
  assert.equal(pk.length, 2);
  assert.equal(pk[0].sellerName, "Alpha");
  assert.equal(pk[0].status, "ready");
  assert.equal(pk[0].readyAt, "2026-01-01T12:00:00Z");
  assert.equal(pk[0].subtotalUsd, 20);
  assert.equal(pk[1].status, "cancelled");
  assert.equal(pk[1].refundedUsd, 20);
  assert.equal(pk[1].subtotalUsd, 0);
  assert.equal(totalLineRefunds(items), 20);
});

test("orderSellers / sellerSummary", () => {
  const items = [
    { sellerId: "s1", sellerName: "Alpha" },
    { sellerId: "s1", sellerName: "Alpha" },
    { sellerId: "s2", sellerName: "Beta" },
    { sellerId: "s3", sellerName: "Gamma" },
    { sellerId: null, sellerName: null },
  ];
  const sellers = orderSellers(items);
  assert.equal(sellers.length, 3);
  assert.equal(sellerSummary(sellers, false), "Alpha + 2 more");
  assert.equal(sellerSummary(sellers, true), "Alpha + 2 autres");
  assert.equal(sellerSummary(sellers.slice(0, 1), false), "Alpha");
  assert.equal(sellerSummary([], false), "—");
});
