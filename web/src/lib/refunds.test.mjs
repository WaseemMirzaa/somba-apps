// Run: npm test (from web/). Transpiles refunds.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./refunds.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { refundFigures, refundNote, refundsByPayment, refundReason, refundDestination } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const money = (n) => `$${n.toFixed(2)}`;

test("a payment nobody refunded is wholly refundable", () => {
  assert.deepEqual(refundFigures({ amountUsd: 63, status: "succeeded" }), { state: "none", refundedUsd: 0, refundableUsd: 63 });
  assert.equal(refundNote({ amountUsd: 63, status: "succeeded" }, false, money), null);
});

test("after a $59 return refund the page shows 'Paid' no more: partly refunded, with what is left (bug 1)", () => {
  const p = { amountUsd: 63, status: "succeeded", refundedUsd: 59, refundableUsd: 4 };
  assert.deepEqual(refundFigures(p), { state: "partial", refundedUsd: 59, refundableUsd: 4 });
  assert.equal(refundNote(p, false, money), "$59.00 of $63.00 already refunded: at most $4.00 can still be refunded.");
  assert.equal(refundNote(p, true, money), "$59.00 sur $63.00 déjà remboursés : au plus $4.00 peuvent encore l'être.");
});

test("the server's refundable figure wins; an older server's is worked out", () => {
  assert.equal(refundFigures({ amountUsd: 63, status: "succeeded", refundedUsd: 59, refundableUsd: 2 }).refundableUsd, 2);
  assert.equal(refundFigures({ amountUsd: 63, status: "succeeded", refundedUsd: 59 }).refundableUsd, 4);
  assert.equal(refundFigures({ amountUsd: 63, status: "succeeded", refundedUsd: 99 }).refundableUsd, 0);
});

test("a fully refunded payment cannot be refunded again, and says why", () => {
  for (const p of [{ amountUsd: 63, status: "refunded", refundedUsd: 23 }, { amountUsd: 63, status: "succeeded", refundedUsd: 63, refundableUsd: 0 }]) {
    const f = refundFigures(p);
    assert.equal(f.state, "full");
    assert.equal(f.refundableUsd, 0);
    assert.equal(f.refundedUsd, 63); // a refunded payment gave back its whole amount, whatever the last refund was
  }
  assert.equal(refundNote({ amountUsd: 63, status: "refunded", refundedUsd: 63 }, false, money), "Nothing left to refund: $63.00 of $63.00 already went back to the customer.");
  assert.equal(refundNote({ amountUsd: 63, status: "refunded", refundedUsd: 63 }, true, money), "Rien à rembourser : $63.00 sur $63.00 ont déjà été remboursés.");
});

test("a payment that is not paid has nothing to refund", () => {
  for (const status of ["pending", "failed"]) {
    assert.deepEqual(refundFigures({ amountUsd: 20, status }), { state: "unpaid", refundedUsd: 0, refundableUsd: 0 });
    assert.equal(refundNote({ amountUsd: 20, status }, false, money), "Only a completed payment can be refunded.");
  }
});

test("the ledger rows of a payment, newest first; the reason names the return", () => {
  const rows = [
    { id: "a", paymentId: "p1", kind: "return", disputeReference: "RET-0001", createdAt: "2026-10-26T10:00:00Z", amountUsd: 59, refundTo: "wallet", status: "completed" },
    { id: "b", paymentId: "p1", kind: "admin", createdAt: "2026-10-27T10:00:00Z", amountUsd: 4, refundTo: "wallet", status: "completed" },
    { id: "c", paymentId: "p2", kind: "cancellation", createdAt: "2026-10-26T11:00:00Z", amountUsd: 10, refundTo: "wallet", status: "completed" },
  ];
  const by = refundsByPayment(rows);
  assert.deepEqual(by.get("p1").map((r) => r.id), ["b", "a"]);
  assert.deepEqual(by.get("p2").map((r) => r.id), ["c"]);
  assert.equal(refundsByPayment(null).size, 0);
  assert.equal(refundReason(rows[0], false), "Return RET-0001");
  assert.equal(refundReason(rows[0], true), "Retour RET-0001");
  assert.equal(refundReason({ kind: "return", disputeReference: null }, false), "Return");
  assert.equal(refundReason(rows[1], true), "Remboursement par la finance");
  assert.equal(refundReason({ kind: "cancellation" }, true), "Commande annulée");
  assert.equal(refundReason({ kind: "something_new" }, false), "Earlier refund");
});

test("where the money went", () => {
  assert.equal(refundDestination({ refundTo: "wallet", status: "completed" }, false), "to wallet");
  assert.equal(refundDestination({ refundTo: "wallet", status: "completed" }, true), "vers le portefeuille");
  assert.equal(refundDestination({ refundTo: "phone", status: "sending" }, false), "to phone · sending");
  assert.equal(refundDestination({ refundTo: "phone", status: "completed" }, true), "vers le téléphone");
  assert.equal(refundDestination({ refundTo: "wallet", status: "failed" }, false), "wallet (phone refund failed)");
});
