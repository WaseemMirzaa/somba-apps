// Run: npm test (from web/). The cart's VAT / fee arithmetic (vat.ts, pure) mirrors api/src/orders/vat.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./vat.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const lines = [
  { priceUsd: 20, qty: 1, vatPct: 16 },
  { priceUsd: 10, qty: 1, vatPct: 16 },
];

test("VAT off (the default): no VAT, today's total", () => {
  const t = m.cartTotals({ lines, discountUsd: 0, feeUsd: 3 });
  assert.deepEqual([t.vat, t.fee, t.total, t.showFeeLine, t.feeInTotal], [0, 3, 33, true, false]);
});

test("VAT on: added per line, one summed amount, included in the total", () => {
  const t = m.cartTotals({ lines, discountUsd: 0, feeUsd: 3, rules: { vatEnabled: true } });
  assert.deepEqual([t.subtotal, t.vat, t.total], [30, 4.8, 37.8]);
});

test("the discount comes off before VAT, each line by its share", () => {
  const t = m.cartTotals({ lines, discountUsd: 3, feeUsd: 0, rules: { vatEnabled: true } });
  assert.equal(t.vat, 4.32); // (20-2)*16% + (10-1)*16%
  assert.equal(t.total, 31.32);
});

test("a store coupon discounts only that store's lines", () => {
  const t = m.cartTotals({ lines: [{ ...lines[0] }, { ...lines[1], discountable: false }], discountUsd: 5, feeUsd: 0, rules: { vatEnabled: true } });
  assert.equal(t.vat, 3.2 - 0.8 + 1.6); // line 1: (20-5)*16% = 2.4, line 2: 1.6
});

test("a category at 0% and a different category rate", () => {
  const t = m.cartTotals({ lines: [{ priceUsd: 20, qty: 1, vatPct: 0 }, { priceUsd: 10, qty: 2, vatPct: 8 }], discountUsd: 0, feeUsd: 0, rules: { vatEnabled: true } });
  assert.equal(t.vat, 1.6);
});

test("the seller pays the fee: the customer pays none and sees no fee row", () => {
  const t = m.cartTotals({ lines, discountUsd: 0, feeUsd: 3, rules: { vatEnabled: true, feePaidBySeller: true } });
  assert.deepEqual([t.fee, t.total, t.showFeeLine, t.feeInTotal, t.feePaidBySeller], [0, 34.8, false, false, true]);
});

test("a hidden fee is still charged: it is folded into the total", () => {
  const t = m.cartTotals({ lines, discountUsd: 0, feeUsd: 3, rules: { showPlatformFee: false } });
  assert.deepEqual([t.fee, t.total, t.showFeeLine, t.feeInTotal], [3, 33, false, true]);
});

test("rules from the public settings (strings), with safe defaults", () => {
  assert.deepEqual(m.vatRulesOf({}), { vatEnabled: false, feePaidBySeller: false, showPlatformFee: true });
  assert.deepEqual(m.vatRulesOf({ vatEnabled: "true", deliveryFeePaidBy: "seller", showPlatformFee: "false" }), { vatEnabled: true, feePaidBySeller: true, showPlatformFee: false });
});

test("allocate always adds up to the cent", () => {
  assert.deepEqual(m.allocate(1, [1, 1, 1]), [0.34, 0.33, 0.33]);
  assert.equal(Math.round(m.allocate(7.77, [3.33, 4.44, 1.11, 9.99]).reduce((a, b) => a + b, 0) * 100), 777);
});
