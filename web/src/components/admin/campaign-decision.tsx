"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg, type CampaignRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

/**
 * Campaign decisions (`campaigns:setStatus`): approve (the server picks scheduled or active from the start date),
 * reject with a reason the seller will read (3 characters at least), or end now.
 * `modal` must be rendered once by the page; `onUpdated` receives the server's row.
 */
export function useCampaignDecisions(onUpdated: (c: CampaignRow) => void) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<CampaignRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(c: CampaignRow, status: "active" | "rejected" | "ended", why?: string): Promise<boolean> {
    setBusyId(c.id);
    try {
      const updated = await socketClient.request<CampaignRow>("campaigns:setStatus", { id: c.id, status, ...(why ? { reason: why } : {}) });
      onUpdated({ ...c, ...updated });
      if (status === "active") {
        toast(
          updated.status === "scheduled"
            ? fr ? `Campagne approuvée : planifiée, les prix changent au début (${updated.startDate ?? "—"})` : `Campaign approved: scheduled, prices change at the start (${updated.startDate ?? "—"})`
            : fr ? "Campagne approuvée : les prix changent maintenant" : "Campaign approved: prices change now",
          "success",
        );
      } else if (status === "ended") {
        toast(fr ? "Campagne terminée : les prix reviennent à la normale" : "Campaign ended: prices return to normal", "success");
      } else {
        toast(fr ? "Campagne rejetée : le vendeur voit votre motif" : "Campaign rejected: the seller sees your reason", "success");
      }
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      setError(errMsg(e));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    const why = reason.trim();
    if (why.length < 3) {
      setError(fr ? "Donnez au vendeur un motif de rejet (3 caractères minimum)." : "Give the seller a reason for rejecting this campaign (at least 3 characters).");
      return;
    }
    if (await send(rejecting, "rejected", why)) {
      setRejecting(null);
      setReason("");
    }
  }

  const modal = (
    <Modal
      open={!!rejecting}
      onClose={() => busyId === null && setRejecting(null)}
      title={fr ? "Rejeter la campagne" : "Reject the campaign"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setRejecting(null)} disabled={busyId !== null}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button variant="danger" size="sm" onClick={() => void confirmReject()} disabled={busyId !== null}>{busyId !== null ? "…" : fr ? "Rejeter" : "Reject"}</Button>
        </>
      }
    >
      {rejecting && <p>{fr ? rejecting.nameFr || rejecting.name : rejecting.name} · {rejecting.sellerName ?? "—"}</p>}
      <label className="block text-xs font-medium text-slate-500">
        {fr ? "Motif (obligatoire, vu par le vendeur)" : "Reason (required, shown to the seller)"}
        <textarea className="input-premium mt-1 w-full px-4 py-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <ErrorNote message={error} />
    </Modal>
  );

  return {
    busyId,
    approve: (c: CampaignRow) => send(c, "active"),
    end: (c: CampaignRow) => send(c, "ended"),
    reject: (c: CampaignRow) => {
      setRejecting(c);
      setReason("");
      setError(null);
    },
    modal,
  };
}
