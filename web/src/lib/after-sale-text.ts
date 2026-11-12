/**
 * Customer words for returns, disputes, replacements and exchanges (docs/contracts/admin-controls.md §1, §2): KOMORIKO support
 * decides from the first second, there is no seller step and no escalation. Pure (no React): `after-sale.ts` re-exports it.
 */

import type { Dispute } from "@/lib/realtime/types";
import { normalizeStage } from "@/lib/support-stage";

export type L = { en: string; fr: string };
export const pick = (l: L | undefined, fr: boolean, fallback = "") => (l ? (fr ? l.fr : l.en) : fallback);

export const CONDITION_LABEL: Record<string, L> = {
  resellable: { en: "Resellable", fr: "Revendable" },
  damaged: { en: "Damaged", fr: "Endommagé" },
  unsellable: { en: "Unsellable", fr: "Invendable" },
};

export const OUTCOME_LABEL: Record<string, L> = {
  refund_full: { en: "Full refund", fr: "Remboursement total" },
  refund_partial: { en: "Partial refund", fr: "Remboursement partiel" },
  replacement: { en: "Replacement sent", fr: "Remplacement envoyé" },
  reject: { en: "Request refused", fr: "Demande refusée" },
  return_refund: { en: "Returned items refunded", fr: "Articles retournés remboursés" },
};

/** One-line status of a return or dispute, in the shopper's words. The old seller stages read like `awaiting_support`. */
export function stageText(d: Pick<Dispute, "type" | "status" | "stage" | "outcome">, fr: boolean): string {
  if (d.status === "resolved") return pick(d.outcome ? OUTCOME_LABEL[d.outcome] : { en: "Resolved", fr: "Résolu" }, fr);
  if (d.status === "rejected") return fr ? "Clôturé sans remboursement" : "Closed without a refund";
  const map: Record<string, L> = {
    awaiting_support: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
    approved: { en: "Approved — pickup being arranged", fr: "Approuvé — collecte en cours d'organisation" },
    pickup: { en: "A rider collects the items", fr: "Un livreur collecte les articles" },
    received: { en: "Items back at the warehouse — refund in progress", fr: "Articles à l'entrepôt — remboursement en cours" },
    closed: { en: "Closed", fr: "Clôturé" },
  };
  return pick(d.stage ? map[normalizeStage(d.stage)] : undefined, fr, d.type === "return" ? (fr ? "Demande reçue" : "Request received") : fr ? "Ouvert" : "Open");
}

export type StepState = "done" | "current" | "todo" | "bad";
export interface Step {
  key: string;
  label: string;
  hint?: string;
  state: StepState;
  at?: string | null;
}

