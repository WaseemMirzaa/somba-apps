"use client";

/**
 * Shared types, labels and small hooks for the nearest-warehouse delivery model
 * (`docs/contracts/logistics.md`): hubs, legs ("tasks"), the desk, quotes.
 * Used by the warehouse desk, the admin routing views, the rider portal and the shop tracking page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { socketClient } from "@/lib/realtime/socket-client";
import { useRealtime } from "@/context/realtime-context";
import type { Area, AreaChain } from "@/lib/areas";
import { isSellerAreaRefusal, notServedFromAck, notServedFromError, type NotServedInfo } from "@/lib/not-served";
import { formatTransit } from "@/lib/quote-text";

export { formatTransit };

export type LegKind =
  | "pickup"
  | "transfer"
  | "delivery"
  | "return_pickup"
  | "return_transfer"
  | "return_to_seller"
  | "replacement_delivery";

export type LegStatus = "unassigned" | "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";

export type WarehouseTier = "operator" | "supervisor" | "manager";

export interface Endpoint {
  type: "seller" | "hub" | "customer";
  id: string | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  city?: string | null;
  phone?: string | null;
}

export interface LegItem {
  orderItemId?: string;
  productId?: string;
  name: string;
  nameFr?: string | null;
  qty: number;
  variant?: string | null;
}

export interface DeskFlags {
  assign: boolean;
  scanIn: boolean;
  scanOut: boolean;
}

/** One leg of a journey, exactly as `task:updated` and `logistics:queue` send it. */
export interface TaskView {
  id: string;
  orderId: string;
  orderReference: string;
  kind: LegKind;
  status: LegStatus;
  riderId: string | null;
  riderName: string | null;
  hubId: string | null;
  fromHubId: string | null;
  toHubId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  parentTaskId: string | null;
  disputeId: string | null;
  replacementId: string | null;
  exchangeId: string | null;
  attempts: number;
  codAmountUsd: number;
  address: string | null;
  pickupAddress: string | null;
  lat: number | null;
  lng: number | null;
  failureReason: string | null;
  readyAt: string | null;
  receivedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  from: Endpoint | null;
  to: Endpoint | null;
  fromHub: Endpoint | null;
  toHub: Endpoint | null;
  items: LegItem[];
  collectOld: boolean;
  needsCode: boolean;
  orderFlow: boolean;
  desk?: DeskFlags;
  /** Transfer runs and multi-hop routes (docs/contracts/areas.md): the run this leg travels in, and its place in the chain. */
  runId?: string | null;
  runReference?: string | null;
  /** 1-based hop of a transfer chain, and the number of hops; `finalHubId` is the end of the chain. */
  hop?: number | null;
  hops?: number | null;
  finalHubId?: string | null;
}

export interface Hub {
  id: string;
  name: string;
  city: string;
  country?: string | null;
  address?: string | null;
  capacity?: number;
  active: boolean;
  lat: number | null;
  lng: number | null;
  activeRiders?: number;
  staffCount?: number;
  placed?: boolean;
  /** Where the warehouse sits, and the areas it covers (docs/contracts/areas.md). */
  areaId?: string | null;
  area?: Area | null;
  coverage?: Area[];
  riders?: number;
  staff?: number;
}

/** A warehouse-to-warehouse link the drivers actually run (`lanes:list`). Both directions are separate rows. */
export interface Lane {
  id: string;
  fromHubId: string;
  fromHubName: string;
  toHubId: string;
  toHubName: string;
  transitHours: number;
  /** Replaces the transfer fee on this hop when set. */
  costUsd: number | null;
  active: boolean;
  /** The reverse lane exists with the same settings. */
  bidirectional: boolean;
}

export interface RouteHop {
  fromHubId: string;
  toHubId: string;
  transitHours: number;
  costUsd: number | null;
}

/** `routes:preview`: the chain of lanes between two warehouses. */
export interface RoutePreview {
  hops: RouteHop[];
  totalHours: number;
  direct: boolean;
}

export type RunStatus = "planned" | "dispatched" | "arrived" | "closed";

