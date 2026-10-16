"use client";

import { useCallback, useMemo } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { DeliveryTask, Order, Product } from "@/lib/realtime/types";
import { useOpsQuery, type WarehouseRider, type InventoryRow } from "@/lib/warehouse-live";

/**
 * Live warehouse data layer. A "parcel" is a delivery task joined with its
 * order. The hub stage is driven by the hub's own `receivedAt` scan, not by the
 * rider's progress:
 *
 *   unassigned & no receivedAt  → inbound      (waiting to be scanned in)
 *   unassigned & receivedAt     → received     (at the hub, waiting for a rider)
 *   assigned                    → sorting      (a rider is attached)
 *   picked_up                   → ready
 *   in_transit                  → dispatched
 *   delivered                   → delivered
 *   failed                      → exception
 */

export type ParcelStage =
  | "inbound"
  | "received"
  | "sorting"
  | "ready"
  | "dispatched"
  | "delivered"
  | "exception";

/** The delivery task as the server sends it today (fields added after the shared type was written). */
export type LiveTask = DeliveryTask & {
  attempts?: number;
  failureReason?: string | null;
  pickupAddress?: string | null;
  readyAt?: string | null;
  receivedAt?: string | null;
  address?: string | null;
};

export const STAGES: ParcelStage[] = [
  "inbound",
  "received",
  "sorting",
  "ready",
  "dispatched",
  "delivered",
  "exception",
];

export const STAGE_LABEL: Record<ParcelStage, { en: string; fr: string }> = {
  inbound: { en: "Inbound", fr: "Entrant" },
  received: { en: "Received", fr: "Reçu" },
  sorting: { en: "Sorting", fr: "Tri" },
  ready: { en: "Ready", fr: "Prêt" },
  dispatched: { en: "Dispatched", fr: "Expédié" },
  delivered: { en: "Delivered", fr: "Livré" },
  exception: { en: "Exception", fr: "Exception" },
};

export const STAGE_OPTIONS = STAGES.map((s) => ({
  value: s,
  label: STAGE_LABEL[s].en,
  labelFr: STAGE_LABEL[s].fr,
}));

export function stageVariant(s: string): "success" | "warning" | "info" | "danger" | "default" {
  switch (s) {
    case "inbound":
      return "warning";
    case "received":
    case "ready":
      return "info";
    case "sorting":
      return "warning";
    case "dispatched":
    case "delivered":
      return "success";
    case "exception":
      return "danger";
    default:
      return "default";
  }
}

export function parcelStage(t: LiveTask): ParcelStage {
  switch (t.status) {
    case "unassigned":
      return t.receivedAt ? "received" : "inbound";
    case "assigned":
      return "sorting";
    case "picked_up":
      return "ready";
    case "in_transit":
      return "dispatched";
    case "delivered":
      return "delivered";
    case "failed":
      return "exception";
    default:
      return "inbound";
  }
}

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card",
  airtel_money: "Mobile Money",
  wallet: "Wallet",
};

export function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/** Address text from either a JSON address object or plain text. */
export function addressText(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { line1?: string; commune?: string; city?: string };
    if (a && typeof a === "object") {
      return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "—";
    }
  } catch {
    /* plain text */
  }
  return raw;
}

function phoneOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as { phone?: string };
    return a?.phone ? String(a.phone) : null;
  } catch {
    return null;
  }
}

export interface ParcelItem {
  productId: string;
  sku: string;
  name: string;
  variant: string;
  qty: number;
}

