/**
 * Pure derivations for the seller's package on an order (multi-seller orders).
 * No React, no imports at runtime: unit-tested by seller-packages.test.mjs.
 *
 * The server is the source of truth: `packageStatus` and each line's `fulfilment` come
 * from `orders:list` / the order pushes. Nothing here is remembered client-side.
 */
import type { OrderItem, OrderStatus, PackageStatus, SellerOrderView } from "./realtime/types";

export type BadgeTone = "default" | "primary" | "success" | "warning" | "danger" | "purple" | "info";

// ─── Package status (the seller's whole parcel) ──────────────────────────────
export const PACKAGE_STATUSES: PackageStatus[] = [
  "pending",
  "to_pack",
  "ready",
  "at_hub",
  "shipped",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
];

const PACKAGE: Record<PackageStatus, { en: string; fr: string; tone: BadgeTone }> = {
  pending: { en: "Awaiting payment", fr: "En attente de paiement", tone: "warning" },
  to_pack: { en: "To pack", fr: "À préparer", tone: "warning" },
  ready: { en: "Ready for pickup", fr: "Prêt pour enlèvement", tone: "info" },
  at_hub: { en: "At the hub", fr: "Au hub", tone: "info" },
  shipped: { en: "Shipped", fr: "Expédié", tone: "info" },
  out_for_delivery: { en: "Out for delivery", fr: "En cours de livraison", tone: "info" },
  delivered: { en: "Delivered", fr: "Livré", tone: "success" },
  returned: { en: "Returned", fr: "Retourné", tone: "danger" },
  cancelled: { en: "Cancelled", fr: "Annulé", tone: "danger" },
};