/** A transfer run: one trip, many parcels, from one warehouse to the next (`logistics:runs`). */
export interface Run {
  id: string;
  reference: string;
  fromHubId: string;
  fromHubName: string;
  toHubId: string;
  toHubName: string;
  riderId: string | null;
  riderName: string | null;
  status: RunStatus;
  taskIds: string[];
  count: number;
  receivedCount: number;
  missingCount: number;
  createdAt: string;
  dispatchedAt: string | null;
  arrivedAt: string | null;
  closedAt: string | null;
  /** True once the driver reported the run on the road (`rider:runStatus`); absent on an old server. */
  inTransit?: boolean;
  inTransitAt?: string | null;
  /** The parcels themselves, when the server sends them with the run. */
  tasks?: TaskView[];
}

/** `logistics:runProposals`: transfer legs waiting at my warehouse, grouped by the next warehouse. */
export interface RunProposal {
  toHubId: string;
  toHubName: string;
  taskIds: string[];
  count: number;
}

export interface DeskQueue {
  hubId: string;
  tasks: (TaskView & { desk: DeskFlags })[];
  counts: { byKind: Record<string, number>; byStatus: Record<string, number> };
}

export interface Custody {
  hubId: string;
  inbound: TaskView[];
  onHand: (TaskView & { since: string; waitingFor: string })[];
  outbound: TaskView[];
  counts: Record<string, number>;
}

export interface DeliveryQuote {
  feeUsd: number;
  deliveryUsd: number;
  transferUsd: number;
  distanceKm: number;
  destinationHubId: string | null;
  destinationHub: { id: string; name: string; city: string } | null;
  originHubIds: string[];
  transfer: boolean;
  pinned: boolean;
  fallback: null | "city" | "nearest" | "no_riders";
  /** Area routing (docs/contracts/areas.md): false = no active warehouse covers the address (the reply is then an error). */
  served?: boolean;
  destinationArea?: (Area & { chain?: AreaChain }) | null;
  destinationAreaChain?: AreaChain;
  destinationHubName?: string | null;
  origins?: QuoteOrigin[];
  /** Multi-hop routes (docs/contracts/areas.md): the transfers between warehouses and their transit time. */
  hops?: QuoteHop[];
  transitHours?: number;
  /** Days the lanes (or the inter-city allowance) add to the delivery estimate. */
  extraDays?: number;
  /** The warehouse that covers the area when another one stands in because it has no rider (see `fallback`). */
  coveringHubName?: string | null;
  /** Planned warehouses per seller: `[origin, …, destination]`. */
  routeBySeller?: Record<string, string[]>;
  interCity?: boolean;
  interCityDays?: number;
  /** A flat fee of the area replaced base + per km. */
  feeOverrideUsd?: number | null;
}

/** One seller's pickup: the warehouse that collects it and the hops it travels to the delivery warehouse. */
export interface QuoteOrigin {
  sellerId: string;
  hubId: string | null;
  hubName: string | null;
  areaName: string | null;
  /** English name of the seller's area (absent on an old server). */
  areaNameEn?: string | null;
  /** Why another warehouse than the covering one collects (`city` / `nearest` / `no_riders`). */
  fallback?: null | "city" | "nearest" | "no_riders";
  coveringHubId?: string | null;
  coveringHubName?: string | null;
  hops?: QuoteHop[];
  /** Hours this seller's parcels spend on the road between warehouses. */
  transitHours?: number;
}

/** One transfer between two warehouses on a route: its lane's transit time, and the lane's own cost (null = standard fee). */
export interface QuoteHop {
  fromHubId: string;
  fromHubName: string;
  toHubId: string;
  toHubName: string;
  transitHours?: number;
  costUsd?: number | null;
}

type L = { en: string; fr: string };
export const pickL = (l: L | undefined, fr: boolean, fallback = "") => (l ? (fr ? l.fr : l.en) : fallback);

export const LEG_KIND: Record<LegKind, L> = {
  pickup: { en: "Seller pickup", fr: "Collecte vendeur" },
  transfer: { en: "Transfer between warehouses", fr: "Transfert entre entrepôts" },
  delivery: { en: "Customer delivery", fr: "Livraison client" },
  return_pickup: { en: "Return pickup", fr: "Collecte de retour" },
  return_transfer: { en: "Return transfer", fr: "Transfert de retour" },
  return_to_seller: { en: "Return to seller", fr: "Retour au vendeur" },
  replacement_delivery: { en: "Replacement delivery", fr: "Livraison de remplacement" },
};

