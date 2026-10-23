// Run: npm test (from web/). The commission helpers live in seller-packages.ts (pure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./seller-packages.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const line = (over = {}) => ({ id: "i", productId: "p", productName: "X", variant: "", qty: 2, priceUsd: 50, fulfilment: "open", ...over });

test("a line's commission is the stored amount, not today's rate", () => {
  assert.equal(m.lineCommission(line({ commissionUsd: 10, commissionPct: 10 }), 40), 10);
  assert.equal(m.lineCommission(line({ commissionUsd: 0, commissionPct: 0 }), 40), 0); // a stored 0 is respected
});

test("only a line without a stored amount falls back to the rate", () => {
  assert.equal(m.lineCommission(line(), 12), 12);
});

test("cancelled lines carry no commission", () => {
  assert.equal(m.liveCommission([line({ commissionUsd: 10 }), line({ commissionUsd: 7, fulfilment: "cancelled" })], 12), 10);
});

test("rate label: one shared rate, mixed, or none", () => {
  assert.equal(m.commissionRateOf([line({ commissionPct: 12 }), line({ commissionPct: 12 })]), 12);
  assert.equal(m.commissionRateOf([line({ commissionPct: 12 }), line({ commissionPct: 25 })]), "mixed");
  assert.equal(m.commissionRateOf([line({ commissionPct: 12 }), line({ commissionPct: 25, fulfilment: "cancelled" })]), 12);
  assert.equal(m.commissionRateOf([line()]), null);
});
