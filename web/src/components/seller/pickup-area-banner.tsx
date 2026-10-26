"use client";

import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { areaName, chainText, notServedText, servedCityNames, useFootprint } from "@/lib/areas";
import { useSellerData } from "@/lib/seller";

/**
 * Shown while the store's pickup area is outside every served area: the store can be prepared, but sales open only
 * when a warehouse covers the area (docs/contracts/areas.md). Disappears at once when coverage changes.
 */
export function PickupAreaBanner({ withLink = false }: { withLink?: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { seller } = useSellerData();
  const footprint = useFootprint();
  if (!seller || seller.pickupServed !== false) return null;
  const chain = seller.pickupAreaChain ?? [];
  const deepest = chain[chain.length - 1];
  return (
    <div role="alert" data-testid="pickup-not-served" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="flex items-start gap-2">
        <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>
            {fr
              ? "Votre zone de collecte n'est pas encore desservie. Vous pouvez préparer votre boutique ; les ventes ouvriront dès que nous livrerons chez vous."
              : "Your pickup area is not served yet. You can prepare your store; sales open when we deliver there."}
          </strong>{" "}
          {deepest ? <span className="text-xs">{chainText(chain, fr, { skipLevels: ["district"] })}. </span> : null}
          <span className="text-xs">{notServedText(deepest ? areaName(deepest, fr) : null, servedCityNames(footprint, fr), fr)}</span>
        </span>
      </span>
      {withLink && (
        <Link href="/seller/settings" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">
          {fr ? "Modifier le lieu" : "Change the location"}
        </Link>
      )}
    </div>
  );
}
