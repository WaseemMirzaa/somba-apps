"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { InfoGrid } from "@/components/ui/info-grid";
import { SectionError } from "@/components/admin/query-state";
import { StepList } from "@/components/shop/step-list";
import { hopRouteSteps } from "@/lib/order-journey";
import { runBadgeText } from "@/lib/warehouse-runs";
import { areaName, chainText } from "@/lib/areas";
import type { TrackingLegView } from "@/lib/realtime/types";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { errMsg, useServerList } from "@/lib/admin-live";
import {
  LEG_KIND,
  LEG_STATUS,
  fmtDateTime,
  legStatusVariant,
  pickL,
  useHubs,
  type DeliveryQuote,
  type Hub,
  type LegItem,
} from "@/lib/logistics";
import type { Order, Seller } from "@/lib/realtime/types";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

interface RiderRow {
  id: string;
  name: string;
}

function pinOf(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as { geo?: { lat: number; lng: number }; lat?: number; lng?: number };
    const lat = a.geo?.lat ?? a.lat;
    const lng = a.geo?.lng ?? a.lng;
    return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function directions(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): string | null {
  if (!a || !b) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}`;
}

/** "Hop 1/2 · " in front of a transfer leg of a multi-hop route ("Étape 1/2 · " in French). */
function hopPrefix(l: { kind?: string; hop?: number | null; hops?: number | null }, fr: boolean): string {
  if (l.kind !== "transfer" || !l.hops || l.hops < 2 || !l.hop) return "";
  return `${fr ? "Étape" : "Hop"} ${l.hop}/${l.hops} · `;
}

function parseItems(raw: unknown): LegItem[] {
  if (Array.isArray(raw)) return raw as LegItem[];
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as LegItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * How an order travels: the origin warehouse of each seller, the destination warehouse, every leg
 * (pickup, transfer, delivery...) with its rider and times, and the fee quoted on today's rates.
 * Legs come from the live feed (`delivery:list` + `task:updated`), so the view moves as the warehouses scan.
 */
export function OrderRouting({ order, sellers }: { order: Order; sellers: Seller[] }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const hubs = useHubs();
  const riders = useServerList<RiderRow>("warehouse:riders");
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const hubById = hubs.byId;
  const sellerName = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  const riderName = useMemo(() => new Map(riders.items.map((r) => [r.id, r.name])), [riders.items]);
  const legs = useMemo(
    () =>
      rt.deliveries
        .filter((d) => d.orderId === order.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [rt.deliveries, order.id],
  );
  const pin = pinOf(order.shippingAddress);
  const lineKey = JSON.stringify(order.items.map((i) => [i.productId, i.qty]));

  // The route on today's rates (the order itself keeps the fee it was charged).
  useEffect(() => {
    if (rt.status !== "connected" || !pin) return;
    let live = true;
    socketClient
      .request<DeliveryQuote>("delivery:quote", {
        geo: pin,
        lines: (JSON.parse(lineKey) as [string, number][]).map(([productId, qty]) => ({ productId, qty })),
      })
      .then((q) => live && setQuote(q))
      .catch((e) => live && setQuoteError(errMsg(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.status, lineKey, pin?.lat, pin?.lng]);

  const hubName = (id: string | null | undefined) => (id ? (hubById.get(id)?.name ?? (fr ? "Entrepôt inconnu" : "Unknown warehouse")) : "—");
  const hubPos = (id: string | null | undefined): { lat: number; lng: number } | null => {
    const h: Hub | undefined = id ? hubById.get(id) : undefined;
    return h && h.lat != null && h.lng != null ? { lat: h.lat, lng: h.lng } : null;
  };

  const origins = order.originHubIds ?? [];
  const destination = order.destinationHubId ?? null;
  const transfer = origins.some((o) => o && o !== destination);

  const rows = legs.map((l) => {
    const raw = l as unknown as Record<string, unknown>;
    const from = l.fromHub?.name ?? l.from?.name ?? (l.kind === "pickup" ? (l.sellerName ?? sellerName.get(l.sellerId ?? "") ?? (fr ? "Vendeur" : "Seller")) : hubName(l.fromHubId));
    const to =
      l.to?.name ??
      (l.kind === "delivery" || l.kind === "replacement_delivery" ? (order.customerName || (fr ? "Client" : "Customer")) : l.kind === "return_to_seller" ? (fr ? "Vendeur" : "Seller") : hubName(l.toHubId));
    const fromPos = l.fromHub?.lat != null ? { lat: l.fromHub.lat as number, lng: l.fromHub.lng as number } : hubPos(l.fromHubId);
    const toPos = l.kind === "delivery" || l.kind === "replacement_delivery" ? pin : l.toHub?.lat != null ? { lat: l.toHub.lat as number, lng: l.toHub.lng as number } : hubPos(l.toHubId);
    return {
      id: l.id,
      kind: l.kind ?? "delivery",
      run: runBadgeText(l, fr),
      status: l.status,
      route: `${hopPrefix(l, fr)}${from} → ${to}`,
      managedBy: hubName(l.hubId),
      rider: (raw.riderName as string | null) ?? (l.riderId ? (riderName.get(l.riderId) ?? (fr ? "Livreur" : "Rider")) : null),
      items: (l.items && l.items.length ? l.items : parseItems(raw.itemsJson)).map((i) => `${i.qty} × ${fr && i.nameFr ? i.nameFr : i.name}`).join(", "),
      attempts: (raw.attempts as number) ?? 1,
      failureReason: (raw.failureReason as string | null) ?? null,
      createdAt: l.createdAt,
      doneAt: (raw.deliveredAt as string | null) ?? (raw.receivedAt as string | null) ?? null,
      link: directions(fromPos, toPos),
    };
  });

  // Each hop of a multi-hop route is its own transfer leg with its own driver.
  const hopLegs: TrackingLegView[] = legs
    .filter((l) => l.kind === "transfer")
    .map((l) => ({
      id: l.id,
      kind: "transfer",
      status: l.status,
      hop: l.hop ?? null,
      hops: l.hops ?? null,
      fromHub: l.fromHubId ? { id: l.fromHubId, name: l.fromHub?.name ?? hubName(l.fromHubId) } : null,
      toHub: l.toHubId ? { id: l.toHubId, name: l.toHub?.name ?? hubName(l.toHubId) } : null,
      riderFirstName: (l.riderName ?? (l.riderId ? riderName.get(l.riderId) : null) ?? "").split(" ")[0] || null,
      runReference: l.runReference ?? null,
      createdAt: l.createdAt,
      deliveredAt: l.deliveredAt,
      pickedUpAt: l.pickedUpAt,
      receivedAt: l.receivedAt,
    }));
  const hopSteps = hopRouteSteps(hopLegs, hubName, destination, fr);
  const planned = Object.entries(order.routeBySeller ?? {}).filter(([, route]) => route.length > 1);

  return (
    <div className="space-y-4">
      {hubs.error && <SectionError message={hubs.error} onRetry={hubs.reload} />}
      <InfoGrid
        columns={3}
        items={[
          {
            label: fr ? "Entrepôt de destination" : "Destination warehouse",
            value: destination ? (
              <Link href={`/admin/warehouses/${destination}`} className="text-[var(--primary)] hover:underline">{hubName(destination)}</Link>
            ) : (
              "—"
            ),
          },
          {
            label: fr ? "Zone de livraison" : "Delivery area",
            value: quote?.destinationAreaChain?.length ? chainText(quote.destinationAreaChain, fr, { skipLevels: ["district"] }) : quote?.destinationArea ? areaName(quote.destinationArea, fr) : "—",
          },
          {
            label: fr ? "Entrepôts d'origine (par vendeur)" : "Origin warehouses (per seller)",
            value: origins.length ? (
              <span className="space-y-0.5">
                {origins.map((o, i) => (
                  <span key={`${o}-${i}`} className="block">
                    {o ? <Link href={`/admin/warehouses/${o}`} className="text-[var(--primary)] hover:underline">{hubName(o)}</Link> : "—"}
                  </span>
                ))}
              </span>
            ) : (
              "—"
            ),
          },
          {
            label: fr ? "Transfert entre entrepôts" : "Transfer between warehouses",
            value: origins.length ? (transfer ? (fr ? "Oui" : "Yes") : fr ? "Non" : "No") : "—",
          },
          {
            label: fr ? "Itinéraire prévu entre entrepôts" : "Planned route between warehouses",
            value: planned.length ? (
              <span className="space-y-0.5" data-testid="planned-route">
                {planned.map(([sellerId, route]) => (
                  <span key={sellerId} className="block">
                    {sellerName.get(sellerId) ? `${sellerName.get(sellerId)} : ` : ""}
                    {route.map((id) => hubName(id)).join(" → ")}
                  </span>
                ))}
              </span>
            ) : transfer ? (
              fr ? "Transfert direct" : "Direct transfer"
            ) : (
              "—"
            ),
            full: true,
          },
          { label: fr ? "Point de livraison" : "Delivery pin", value: pin ? `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}` : <Badge variant="warning">{fr ? "Adresse sans point" : "Address without a pin"}</Badge> },
          { label: fr ? "Frais facturés" : "Fee charged", value: formatCurrency(order.deliveryFeeUsd, locale) },
          {
            label: fr ? "Distance (tarif actuel)" : "Distance (today's rates)",
            value: quote ? `${quote.distanceKm.toFixed(1)} km` : quoteError ? "—" : pin ? "…" : "—",
          },
        ]}
      />
      {quote && (
        <p className="text-xs text-slate-500">
          {fr ? "Sur les tarifs actuels : " : "On today's rates: "}
          {formatCurrency(quote.deliveryUsd, locale)} {fr ? "livraison" : "delivery"}
          {quote.transfer ? ` + ${formatCurrency(quote.transferUsd, locale)} ${fr ? "transfert" : "transfer"}` : ""} = {formatCurrency(quote.feeUsd, locale)}
        </p>
      )}
      {quote?.fallback && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {quote.fallback === "city"
            ? fr ? `${quote.coveringHubName ?? "L'entrepôt de la zone"} n'a aucun livreur actif : un entrepôt de la même ville a pris le relais.` : `${quote.coveringHubName ?? "The covering warehouse"} has no active rider: a warehouse of the same city stood in.`
            : quote.fallback === "no_riders"
              ? fr ? "Aucun entrepôt proche n'a de livreur : la commande reste sur l'entrepôt de la zone et les admins sont alertés." : "No warehouse nearby has a rider: the order stays on the covering warehouse and admins are alerted."
              : fr ? `${quote.coveringHubName ?? "L'entrepôt de la zone"} n'a aucun livreur actif : l'entrepôt de la province le plus proche a pris le relais.` : `${quote.coveringHubName ?? "The covering warehouse"} has no active rider: the nearest warehouse of the province stood in.`}
        </p>
      )}

      {hopSteps.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="route-hops">
          <p className="mb-3 text-sm font-semibold text-slate-800">{fr ? "Étapes entre entrepôts (un chauffeur par étape)" : "Hops between warehouses (one driver per hop)"}</p>
          <StepList steps={hopSteps} fr={fr} />
        </div>
      )}

      <DataTable
        emptyMessage={fr ? "Aucun trajet créé pour l'instant : les collectes démarrent quand la commande est payée." : "No legs yet: pickups start once the order is paid."}
        columns={[
          { key: "kind", label: fr ? "Trajet" : "Leg", render: (r) => (
            <span className="font-medium text-slate-800">
              {pickL(LEG_KIND[r.kind as keyof typeof LEG_KIND], fr, String(r.kind))}
              {r.run ? <><br /><span className="text-xs font-normal text-violet-700">{String(r.run)}</span></> : null}
            </span>
          ) },
          { key: "route", label: fr ? "De → vers" : "From → to" },
          { key: "managedBy", label: fr ? "Géré par" : "Managed by" },
          { key: "rider", label: fr ? "Livreur / chauffeur" : "Rider / driver", render: (r) => (r.rider ? String(r.rider) : <span className="text-slate-400">{fr ? "Non assigné" : "Unassigned"}</span>) },
          { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={legStatusVariant(String(r.status))}>{pickL(LEG_STATUS[r.status as keyof typeof LEG_STATUS], fr, String(r.status))}</Badge> },
          { key: "items", label: fr ? "Contenu" : "Cargo", hideOnMobile: true },
          {
            key: "times",
            label: fr ? "Dates" : "Times",
            render: (r) => (
              <span className="text-xs text-slate-500">
                {fmtDateTime(String(r.createdAt), fr)}
                {r.doneAt ? <><br />{fr ? "Terminé" : "Done"}: {fmtDateTime(String(r.doneAt), fr)}</> : null}
                {Number(r.attempts) > 1 ? <><br />{fr ? "Tentatives" : "Attempts"}: {String(r.attempts)}</> : null}
                {r.failureReason ? <><br /><span className="text-red-600">{String(r.failureReason)}</span></> : null}
              </span>
            ),
          },
          {
            key: "actions",
            label: "",
            render: (r) =>
              r.link ? (
                <a href={String(r.link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" />{fr ? "Itinéraire" : "Route"}
                </a>
              ) : null,
          },
        ]}
        data={rows as unknown as Record<string, unknown>[]}
      />
      <Link href="/admin/fulfillment/desk" className="inline-block text-sm font-medium text-[var(--primary)] hover:underline">
        {fr ? "Ouvrir le bureau de l'entrepôt pour assigner et scanner →" : "Open the warehouse desk to assign and scan →"}
      </Link>
    </div>
  );
}
