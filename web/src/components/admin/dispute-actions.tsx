"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { RETURN_UNDECIDED, canMoveMoney, errMsg, useRole, type DisputeRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { resolutionText } from "@/lib/i18n-fields";

type Mode = "decide" | "approve" | "refuse" | "received" | "refund" | "norefund" | "reject" | null;
type Outcome = "refund_full" | "refund_partial" | "replacement" | "reject";

const OUTCOMES: { id: Outcome; en: string; fr: string; hintEn: string; hintFr: string; money: boolean }[] = [
  { id: "refund_full", en: "Refund in full", fr: "Rembourser en totalité", hintEn: "Everything still outstanding on the order goes back to the customer.", hintFr: "Tout ce qui reste à rembourser sur la commande retourne au client.", money: true },
  { id: "refund_partial", en: "Refund part", fr: "Rembourser en partie", hintEn: "Give back an amount you choose.", hintFr: "Rendez le montant de votre choix.", money: true },
  { id: "replacement", en: "Send a replacement", fr: "Envoyer un remplacement", hintEn: "Creates a replacement request for the seller; stock comes from the seller.", hintFr: "Crée une demande de remplacement chez le vendeur ; le stock vient du vendeur.", money: false },
  { id: "reject", en: "Reject the request", fr: "Rejeter la demande", hintEn: "Closes it without a refund. The customer sees your reason.", hintFr: "Clôt sans remboursement. Le client voit votre motif.", money: false },
];

/**
 * Admin actions on a return or a dispute. Every button calls the server; the row updates from the
 * `dispute:updated` push, the dialog shows the server's own error. Refund actions need `admin` or `admin_finance`.
 */
