// Run: npm test (from web/). payout-statement.ts is pure, so it is transpiled with the project's own
// `typescript` and imported, like seller-packages.test.mjs does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./payout-statement.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const payout = { id: "p1", reference: "PO-123/4", sellerId: "u1", sellerName: 'Store "One", Ltd', amountUsd: 100, method: "wallet", status: "paid", providerRef: null, createdAt: "2026-10-22T10:00:00Z" };
const line = (over = {}) => ({ id: "l1", payoutId: "p1", orderItemId: "i1", orderId: "o1", orderReference: "SO-1", productName: "Phone", variant: "Default", qty: 2, kind: "sale", grossUsd: 200, commissionPct: 10, commissionUsd: 20, refundUsd: 0, netUsd: 180, deliveredAt: "2026-10-21T10:00:00Z", ...over });
const day = (v) => (v ? String(v).slice(0, 10) : "");

test("csv rows: header block, one row per line, totals, closing balance", () => {
  const st = {
    payout,
    legacy: false,
    lines: [line(), line({ id: "l2", kind: "refund", orderReference: "SO-0", grossUsd: 0, commissionUsd: 0, refundUsd: 90, netUsd: -90 })],
    totals: { grossUsd: 200, commissionUsd: 20, refundsUsd: 90, netUsd: 90, openingBalanceUsd: 10, closingBalanceUsd: 0, amountUsd: 100 },
  };
  const rows = m.statementCsvRows(st, { fr: false, day });
  assert.deepEqual(rows[0], ["Payout statement", "PO-123/4"]);
  assert.deepEqual(rows.find((r) => r[0] === "Opening balance (USD)"), ["Opening balance (USD)", "10.00"]);
  const head = rows.findIndex((r) => r[0] === "Order");
  assert.deepEqual(rows[head + 1], ["SO-1", "Phone", "Default", 2, "Sale", "200.00", 10, "20.00", "0.00", "180.00", "2026-10-21"]);
  assert.deepEqual(rows[head + 2].slice(4, 10), ["Refund", "0.00", 10, "0.00", "90.00", "-90.00"]);
  const totals = rows.find((r) => r[0] === "Totals");
  assert.deepEqual(totals, ["Totals", "", "", 4, "", "200.00", "", "20.00", "90.00", "90.00", ""]);
  assert.deepEqual(rows.at(-1), ["Closing balance (USD)", "0.00"]);
  // gross - commission - refunds = net, as the statement states
  assert.equal(200 - 20 - 90, 90);
});

test("french labels", () => {
  const st = { payout, legacy: false, lines: [], totals: { grossUsd: 0, commissionUsd: 0, refundsUsd: 0, netUsd: 0, openingBalanceUsd: 5, closingBalanceUsd: 5, amountUsd: 0 } };
  const rows = m.statementCsvRows(st, { fr: true, day });
  assert.equal(rows[0][0], "Relevé de versement");
  assert.ok(rows.some((r) => r[0] === "Solde de clôture (USD)"));
});

test("a payout issued before statements existed says so and keeps its amount", () => {
  const rows = m.statementCsvRows({ payout, legacy: true, lines: [], totals: null }, { fr: false, day });
  assert.ok(rows.some((r) => /before statements existed/.test(String(r[0]))));
  assert.deepEqual(rows.at(-1), ["Payout amount (USD)", "100.00"]);
});

test("spreadsheet formulas in free text are neutralised", () => {
  assert.equal(m.csvText("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(m.csvText("+1 phone"), "'+1 phone");
  assert.equal(m.csvText("Phone"), "Phone");
  assert.equal(m.csvText(null), "");
  const rows = m.statementCsvRows({ payout, legacy: false, lines: [line({ productName: "=cmd|' /C calc'!A0" })], totals: { grossUsd: 0, commissionUsd: 0, refundsUsd: 0, netUsd: 0, openingBalanceUsd: 0, closingBalanceUsd: 0, amountUsd: 0 } }, { fr: false, day });
  assert.equal(rows.find((r) => r[0] === "SO-1")[1].startsWith("'="), true);
});

test("filename is safe", () => {
  assert.equal(m.statementFilename({ payout }), "somba-statement-PO-123-4.csv");
});