/** Short names for the desk tabs. */
export const LEG_KIND_SHORT: Record<LegKind, L> = {
  pickup: { en: "Pickups", fr: "Collectes" },
  transfer: { en: "Transfers", fr: "Transferts" },
  delivery: { en: "Deliveries", fr: "Livraisons" },
  return_pickup: { en: "Return pickups", fr: "Collectes de retour" },
  return_transfer: { en: "Return transfers", fr: "Transferts de retour" },
  return_to_seller: { en: "Back to seller", fr: "Retours vendeur" },
  replacement_delivery: { en: "Replacements", fr: "Remplacements" },
};

export const LEG_KINDS = Object.keys(LEG_KIND) as LegKind[];

export const LEG_STATUS: Record<LegStatus, L> = {
  unassigned: { en: "Unassigned", fr: "Non assignée" },
  assigned: { en: "Assigned", fr: "Assignée" },
  picked_up: { en: "Picked up", fr: "Collectée" },
  in_transit: { en: "On the way", fr: "En route" },
  delivered: { en: "Done", fr: "Terminée" },
  failed: { en: "Failed", fr: "Échouée" },
};

export function legStatusVariant(s: string): "success" | "warning" | "info" | "danger" | "default" {
  switch (s) {
    case "delivered":
      return "success";
    case "failed":
      return "danger";
    case "unassigned":
      return "warning";
    case "assigned":
    case "picked_up":
    case "in_transit":
      return "info";
    default:
      return "default";
  }
}

/** Legs that finish when hub staff scan the parcel in. */
export const HUB_BOUND: LegKind[] = ["pickup", "transfer", "return_pickup", "return_transfer"];
/** Legs that finish when the rider hands the parcel over. */
export const RIDER_FINISHED: LegKind[] = ["delivery", "replacement_delivery", "return_to_seller"];

export const isHubBound = (k: LegKind | string) => (HUB_BOUND as string[]).includes(k);

/** Legs that meet the customer face to face. */
export const meetsCustomer = (k: LegKind | string) =>
  k === "delivery" || k === "replacement_delivery" || k === "return_pickup";

export const TIER_LABEL: Record<WarehouseTier, L> = {
  operator: { en: "Operator", fr: "Opérateur" },
  supervisor: { en: "Supervisor", fr: "Superviseur" },
  manager: { en: "Manager", fr: "Responsable" },
};

export const tierLevel = (t: WarehouseTier | null | undefined) => (t === "manager" ? 3 : t === "supervisor" ? 2 : 1);

/** The name of an endpoint in one line: "Kinshasa Traders", "Limete Hub". */
export function endpointName(e: Endpoint | null | undefined, fr: boolean): string {
  if (!e) return "—";
  if (e.name) return e.name;
  return e.type === "customer" ? (fr ? "Client" : "Customer") : e.type === "seller" ? (fr ? "Vendeur" : "Seller") : fr ? "Entrepôt" : "Warehouse";
}

export function legRoute(t: Pick<TaskView, "from" | "to">, fr: boolean): string {
  return `${endpointName(t.from, fr)} → ${endpointName(t.to, fr)}`;
}

/** Lines of a leg's cargo as text ("2 × Sony headphones, 1 × MacBook"). */
export function legItemsText(items: LegItem[] | undefined, fr: boolean): string {
  return (items ?? []).map((i) => `${i.qty} × ${fr && i.nameFr ? i.nameFr : i.name}`).join(", ") || "—";
}

/** Customer-facing journey: ordered stages of an order built from its legs (order flow only). */
export function orderJourney(legs: TaskView[]): TaskView[] {
  const order: LegKind[] = ["pickup", "transfer", "delivery"];
  return legs
    .filter((l) => l.orderFlow !== false && order.includes(l.kind))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.createdAt.localeCompare(b.createdAt));
}

