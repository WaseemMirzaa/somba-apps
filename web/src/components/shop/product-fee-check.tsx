"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LocateFixed } from "lucide-react";
import { useRealtime } from "@/context/realtime-context";
import { addressPin, useDeliveryQuote } from "@/lib/logistics";
import { NotServedNotice } from "@/components/shop/delivery-quote";
import { quoteFallbackNote } from "@/lib/quote-text";
import { formatCurrency } from "@/lib/utils";

/**
 * "What would delivery cost me?" on the product page: the server quotes it (the warehouse of the area + distance) for one of
 * the shopper's pinned addresses, or for the device location when nobody is signed in.
 */
export function ProductFeeCheck({ productId, fr, locale }: { productId: string; fr: boolean; locale: string }) {
  const rt = useRealtime();
  const [addressId, setAddressId] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const pinned = useMemo(() => rt.addresses.filter((a) => !!addressPin(a)), [rt.addresses]);
  const lines = useMemo(() => [{ productId, qty: 1 }], [productId]);
  const chosen = addressId || (geo ? "" : pinned.find((a) => a.isDefault)?.id ?? pinned[0]?.id ?? "");
  const { quote, loading, error, notServed } = useDeliveryQuote({
    addressId: chosen || null,
    geo: chosen ? null : geo,
    lines,
    enabled: !!chosen || !!geo,
  });

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setAddressId("");
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError(true);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2" data-testid="fee-check">
      <p className="text-sm font-medium text-slate-800">{fr ? "Frais de livraison jusqu'à chez vous" : "Delivery fee to your door"}</p>
      <div className="flex flex-wrap items-center gap-2">
        {pinned.length > 0 && (
          <select
            className="input-premium min-w-0 flex-1 px-3 py-2 text-sm"
            aria-label={fr ? "Adresse de livraison" : "Delivery address"}
            value={chosen}
            onChange={(e) => {
              setGeo(null);
              setAddressId(e.target.value);
            }}
          >
            {pinned.map((a) => (
              <option key={a.id} value={a.id}>{a.label} — {[a.commune, a.city].filter(Boolean).join(", ")}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <LocateFixed className="h-3.5 w-3.5" />
          {locating ? (fr ? "Localisation…" : "Locating…") : fr ? "Ma position" : "Use my location"}
        </button>
      </div>
      {pinned.length === 0 && !geo && rt.user && (
        <p className="text-xs text-slate-500">
          {fr ? "Aucune adresse épinglée. " : "No pinned address yet. "}
          <Link href="/shop/account/addresses" className="text-[var(--primary)] underline">{fr ? "Ajouter une adresse" : "Add an address"}</Link>
        </p>
      )}
      {geoError && <p role="alert" className="text-xs text-red-700">{fr ? "Position indisponible : autorisez la localisation ou choisissez une adresse." : "Location unavailable: allow location access or choose an address."}</p>}
      {loading && !quote && <p className="text-xs text-slate-500">{fr ? "Calcul…" : "Calculating…"}</p>}
      {notServed && <NotServedNotice notServed={notServed} fr={fr} />}
      {error && !quote && !notServed && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {quote && (
        <p className="text-xs text-emerald-800" data-testid="fee-check-result">
          {quote.feeUsd === 0 ? (fr ? "Livraison gratuite" : "Free delivery") : formatCurrency(quote.feeUsd, locale)}
          {quote.destinationHub ? ` · ${fr ? "depuis" : "from"} ${quote.destinationHubName ?? quote.destinationHub.name}` : ""}
          {quote.pinned && quote.distanceKm > 0 ? ` · ${quote.distanceKm.toLocaleString(fr ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 })} km` : ""}
          {quote.transfer ? (fr ? " (transfert entre entrepôts inclus)" : " (includes a warehouse transfer)") : ""}
        </p>
      )}
      {quote && quoteFallbackNote(quote, fr) && (
        <p role="note" data-testid="fee-check-fallback" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{quoteFallbackNote(quote, fr)}</p>
      )}
    </div>
  );
}
