import type { ItemFulfilment, OrderItem, OrderStatus, PackageStatus } from "@/lib/realtime/types";

/**
 * Pure helpers for multi-seller orders. A cart can mix sellers: it is ONE order
 * (one payment, one delivery) split into one package per seller. The package
 * status mirrors the server's `OrdersService.packageStatus`.
 */

type LineLike = Pick<OrderItem, "sellerId" | "sellerName" | "fulfilment" | "readyAt" | "receivedAt" | "refundedUsd" | "priceUsd" | "qty">;

export interface PackageOrderInfo {
  status: OrderStatus | string;
  paymentMethod: string;
  /** True when a successful payment is recorded for the order. */
  paid?: boolean;
}

export function lineFulfilment(line: Pick<OrderItem, "fulfilment">): ItemFulfilment {
  return line.fulfilment ?? "open";
}

const SHIPPED_STATES = ["shipped", "out_for_delivery", "delivered", "returned"];

/** Derives one seller's package status from their lines and the order. */
export function derivePackageStatus(order: PackageOrderInfo, lines: Pick<OrderItem, "fulfilment">[]): PackageStatus {
  const live = lines.filter((l) => lineFulfilment(l) !== "cancelled");
  if (lines.length > 0 && live.length === 0) return "cancelled";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending" && order.paymentMethod !== "cod" && !order.paid) return "pending";
  if (live.length > 0 && live.every((l) => lineFulfilment(l) === "received")) {
    return SHIPPED_STATES.includes(order.status) ? (order.status as PackageStatus) : "at_hub";
  }
  if (live.length > 0 && live.every((l) => ["ready", "received"].includes(lineFulfilment(l)))) return "ready";
  return "to_pack";
}

export interface OrderPackage<T extends LineLike = OrderItem> {
  /** Seller id, or "" when the line carries no seller snapshot. */
  sellerId: string;
  sellerName: string;
  lines: T[];
  status: PackageStatus;
  /** Latest time one of this package's lines was marked packed. */
  readyAt: string | null;
  /** Latest time one of this package's lines reached the hub. */
  receivedAt: string | null;
  /** Value of the lines that are not cancelled. */
  subtotalUsd: number;
  /** Refunded to the customer for this package's cancelled lines. */
  refundedUsd: number;
}

function latest(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) continue;
    if (t > bestT) {
      bestT = t;
      best = v;
    }
  }
  return best;
}

/** One package per seller, in the order the sellers first appear on the order. */
export function groupPackages<T extends LineLike>(order: PackageOrderInfo, items: T[]): OrderPackage<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = it.sellerId ?? "";
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  }
  return [...map.entries()].map(([sellerId, lines]) => ({
    sellerId,
    sellerName: lines.find((l) => l.sellerName)?.sellerName ?? "",
    lines,
    status: derivePackageStatus(order, lines),
    readyAt: latest(lines.map((l) => l.readyAt)),
    receivedAt: latest(lines.map((l) => l.receivedAt)),
    subtotalUsd: lines.filter((l) => lineFulfilment(l) !== "cancelled").reduce((s, l) => s + l.priceUsd * l.qty, 0),
    refundedUsd: lines.reduce((s, l) => s + (l.refundedUsd ?? 0), 0),
  }));
}

/** Total refunded to the wallet across all lines (seller cancellations). */
export function totalLineRefunds(items: Pick<OrderItem, "refundedUsd">[]): number {
  return items.reduce((s, l) => s + (l.refundedUsd ?? 0), 0);
}

export interface SellerRef {
  id: string | null;
  name: string;
}

/** Distinct sellers across an order's lines (by id, else by name), first-seen order. */
export function orderSellers(items: Pick<OrderItem, "sellerId" | "sellerName">[]): SellerRef[] {
  const seen = new Set<string>();
  const out: SellerRef[] = [];
  for (const it of items) {
    const name = it.sellerName ?? "";
    if (!it.sellerId && !name) continue;
    const key = it.sellerId ?? `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: it.sellerId ?? null, name: name || "—" });
  }
  return out;
}

/** "Name", "Name + 2 more" (en) / "Name + 2 autres" (fr); "—" when no seller is known. */
export function sellerSummary(sellers: SellerRef[], fr: boolean): string {
  if (sellers.length === 0) return "—";
  if (sellers.length === 1) return sellers[0].name;
  const more = sellers.length - 1;
  return fr ? `${sellers[0].name} + ${more} autre${more > 1 ? "s" : ""}` : `${sellers[0].name} + ${more} more`;
}

export const PACKAGE_STATUS_LABEL: Record<PackageStatus, { en: string; fr: string }> = {
  pending: { en: "Awaiting payment", fr: "En attente de paiement" },
  to_pack: { en: "To pack", fr: "À préparer" },
  ready: { en: "Ready", fr: "Prêt" },
  at_hub: { en: "At hub", fr: "Au hub" },
  shipped: { en: "Shipped", fr: "Expédié" },
  out_for_delivery: { en: "Out for delivery", fr: "En livraison" },
  delivered: { en: "Delivered", fr: "Livré" },
  returned: { en: "Returned", fr: "Retourné" },
  cancelled: { en: "Cancelled", fr: "Annulé" },
};

export const PACKAGE_STATUS_BADGE: Record<PackageStatus, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  to_pack: "warning",
  ready: "info",
  at_hub: "info",
  shipped: "info",
  out_for_delivery: "info",
  delivered: "success",
  returned: "default",
  cancelled: "danger",
};
