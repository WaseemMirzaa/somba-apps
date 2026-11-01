"use client";

import Link from "next/link";
import { Paperclip } from "lucide-react";
import { useSellerAccess } from "@/lib/seller";
import { useLiveQuery, type Page } from "@/lib/seller-api";
import type { OrderRef } from "@/lib/seller-engage";

/** The store's recent orders (to link a support ticket to one) and a lookup from order id to its reference. */
export function useOrderRefs(): { orders: OrderRef[]; refOf: (orderId: string | null | undefined) => string | null; canLink: boolean } {
  const access = useSellerAccess();
  const canLink = access.can("orders");
  const q = useLiveQuery<Page<OrderRef>>("orders:sellerList", canLink ? { limit: 100 } : null, {});
  const orders = q.data?.items ?? [];
  return {
    orders,
    canLink,
    refOf: (orderId) => (orderId ? (orders.find((o) => o.id === orderId)?.reference ?? null) : null),
  };
}

/** "Order SOM-123" link for a ticket (nothing when the ticket has no order). */
export function OrderLink({ orderId, reference, fr, enabled }: { orderId: string | null | undefined; reference: string | null; fr: boolean; enabled: boolean }) {
  if (!orderId) return <span className="text-slate-400">—</span>;
  const label = reference ?? `#${orderId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  if (!enabled) return <span>{label}</span>;
  return (
    <Link href={`/seller/orders/${reference ?? orderId}`} className="font-medium text-[var(--primary)] hover:underline" aria-label={fr ? `Commande ${label}` : `Order ${label}`}>
      {label}
    </Link>
  );
}

export function PhotoCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
      <Paperclip className="h-3 w-3" aria-hidden="true" />
      {n}
    </span>
  );
}