/** The customer-facing steps of a return or a dispute, derived from `stage` and the timestamps. */
export function requestSteps(d: Dispute, fr: boolean): Step[] {
  const t = (en: string, frT: string) => (fr ? frT : en);
  const stage = normalizeStage(d.stage);
  const closed = d.status !== "open";
  const steps: Step[] = [{ key: "sent", label: d.type === "return" ? t("Return requested", "Retour demandé") : t("Problem reported", "Problème signalé"), state: "done", at: d.createdAt }];
  if (d.type === "dispute") {
    steps.push({
      key: "decision",
      label: d.status === "resolved" ? stageText(d, fr) : d.status === "rejected" ? t("Closed without a refund", "Clôturé sans remboursement") : t("KOMORIKO support decision", "Décision du support KOMORIKO"),
      state: d.status === "resolved" ? "done" : d.status === "rejected" ? "bad" : "current",
      at: closed ? d.updatedAt : null,
    });
    return steps;
  }
  // Return
  const approved = stage === "approved" || stage === "pickup" || stage === "received" || !!d.receivedAt || d.status === "resolved";
  if (d.status === "rejected" && !approved) {
    // Support refused it: its reason is the hint (a legacy row may still carry the seller's).
    steps.push({ key: "support", label: t("Declined by KOMORIKO support", "Refusé par le support KOMORIKO"), hint: d.resolution ?? d.sellerReason ?? undefined, state: "bad", at: d.updatedAt });
    return steps;
  }
  steps.push({
    key: "support",
    label: approved ? t("Approved by KOMORIKO support", "Approuvé par le support KOMORIKO") : t("KOMORIKO support review", "Examen par le support KOMORIKO"),
    state: approved ? "done" : closed ? "todo" : "current",
  });
  const pickupDone = stage === "received" || (stage === "closed" && !!d.receivedAt);
  steps.push({
    key: "pickup",
    label: t("A rider collects the items", "Un livreur collecte les articles"),
    state: pickupDone ? "done" : stage === "approved" || stage === "pickup" ? "current" : "todo",
  });
  steps.push({
    key: "received",
    label: t("Items back at the warehouse", "Articles de retour à l'entrepôt"),
    state: d.receivedAt ? "done" : "todo",
    at: d.receivedAt,
  });
  steps.push({
    key: "refund",
    label: d.status === "rejected" ? t("Closed without a refund", "Clôturé sans remboursement") : t("Refund", "Remboursement"),
    state: d.status === "resolved" ? "done" : d.status === "rejected" ? "bad" : stage === "received" ? "current" : "todo",
    at: closed ? d.updatedAt : null,
  });
  return steps;
}

export const SWAP_STATUS: Record<string, L> = {
  requested: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  approved: { en: "Approved — preparing the new item", fr: "Approuvé — préparation du nouvel article" },
  received: { en: "Preparing the new item", fr: "Préparation du nouvel article" },
  allocated: { en: "New item ready", fr: "Nouvel article prêt" },
  ready: { en: "New item ready", fr: "Nouvel article prêt" },
  dispatched: { en: "On its way to you", fr: "En route vers vous" },
  delivered: { en: "Delivered", fr: "Livré" },
  rejected: { en: "Declined by KOMORIKO support", fr: "Refusé par le support KOMORIKO" },
};

/** Steps of a replacement or an exchange. `sellerReason` / `sellerRespondedAt` now carry the support decision note and time. */
export function swapSteps(r: { status: string; createdAt: string; sellerRespondedAt: string | null; deliveredAt: string | null; sellerReason: string | null }, fr: boolean): Step[] {
  const t = (en: string, frT: string) => (fr ? frT : en);
  if (r.status === "rejected") {
    return [
      { key: "sent", label: t("Request sent", "Demande envoyée"), state: "done", at: r.createdAt },
      { key: "answer", label: t("Declined by KOMORIKO support", "Refusé par le support KOMORIKO"), hint: r.sellerReason ?? undefined, state: "bad", at: r.sellerRespondedAt },
    ];
  }
  const rank: Record<string, number> = { requested: 0, approved: 1, received: 1, allocated: 1, ready: 1, dispatched: 2, delivered: 3 };
  const at = rank[r.status] ?? 0;
  const st = (i: number): StepState => (at > i ? "done" : at === i ? "current" : "todo");
  return [
    { key: "sent", label: t("Request sent", "Demande envoyée"), state: "done", at: r.createdAt },
    { key: "answer", label: at >= 1 ? t("Approved by KOMORIKO support", "Approuvé par le support KOMORIKO") : t("KOMORIKO support review", "Examen par le support KOMORIKO"), state: at >= 1 ? "done" : "current", at: r.sellerRespondedAt },
    { key: "ship", label: t("A rider brings the new item and collects the old one", "Un livreur apporte le nouvel article et reprend l'ancien"), state: st(1) === "current" ? "current" : st(2) === "current" || at > 2 ? "done" : "todo" },
    { key: "delivered", label: t("Delivered", "Livré"), state: at >= 3 ? "done" : at === 2 ? "current" : "todo", at: r.deliveredAt },
  ];
}