export function packageStatusLabel(status: string, fr: boolean): string {
  const hit = PACKAGE[status as PackageStatus];
  if (hit) return fr ? hit.fr : hit.en;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function packageStatusTone(status: string): BadgeTone {
  return PACKAGE[status as PackageStatus]?.tone ?? "default";
}
export const PACKAGE_STATUS_OPTIONS = PACKAGE_STATUSES.map((value) => ({
  value,
  label: PACKAGE[value].en,
  labelFr: PACKAGE[value].fr,
}));

/**
 * The older "shipping" vocabulary the shipment views use, derived from the package status
 * (never from the localStorage flag the portal used to keep).
 */
export function shippingStatusFromPackage(status: PackageStatus): string {
  switch (status) {
    case "pending": return "pending";
    case "to_pack": return "awaiting_pickup";
    case "ready": return "ready";
    case "at_hub": return "at_hub";
    case "shipped": return "picked_up";
    case "out_for_delivery": return "in_transit";
    default: return status; // delivered | returned | cancelled
  }
}

// ─── Lines ───────────────────────────────────────────────────────────────────
export type LineState = "to_pack" | "ready" | "at_hub" | "cancelled";

const LINE: Record<LineState, { en: string; fr: string; tone: BadgeTone }> = {
  to_pack: { en: "To pack", fr: "À préparer", tone: "warning" },
  ready: { en: "Ready", fr: "Prêt", tone: "info" },
  at_hub: { en: "At the hub", fr: "Au hub", tone: "success" },
  cancelled: { en: "Cancelled", fr: "Annulé", tone: "danger" },
};

/** A line without a `fulfilment` (older server) is an open line. */
export function lineState(item: Pick<OrderItem, "fulfilment">): LineState {
  switch (item.fulfilment) {
    case "cancelled": return "cancelled";
    case "ready": return "ready";
    case "received": return "at_hub";
    default: return "to_pack";
  }
}
export const lineStateLabel = (s: LineState, fr: boolean) => (fr ? LINE[s].fr : LINE[s].en);
export const lineStateTone = (s: LineState): BadgeTone => LINE[s].tone;

export const isLiveLine = (item: Pick<OrderItem, "fulfilment">) => item.fulfilment !== "cancelled";
export const liveLines = <T extends Pick<OrderItem, "fulfilment">>(items: T[]): T[] => items.filter(isLiveLine);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What the seller earns from: their live (non-cancelled) lines only. */
export function liveAmount(items: Pick<OrderItem, "fulfilment" | "priceUsd" | "qty">[]): number {
  return round2(items.filter(isLiveLine).reduce((s, it) => s + it.priceUsd * it.qty, 0));
}

/**
 * Commission on one line: the amount STORED when the order was placed. Only a line without it
 * (an older payload) falls back to today's rate (`fallbackPct`), so history never rewrites itself.
 */
export function lineCommission(item: Pick<OrderItem, "priceUsd" | "qty" | "commissionUsd">, fallbackPct: number): number {
  if (typeof item.commissionUsd === "number" && Number.isFinite(item.commissionUsd)) return round2(item.commissionUsd);
  return round2((item.priceUsd * item.qty * fallbackPct) / 100);
}

/** Commission on the live (non-cancelled) lines of an order. */
export function liveCommission(items: Pick<OrderItem, "fulfilment" | "priceUsd" | "qty" | "commissionUsd">[], fallbackPct: number): number {
  return round2(items.filter(isLiveLine).reduce((s, it) => s + lineCommission(it, fallbackPct), 0));
}

/** Rate label of a set of lines: "12" when they share one stored rate, "mixed" when they differ, null when none stored. */
export function commissionRateOf(items: Pick<OrderItem, "fulfilment" | "commissionPct">[]): number | "mixed" | null {
  const rates = new Set(items.filter(isLiveLine).map((it) => it.commissionPct).filter((r): r is number => typeof r === "number"));
  if (rates.size === 0) return null;
  return rates.size === 1 ? [...rates][0] : "mixed";
}

/** Amount of one order for the seller: cancelled lines never count (the server's subtotal is only a fallback). */
export function orderAmount(o: Pick<SellerOrderView, "items" | "subtotalUsd">): number {
  if (!o.items || o.items.length === 0) return round2(o.subtotalUsd ?? 0);
  return liveAmount(o.items);
}

/** Money already refunded to the customer for the seller's cancelled lines. */
export function refundedAmount(items: Pick<OrderItem, "refundedUsd">[]): number {
  return round2(items.reduce((s, it) => s + (it.refundedUsd ?? 0), 0));
}

export function liveQty(items: Pick<OrderItem, "fulfilment" | "qty">[]): number {
  return items.filter(isLiveLine).reduce((s, it) => s + it.qty, 0);
}

// ─── Normalising what the server sends ───────────────────────────────────────
interface LooseOrder {
  id: string;
  reference: string;
  status: OrderStatus;
  packageStatus?: PackageStatus;
  paymentMethod: SellerOrderView["paymentMethod"];
  createdAt: string;
  customerName: string;
  items?: OrderItem[];
  subtotalUsd?: number;
  totalUsd: number;
  sellerCount?: number;
  shippingAddress?: string | null;
  riderId?: string | null;
}

/** Fallback only for a server that has not sent `packageStatus` (offline mirror): mirrors the server rules. */
export function derivePackageStatus(o: Pick<LooseOrder, "status" | "paymentMethod" | "items">): PackageStatus {
  const items = o.items ?? [];
  if (items.length > 0 && items.every((it) => it.fulfilment === "cancelled")) return "cancelled";
  switch (o.status) {
    case "cancelled": return "cancelled";
    case "returned": return "returned";
    case "delivered": return "delivered";
    case "out_for_delivery": return "out_for_delivery";
    case "shipped": return "shipped";
    case "pending":
      if (o.paymentMethod !== "cod") return "pending";
      break;
    default: break;
  }
  const live = liveLines(items);
  if (live.length > 0 && live.every((it) => it.fulfilment === "received")) return "at_hub";
  if (live.length > 0 && live.every((it) => it.fulfilment === "ready" || it.fulfilment === "received")) return "ready";
  return "to_pack";
}

export function normalizeOrder<T extends LooseOrder>(o: T): T & { packageStatus: PackageStatus; sellerCount: number; subtotalUsd: number } {
  return {
    ...o,
    packageStatus: o.packageStatus ?? derivePackageStatus(o),
    sellerCount: o.sellerCount ?? 1,
    subtotalUsd: o.subtotalUsd ?? liveAmount(o.items ?? []),
  };
}

// ─── What counts ─────────────────────────────────────────────────────────────
/**
 * A sale is a package that is paid for (or COD in transit) and not cancelled/returned.
 * An unpaid non-COD `pending` order is not a sale and not work for the seller yet (B14).
 */
export function countsAsSale(o: Pick<SellerOrderView, "status" | "packageStatus">): boolean {
  if (o.status === "cancelled" || o.status === "returned" || o.status === "pending") return false;
  return o.packageStatus !== "cancelled" && o.packageStatus !== "returned" && o.packageStatus !== "pending";
}

/** Work waiting for the seller: a package still to pack. */
export const isPendingWork = (o: Pick<SellerOrderView, "packageStatus">) => o.packageStatus === "to_pack";

/** The latest `readyAt` among live lines, only once every live line is ready (or already at the hub). */
export function packageReadyAt(items: Pick<OrderItem, "fulfilment" | "readyAt">[]): string | null {
  const live = liveLines(items);
  if (live.length === 0) return null;
  if (!live.every((it) => it.fulfilment === "ready" || it.fulfilment === "received")) return null;
  const times = live.map((it) => it.readyAt).filter((t): t is string => !!t);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (a > b ? a : b));
}

