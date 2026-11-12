"use client";

import { MapPinOff, Truck } from "lucide-react";
import { DualCurrency } from "@/components/ui/dual-currency";
import { formatTransit, type DeliveryQuote } from "@/lib/logistics";
import { areaName, notServedArea, notServedCityNames, notServedText, servedCityNames, useFootprint, type Area, type NotServedInfo } from "@/lib/areas";
import { englishAreaName } from "@/lib/not-served";
import { hopTransitText, originAreaName, originFallbackNote, platformFee, quoteFallbackNote, quoteRoutes } from "@/lib/quote-text";

export type NotServed = NotServedInfo | null;

/**
 * "We don't deliver to X yet" (EN/FR) with the cities we do serve. Shown instead of the fee wherever a quote is
 * refused for an unserved area; the checkout button stays off until the customer picks a served address.
 * The sentence is built here, in the UI language, from the refusal's structured fields (`areaName`, `areaNameEn`,
 * `servedCities`, docs/contracts/areas.md). An old server only sends the area's French name: the English name and the
 * cities then come from the geography the page already holds. `areaObj` (the address's own area) is the last resort.
 */
export function NotServedNotice({ notServed, areaObj, fr, children }: { notServed?: NotServed; areaObj?: Area | null; fr: boolean; children?: React.ReactNode }) {
  const footprint = useFootprint();
  let where = notServedArea(notServed, fr);
  // Old server: English readers still get the English name, looked up in the cached tree (no extra request).
  if (!fr && notServed && !notServed.areaEn && notServed.area) where = englishAreaName(footprint.root, notServed.area) ?? where;
  if (!where && areaObj) where = areaName(areaObj, fr);
  const cities = notServed?.servedCities ? notServedCityNames(notServed, fr) : servedCityNames(footprint, fr);
  return (
    <div role="alert" data-testid="not-served" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">{notServedText(where, cities, fr)}</p>
        <p className="text-xs">
          {fr
            ? "Choisissez ou ajoutez une adresse dans une zone desservie pour continuer."
            : "Choose or add an address in a served area to continue."}
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * "One seller in your cart cannot ship from their area yet": the address is served, but a store in the cart picks up in an area
 * nobody serves yet (docs/contracts/areas.md). Shown instead of the fee wherever the quote is refused for that reason; the checkout
 * button stays off until the cart no longer holds that store's items. The sentence is the server's own, in the UI language.
 */
export function SellerAreaNotice({ fr }: { fr: boolean }) {
  return (
    <div role="alert" data-testid="seller-not-served" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">{fr ? "Un vendeur de votre panier ne peut pas encore expédier depuis sa zone." : "One seller in your cart cannot ship from their area yet."}</p>
        <p className="text-xs">
          {fr
            ? "Retirez ses articles de votre panier pour continuer : la zone de collecte de sa boutique n'est pas encore desservie."
            : "Remove its items from your cart to continue: its store's pickup area is not served yet."}
        </p>
      </div>
    </div>
  );
}

/**
 * The ONE fee row of a totals list ("Platform commission": the sum of every fee the customer pays, delivery included):
 * "FREE", the amount, or why there is none yet. The customer never sees how it is made up.
 */
export function QuoteFeeValue({
  quote,
  loading,
  error,
  fr,
  missing,
  notServed,
}: {
  quote: DeliveryQuote | null;
  loading: boolean;
  error: string | null;
  fr: boolean;
  /** Shown when there is nothing to quote yet (no address). */
  missing?: string;
  /** The address is outside every served area: there is no fee to show. */
  notServed?: NotServed;
}) {
  if (notServed) return <span className="font-medium text-amber-800">{fr ? "Zone non desservie" : "Not served yet"}</span>;
  if (quote) return platformFee(quote) === 0 ? <span>{fr ? "GRATUIT" : "FREE"}</span> : <DualCurrency amount={platformFee(quote)} />;
  if (loading) return <span className="text-slate-500">{fr ? "Calcul…" : "Calculating…"}</span>;
  if (error) return <span className="text-red-600">{fr ? "Indisponible" : "Unavailable"}</span>;
  return <span className="text-slate-500">{missing ?? (fr ? "Choisissez une adresse" : "Choose an address")}</span>;
}

/**
 * How the parcel gets to the customer: the area, the warehouse, the route and the notes. It carries NO price: the fee is
 * the single "Platform commission" row of the totals next to it (the server sends customers no breakdown to show).
 */
export function DeliveryQuoteCard({
  quote,
  loading,
  error,
  fr,
  notServed,
}: {
  quote: DeliveryQuote | null;
  loading: boolean;
  error: string | null;
  fr: boolean;
  /** Kept so call sites need not change; the card shows no money. */
  locale?: string;
  notServed?: NotServed;
}) {
  if (notServed) return <NotServedNotice notServed={notServed} fr={fr} />;
  if (!quote && !loading && !error) return null;
  // Multi-hop routes: one per seller that travels (or one for the whole quote on an old server), hop by hop.
  const routes = quoteRoutes(quote, fr);
  const fallbackNote = quoteFallbackNote(quote, fr);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-slate-50/60 p-4 text-sm" data-testid="delivery-quote">
      <p className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
        <Truck className="h-4 w-4 text-[var(--primary)]" />
        {quote?.deliveryMode === "express"
          ? fr ? "Livraison express : directement depuis le vendeur" : "Express delivery: straight from the seller"
          : fr ? "Livraison depuis l'entrepôt de votre zone" : "Delivered from your area's warehouse"}
      </p>
      {loading && !quote && <p className="text-slate-500">{fr ? "Calcul de la commission de la plateforme…" : "Working out your platform commission…"}</p>}
      {error && !quote && <p role="alert" className="text-red-600">{error}</p>}
      {quote && (
        <div className="space-y-1.5">
          {quote.destinationArea && (
            <p className="text-slate-700" data-testid="quote-area">
              {fr ? "Zone de livraison" : "Delivery area"}: <span className="font-medium">{areaName(quote.destinationArea, fr)}</span>
            </p>
          )}
          {quote.deliveryMode === "express" && (
            <p className="text-violet-800" data-testid="quote-express">
              {fr ? "Un livreur apporte votre colis directement depuis la boutique du vendeur, sans passer par un entrepôt." : "A rider brings your parcel straight from the seller's store, with no warehouse in between."}
            </p>
          )}
          {quote.deliveryMode !== "express" && quote.destinationHub && (
            <p className="text-slate-700">
              {fr ? "Entrepôt de livraison" : "Delivery warehouse"}: <span className="font-medium">{quote.destinationHubName ?? quote.destinationHub.name}</span>
              {quote.destinationHub.city ? ` · ${quote.destinationHub.city}` : ""}
            </p>
          )}
          {quote.deliveryMode !== "express" && (quote.origins ?? []).length > 0 && (
            <div className="space-y-0.5 text-xs text-slate-500" data-testid="quote-origins">
              <p>
                {fr ? "Collecte chez le vendeur" : "Collected from the seller"}:{" "}
                {(quote.origins ?? []).map((o) => [originAreaName(o, fr), o.hubName].filter(Boolean).join(" → ")).filter(Boolean).join(" · ") || "—"}
              </p>
              {(quote.origins ?? []).map((o, i) => {
                const note = originFallbackNote(o, fr);
                return note ? <p key={o.sellerId ?? i} data-testid="origin-fallback" className="text-amber-800">{note}</p> : null;
              })}
            </div>
          )}
          {routes.length > 0 && (
            <div className="space-y-2 text-xs text-slate-500" data-testid="quote-hops">
              {routes.map((r, i) => (
                <div key={i} className="space-y-1">
                  <p>
                    {fr ? "Itinéraire entre entrepôts" : "Route between warehouses"}
                    {r.label ? ` (${r.label})` : ""}: {[r.hops[0].from, ...r.hops.map((h) => h.to)].join(" → ")} · {r.hops.length} {fr ? (r.hops.length > 1 ? "étapes" : "étape") : r.hops.length > 1 ? "hops" : "hop"}
                    {r.transitHours != null && r.transitHours > 0 ? ` · ~${formatTransit(r.transitHours, fr)}` : ""}
                  </p>
                  <ol className="space-y-0.5 pl-1">
                    {r.hops.map((h, k) => (
                      <li key={k} data-testid="quote-hop" className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md bg-white px-2 py-1 ring-1 ring-slate-100">
                        <span className="text-slate-700">
                          {fr ? `Étape ${k + 1}` : `Hop ${k + 1}`}: {h.from} → {h.to}
                        </span>
                        <span className="text-slate-600">{hopTransitText(h.transitHours, fr) ?? ""}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              {quote.interCity && (quote.interCityDays ?? 0) > 0 && (
                <p>{fr ? `Entre deux villes : environ ${quote.interCityDays} j de plus sont comptés dans la date estimée` : `Between two cities: about ${quote.interCityDays} extra days are included in the estimate`}</p>
              )}
              {quote.transitHours != null && quote.transitHours > 0 && (
                <p>{fr ? "Transit entre entrepôts, compté dans la date estimée" : "Transit between warehouses, included in the estimate"}: ~{formatTransit(quote.transitHours, fr)}</p>
              )}
            </div>
          )}
          {fallbackNote && (
            <p role="note" data-testid="quote-fallback" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {fallbackNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
