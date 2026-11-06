"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errorMessage } from "@/lib/warehouse-live";
import { returnToSeller } from "@/lib/warehouse-ops";

/**
 * Confirm sending a stuck parcel back to its seller. One filled button (the decision); the way out is plain text.
 * The warehouse desk never touches money: the order stays as it is and the admins are told to decide about it.
 */
export function ReturnToSellerDialog({ parcel, onClose, onDone }: { parcel: { id: string; code: string; orderReference: string }; onClose: () => void; onDone: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await returnToSeller(parcel.id);
      toast(
        fr
          ? `${parcel.code} retourne chez le vendeur : ${r.legs.length} trajet${r.legs.length > 1 ? "s" : ""} de retour à confier à un livreur`
          : `${parcel.code} is going back to the seller: ${r.legs.length} return leg${r.legs.length === 1 ? "" : "s"} to give to a rider`,
      );
      onDone();
      onClose();
    } catch (e) {
      const m = errorMessage(e);
      setError(m);
      toast(m, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={fr ? "Retour au vendeur" : "Return to seller"}>
      <div className="card-premium w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-slate-900">{fr ? "Retourner ce colis au vendeur ?" : "Return this parcel to the seller?"}</h3>
        <p className="mt-3 text-sm text-slate-600">
          {fr
            ? `Le trajet de livraison de ${parcel.code} (commande ${parcel.orderReference}) est clos et un trajet de retour est créé pour chaque vendeur, à confier à un livreur.`
            : `The delivery of ${parcel.code} (order ${parcel.orderReference}) is closed and a return leg is created for each seller, to give to a rider.`}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {fr
            ? "La commande n'est ni annulée ni remboursée ici : les administrateurs et le client sont prévenus."
            : "The order is not cancelled or refunded here: the admins and the customer are told."}
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex items-center justify-end gap-4">
          <button type="button" onClick={onClose} disabled={busy} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {fr ? "Annuler" : "Cancel"}
          </button>
          <button type="button" onClick={() => void confirm()} disabled={busy} className="btn-primary min-w-[10rem] rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60">
            {busy ? "…" : fr ? "Retourner au vendeur" : "Return to seller"}
          </button>
        </div>
      </div>
    </div>
  );
}
