"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg, useRole, type DisputeRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

type Mode = "received" | "refund" | "norefund" | "reject" | null;

/**
 * Real dispute / return actions. Every button calls the server; the row itself
 * updates from the `dispute:updated` push, the dialog shows the server's error.
 */
export function DisputeActions({ dispute }: { dispute: DisputeRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const role = useRole();
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReturn = dispute.type === "return";
  const open = dispute.status === "open";
  const received = !!dispute.receivedAt;

  function start(m: Mode) {
    setMode(m);
    setNote("");
    setError(null);
    setForce(false);
    setRestock(true);
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "received") {
        await socketClient.request("disputes:markReceived", { disputeId: dispute.id, restock });
        toast(fr ? "Marchandise marquée reçue" : "Goods marked received", "success");
      } else if (mode === "reject") {
        await socketClient.request("disputes:reject", { disputeId: dispute.id, resolution: note.trim() || undefined });
        toast(fr ? "Demande rejetée" : "Request rejected", "success");
      } else {
        const refund = mode === "refund";
        await socketClient.request("disputes:resolve", {
          disputeId: dispute.id,
          refund,
          resolution: note.trim() || undefined,
          ...(refund && force ? { force: true } : {}),
        });
        toast(refund ? (fr ? "Résolu — client remboursé" : "Resolved — customer refunded") : fr ? "Résolu sans remboursement" : "Resolved without refund", "success");
      }
      setMode(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="text-sm text-slate-500">
        {fr ? "Dossier clos" : "Case closed"}
        {dispute.resolution ? ` — ${dispute.resolution}` : ""}
      </p>
    );
  }

  const title =
    mode === "received"
      ? fr ? "Marchandise reçue à l'entrepôt" : "Goods received at the warehouse"
      : mode === "refund"
        ? fr ? "Résoudre — rembourser le client" : "Resolve — refund the customer"
        : mode === "norefund"
          ? fr ? "Résoudre — sans remboursement" : "Resolve — no refund"
          : fr ? "Rejeter la demande" : "Reject the request";

  return (
    <div className="space-y-3">
      {isReturn && (
        <p className="text-sm text-slate-600">
          {fr
            ? "Règle du serveur : un retour ne peut être remboursé qu'après réception de la marchandise à l'entrepôt."
            : "Server rule: a return can only be refunded after the goods are marked received at the warehouse."}
          {received ? (fr ? " Marchandise déjà reçue." : " Goods already received.") : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {isReturn && !received && (
          <Button size="sm" variant="secondary" onClick={() => start("received")}>
            {fr ? "Marquer reçu à l'entrepôt" : "Mark goods received at warehouse"}
          </Button>
        )}
        <Button size="sm" onClick={() => start("refund")}>
          {fr ? "Résoudre — rembourser" : "Resolve — refund"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => start("norefund")}>
          {fr ? "Résoudre — sans remboursement" : "Resolve — no refund"}
        </Button>
        <Button size="sm" variant="reject" onClick={() => start("reject")}>
          {fr ? "Rejeter" : "Reject"}
        </Button>
      </div>

      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={title}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setMode(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant={mode === "reject" ? "danger" : "primary"} onClick={submit} disabled={busy}>
              {busy ? "…" : fr ? "Confirmer" : "Confirm"}
            </Button>
          </>
        }
      >
        <p>{dispute.reference} · {dispute.orderReference} · {dispute.customerName}</p>
        {mode === "received" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            {fr ? "Remettre les articles en stock" : "Put the items back in stock"}
          </label>
        )}
        {mode === "refund" && (
          <>
            <p className="text-slate-600">
              {fr ? "Le montant est remboursé sur le portefeuille du client (admin ou finance uniquement)." : "The amount is refunded to the customer's wallet (admin or finance only)."}
            </p>
            {isReturn && !received && role === "admin" && (
              <label className="flex items-start gap-2 text-amber-800">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-1" />
                {fr ? "Forcer sans réception de la marchandise (super admin)" : "Force without goods received (super admin)"}
              </label>
            )}
          </>
        )}
        {mode !== "received" && (
          <label className="block text-xs font-medium text-slate-500">
            {fr ? "Décision (visible par le client)" : "Resolution note (shown to the customer)"}
            <textarea className="input-premium mt-1 w-full px-4 py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        <ErrorNote message={error} />
      </Modal>
    </div>
  );
}
