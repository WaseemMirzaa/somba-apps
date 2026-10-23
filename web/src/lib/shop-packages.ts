// Pure helpers for multi-seller orders: one order, one payment, one delivery, but
// each seller packs their own "package" and the hub consolidates them.
// No imports besides types, so the node:test file can transpile and load it.
import type { ItemFulfilment, PackageStatus } from "@/lib/realtime/types";

/** The fields of an order line these helpers read (a subset of OrderItem). */
export interface PackageLine {
  sellerId?: string | null;
  sellerName?: string | null;
  fulfilment?: ItemFulfilment | null;
  refundedUsd?: number | null;
  qty?: number;
  priceUsd?: number;
}

export interface SellerGroup<T extends PackageLine> {
  /** Stable key: the seller id, else the seller name, else "". */
  key: string;
  sellerId: string | null;
  sellerName: string | null;
  items: T[];
}

export interface OrderPackage<T extends PackageLine> extends SellerGroup<T> {
  /** 1-based position among the order's packages. */
  index: number;
  total: number;
  status: PackageStatus;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const fulfilmentOf = (l: PackageLine): ItemFulfilment => l.fulfilment ?? "open";

/** Group lines by seller, in order of first appearance. Lines without a seller share one group. */
export function groupBySeller<T extends PackageLine>(items: readonly T[]): SellerGroup<T>[] {
  const groups = new Map<string, SellerGroup<T>>();
  for (const it of items) {
    const key = it.sellerId || it.sellerName || "";
    let g = groups.get(key);
    if (!g) {
      g = { key, sellerId: it.sellerId ?? null, sellerName: it.sellerName ?? null, items: [] };
      groups.set(key, g);
    }
    g.items.push(it);
    if (!g.sellerName && it.sellerName) g.sellerName = it.sellerName;
  }
  return [...groups.values()];
}

/** How many distinct sellers share these lines. */
export function sellerCount(items: readonly PackageLine[]): number {
  return groupBySeller(items).length;
}

export function isCancelledLine(l: PackageLine): boolean {
  return fulfilmentOf(l) === "cancelled";
}

export function hasCancelledLines(items: readonly PackageLine[]): boolean {
  return items.some(isCancelledLine);
}

export function cancelledCount(items: readonly PackageLine[]): number {
  return items.filter(isCancelledLine).length;
}

/** Total refunded to the customer for seller-cancelled lines. */
export function refundedTotal(items: readonly PackageLine[]): number {
  return round2(items.reduce((s, l) => s + (l.refundedUsd && l.refundedUsd > 0 ? l.refundedUsd : 0), 0));
}

/** Packages are shown when 2+ sellers share the order or any line was cancelled. */
export function shouldShowPackages(items: readonly PackageLine[]): boolean {
  return sellerCount(items) >= 2 || hasCancelledLines(items);
}

const DELIVERY_STAGES: readonly string[] = ["shipped", "out_for_delivery", "delivered", "returned"];

/**
 * Status of one seller's package.
 * all lines cancelled -> cancelled; order cancelled -> cancelled;
 * unpaid pending non-COD order -> pending;
 * all live lines received -> the order status once it is shipped/out_for_delivery/delivered/returned, else at_hub;
 * all live lines ready or received -> ready; otherwise to_pack.
 */
export function packageStatus(
  order: { status: string; paymentMethod?: string | null },
  lines: readonly PackageLine[],
): PackageStatus {
  if (lines.length > 0 && lines.every(isCancelledLine)) return "cancelled";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending" && order.paymentMethod !== "cod") return "pending";
  const live = lines.filter((l) => !isCancelledLine(l));
  if (live.length > 0 && live.every((l) => fulfilmentOf(l) === "received")) {
    return DELIVERY_STAGES.includes(order.status) ? (order.status as PackageStatus) : "at_hub";
  }
  if (live.length > 0 && live.every((l) => fulfilmentOf(l) === "ready" || fulfilmentOf(l) === "received")) return "ready";
  return "to_pack";
}

/** The order's lines split into one package per seller, each with its derived status. */
export function buildPackages<T extends PackageLine>(
  order: { status: string; paymentMethod?: string | null },
  items: readonly T[],
): OrderPackage<T>[] {
  const groups = groupBySeller(items);
  return groups.map((g, i) => ({
    ...g,
    index: i + 1,
    total: groups.length,
    status: packageStatus(order, g.items),
  }));
}