// ─── Actions: eligibility ────────────────────────────────────────────────────
const CANCELLABLE_ORDER_STATUS: OrderStatus[] = ["pending", "confirmed", "processing"];

/** "Package ready" shows only while the server says the package is still to pack. */
export function canMarkReady(o: { packageStatus: PackageStatus; items: Pick<OrderItem, "fulfilment">[] }): boolean {
  return o.packageStatus === "to_pack" && o.items.some((it) => (it.fulfilment ?? "open") === "open");
}

/** Lines the seller may still cancel: open or ready, on an order that has not left yet. */
export function cancellableLines<T extends Pick<OrderItem, "fulfilment">>(
  o: { status: OrderStatus; packageStatus: PackageStatus; items: T[] },
): T[] {
  if (!CANCELLABLE_ORDER_STATUS.includes(o.status)) return [];
  if (o.packageStatus !== "to_pack" && o.packageStatus !== "ready" && o.packageStatus !== "pending") return [];
  return o.items.filter((it) => it.fulfilment === undefined || it.fulfilment === "open" || it.fulfilment === "ready");
}
export const canCancelItems = (o: Parameters<typeof cancellableLines>[0]) => cancellableLines(o).length > 0;

/** True when this seller is done but other sellers of a shared order are still packing. */
export function waitingForOtherSellers(
  o: Pick<SellerOrderView, "packageStatus" | "sellerCount" | "otherSellersPacking">,
): boolean {
  if (o.sellerCount <= 1 || o.packageStatus !== "ready") return false;
  // The server says exactly how many other sellers are still packing; older payloads lack it.
  return o.otherSellersPacking === undefined ? true : o.otherSellersPacking > 0;
}

// ─── Cancel reasons ──────────────────────────────────────────────────────────
export const CANCEL_REASONS = [
  { key: "out_of_stock", en: "Out of stock", fr: "Rupture de stock" },
  { key: "damaged", en: "Damaged", fr: "Article endommagé" },
  { key: "price_error", en: "Price error", fr: "Erreur de prix" },
  { key: "other", en: "Other", fr: "Autre" },
] as const;
export type CancelReasonKey = (typeof CANCEL_REASONS)[number]["key"];
export const MIN_CANCEL_REASON = 3;

/**
 * The reason text sent to the server (≥3 chars). A preset sends its English label (what support reads);
 * "Other" sends the free text. Returns null while the choice is not valid yet.
 */
export function buildCancelReason(key: CancelReasonKey | "", other: string): string | null {
  if (!key) return null;
  if (key === "other") {
    const t = other.trim();
    return t.length >= MIN_CANCEL_REASON ? t : null;
  }
  const hit = CANCEL_REASONS.find((r) => r.key === key);
  return hit ? hit.en : null;
}

// ─── Optimistic update after `orders:sellerReady` succeeded ──────────────────
/**
 * Marks the seller's open lines ready (and the package ready) right after the server accepted, until
 * the re-read / next push brings the server's own state. Other lines and orders are left as they are.
 */
export function applySellerReady<T extends { packageStatus: PackageStatus; items: OrderItem[] }>(o: T, nowIso: string): T {
  const items = o.items.map((it) =>
    it.fulfilment === undefined || it.fulfilment === "open" ? { ...it, fulfilment: "ready" as const, readyAt: nowIso } : it,
  );
  return { ...o, items, packageStatus: o.packageStatus === "to_pack" ? "ready" : o.packageStatus };
}
