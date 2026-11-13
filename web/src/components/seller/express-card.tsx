"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useStoreGate } from "@/lib/seller";
import { useAfterSaleAccess } from "@/lib/seller-aftersale";

/**
 * Express delivery as the store sees it: READ-ONLY (docs/contracts/admin-controls.md §4 and §13). KOMORIKO switches it per store;
 * the card only shows where it stands, while admin has the Express section on for this store. Nothing here changes it.
 */
export function ExpressCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { access } = useAfterSaleAccess();
  const { seller } = useStoreGate();
  if (!access.express || !seller) return null;
  const on = seller.expressDelivery === true;
  const pinned = seller.pickupLat != null && seller.pickupLng != null;

  return (
    <div className="card-premium p-6" data-testid="express-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Zap className="h-5 w-5 text-amber-500" aria-hidden="true" />
        <h2 className="font-semibold">{fr ? "Livraison express" : "Express delivery"}</h2>
        <Badge variant={on ? "success" : "default"}>{on ? (fr ? "Activée" : "On") : fr ? "Désactivée" : "Off"}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        {fr
          ? "Quand votre boutique et le client sont dans la même commune, un livreur peut aller directement de votre boutique chez le client."
          : "When your store and the customer are in the same commune, a rider can go straight from your store to the customer."}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-800">
        {fr ? "Géré par KOMORIKO. Contactez le support pour le modifier." : "Managed by KOMORIKO. Contact support to change it."}{" "}
        <Link href="/seller/support" className="text-[var(--primary)] hover:underline">
          {fr ? "Contacter le support" : "Contact support"}
        </Link>
      </p>
      {!on && !pinned && (
        <p role="note" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {fr
            ? "Pour activer l'express, votre point de collecte doit être placé sur la carte (Informations de la boutique ci-dessus)."
            : "To turn express on, your pickup location must be pinned on the map (Store details above)."}
        </p>
      )}
    </div>
  );
}
