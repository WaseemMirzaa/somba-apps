// Run: npm test (from web/). Customer wording after the seller left the after-sale flow: support decides, no escalation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// after-sale-text.ts imports `normalizeStage` from support-stage.ts: inline it so the data: module is self-contained.
const stageSrc = ts.transpileModule(readFileSync(new URL("./support-stage.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
let text = ts.transpileModule(readFileSync(new URL("./after-sale-text.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
text = text.replace(/import \{ normalizeStage \} from "@\/lib\/support-stage";/, "");
const m = await import(`data:text/javascript,${encodeURIComponent(stageSrc.replace(/export const/g, "const").replace(/export function/g, "function").replace(/export \{[^}]*\};?/g, "") + "\n" + text)}`);

const ret = (over = {}) => ({ id: "d1", type: "return", status: "open", stage: "awaiting_support", reason: "broken", createdAt: "2026-11-12T10:00:00Z", updatedAt: "2026-11-12T10:00:00Z", ...over });

test("a fresh request is with KOMORIKO support, in both languages; no seller words", () => {
  assert.equal(m.stageText(ret(), false), "With KOMORIKO support");
  assert.equal(m.stageText(ret(), true), "Chez le support KOMORIKO");
});

test("every legacy seller stage reads as with support", () => {
  for (const s of ["awaiting_seller", "seller_replied", "seller_rejected", "seller_timeout", "escalated"]) {
    assert.equal(m.stageText(ret({ stage: s }), false), "With KOMORIKO support", s);
    assert.equal(m.stageText(ret({ stage: s }), true), "Chez le support KOMORIKO", s);
  }
});

test("later stages are unchanged", () => {
  assert.match(m.stageText(ret({ stage: "approved" }), false), /^Approved/);
  assert.match(m.stageText(ret({ stage: "pickup" }), true), /livreur/);
  assert.equal(m.stageText(ret({ status: "rejected", stage: "closed" }), false), "Closed without a refund");
  assert.equal(m.stageText(ret({ status: "resolved", outcome: "refund_full", stage: "closed" }), false), "Full refund");
});

test("a return's steps: requested, then support review (current), no seller step", () => {
  const steps = m.requestSteps(ret(), false);
  assert.deepEqual(steps.map((s) => s.key), ["sent", "support", "pickup", "received", "refund"]);
  assert.equal(steps[1].label, "KOMORIKO support review");
  assert.equal(steps[1].state, "current");
  assert.ok(!steps.some((s) => /seller|vendeur/i.test(s.label)));
  assert.ok(!steps.some((s) => /escalat/i.test(s.key + s.label)));
});

test("a return in an old seller stage still shows support reviewing it", () => {
  for (const s of ["awaiting_seller", "seller_rejected", "seller_timeout"]) {
    const steps = m.requestSteps(ret({ stage: s }), false);
    assert.equal(steps.find((x) => x.key === "support").state, "current", s);
    assert.ok(!steps.some((x) => /seller|vendeur/i.test(x.label)), s);
  }
});

test("approved by support moves the timeline on; a refusal shows support's reason", () => {
  const ok = m.requestSteps(ret({ stage: "pickup" }), true);
  assert.equal(ok[1].label, "Approuvé par le support KOMORIKO");
  assert.equal(ok[1].state, "done");
  assert.equal(ok.find((s) => s.key === "pickup").state, "current");
  const no = m.requestSteps(ret({ status: "rejected", stage: "closed", resolution: "Outside the return window" }), false);
  assert.deepEqual(no.map((s) => s.key), ["sent", "support"]);
  assert.equal(no[1].label, "Declined by KOMORIKO support");
  assert.equal(no[1].hint, "Outside the return window");
  assert.equal(no[1].state, "bad");
});

test("a dispute: reported, then KOMORIKO support decides", () => {
  const steps = m.requestSteps(ret({ type: "dispute" }), false);
  assert.deepEqual(steps.map((s) => s.key), ["sent", "decision"]);
  assert.equal(steps[1].label, "KOMORIKO support decision");
  assert.equal(steps[1].state, "current");
});

test("replacements and exchanges: support reviews, then approves or declines", () => {
  assert.equal(m.SWAP_STATUS.requested.en, "With KOMORIKO support");
  assert.equal(m.SWAP_STATUS.rejected.fr, "Refusé par le support KOMORIKO");
  const open = m.swapSteps({ status: "requested", createdAt: "x", sellerRespondedAt: null, deliveredAt: null, sellerReason: null }, false);
  assert.equal(open[1].label, "KOMORIKO support review");
  assert.equal(open[1].state, "current");
  const approved = m.swapSteps({ status: "approved", createdAt: "x", sellerRespondedAt: "y", deliveredAt: null, sellerReason: null }, true);
  assert.equal(approved[1].label, "Approuvé par le support KOMORIKO");
  const declined = m.swapSteps({ status: "rejected", createdAt: "x", sellerRespondedAt: "y", deliveredAt: null, sellerReason: "Not eligible" }, false);
  assert.equal(declined[1].label, "Declined by KOMORIKO support");
  assert.equal(declined[1].hint, "Not eligible");
});

test("customer pages carry no escalate button and no 'seller should answer' line", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const status = read("../app/shop/returns/[id]/page.tsx");
  assert.doesNotMatch(status, /disputes:escalate|canEscalate|showEscalate/);
  assert.doesNotMatch(status, /The seller should answer|Réponse du vendeur attendue/);
  assert.doesNotMatch(read("../components/shop/swap-status.tsx"), /The seller should answer|Réponse du vendeur attendue/);
  const form = read("../components/shop/request-form.tsx");
  assert.doesNotMatch(form, /The seller has|Le vendeur a/);
  assert.match(form, /Support response time/);
  const legal = read("../app/legal/returns/page.tsx");
  assert.doesNotMatch(legal, /Seller answer and escalation|Réponse du vendeur et escalade/);
  assert.match(legal, /KOMORIKO support decides/);
});