export function DisputeActions({ dispute }: { dispute: DisputeRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const rt = useRealtime();
  const role = useRole();
  const mayRefund = canMoveMoney(role);
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(mayRefund ? "refund_full" : "replacement");
  const [amount, setAmount] = useState("");
  const [refundTo, setRefundTo] = useState<"wallet" | "phone">("wallet");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState(true);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReturn = dispute.type === "return";
  const open = dispute.status === "open";
  const received = !!dispute.receivedAt || dispute.stage === "received";
  const undecided = !!dispute.stage && RETURN_UNDECIDED.includes(dispute.stage);

  // The lines a replacement can cover: the request's own lines, or the whole order.
  const order = rt.orders.find((o) => o.id === dispute.orderId);
  const lines = useMemo(() => {
    if (dispute.items && dispute.items.length) return dispute.items.map((i) => ({ id: i.orderItemId, name: fr && i.productNameFr ? i.productNameFr : i.productName, max: i.qty }));
    return (order?.items ?? []).map((i) => ({ id: i.id, name: fr && i.productNameFr ? i.productNameFr : i.productName, max: i.qty }));
  }, [dispute.items, order, fr]);

  function start(m: Mode) {
    setMode(m);
    setNote("");
    setError(null);
    setForce(false);
    setRestock(true);
    setAmount("");
    setRefundTo(dispute.refundTo === "phone" ? "phone" : "wallet");
    setQty({});
    setOutcome(mayRefund ? "refund_full" : "replacement");
  }

  async function submit() {
    if (!mode) return;
    setError(null);
    const reason = note.trim();
    // Same rules as the server, so the message shows before the round trip.
    if ((mode === "refuse" || (mode === "decide" && outcome === "reject")) && reason.length < 5) {
      setError(fr ? "Donnez au client un motif de refus (5 caractères minimum)." : "Give the customer a reason for refusing (at least 5 characters).");
      return;
    }
    if (mode === "decide" && outcome === "refund_partial" && !(Number(amount.replace(",", ".")) > 0)) {
      setError(fr ? "Saisissez le montant à rembourser." : "Enter the amount to refund.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "decide") {
        const items = outcome === "replacement" ? lines.filter((l) => (qty[l.id] ?? 0) > 0).map((l) => ({ itemId: l.id, qty: qty[l.id] })) : undefined;
        await socketClient.request("disputes:decide", {
          id: dispute.id,
          outcome,
          ...(reason ? { reason } : {}),
          ...(outcome === "refund_partial" ? { amountUsd: Number(amount.replace(",", ".")) } : {}),
          ...(outcome === "refund_full" || outcome === "refund_partial" ? { refundTo } : {}),
          ...(items && items.length ? { items } : {}),
        });
        toast(fr ? "Décision enregistrée" : "Decision saved", "success");
      } else if (mode === "approve" || mode === "refuse") {
        await socketClient.request("returns:decide", { id: dispute.id, approve: mode === "approve", ...(reason ? { reason } : {}) });
        toast(mode === "approve" ? (fr ? "Retour approuvé : la collecte est planifiée" : "Return approved: pickup is being planned") : fr ? "Retour refusé" : "Return refused", "success");
      } else if (mode === "received") {
        await socketClient.request("disputes:markReceived", { disputeId: dispute.id, restock });
        toast(fr ? "Marchandise marquée reçue" : "Goods marked received", "success");
      } else if (mode === "reject") {
        await socketClient.request("disputes:reject", { disputeId: dispute.id, resolution: reason || undefined });
        toast(fr ? "Demande rejetée" : "Request rejected", "success");
      } else {
        const refund = mode === "refund";
        await socketClient.request("disputes:resolve", {
          disputeId: dispute.id,
          refund,
          resolution: reason || undefined,
          ...(refund && force ? { force: true } : {}),
        });
        toast(refund ? (fr ? "Résolu : client remboursé" : "Resolved: customer refunded") : fr ? "Résolu sans remboursement" : "Resolved without refund", "success");
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
        {dispute.resolution ? ` : ${resolutionText(dispute, fr)}` : ""}
      </p>
    );
  }

  const title =
    mode === "decide" ? (fr ? "Décider du litige" : "Decide the dispute")
    : mode === "approve" ? (fr ? "Approuver le retour" : "Approve the return")
    : mode === "refuse" ? (fr ? "Refuser le retour" : "Refuse the return")
    : mode === "received" ? (fr ? "Marchandise reçue à l'entrepôt" : "Goods received at the warehouse")
    : mode === "refund" ? (fr ? "Rembourser les articles retournés" : "Refund the returned items")
    : mode === "norefund" ? (fr ? "Résoudre sans remboursement" : "Resolve without refund")
    : fr ? "Rejeter la demande" : "Reject the request";

  const noteLabel =
    mode === "refuse" || (mode === "decide" && outcome === "reject") || mode === "reject"
      ? fr ? "Motif (obligatoire, vu par le client)" : "Reason (required, shown to the customer)"
      : fr ? "Message (optionnel, vu par le client)" : "Message (optional, shown to the customer)";

  return (
    <div className="space-y-3">
      {isReturn && (
        <p className="text-sm text-slate-600">
          {undecided
            ? fr
              ? "Personne n'a encore décidé : le support Somba peut approuver (une collecte est planifiée chez le client) ou refuser avec un motif."
              : "Nobody has decided yet: Somba support can approve (a pickup from the customer is planned) or refuse with a reason."
            : dispute.stage === "approved" || dispute.stage === "pickup"
              ? fr ? "Accepté : l'entrepôt collecte chez le client puis scanne le colis ; le remboursement des articles retournés suit automatiquement." : "Accepted: the warehouse collects from the customer and scans the parcel in; the refund of the returned items follows automatically."
              : fr ? "Marchandise à l'entrepôt : le remboursement automatique a échoué ou la demande est antérieure au nouveau flux." : "The goods are at the warehouse: the automatic refund failed or the request pre-dates the new flow."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!isReturn && (
          <Button size="sm" onClick={() => start("decide")}>
            {fr ? "Décider…" : "Decide…"}
          </Button>
        )}
        {isReturn && undecided && (
          <>
            <Button size="sm" onClick={() => start("approve")}>{fr ? "Approuver le retour" : "Approve return"}</Button>
            <Button size="sm" variant="reject" onClick={() => start("refuse")}>{fr ? "Refuser" : "Refuse"}</Button>
          </>
        )}
        {isReturn && !received && !undecided && (
          <Button size="sm" variant="secondary" onClick={() => start("received")}>
            {fr ? "Marquer reçu à l'entrepôt" : "Mark goods received at warehouse"}
          </Button>
        )}
        {isReturn && received && mayRefund && (
          <Button size="sm" onClick={() => start("refund")}>{fr ? "Rembourser les articles retournés" : "Refund returned items"}</Button>
        )}
        {isReturn && received && !mayRefund && (
          <span className="self-center text-xs text-slate-500">{fr ? "Seuls l'admin ou la finance peuvent rembourser." : "Only admin or finance can refund."}</span>
        )}
        {isReturn && !undecided && (
          <Button size="sm" variant="secondary" onClick={() => start("norefund")}>{fr ? "Résoudre sans remboursement" : "Resolve without refund"}</Button>
        )}
        {role === "admin" && !undecided && (
          <Button size="sm" variant="reject" onClick={() => start("reject")}>{fr ? "Rejeter" : "Reject"}</Button>
        )}
      </div>

      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={title}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setMode(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant={mode === "reject" || mode === "refuse" || (mode === "decide" && outcome === "reject") ? "danger" : "primary"} onClick={submit} disabled={busy}>
              {busy ? "…" : fr ? "Confirmer" : "Confirm"}
            </Button>
          </>
        }
      >
        <p>{dispute.reference} · {dispute.orderReference} · {dispute.customerName}</p>

        {mode === "decide" && (
          <fieldset className="space-y-2">
            {OUTCOMES.map((o) => {
              const locked = o.money && !mayRefund;
              return (
                <label key={o.id} className={`flex items-start gap-2 rounded-lg border p-2.5 ${outcome === o.id ? "border-[var(--primary)] bg-red-50/40" : "border-slate-200"} ${locked ? "opacity-50" : ""}`}>
                  <input type="radio" name="outcome" className="mt-1" disabled={locked} checked={outcome === o.id} onChange={() => setOutcome(o.id)} />
                  <span>
                    <span className="font-medium text-slate-900">{fr ? o.fr : o.en}</span>
                    <span className="block text-xs text-slate-500">{locked ? (fr ? "Seuls l'admin ou la finance peuvent rembourser." : "Only admin or finance can refund.") : fr ? o.hintFr : o.hintEn}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {mode === "decide" && outcome === "refund_partial" && (
          <label className="block text-xs font-medium text-slate-500">
            {fr ? "Montant à rembourser (USD)" : "Amount to refund (USD)"}
            <input className="input-premium mt-1 w-full px-4 py-2 text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={order ? `≤ ${formatCurrency(order.totalUsd, locale)}` : "0.00"} />
          </label>
        )}

        {mode === "decide" && (outcome === "refund_full" || outcome === "refund_partial") && (
          <fieldset className="flex gap-4 text-sm">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Rembourser vers" : "Refund to"}</legend>
            <label className="flex items-center gap-2"><input type="radio" name="refund-to" checked={refundTo === "wallet"} onChange={() => setRefundTo("wallet")} />{fr ? "Portefeuille" : "Wallet"}</label>
            <label className="flex items-center gap-2"><input type="radio" name="refund-to" checked={refundTo === "phone"} onChange={() => setRefundTo("phone")} />{fr ? "Téléphone (pawaPay)" : "Phone (pawaPay)"}</label>
          </fieldset>
        )}

        {mode === "decide" && outcome === "replacement" && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Articles à remplacer" : "Items to replace"}</p>
            {lines.length === 0 ? (
              <p className="text-xs text-slate-500">{fr ? "Aucune ligne connue : tous les articles de la demande seront remplacés." : "No lines known: every item of the request is replaced."}</p>
            ) : (
              lines.map((l) => (
                <label key={l.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{l.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={l.max}
                    className="input-premium w-20 px-2 py-1 text-sm"
                    value={qty[l.id] ?? 0}
                    onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(l.max, Number(e.target.value) || 0)) })}
                  />
                </label>
              ))
            )}
            <p className="text-xs text-slate-400">{fr ? "Laissez 0 partout pour remplacer tous les articles." : "Leave 0 everywhere to replace every item."}</p>
          </div>
        )}

        {mode === "received" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            {fr ? "Remettre les articles en stock" : "Put the items back in stock"}
          </label>
        )}
        {mode === "approve" && (
          <p className="text-slate-600">{fr ? "Le client et le vendeur sont prévenus ; l'entrepôt de destination planifie la collecte chez le client." : "The customer and the seller are told; the destination warehouse plans the pickup from the customer."}</p>
        )}
        {mode === "refund" && (
          <>
            <p className="text-slate-600">{fr ? "Seuls les articles retournés sont remboursés (admin ou finance)." : "Only the returned items are refunded (admin or finance)."}</p>
            {role === "admin" && !received && (
              <label className="flex items-start gap-2 text-amber-800">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-1" />
                {fr ? "Forcer sans réception de la marchandise (super admin)" : "Force without goods received (super admin)"}
              </label>
            )}
          </>
        )}
        {mode !== "received" && (
          <label className="block text-xs font-medium text-slate-500">
            {noteLabel}
            <textarea className="input-premium mt-1 w-full px-4 py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        <ErrorNote message={error} />
      </Modal>
    </div>
  );
}
