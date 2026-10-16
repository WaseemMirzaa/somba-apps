"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";

/** The two store fields the server keeps: name and pickup address (`sellers:update`). */
export function StoreProfileForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore } = useSellerData();
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seller) return;
    /* eslint-disable react-hooks/set-state-in-effect -- fill the form from the loaded store */
    setName(seller.name);
    setPickup(seller.pickupAddress ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [seller]);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 100;
  const pickupOk = pickup.trim() === "" || (pickup.trim().length >= 5 && pickup.trim().length <= 300);
  const dirty = !!seller && (name.trim() !== seller.name || pickup.trim() !== (seller.pickupAddress ?? ""));

  async function save() {
    if (!nameOk || !pickupOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateStore({ name: name.trim(), pickupAddress: pickup.trim() === "" ? null : pickup.trim() });
      toast(fr ? "Boutique enregistrée" : "Store saved");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Nom de la boutique" : "Store name"}</label>
        <input className="input-premium w-full px-4 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        {!nameOk && <p className="mt-1 text-xs text-red-600">{fr ? "2 à 100 caractères." : "2 to 100 characters."}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Adresse de collecte" : "Pickup address"}</label>
        <textarea className="input-premium w-full px-4 py-2 text-sm" rows={2} value={pickup} onChange={(e) => setPickup(e.target.value)} maxLength={300} placeholder={fr ? "Où les livreurs récupèrent vos colis (rue, quartier, commune, ville)" : "Where riders collect your parcels (street, area, commune, city)"} />
        {!pickupOk && <p className="mt-1 text-xs text-red-600">{fr ? "5 à 300 caractères, ou laissez vide." : "5 to 300 characters, or leave empty."}</p>}
        {!pickup.trim() && <p className="mt-1 text-xs text-amber-700">{fr ? "Sans adresse de collecte, les livreurs ne savent pas où passer." : "Without a pickup address riders do not know where to collect."}</p>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button onClick={() => void save()} disabled={!seller || !nameOk || !pickupOk || !dirty || busy}>
        {busy ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer" : "Save"}
      </Button>
    </div>
  );
}
