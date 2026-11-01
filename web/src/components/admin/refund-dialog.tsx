"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useToast } from "@/context/toast-context";
import { errMsg, type PaymentCapabilities } from "@/lib/admin-live";
import { useSocketQuery } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { refundFigures, refundNote } from "@/lib/refunds";

const MOBILE_MONEY = new Set(["airtel_money", "orange_money", "vodacom_mpesa"]);

export interface RefundTarget {
  orderId: string;
  orderReference: string | null;
  amountUsd: number;
  method: string;
  /** The payment's status and what it already gave back: the refund is limited to what is left. */
  status?: string;
  refundedUsd?: number | null;
  refundableUsd?: number | null;
}

/**
 * Refund an order (`orders:refund`): to the customer's wallet (instant), or — for a mobile-money payment while
 * pawaPay is connected — back to the phone that paid. It refunds what is LEFT on the payment (amount paid - already
 * refunded, returns and seller cancellations included): the dialog says how much, and the server refuses any more.
 */
export function RefundDialog({
  target,
  fr,
  locale,
  onClose,
  onDone,
}: {
  target: RefundTarget | null;
  fr: boolean;
  locale: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const caps = useSocketQuery<PaymentCapabilities>("payments:provider");
  const [to, setTo] = useState<"wallet" | "phone">("wallet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneOk = !!target && MOBILE_MONEY.has(target.method) && !!caps.data?.phoneRefunds;
  const figures = target ? refundFigures({ amountUsd: target.amountUsd, status: target.status ?? "succeeded", refundedUsd: target.refundedUsd, refundableUsd: target.refundableUsd }) : null;
  const note = target ? refundNote({ amountUsd: target.amountUsd, status: target.status ?? "succeeded", refundedUsd: target.refundedUsd, refundableUsd: target.refundableUsd }, fr, (n) => formatCurrency(n, locale)) : null;
  const left = figures?.refundableUsd ?? 0;

  function close() {
    if (busy) return;
    setError(null);
    setTo("wallet");
    onClose();
  }

  async function refund() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await socketClient.request("orders:refund", { orderId: target.orderId, toWallet: to === "wallet" || !phoneOk });
      toast(
        to === "phone" && phoneOk
          ? fr ? `Remboursement de ${target.orderReference} envoyé au téléphone` : `Refund for ${target.orderReference} sent to the phone`
          : fr ? `Commande ${target.orderReference} remboursée` : `Order ${target.orderReference} refunded`,
        "success",
      );
      setTo("wallet");
      onDone?.();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={fr ? "Confirmer le remboursement" : "Confirm refund"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button variant="danger" size="sm" onClick={() => void refund()} disabled={busy || left < 0.01}>
            {busy ? "…" : left >= 0.01 ? `${fr ? "Rembourser" : "Refund"} ${formatCurrency(left, locale)}` : fr ? "Rembourser" : "Refund"}
          </Button>
        </>
      }
    >
      {target && (
        <>
          <p>
            {target.orderReference} · {fr ? "payé" : "paid"} {formatCurrency(target.amountUsd, locale)} · {paymentMethodLabel(target.method, fr)}
          </p>
          {note && (
            <p data-testid="refund-limit" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Rembourser vers" : "Refund to"}</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="refund-to" className="mt-1" checked={to === "wallet" || !phoneOk} onChange={() => setTo("wallet")} />
              <span>
                <span className="font-medium text-slate-900">{fr ? "Portefeuille du client" : "Customer's wallet"}</span>
                <span className="block text-xs text-slate-500">{fr ? "Immédiat, utilisable pour un prochain achat." : "Instant, usable on the next purchase."}</span>
              </span>
            </label>
            <label className={`flex items-start gap-2 ${phoneOk ? "" : "opacity-50"}`}>
              <input type="radio" name="refund-to" className="mt-1" disabled={!phoneOk} checked={to === "phone" && phoneOk} onChange={() => setTo("phone")} />
              <span>
                <span className="font-medium text-slate-900">{fr ? "Téléphone qui a payé (pawaPay)" : "The phone that paid (pawaPay)"}</span>
                <span className="block text-xs text-slate-500">
                  {phoneOk
                    ? fr ? "Renvoyé sur le numéro mobile money. S'il échoue, le montant va au portefeuille." : "Sent back to the mobile-money number. If it fails, the amount goes to the wallet."
                    : !MOBILE_MONEY.has(target.method)
                      ? fr ? "Seulement pour un paiement mobile money." : "Only for a mobile-money payment."
                      : fr ? "Disponible une fois pawaPay connecté." : "Available once pawaPay is connected."}
                </span>
              </span>
            </label>
          </fieldset>
          <p className="text-xs text-slate-500">
            {fr
              ? "Seul le reste du paiement est remboursé : ce qui l'a déjà été (retour, annulation par un vendeur) ne l'est jamais deux fois."
              : "Only what is left of the payment is refunded: what already went back (a return, a seller's cancellation) is never paid twice."}
          </p>
          <ErrorNote message={error} />
        </>
      )}
    </Modal>
  );
}
