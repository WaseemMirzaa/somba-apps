"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errMsg } from "@/lib/admin-live";
import type { Order, Product, Seller } from "@/lib/realtime/types";

/**
 * Typed shapes + a request hook for the server's analytics events
 * (see docs/ANALYTICS-API.md). Nothing here is computed on the client: every
 * figure shown by the admin pages comes straight from these responses.
 */

export interface AdminAlert {
  kind: string;
  severity: "info" | "warning" | "critical";
  count: number;
  message: string;
  messageFr: string;
}

export interface GmvByCategory {
  category: string;
  gmv: number;
  orders: number;
}

export interface AdminStatsFull {
  orders: number;
  gmv: number;
  revenue: number;
  customers: number;
  sellers: number;
  liveProducts: number;
  pendingDisputes: number;
  pendingPayouts: number;
  commissionUsd: number;
  commissionPct: number;
  ordersByStatus: Record<string, number>;
  gmvByCategory: GmvByCategory[];
  ordersToday: number;
  gmvToday: number;
  ordersLast30: number;
  gmvLast30: number;
  gmvPrev30: number;
  gmvChangePct: number | null;
  refundsUsd: number;
  subscriptionRevenueUsd: number;
  aov: number;
  alerts: AdminAlert[];
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface FinanceSeriesPoint {
  date: string;
  gmv: number;
  orders: number;
  revenue: number;
  refunds: number;
}

export interface FinanceStats {
  currency: string;
  commissionPct: number;
  grossGmvUsd: number;
  deliveryFeesUsd: number;
  promoDiscountsUsd: number;
  collectedUsd: number;
  commissionEarnedUsd: number;
  commissionExpectedUsd: number;
  subscriptionRevenueUsd: number;
  refundsUsd: number;
  refundsCount: number;
  payouts: {
    paidUsd: number;
    paidCount: number;
    pendingUsd: number;
    pendingCount: number;
    requestedCount: number;
    rejectedCount: number;
  };
  receivables: {
    count: number;
    amountUsd: number;
    oldestMinutes: number;
    byMethod: { method: string; count: number; amountUsd: number; oldestMinutes: number }[];
  };
  codOutstandingUsd: number;
  codOutstandingCount: number;
  walletLiabilityUsd: number;
  series30: FinanceSeriesPoint[];
}

export interface WarehouseStats {
  totalParcels: number;
  unassigned: number;
  inTransit: number;
  delivered: number;
  codToCollect: number;
  byStatus: Record<string, number>;
  throughput: { date: string; received: number; pickedUp: number; delivered: number }[];
  avgPickupToDeliveryMinutes: number | null;
  pickupToDeliverySamples: number;
  failureRatePct: number | null;
  failed30: number;
  delivered30: number;
  agedOver24h: number;
  byZone: { zoneId: string; parcels: number; delivered: number; failed: number }[];
  byHub: { hubId: string; hub: string; batches30: number }[];
}

export interface HubRow {
  id: string;
  name: string;
  city: string;
  country: string | null;
  address: string | null;
  capacity: number;
  active: boolean;
  createdAt?: string;
}

export interface ReviewRow {
  id: string;
  productId: string;
  productName?: string;
  userId?: string;
  author: string;
  rating: number;
  text: string;
  helpful?: number;
  status: "visible" | "hidden";
  sellerReply: string | null;
  sellerReplyAt: string | null;
  createdAt: string;
}

export interface SeriesQueryOpts {
  enabled?: boolean;
  /** Change this value to force a reload (e.g. when a push event arrived). */
  refreshKey?: unknown;
}

/**
 * One request -> ack with real loading / error / retry state. While the socket
 * is not connected the query stays in `loading` (the provider reconnects by
 * itself); a refused or failed request exposes the server's message in `error`.
 */
export function useSocketQuery<T>(event: string, body?: Record<string, unknown>, opts: SeriesQueryOpts = {}) {
  const rt = useRealtime();
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bodyKey = JSON.stringify(body ?? {});
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  });
  const seq = useRef(0);
  const connected = rt.status === "connected";

  const load = useCallback(
    async (silent = false) => {
      if (!connected || !enabled) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const res = await socketClient.request<T>(event, bodyRef.current);
        if (id !== seq.current) return;
        setData(res);
        setError(null);
      } catch (e) {
        if (id !== seq.current) return;
        setError(errMsg(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    // bodyKey re-creates the loader when the request body changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, connected, enabled, bodyKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A push-driven refresh keeps the current figures on screen (no spinner flash).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.refreshKey]);

  return { data, loading, error, reload: () => load(), connected };
}

/** Short axis label for a `YYYY-MM-DD` bucket, e.g. "17 Oct". */
export function shortDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "1 h 05" style age for a number of minutes. */
export function ageLabel(minutes: number, fr: boolean): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h ${String(Math.round(minutes % 60)).padStart(2, "0")}`;
  return `${Math.round(h / 24)} ${fr ? "j" : "d"}`;
}

export interface TopSeller extends Seller {
  revenue: number;
  orderCount: number;
}

/**
 * Seller ranking from the live order feed: item value of each store's products on
 * orders that are not cancelled or returned (the same rule the server uses).
 */
export function rankSellers(orders: Order[], products: Product[], sellers: Seller[]): TopSeller[] {
  const owner = new Map(products.map((p) => [p.id, p.sellerId]));
  const acc = new Map<string, { revenue: number; orders: Set<string> }>();
  for (const o of orders) {
    if (o.status === "cancelled" || o.status === "returned") continue;
    for (const it of o.items ?? []) {
      const sid = owner.get(it.productId);
      if (!sid) continue;
      const cur = acc.get(sid) ?? { revenue: 0, orders: new Set<string>() };
      cur.revenue += it.priceUsd * it.qty;
      cur.orders.add(o.id);
      acc.set(sid, cur);
    }
  }
  return sellers
    .map((sl) => ({ ...sl, revenue: acc.get(sl.id)?.revenue ?? 0, orderCount: acc.get(sl.id)?.orders.size ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}
