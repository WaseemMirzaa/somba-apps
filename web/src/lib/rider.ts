"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";

/**
 * Live rider data layer — backend-backed replacement for the mock
 * @/lib/rider-entities. Derives the rider's delivery queue and shift summary
 * from their real delivery tasks (enriched with order snapshots) over the one
 * authenticated socket, refreshing on live delivery:updated pushes.
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

interface RiderEarnings {
  totalTasks: number;
  delivered: number;
  active: number;
  codCollectedUsd: number;
  earningsUsd: number;
}

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
  if (!raw) return "Kinshasa";
  try {
    const a = JSON.parse(raw) as { line1?: string; commune?: string; city?: string };
    return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "Kinshasa";
  } catch {
    return raw;
  }
}

function toRiderTask(row: RiderQueueRow) {
  const o = row.order;
  const step = STATUS_STEP[row.status] ?? 1;
  const items = o?.items ?? [];
  return {
    id: row.id,
    type: "delivery" as const,
    status: (row.status === "unassigned" ? "assigned" : row.status) as
      | "assigned"
      | "picked_up"
      | "in_transit"
      | "delivered"
      | "failed",
    customer: o?.customerName ?? "Customer",
    address: addressText(row.address ?? o?.shippingAddress ?? null),
    phone: "+243 800 000 000",
    zone: row.zoneId ?? "Kinshasa — Gombe",
    orderId: row.orderReference,
    amount: row.codAmountUsd > 0 ? row.codAmountUsd : o?.totalUsd,
    paymentType: PAYMENT_LABEL[o?.paymentMethod ?? ""] ?? o?.paymentMethod ?? "—",
    eta: step >= 4 ? "En route" : "Scheduled",
    distance: "—",
    items: items.reduce((s, it) => s + it.qty, 0),
    sellerName: "Kinshasa Traders",
    sellerStore: "Kinshasa Traders",
    sellerPhone: "+243 820 100 200",
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
      { time: "—", label: "Picked from seller", done: step >= 3 },
      { time: "—", label: "At warehouse", done: step >= 3 },
      { time: "—", label: "Out for delivery", done: step >= 4 },
      { time: "—", label: "Delivered", done: step >= 5 },
    ],
    codAmount: row.codAmountUsd,
    notes: "" as string,
    notesFr: "" as string,
  };
}

export type RiderTask = ReturnType<typeof toRiderTask>;

export function useRiderData() {
  const rt = useRealtime();
  const [queue, setQueue] = useState<RiderQueueRow[]>([]);
  const [earnings, setEarnings] = useState<RiderEarnings | null>(null);

  const isRider = rt.user?.role === "rider";

  useEffect(() => {
    if (rt.status !== "connected" || !isRider) return;
    let alive = true;
    const load = async () => {
      const [q, e] = await Promise.all([
        socketClient.request<RiderQueueRow[]>("rider:tasks").catch(() => []),
        socketClient.request<RiderEarnings>("rider:earnings").catch(() => null),
      ]);
      if (!alive) return;
      setQueue(q ?? []);
      setEarnings(e);
    };
    void load();
    return () => {
      alive = false;
    };
    // rt.deliveries changes when a delivery:updated event lands — refetch then.
  }, [rt.status, isRider, rt.deliveries]);

  return useMemo(() => {
    const riderTasks = queue.map(toRiderTask);
    const active = riderTasks.filter((t) => t.status !== "delivered" && t.status !== "failed");
    const riderProfile = {
      id: rt.user?.id ? `RDR-${rt.user.id.slice(0, 4).toUpperCase()}` : "RDR-001",
      name: rt.user?.name ?? "Rider",
      phone: rt.user?.phone ?? "+243 800 000 000",
      vehicle: "Motorcycle — Honda CB150",
      vehicleFr: "Moto — Honda CB150",
      zone: "Kinshasa — Gombe",
      rating: 4.9,
      deliveriesToday: earnings?.delivered ?? 0,
      earningsToday: earnings?.earningsUsd ?? 0,
      codCollected: earnings?.codCollectedUsd ?? 0,
      activeTasks: earnings?.active ?? active.length,
      status: "on_duty" as const,
    };
    return {
      riderProfile,
      riderTasks,
      earnings,
      getRiderTask: (id: string) => riderTasks.find((t) => t.id === id || t.orderId === id),
      getActiveRiderTasks: () => active,
    };
  }, [queue, earnings, rt.user]);
}

export type RiderData = ReturnType<typeof useRiderData>;
