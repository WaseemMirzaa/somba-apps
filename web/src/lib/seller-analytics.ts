"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSellerLiveTick } from "@/lib/seller";

/**
 * Real store analytics: the server's `analytics:seller` (see docs/ANALYTICS-API.md §5).
 * Every figure is computed by the server from the seller's own orders, reviews
 * and product views. Anything the platform does not record is `null` / absent.
 */
export interface SellerAnalytics {
  sellerId: string;
  days: number;
  from: string;
  to: string;
  revenue: number;
  /** Commission on `revenue`: the amounts stored on the order lines (absent on an older server). */
  commissionUsd?: number;
  orders: number;
  units: number;
  aov: number;
  revenueSeries: { date: string; revenue: number; orders: number; units: number }[];
  topProducts: { productId: string; name: string; units: number; revenue: number }[];
  customers: {
    total: number;
    repeat: number;
    repeatRatePct: number;
    windowActive: number;
    windowNew: number;
    windowReturning: number;
  };
  fulfilment: {
    ordersPlaced: number;
    avgHoursToReady: number | null;
    avgHoursToDelivered: number | null;
    cancelRatePct: number;
    returnRatePct: number;
    disputeRatePct: number;
  };
  reviews: { average: number | null; count: number; replied: number };
  health: {
    score: number | null;
    grade: "A" | "B" | "C" | "D" | null;
    components: { key: string; score: number; weight: number; value: number }[];
  };
  funnel: { views: number; orders: number; conversionPct: number };
}

export type AnalyticsDays = 7 | 30 | 90;

export interface AnalyticsState {
  data: SellerAnalytics | null;
  /** True until the first answer (or error) for the current window arrived. */
  loading: boolean;
  /** The server's message when the last read failed. */
  error: string | null;
  retry: () => void;
}

/**
 * Loads `analytics:seller` for a window and re-reads it (no spinner, previous
 * numbers stay on screen) whenever a push changed something it is computed from.
 */
export function useSellerAnalytics(days: AnalyticsDays = 30): AnalyticsState {
  const rt = useRealtime();
  const tick = useSellerLiveTick();
  const connected = rt.status === "connected" && rt.user?.role === "seller";
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!connected) return;
    const mine = ++seq.current;
    socketClient
      .request<SellerAnalytics>("analytics:seller", { days, top: 10 })
      .then((d) => {
        if (mine !== seq.current) return;
        setData(d);
        setError(null);
        setLoadedFor(days);
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return;
        setError(e instanceof Error ? e.message : "Request failed.");
        setLoadedFor(days);
      });
  }, [connected, days, tick, nonce]);

  const retry = useCallback(() => {
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  // Stale numbers of ANOTHER window are not shown as if they belonged to this one.
  const matches = data?.days === days;
  return { data: matches ? data : null, loading: loadedFor !== days && !error, error, retry };
}

/** "2026-10-17" -> "Oct 17" (UTC day buckets, so no timezone shift). */
export function shortDay(date: string, fr: boolean): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(fr ? "fr-FR" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Hours -> "6.5 h" / "2.2 d"; null stays a dash (the server had no sample). */
export function formatHours(h: number | null | undefined, fr: boolean): string {
  if (h === null || h === undefined) return "—";
  if (h >= 48) return `${(h / 24).toFixed(1)} ${fr ? "j" : "d"}`;
  return `${h.toFixed(1)} h`;
}

export function formatPct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${n}%`;
}

/** Labels for the five store-health components (key -> [EN, FR]). */
export const HEALTH_LABELS: Record<string, [string, string]> = {
  ready: ["Packing speed", "Vitesse de préparation"],
  cancel: ["Cancellations", "Annulations"],
  problems: ["Returns & disputes", "Retours et litiges"],
  reviews: ["Customer rating", "Note des clients"],
  repeat: ["Repeat buyers", "Clients récurrents"],
};

/** What the server's health component `value` means, as a short formatted string. */
export function healthValue(key: string, value: number, fr: boolean): string {
  switch (key) {
    case "ready":
      return formatHours(value, fr);
    case "reviews":
      return `${value.toFixed(1)} ★`;
    default:
      return `${value}%`;
  }
}