export function fmtDateTime(iso: string | null | undefined, fr: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(fr ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Google Maps "directions" deep link between two endpoints (opens in a new tab; no API key needed). */
export function mapsLink(from: Endpoint | null | undefined, to: Endpoint | null | undefined): string | null {
  const pt = (e: Endpoint | null | undefined) => (e && e.lat != null && e.lng != null ? `${e.lat},${e.lng}` : null);
  const a = pt(from);
  const b = pt(to);
  if (b && a) return `https://www.google.com/maps/dir/?api=1&origin=${a}&destination=${b}`;
  if (b) return `https://www.google.com/maps/dir/?api=1&destination=${b}`;
  return null;
}

// ───────────────────────────── hooks ─────────────────────────────

/** The hub directory (`hubs:list`), refreshed on `hub:updated`. */
export function useHubs(opts: { activeOnly?: boolean } = {}) {
  const rt = useRealtime();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeOnly = !!opts.activeOnly;
  const enabled = rt.status === "connected" && !!rt.user;

  const load = useCallback(async () => {
    try {
      const res = await socketClient.request<Hub[]>("hubs:list", { activeOnly });
      setHubs(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of an external resource
    void load();
    const s = socketClient.current;
    const h = () => void load();
    s?.on("hub:updated", h);
    return () => {
      s?.off("hub:updated", h);
    };
  }, [enabled, load]);

  const byId = useMemo(() => new Map(hubs.map((h) => [h.id, h])), [hubs]);
  return { hubs, byId, loading, error, reload: load };
}

/** The signed-in warehouse member's tier and hub, straight from the API (`me:get` / `ready.user`). */
export function useWarehouseSelf() {
  const rt = useRealtime();
  const u = rt.user as (typeof rt.user & { hubId?: string | null; warehouseTier?: WarehouseTier | null }) | null;
  const isAdmin = !!u?.role && u.role.startsWith("admin");
  const tier: WarehouseTier | null = isAdmin ? "manager" : (u?.warehouseTier ?? null);
  return {
    hubId: u?.hubId ?? null,
    tier,
    isAdmin,
    isStaff: u?.role === "warehouse_staff",
    canAssign: tierLevel(tier) >= 2,
    canManage: tierLevel(tier) >= 3,
  };
}

/** A live fee quote for the cart (`delivery:quote`); re-asked when the address or the cart sellers change. */
export function useDeliveryQuote(input: { addressId?: string | null; geo?: { lat: number; lng: number } | null; city?: string | null; lines: { productId: string; qty: number }[]; /** false = nothing to quote yet (no address): no request, no quote. */ enabled?: boolean }) {
  const rt = useRealtime();
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notServed, setNotServed] = useState<NotServedInfo | null>(null);
  // The address is served, but a seller in the cart picks up in an area nobody serves yet: nothing can be ordered from this cart.
  const [sellerBlocked, setSellerBlocked] = useState(false);
  const key = JSON.stringify([input.addressId ?? null, input.geo ?? null, input.city ?? null, input.lines.map((l) => [l.productId, l.qty])]);
  const ready = rt.status === "connected" && input.enabled !== false;

  useEffect(() => {
    if (!ready) return;
    const body = JSON.parse(key) as [string | null, { lat: number; lng: number } | null, string | null, [string, number][]];
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the spinner while the quote is fetched
    setLoading(true);
    socketClient
      .request<DeliveryQuote>("delivery:quote", {
        ...(body[0] ? { addressId: body[0] } : {}),
        ...(body[1] ? { geo: body[1] } : {}),
        ...(body[2] ? { city: body[2] } : {}),
        lines: body[3].map(([productId, qty]) => ({ productId, qty })),
      })
      .then((q) => {
        if (!alive) return;
        // `served: false` can also arrive as a normal reply; the usual refusal is an error (below).
        const refused = q.served === false;
        setQuote(refused ? null : q);
        setNotServed(
          refused
            ? (notServedFromAck(q) ?? { area: q.destinationArea?.name ?? "", areaEn: q.destinationArea?.nameEn ?? undefined, areaId: q.destinationArea?.id ?? null })
            : null,
        );
        setError(refused ? "Not served." : null);
        setSellerBlocked(false);
      })
      .catch((e) => {
        if (!alive) return;
        setQuote(null);
        setNotServed(notServedFromError(e));
        setSellerBlocked(isSellerAreaRefusal(e));
        setError(e instanceof Error ? e.message : "Request failed.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ready, key]);

  return input.enabled === false ? { quote: null, loading: false, error: null, notServed: null, sellerBlocked: false } : { quote, loading, error, notServed, sellerBlocked };
}

/** Pin on an address ({geo:{lat,lng}} or top-level lat/lng in the JSON shipping address). */
export function addressPin(a: { geo?: { lat: number; lng: number } | null } | null | undefined): { lat: number; lng: number } | null {
  return a?.geo && Number.isFinite(a.geo.lat) && Number.isFinite(a.geo.lng) ? { lat: a.geo.lat, lng: a.geo.lng } : null;
}
