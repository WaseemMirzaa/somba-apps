"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";

/**
 * Live rider data layer. `rider:tasks` returns the rider's own tasks PLUS the
 * open pool (status `unassigned`), each with an order snapshot. The pool is
 * exposed separately as "available" so it is never mistaken for assigned work.
 * Refreshes on every `delivery:updated` push and after each action.
 */

interface RiderQueueRow {
  id: string;
  orderId: string;
  orderReference: string;
  status: string;
  zoneId: string | null;
  codAmountUsd: number;
  address: string | null;
  lat: number | null;
  lng: number | null;
  pickupAddress?: string | null;
  attempts?: number;
  failureReason?: string | null;
  readyAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  order: {
    reference: string;
    customerName: string;
    paymentMethod: string;
    totalUsd: number;
    shippingAddress: string | null;
    items: { productId: string; productName: string; variant: string; qty: number; priceUsd: number }[];
  } | null;
}

export interface RiderEarnings {
  totalTasks: number;
  delivered: number;
  active: number;
  codCollectedUsd: number;
  earningsUsd: number;
}

export type RiderTaskStatus = "available" | "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card (prepaid)",
  airtel_money: "Mobile Money",
  wallet: "Wallet (prepaid)",
};

const STATUS_STEP: Record<string, number> = {
  unassigned: 1,
  assigned: 2,
  picked_up: 3,
  in_transit: 4,
  delivered: 5,
  failed: 4,
};

function addressText(raw: string | null): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { line1?: string; commune?: string; city?: string };
    if (a && typeof a === "object") return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "—";
  } catch {
    /* plain text */
  }
  return raw;
}

function phoneFrom(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as { phone?: string };
    return a?.phone ? String(a.phone) : null;
  } catch {
    return null;
  }
}

function toRiderTask(row: RiderQueueRow) {
  const o = row.order;
  const step = STATUS_STEP[row.status] ?? 1;
  const items = o?.items ?? [];
  const status: RiderTaskStatus = row.status === "unassigned" ? "available" : (row.status as RiderTaskStatus);
  return {
    id: row.id,
    type: "delivery" as const,
    status,
    isPool: row.status === "unassigned",
    customer: o?.customerName ?? "Customer",
    address: addressText(row.address ?? o?.shippingAddress ?? null),
    pickupAddress: addressText(row.pickupAddress ?? null),
    phone: phoneFrom(row.address) ?? phoneFrom(o?.shippingAddress),
    zone: row.zoneId ?? "—",
    orderId: row.orderReference,
    amount: row.codAmountUsd > 0 ? row.codAmountUsd : o?.totalUsd,
    paymentType: PAYMENT_LABEL[o?.paymentMethod ?? ""] ?? o?.paymentMethod ?? "—",
    eta: step >= 4 ? "En route" : "Scheduled",
    distance: "—",
    items: items.reduce((s, it) => s + it.qty, 0),
    attempts: row.attempts ?? 1,
    failureReason: row.failureReason ?? null,
    readyAt: row.readyAt ?? null,
    receivedAt: row.receivedAt ?? null,
    createdAt: row.createdAt,
    sellerName: "—",
    sellerStore: "—",
    sellerPhone: null as string | null,
    products: items.map((it) => ({
      productId: it.productId,
      name: it.productName,
      sku: `SKU-${it.productId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      variant: it.variant || "Default",
      qty: it.qty,
      image: "/brand/logo-stack.png",
    })),
    timeline: [
      { time: new Date(row.createdAt).toLocaleString(), label: "Order placed", done: step >= 1 },
      { time: row.readyAt ? new Date(row.readyAt).toLocaleString() : "—", label: "Seller ready", done: !!row.readyAt },
      { time: "—", label: "Picked from seller", done: step >= 3 },
      { time: "—", label: "Out for delivery", done: step >= 4 && row.status !== "failed" },
      row.status === "failed"
        ? { time: "—", label: `Failed${row.failureReason ? `: ${row.failureReason}` : ""}`, done: true }
        : { time: "—", label: "Delivered", done: step >= 5 },
    ],
    codAmount: row.codAmountUsd,
  };
}

export type RiderTask = ReturnType<typeof toRiderTask>;

export function useRiderData() {
  const rt = useRealtime();
  const [queue, setQueue] = useState<RiderQueueRow[]>([]);
  const [earnings, setEarnings] = useState<RiderEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isRider = rt.user?.role === "rider";
  const connected = rt.status === "connected";

  const refresh = useCallback(async () => {
    try {
      const [q, e] = await Promise.all([
        socketClient.request<RiderQueueRow[]>("rider:tasks"),
        socketClient.request<RiderEarnings>("rider:earnings"),
      ]);
      setQueue(q ?? []);
      setEarnings(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!connected || !isRider) return;
    void refresh();
    const s = socketClient.current;
    const onPush = () => void refresh();
    s?.on("delivery:updated", onPush);
    return () => {
      s?.off("delivery:updated", onPush);
    };
  }, [connected, isRider, refresh]);

  return useMemo(() => {
    const riderTasks = queue.map(toRiderTask);
    const available = riderTasks.filter((t) => t.isPool);
    const mine = riderTasks.filter((t) => !t.isPool);
    const active = mine.filter((t) => t.status !== "delivered" && t.status !== "failed");
    const riderProfile = {
      id: rt.user?.id ? `RDR-${rt.user.id.slice(0, 4).toUpperCase()}` : "RDR-001",
      userId: rt.user?.id ?? "",
      name: rt.user?.name ?? "Rider",
      email: rt.user?.email ?? "",
      phone: rt.user?.phone ?? null,
      deliveriesToday: earnings?.delivered ?? 0,
      earningsToday: earnings?.earningsUsd ?? 0,
      codCollected: earnings?.codCollectedUsd ?? 0,
      activeTasks: earnings?.active ?? active.length,
    };
    return {
      riderProfile,
      /** Every row the server sent: own tasks + open pool. */
      riderTasks,
      /** Open pool: unclaimed, can be accepted. */
      available,
      /** The rider's own tasks (any status). */
      mine,
      earnings,
      loading,
      error,
      refresh,
      getRiderTask: (id: string) => riderTasks.find((t) => t.id === id || t.orderId === id),
      getActiveRiderTasks: () => active,
    };
  }, [queue, earnings, rt.user, loading, error, refresh]);
}

export type RiderData = ReturnType<typeof useRiderData>;
