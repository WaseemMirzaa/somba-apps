"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { localizeApiError } from "@/lib/api-errors";
import { errorMessage } from "@/lib/warehouse-live";

/**
 * Confirm unlocking the rider's delivery code after too many wrong tries (`delivery:resetCode`). One filled button (the
 * decision); the way out is plain text. The result and any refusal are shown as a toast, the refusal also in the dialog.
 */
export function UnlockCodeDialog({
  parcel,
  onConfirm,
  onClose,
}: {
  parcel: { code: string; orderReference: string };
  /** Runs the unlock; rejects with the server's refusal. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      toast(fr ? `Code de livraison déverrouillé pour ${parcel.code}` : `Delivery code unlocked for ${parcel.code}`);
      onClose();
    } catch (e) {
      const m = localizeApiError(errorMessage(e), fr ? "fr" : "en");
      setError(m);
      toast(m, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={fr ? "Déverrouiller le code" : "Unlock code"}>
      <div className="card-premium w-full max-w-md p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">{fr ? "Déverrouiller ce code de livraison ?" : "Unlock this delivery code?"}</h3>
        <p className="mt-3 text-sm text-slate-600">
          {fr
            ? `Le livreur de ${parcel.code} (commande ${parcel.orderReference}) pourra de nouveau saisir le code du client. Déverrouillez seulement après avoir vérifié avec le client.`
            : `The rider of ${parcel.code} (order ${parcel.orderReference}) will be able to type the customer's code again. Unlock only after you have checked with the customer.`}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {fr ? "Le compteur d'erreurs est remis à zéro, l'action est journalisée et le livreur est prévenu." : "The wrong-code counter is reset, the action is logged and the rider is told."}
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <button type="button" onClick={onClose} disabled={busy} className="px-2 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            {fr ? "Annuler" : "Cancel"}
          </button>
          <button type="button" onClick={() => void confirm()} disabled={busy} className="btn-primary min-h-[2.75rem] rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60 sm:min-w-[10rem]">
            {busy ? "…" : fr ? "Déverrouiller le code" : "Unlock code"}
          </button>
        </div>
      </div>
    </div>
  );
}
