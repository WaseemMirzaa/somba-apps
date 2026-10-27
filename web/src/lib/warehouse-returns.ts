"use client";

import { useCallback, useMemo } from "react";
import { socketClient } from "@/lib/realtime/socket-client";
import { useOpsQuery } from "@/lib/warehouse-live";
import type { Dispute, DisputeItem } from "@/lib/realtime/types";

/**
 * Returns as the warehouse sees them (`returns:list`, `returns:get`): the items and photos the customer sent,
 * where the request stands (`stage`), and the grading the warehouse does once the goods are scanned in.
 * The refund is paid by the server when the return pickup is scanned in; grading is what shelves resellable goods.
 */

export type ReturnPhase = "with_seller" | "awaiting_goods" | "received" | "graded" | "refunded" | "rejected";

export const RETURN_PHASE_LABEL: Record<ReturnPhase, { en: string; fr: string }> = {
  with_seller: { en: "With the seller / support", fr: "Chez le vendeur / support" },
  awaiting_goods: { en: "Awaiting goods", fr: "En attente des articles" },
  received: { en: "To grade", fr: "À évaluer" },
  graded: { en: "Graded", fr: "Évalué" },
  refunded: { en: "Resolved", fr: "Résolu" },
  rejected: { en: "Closed without refund", fr: "Clôturé sans remboursement" },
};

export const RETURN_PHASE_OPTIONS = (Object.keys(RETURN_PHASE_LABEL) as ReturnPhase[]).map((v) => ({
  value: v,
  label: RETURN_PHASE_LABEL[v].en,
  labelFr: RETURN_PHASE_LABEL[v].fr,
}));

export const RETURN_PHASE_VARIANT: Record<ReturnPhase, "warning" | "info" | "success" | "danger" | "default"> = {
  with_seller: "default",
  awaiting_goods: "warning",
  received: "info",
  graded: "success",
  refunded: "success",
  rejected: "danger",
};

export const RETURN_STAGE_LABEL: Record<string, { en: string; fr: string }> = {
  awaiting_seller: { en: "Waiting for the seller", fr: "En attente du vendeur" },
  seller_replied: { en: "Seller replied", fr: "Le vendeur a répondu" },
  seller_rejected: { en: "Seller said no", fr: "Refusé par le vendeur" },
  seller_timeout: { en: "Seller did not answer", fr: "Le vendeur n'a pas répondu" },
  escalated: { en: "With Somba support", fr: "Chez le support Somba" },
  approved: { en: "Approved (no pickup yet)", fr: "Approuvé (pas encore de collecte)" },
  pickup: { en: "Pickup in progress", fr: "Collecte en cours" },
  received: { en: "Goods at the warehouse", fr: "Articles à l'entrepôt" },
  closed: { en: "Closed", fr: "Clôturé" },
};

export const CONDITION_LABEL: Record<string, { en: string; fr: string }> = {
  resellable: { en: "Resellable", fr: "Revendable" },
  damaged: { en: "Damaged", fr: "Endommagé" },
  unsellable: { en: "Unsellable", fr: "Invendable" },
};

export const RETURN_CATEGORY_LABEL: Record<string, { en: string; fr: string }> = {
  damaged: { en: "Damaged", fr: "Endommagé" },
  wrong_item: { en: "Wrong item", fr: "Mauvais article" },
  not_as_described: { en: "Not as described", fr: "Non conforme à la description" },
  changed_mind: { en: "Changed my mind", fr: "Changement d'avis" },
  defective: { en: "Defective", fr: "Défectueux" },
  other: { en: "Other", fr: "Autre" },
};

export type ReturnRow = Dispute & { phase: ReturnPhase };

export function returnPhase(d: Dispute): ReturnPhase {
  if (d.status === "rejected") return "rejected";
  if (d.status === "resolved") return "refunded";
  if (d.gradedAt) return "graded";
  if (d.receivedAt || d.stage === "received") return "received";
  if (d.stage === "approved" || d.stage === "pickup") return "awaiting_goods";
  return "with_seller";
}

/** Short text for the items of a return: "2 × Headphones, 1 × Case". */
export function returnItemsText(items: DisputeItem[] | undefined, fr: boolean): string {
  return (items ?? []).map((i) => `${i.qty} × ${fr && i.productNameFr ? i.productNameFr : i.productName}`).join(", ") || "—";
}

export interface GradeInput {
  itemId: string;
  condition: "resellable" | "damaged" | "unsellable";
  restockQty?: number;
}

export function useReturns() {
  const q = useOpsQuery<Dispute[]>("returns:list", {
    initial: [] as Dispute[],
    push: ["dispute:updated", "dispute:created", "task:updated"],
  });
  const returns = useMemo<ReturnRow[]>(
    () => q.data.filter((d) => d.type === "return").map((d) => ({ ...d, phase: returnPhase(d) })),
    [q.data],
  );
  const { patch } = q;
  const merge = useCallback(
    (saved: Dispute) => patch((cur) => cur.map((d) => (d.id === saved.id ? { ...d, ...saved } : d))),
    [patch],
  );
  const grade = useCallback(
    async (id: string, grades: GradeInput[], note?: string) => {
      const saved = await socketClient.request<Dispute>("returns:grade", { id, grades, ...(note?.trim() ? { note: note.trim() } : {}) });
      merge(saved);
      return saved;
    },
    [merge],
  );
  /** The old desk button, for a return approved without a pickup task: marks the goods as received. */
  const markReceived = useCallback(
    async (disputeId: string, restock: boolean) => {
      const saved = await socketClient.request<Dispute>("disputes:markReceived", { disputeId, restock });
      merge(saved);
      return saved;
    },
    [merge],
  );
  return { returns, loading: q.loading, error: q.error, reload: q.reload, grade, markReceived };
}

/** One return with its messages (`returns:get` is `disputes:get`). */
export function useReturn(id: string) {
  const q = useOpsQuery<Dispute | null>("disputes:get", {
    initial: null,
    body: { id },
    push: ["dispute:updated", "dispute:message", "task:updated"],
  });
  return q;
}

/** A photo the customer attached: uploads are served by the API. */
export function assetUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  return `${api}${u.startsWith("/") ? "" : "/"}${u}`;
}
