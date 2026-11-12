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
import type { TextI18n } from "@/lib/text-i18n";

import { pick, stageText, SWAP_STATUS, type L } from "@/lib/after-sale-text";

// The pure texts and steps live in after-sale-text.ts (testable without React); they are part of this module's API.
export * from "@/lib/after-sale-text";

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
  /** `reason` / `sellerReason` (the support decision note) in both languages (docs/contracts/stored-text-i18n.md). */
  reasonI18n?: TextI18n | null;
  sellerReasonI18n?: TextI18n | null;
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
  reasonI18n?: TextI18n | null;
  sellerReasonI18n?: TextI18n | null;
  status: "requested" | "approved" | "received" | "ready" | "dispatched" | "delivered" | "rejected";
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  deliveryTaskId: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
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
