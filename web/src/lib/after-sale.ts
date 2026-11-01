"use client";

/**
 * The customer's after-sale requests: returns and disputes (`disputes:*`), replacements and exchanges
 * (`replacements:*`, `exchanges:*`). Labels, the step timeline and live hooks. Contract: docs/contracts/after-sale.md.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketEvent } from "@/lib/shop-live";
import type { Dispute, DisputeMessage } from "@/lib/realtime/types";

type L = { en: string; fr: string };
const pick = (l: L | undefined, fr: boolean, fallback = "") => (l ? (fr ? l.fr : l.en) : fallback);

export const RETURN_CATEGORIES: { value: string; label: L }[] = [
  { value: "defective", label: { en: "Defective or not working", fr: "Défectueux ou ne fonctionne pas" } },
  { value: "damaged", label: { en: "Damaged on arrival", fr: "Endommagé à la livraison" } },
  { value: "wrong_item", label: { en: "Wrong item received", fr: "Mauvais article reçu" } },
  { value: "not_as_described", label: { en: "Not as described", fr: "Non conforme à la description" } },
  { value: "changed_mind", label: { en: "Changed my mind", fr: "J'ai changé d'avis" } },
  { value: "other", label: { en: "Other", fr: "Autre" } },
];

export const DISPUTE_CATEGORIES: { value: string; label: L }[] = [
  { value: "missing", label: { en: "An item is missing", fr: "Un article est manquant" } },
  { value: "damaged", label: { en: "Item arrived damaged", fr: "Article arrivé endommagé" } },
  { value: "wrong_item", label: { en: "Wrong item received", fr: "Mauvais article reçu" } },
  { value: "not_received", label: { en: "I never received my order", fr: "Je n'ai jamais reçu ma commande" } },
  { value: "other", label: { en: "Other problem", fr: "Autre problème" } },
];

export function categoryLabel(type: "return" | "dispute", value: string | null | undefined, fr: boolean): string {
  if (!value) return "—";
  const list = type === "return" ? RETURN_CATEGORIES : DISPUTE_CATEGORIES;
  return pick(list.find((c) => c.value === value)?.label, fr, value);
}

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

/** One-line status of a return or dispute, in the shopper's words. */
export function stageText(d: Pick<Dispute, "type" | "status" | "stage" | "outcome">, fr: boolean): string {
  if (d.status === "resolved") return pick(d.outcome ? OUTCOME_LABEL[d.outcome] : { en: "Resolved", fr: "Résolu" }, fr);
  if (d.status === "rejected") return fr ? "Clôturé sans remboursement" : "Closed without a refund";
  const map: Record<string, L> = {
    awaiting_seller: { en: "Waiting for the seller", fr: "En attente du vendeur" },
    seller_replied: { en: "The seller replied — Somba support decides", fr: "Le vendeur a répondu — le support Somba décide" },
    seller_rejected: { en: "The seller declined — you can ask Somba support to review", fr: "Le vendeur a refusé — vous pouvez demander l'avis du support Somba" },
    seller_timeout: { en: "The seller did not answer in time — ask Somba support to review", fr: "Le vendeur n'a pas répondu à temps — demandez l'avis du support Somba" },
    escalated: { en: "With Somba support", fr: "Chez le support Somba" },
    approved: { en: "Approved — pickup being arranged", fr: "Approuvé — collecte en cours d'organisation" },
    pickup: { en: "A rider collects the items", fr: "Un livreur collecte les articles" },
    received: { en: "Items back at the warehouse — refund in progress", fr: "Articles à l'entrepôt — remboursement en cours" },
    closed: { en: "Closed", fr: "Clôturé" },
  };
  return pick(d.stage ? map[d.stage] : undefined, fr, d.type === "return" ? (fr ? "Demande reçue" : "Request received") : fr ? "Ouvert" : "Open");
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
  const stage = d.stage ?? "awaiting_seller";
  const closed = d.status !== "open";
  const steps: Step[] = [{ key: "sent", label: d.type === "return" ? t("Return requested", "Retour demandé") : t("Problem reported", "Problème signalé"), state: "done", at: d.createdAt }];
  if (d.type === "dispute") {
    const replied = stage !== "awaiting_seller";
    steps.push({ key: "seller", label: replied ? t("Seller replied", "Le vendeur a répondu") : t("Seller reply", "Réponse du vendeur"), state: replied ? "done" : closed ? "todo" : "current" });
    steps.push({
      key: "decision",
      label: d.status === "resolved" ? stageText(d, fr) : d.status === "rejected" ? t("Closed without a refund", "Clôturé sans remboursement") : t("Somba support decision", "Décision du support Somba"),
      state: d.status === "resolved" ? "done" : d.status === "rejected" ? "bad" : replied ? "current" : "todo",
      at: closed ? d.updatedAt : null,
    });
    return steps;
  }
  // Return
  const sellerAnswered = stage !== "awaiting_seller";
  // A refusal keeps its reason after support takes over, so the step still says what the seller did.
  const declined = !!d.sellerReason || stage === "seller_rejected";
  const timedOut = stage === "seller_timeout" || (!!d.escalatedAt && !d.sellerRespondedAt);
  if (declined) steps.push({ key: "seller", label: t("Seller declined", "Le vendeur a refusé"), hint: d.sellerReason ?? undefined, state: "bad", at: d.sellerRespondedAt });
  else if (timedOut) steps.push({ key: "seller", label: t("Seller did not answer in time", "Le vendeur n'a pas répondu à temps"), state: "bad" });
  else steps.push({ key: "seller", label: sellerAnswered ? t("Seller accepted", "Le vendeur a accepté") : t("Seller review", "Examen par le vendeur"), state: sellerAnswered ? "done" : closed ? "todo" : "current", at: d.sellerRespondedAt });
  if (d.escalatedAt || stage === "escalated" || stage === "seller_rejected" || stage === "seller_timeout") {
    steps.push({ key: "support", label: t("Somba support review", "Examen par le support Somba"), state: stage === "escalated" ? "current" : d.escalatedAt ? "done" : "todo", at: d.escalatedAt });
  }
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
    hint: d.status === "resolved" && d.refundUsd != null ? undefined : undefined,
    state: d.status === "resolved" ? "done" : d.status === "rejected" ? "bad" : stage === "received" ? "current" : "todo",
    at: closed ? d.updatedAt : null,
  });
  return steps;
}

