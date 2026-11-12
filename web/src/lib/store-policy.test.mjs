// Run: npm test (from web/). Store policies need approval: the proposal helpers shared by the seller form and the admin queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("./store-policy.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const live = { returnsPolicy: "Live returns", returnsPolicyFr: "Retours en ligne", shippingPolicy: "", shippingPolicyFr: "" };
const rev = (over = {}) => ({ id: "r1", sellerId: "s1", status: "pending", returnsPolicy: null, returnsPolicyFr: null, shippingPolicy: null, shippingPolicyFr: null, note: null, createdAt: "2026-11-12T10:00:00Z", live, ...over });

test("a null column is not part of the proposal; '' clears; text replaces", () => {
  assert.deepEqual(m.revisionKeys(rev({ returnsPolicy: "New text here", shippingPolicyFr: "" })), ["returnsPolicy", "shippingPolicyFr"]);
  assert.deepEqual(m.revisionKeys(rev()), []);
  assert.deepEqual(m.revisionKeys(null), []);
});

test("the form starts from the proposal in review, else from the live text", () => {
  assert.deepEqual(m.effectivePolicy(live, null), live);
  const eff = m.effectivePolicy(live, rev({ returnsPolicy: "Proposed returns text", shippingPolicy: "Proposed shipping" }));
  assert.equal(eff.returnsPolicy, "Proposed returns text");
  assert.equal(eff.returnsPolicyFr, "Retours en ligne"); // not part of the proposal: the live text
  assert.equal(eff.shippingPolicy, "Proposed shipping");
  assert.equal(m.effectivePolicy(live, rev({ returnsPolicy: "" })).returnsPolicy, ""); // a cleared field stays cleared
  assert.equal(m.effectivePolicy({}, null).shippingPolicyFr, "");
});

test("the patch names only what changed; an emptied field is null (clears it)", () => {
  assert.deepEqual(m.policyPatch(live, live), {});
  assert.deepEqual(m.policyPatch({ ...live, returnsPolicy: "  Edited returns text  " }, live), { returnsPolicy: "Edited returns text" });
  assert.deepEqual(m.policyPatch({ ...live, returnsPolicyFr: "   " }, live), { returnsPolicyFr: null });
  assert.deepEqual(m.policyPatch({ ...live, returnsPolicy: "Live returns   " }, live), {}); // trailing spaces are not a change
});

test("a policy text is empty or 10-2000 characters (the server's rule)", () => {
  assert.equal(m.policyTextInvalid(""), false);
  assert.equal(m.policyTextInvalid("   "), false);
  assert.equal(m.policyTextInvalid("too short"), true);
  assert.equal(m.policyTextInvalid("exactly 10"), false);
  assert.equal(m.policyTextInvalid("x".repeat(2000)), false);
  assert.equal(m.policyTextInvalid("x".repeat(2001)), true);
});

test("the admin compares each changed field with the live text", () => {
  const rows = m.compareRows(rev({ returnsPolicy: "Proposed text here", shippingPolicy: "" }));
  assert.deepEqual(rows.map((r) => r.key), ["returnsPolicy", "shippingPolicy"]);
  assert.equal(rows[0].live, "Live returns");
  assert.equal(rows[0].proposed, "Proposed text here");
  assert.equal(rows[0].cleared, false);
  assert.equal(rows[1].cleared, true);
  assert.equal(m.compareRows(rev({ live: null, returnsPolicy: "Proposed text here" }))[0].live, "");
});

test("status labels are English and French; an unknown status reads as it is", () => {
  assert.equal(m.policyStatusLabel("pending", false), "Waiting for approval");
  assert.equal(m.policyStatusLabel("pending", true), "En attente d'approbation");
  assert.equal(m.policyStatusLabel("rejected", true), "Refusée");
  assert.equal(m.policyStatusLabel("weird", false), "weird");
});
