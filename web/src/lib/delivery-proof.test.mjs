// Run: npm test (from web/). Transpiles delivery-proof.ts with the project's own `typescript` and imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./delivery-proof.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { takesProof, PROOF_DENIED } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("proof is looked up only for a delivered handover to the customer", () => {
  assert.equal(takesProof({ kind: "delivery", status: "delivered" }), true);
  assert.equal(takesProof({ kind: "replacement_delivery", status: "delivered" }), true);
  for (const status of ["assigned", "picked_up", "in_transit", "failed", "unassigned"]) {
    assert.equal(takesProof({ kind: "delivery", status }), false, status);
  }
  for (const kind of ["pickup", "transfer", "return_pickup", "return_transfer", "return_to_seller"]) {
    assert.equal(takesProof({ kind, status: "delivered" }), false, kind);
  }
});

test("the 'not for your role' answer is the server's own not-found sentence", () => {
  assert.equal(PROOF_DENIED, "Delivery task not found.");
});

test("an express run is handed to the customer: its proof is looked up once delivered", () => {
  assert.equal(takesProof({ kind: "express", status: "delivered" }), true);
  assert.equal(takesProof({ kind: "express", status: "in_transit" }), false);
});