// ───────────────────────── replacements / exchanges ─────────────────────────

export interface ReplacementRow {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  sellerId: string | null;
  sku: string;
  productName: string;
  productNameFr?: string | null;
  reason: string | null;
  condition: string | null;
  qty: number;
  variant: string | null;
  attachments: string[];
  status: "requested" | "approved" | "received" | "allocated" | "dispatched" | "delivered" | "rejected";
  dispatchStatus: string | null;
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  deliveryTaskId: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRow {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  sellerId: string | null;
  fromSku: string;
  fromName: string;
  fromNameFr?: string | null;
  fromVariant: string | null;
  toSku: string;
  toName: string;
  toNameFr?: string | null;
  toVariant: string | null;
  qty: number;
  priceDiffUsd: number;
  heldUsd: number;
  reason: string | null;
  status: "requested" | "approved" | "received" | "ready" | "dispatched" | "delivered" | "rejected";
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  deliveryTaskId: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SWAP_STATUS: Record<string, L> = {
  requested: { en: "Waiting for the seller", fr: "En attente du vendeur" },
  approved: { en: "Approved — preparing the new item", fr: "Approuvé — préparation du nouvel article" },
  received: { en: "Preparing the new item", fr: "Préparation du nouvel article" },
  allocated: { en: "New item ready", fr: "Nouvel article prêt" },
  ready: { en: "New item ready", fr: "Nouvel article prêt" },
  dispatched: { en: "On its way to you", fr: "En route vers vous" },
  delivered: { en: "Delivered", fr: "Livré" },
  rejected: { en: "Declined", fr: "Refusé" },
};

export function swapSteps(r: { status: string; createdAt: string; sellerRespondedAt: string | null; deliveredAt: string | null; sellerReason: string | null }, fr: boolean): Step[] {
  const t = (en: string, frT: string) => (fr ? frT : en);
  if (r.status === "rejected") {
    return [
      { key: "sent", label: t("Request sent", "Demande envoyée"), state: "done", at: r.createdAt },
      { key: "answer", label: t("Seller declined", "Le vendeur a refusé"), hint: r.sellerReason ?? undefined, state: "bad", at: r.sellerRespondedAt },
    ];
  }
  const rank: Record<string, number> = { requested: 0, approved: 1, received: 1, allocated: 1, ready: 1, dispatched: 2, delivered: 3 };
  const at = rank[r.status] ?? 0;
  const st = (i: number): StepState => (at > i ? "done" : at === i ? "current" : "todo");
  return [
    { key: "sent", label: t("Request sent", "Demande envoyée"), state: "done", at: r.createdAt },
    { key: "answer", label: at >= 1 ? t("Seller approved", "Le vendeur a approuvé") : t("Seller review", "Examen par le vendeur"), state: at >= 1 ? "done" : "current", at: r.sellerRespondedAt },
    { key: "ship", label: t("A rider brings the new item and collects the old one", "Un livreur apporte le nouvel article et reprend l'ancien"), state: st(1) === "current" ? "current" : st(2) === "current" || at > 2 ? "done" : "todo" },
    { key: "delivered", label: t("Delivered", "Livré"), state: at >= 3 ? "done" : at === 2 ? "current" : "todo", at: r.deliveredAt },
  ];
}

/** The customer's replacements, live via `replacement:updated`. */
export function useMyReplacements() {
  const rt = useRealtime();
  const [rows, setRows] = useState<ReplacementRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const enabled = rt.status === "connected" && rt.user?.role === "customer";
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    socketClient
      .request<ReplacementRow[]>("replacements:mine", {})
      .then((l) => alive && setRows(Array.isArray(l) ? l : []))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [enabled]);
  useSocketEvent<ReplacementRow>("replacement:updated", (r) => setRows((cur) => (cur.some((x) => x.id === r.id) ? cur.map((x) => (x.id === r.id ? r : x)) : [r, ...cur])));
  const put = useCallback((r: ReplacementRow) => setRows((cur) => [r, ...cur.filter((x) => x.id !== r.id)]), []);
  return { rows, loaded, put };
}

/** The customer's exchanges, live via `exchange:updated`. */
export function useMyExchanges() {
  const rt = useRealtime();
  const [rows, setRows] = useState<ExchangeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const enabled = rt.status === "connected" && rt.user?.role === "customer";
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    socketClient
      .request<ExchangeRow[]>("exchanges:mine", {})
      .then((l) => alive && setRows(Array.isArray(l) ? l : []))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [enabled]);
  useSocketEvent<ExchangeRow>("exchange:updated", (r) => setRows((cur) => (cur.some((x) => x.id === r.id) ? cur.map((x) => (x.id === r.id ? r : x)) : [r, ...cur])));
  const put = useCallback((r: ExchangeRow) => setRows((cur) => [r, ...cur.filter((x) => x.id !== r.id)]), []);
  return { rows, loaded, put };
}

