"use client";

import { useCallback, useMemo } from "react";
import { socketClient } from "@/lib/realtime/socket-client";
import { useOpsQuery, type ReturnDispute } from "@/lib/warehouse-live";

/**
 * Live return requests = `disputes:list` rows with type "return". The
 * warehouse's only job is to confirm the goods arrived (`disputes:markReceived`);
 * the refund / reject decision belongs to admin finance.
 */

export type ReturnPhase = "awaiting_goods" | "received" | "refunded" | "rejected";

export const RETURN_PHASE_LABEL: Record<ReturnPhase, { en: string; fr: string }> = {
  awaiting_goods: { en: "Awaiting goods", fr: "En attente des articles" },
  received: { en: "Goods received", fr: "Articles reçus" },
  refunded: { en: "Resolved", fr: "Résolu" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};

export const RETURN_PHASE_OPTIONS = (Object.keys(RETURN_PHASE_LABEL) as ReturnPhase[]).map((v) => ({
  value: v,
  label: RETURN_PHASE_LABEL[v].en,
  labelFr: RETURN_PHASE_LABEL[v].fr,
}));

export function returnPhase(d: ReturnDispute): ReturnPhase {
  if (d.status === "rejected") return "rejected";
  if (d.status === "resolved") return "refunded";
  return d.receivedAt ? "received" : "awaiting_goods";
}

export function useReturns() {
  const q = useOpsQuery<ReturnDispute[]>("disputes:list", {
    initial: [] as ReturnDispute[],
    push: ["dispute:updated", "dispute:created"],
  });
  const returns = useMemo(
    () => q.data.filter((d) => d.type === "return").map((d) => ({ ...d, phase: returnPhase(d) })),
    [q.data],
  );
  const { patch } = q;
  const markReceived = useCallback(
    async (disputeId: string, restock: boolean) => {
      const saved = await socketClient.request<ReturnDispute>("disputes:markReceived", { disputeId, restock });
      patch((cur) => cur.map((d) => (d.id === saved.id ? { ...d, ...saved } : d)));
      return saved;
    },
    [patch],
  );
  return { returns, loading: q.loading, error: q.error, reload: q.reload, markReceived };
}