export interface Parcel {
  /** PKG-XXXXXX — what staff see and scan. */
  id: string;
  taskId: string;
  barcode: string;
  /** Order reference (e.g. ORD-…). */
  orderId: string;
  orderUuid: string;
  status: ParcelStage;
  rawStatus: string;
  seller: string;
  customer: string;
  customerPhone: string | null;
  customerAddress: string;
  pickupAddress: string;
  zone: string;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
  receivedAt: string | null;
  readyAt: string | null;
  attempts: number;
  failureReason: string | null;
  lat: number | null;
  lng: number | null;
  riderId: string | null;
  rider: string;
  paymentLabel: string;
  codAmountUsd: number;
  totalUsd: number;
  items: ParcelItem[];
  itemsCount: number;
  ageHours: number;
  timeline: { time: string; label: string; labelFr: string; done: boolean }[];
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function buildParcels(
  tasks: LiveTask[],
  orders: Order[],
  products: Product[],
  riders: WarehouseRider[],
): Parcel[] {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const riderById = new Map(riders.map((r) => [r.id, r]));
  const now = Date.now();

  return tasks.map((t) => {
    const o = orderById.get(t.orderId);
    const stage = parcelStage(t);
    const items: ParcelItem[] = (o?.items ?? []).map((it) => ({
      productId: it.productId,
      sku: `SKU-${shortId(it.productId)}`,
      name: it.productName,
      variant: it.variant || "Default",
      qty: it.qty,
    }));
    const firstProduct = o?.items?.[0] ? productById.get(o.items[0].productId) : undefined;
    const seller = firstProduct?.sellerName ?? "—";
    const rider = t.riderId ? riderById.get(t.riderId)?.name ?? `Rider ${shortId(t.riderId)}` : "Unassigned";
    const created = new Date(t.createdAt).getTime();
    const past = (s: ParcelStage) => STAGES.indexOf(stage) >= STAGES.indexOf(s) && stage !== "exception";
    return {
      id: `PKG-${shortId(t.id)}`,
      taskId: t.id,
      barcode: `BC-${shortId(t.id)}`,
      orderId: o?.reference ?? t.orderReference,
      orderUuid: t.orderId,
      status: stage,
      rawStatus: t.status,
      seller,
      customer: o?.customerName ?? "—",
      customerPhone: phoneOf(t.address) ?? phoneOf(o?.shippingAddress),
      customerAddress: addressText(t.address ?? o?.shippingAddress),
      pickupAddress: addressText(t.pickupAddress),
      zone: t.zoneId ?? "—",
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      receivedAt: t.receivedAt ?? null,
      readyAt: t.readyAt ?? null,
      attempts: t.attempts ?? 1,
      failureReason: t.failureReason ?? null,
      lat: t.lat ?? null,
      lng: t.lng ?? null,
      riderId: t.riderId,
      rider,
      paymentLabel: PAYMENT_LABEL[o?.paymentMethod ?? ""] ?? "—",
      codAmountUsd: t.codAmountUsd,
      totalUsd: o?.totalUsd ?? 0,
      items,
      itemsCount: items.reduce((s, it) => s + it.qty, 0),
      ageHours: Number.isNaN(created) ? 0 : Math.max(0, (now - created) / 3_600_000),
      timeline: [
        { time: fmt(t.createdAt), label: "Order paid, delivery created", labelFr: "Commande payée, livraison créée", done: true },
        { time: fmt(t.readyAt), label: "Seller marked ready", labelFr: "Vendeur: colis prêt", done: !!t.readyAt },
        { time: fmt(t.receivedAt), label: "Received at hub", labelFr: "Reçu au hub", done: !!t.receivedAt },
        { time: t.riderId ? fmt(t.updatedAt) : "—", label: "Rider assigned", labelFr: "Livreur assigné", done: !!t.riderId },
        { time: past("ready") ? fmt(t.updatedAt) : "—", label: "Picked up by rider", labelFr: "Collecté par le livreur", done: past("ready") },
        { time: past("dispatched") ? fmt(t.updatedAt) : "—", label: "On the way", labelFr: "En route", done: past("dispatched") },
        stage === "exception"
          ? { time: fmt(t.updatedAt), label: `Delivery failed${t.failureReason ? `: ${t.failureReason}` : ""}`, labelFr: `Livraison échouée${t.failureReason ? ` : ${t.failureReason}` : ""}`, done: true }
          : { time: stage === "delivered" ? fmt(t.updatedAt) : "—", label: "Delivered", labelFr: "Livré", done: stage === "delivered" },
      ],
    };
  });
}

/** Match a typed / scanned code against real parcels (keyboard-wedge scanners type into inputs). */
export function findParcel(parcels: Parcel[], raw: string): Parcel | undefined {
  const code = raw.trim().toLowerCase();
  if (!code) return undefined;
  const short = code.replace(/^(pkg|bc)-?/, "").toUpperCase();
  return parcels.find(
    (p) =>
      p.id.toLowerCase() === code ||
      p.barcode.toLowerCase() === code ||
      p.taskId.toLowerCase() === code ||
      p.orderId.toLowerCase() === code ||
      p.orderUuid.toLowerCase() === code ||
      (short.length === 6 && p.taskId.replace(/-/g, "").slice(0, 6).toUpperCase() === short),
  );
}

export function useWarehouseData() {
  const rt = useRealtime();
  const ridersQ = useOpsQuery<WarehouseRider[]>("warehouse:riders", {
    initial: [] as WarehouseRider[],
    push: ["delivery:updated"],
  });
  const inventoryQ = useOpsQuery<InventoryRow[]>("warehouse:inventory", {
    initial: [] as InventoryRow[],
    push: ["product:updated"],
  });

  const parcels = useMemo(
    () => buildParcels(rt.deliveries as LiveTask[], rt.orders, rt.products, ridersQ.data),
    [rt.deliveries, rt.orders, rt.products, ridersQ.data],
  );

  const getParcel = useCallback(
    (key: string) => findParcel(parcels, decodeURIComponent(key)),
    [parcels],
  );

  const stats = useMemo(() => {
    const by = (s: ParcelStage) => parcels.filter((p) => p.status === s).length;
    const open = parcels.filter((p) => p.status !== "delivered" && p.status !== "exception");
    return {
      total: parcels.length,
      inbound: by("inbound"),
      received: by("received"),
      sorting: by("sorting"),
      ready: by("ready"),
      dispatched: by("dispatched"),
      delivered: by("delivered"),
      exception: by("exception"),
      aged24h: open.filter((p) => p.ageHours >= 24).length,
      activeRiders: ridersQ.data.filter((r) => r.activeTasks > 0).length,
      riders: ridersQ.data.length,
    };
  }, [parcels, ridersQ.data]);

  // ── Writes: every one resolves on the server before the caller shows success ──
  const receive = useCallback(
    (taskId: string) => socketClient.request<LiveTask>("warehouse:receive", { taskId }),
    [],
  );
  const assign = useCallback(
    (taskId: string, riderId: string) =>
      socketClient.request<LiveTask>("delivery:assign", { taskId, riderId }),
    [],
  );
  const buildBatch = useCallback(
    (taskIds: string[], riderId: string, riderName?: string) =>
      socketClient.request<{ id: string; reference: string }>("warehouse:buildBatch", {
        taskIds,
        riderId,
        riderName,
      }),
    [],
  );

  return {
    parcels,
    getParcel,
    stats,
    riders: ridersQ.data,
    ridersLoading: ridersQ.loading,
    ridersError: ridersQ.error,
    reloadRiders: ridersQ.reload,
    inventory: inventoryQ.data,
    inventoryLoading: inventoryQ.loading,
    inventoryError: inventoryQ.error,
    receive,
    assign,
    buildBatch,
  };
}

export type WarehouseData = ReturnType<typeof useWarehouseData>;