/** One return/dispute with its thread (`disputes:get`), live via `dispute:updated` / `dispute:message`. */
export function useDisputeDetail(id: string | undefined) {
  const rt = useRealtime();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await socketClient.request<Dispute>("disputes:get", { id });
      setDispute(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [id]);
  useEffect(() => {
    if (!id || rt.status !== "connected") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [id, rt.status, load]);
  useSocketEvent<Dispute>("dispute:updated", (d) => {
    if (d.id === id) setDispute((cur) => ({ ...(cur ?? d), ...d, messages: cur?.messages ?? d.messages }));
  });
  useSocketEvent<{ disputeId: string; message: DisputeMessage }>("dispute:message", (p) => {
    if (p.disputeId !== id) return;
    setDispute((cur) => (cur ? { ...cur, messages: (cur.messages ?? []).some((m) => m.id === p.message.id) ? cur.messages : [...(cur.messages ?? []), p.message] } : cur));
  });
  const patch = useCallback((d: Dispute) => setDispute((cur) => ({ ...(cur ?? d), ...d, messages: d.messages ?? cur?.messages })), []);
  const addMessage = useCallback((m: DisputeMessage) => setDispute((cur) => (cur ? { ...cur, messages: (cur.messages ?? []).some((x) => x.id === m.id) ? cur.messages : [...(cur.messages ?? []), m] } : cur)), []);
  return { dispute, loaded, error, reload: load, patch, addMessage };
}

/** Rows sorted newest first, merged from the three kinds for the "my requests" list. */
export function useMyRequests() {
  const rt = useRealtime();
  const { rows: reps } = useMyReplacements();
  const { rows: exs } = useMyExchanges();
  return useMemo(() => {
    const items: { kind: "return" | "dispute" | "replacement" | "exchange"; id: string; reference: string; orderReference: string; createdAt: string; label: string; labelFr: string; status: string; statusClass: "success" | "danger" | "warning" | "info" }[] = [];
    for (const d of rt.disputes) {
      items.push({
        kind: d.type,
        id: d.id,
        reference: d.reference,
        orderReference: d.orderReference,
        createdAt: d.createdAt,
        label: stageText(d, false),
        labelFr: stageText(d, true),
        status: d.status,
        statusClass: d.status === "resolved" ? "success" : d.status === "rejected" ? "danger" : "warning",
      });
    }
    for (const r of reps) {
      items.push({ kind: "replacement", id: r.id, reference: r.reference, orderReference: r.orderReference, createdAt: r.createdAt, label: SWAP_STATUS[r.status]?.en ?? r.status, labelFr: SWAP_STATUS[r.status]?.fr ?? r.status, status: r.status, statusClass: r.status === "delivered" ? "success" : r.status === "rejected" ? "danger" : "warning" });
    }
    for (const r of exs) {
      items.push({ kind: "exchange", id: r.id, reference: r.reference, orderReference: r.orderReference, createdAt: r.createdAt, label: SWAP_STATUS[r.status]?.en ?? r.status, labelFr: SWAP_STATUS[r.status]?.fr ?? r.status, status: r.status, statusClass: r.status === "delivered" ? "success" : r.status === "rejected" ? "danger" : "warning" });
    }
    return items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [rt.disputes, reps, exs]);
}
