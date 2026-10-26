"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { isHubBound, legItemsText, type Endpoint, type LegItem, type LegKind, type TaskView } from "@/lib/logistics";

/**
 * Live rider data layer. `rider:tasks` returns ONLY the legs assigned to this rider (their warehouse assigns them;
 * there is no pool and no accepting), each with an order snapshot. On legs that do not meet the customer
 * (pickup, transfer, return to seller) the customer's address is not sent and the name is the first name only.
 * Refreshes on every `task:updated` push and after each action.
 */

interface RiderQueueRow extends Omit<TaskView, "desk"> {
  order: {
    reference: string;
    customerName: string;
    paymentMethod: string;
    estimatedDeliveryDate?: string | null;
    totalUsd: number;
    shippingAddress: string | null;
    items: { productId: string; productName: string; productNameFr?: string | null; variant: string; variantFr?: string | null; qty: number; priceUsd: number }[];
  } | null;
}

export interface RiderEarnings {
  totalTasks: number;
  delivered: number;
  active: number;
  codCollectedUsd: number;
  earningsUsd: number;
}

export type RiderTaskStatus = "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card (prepaid)",
  airtel_money: "Mobile Money",
  wallet: "Wallet (prepaid)",
};

/** The order the legs are shown in: what meets the customer first, then warehouse runs. */
export const RIDER_KIND_ORDER: LegKind[] = ["delivery", "replacement_delivery", "return_pickup", "pickup", "transfer", "return_transfer", "return_to_seller"];

function addressText(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { line1?: string; commune?: string; city?: string };
    if (a && typeof a === "object") return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "—";
  } catch {
    /* plain text */
  }
  return raw;
}

function geoFrom(raw: string | null | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  try {
    const g = (JSON.parse(raw) as { geo?: { lat?: unknown; lng?: unknown } })?.geo;
    const lat = Number(g?.lat);
    const lng = Number(g?.lng);
    return g && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
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

const pin = (e: Endpoint | null | undefined) => (e && e.lat != null && e.lng != null ? { lat: Number(e.lat), lng: Number(e.lng) } : null);

function toRiderTask(row: RiderQueueRow) {
  const o = row.order;
  const items = o?.items ?? [];
  const legItems: LegItem[] = row.items ?? [];
  const status = row.status as RiderTaskStatus;
  const toEnd = row.to;
  const fromEnd = row.from;
  const hubBound = isHubBound(row.kind);
  const geo = pin(toEnd) ?? geoFrom(row.address) ?? geoFrom(o?.shippingAddress);
  const stepsDone = ["assigned", "picked_up", "in_transit", "delivered"].indexOf(status);
  return {
    id: row.id,
    kind: row.kind,
    hubBound,
    status,
    customer: o?.customerName ?? toEnd?.name ?? "—",
    /** Where the rider goes to (customer, warehouse or seller). */
    address: toEnd?.address ?? addressText(row.address ?? o?.shippingAddress ?? null),
    /** Where the rider collects from. */
    pickupAddress: fromEnd?.address ?? addressText(row.pickupAddress ?? null),
    from: fromEnd,
    to: toEnd,
    toName: toEnd?.name ?? "—",
    fromName: fromEnd?.name ?? "—",
    phone: toEnd?.phone ?? phoneFrom(row.address) ?? phoneFrom(o?.shippingAddress),
    geo,
    fromGeo: pin(fromEnd),
    hubId: row.hubId,
    /** The transfer run this parcel travels in (its card shows it), and its place in a multi-hop route (1 of 1 otherwise). */
    runId: row.runId ?? null,
    runReference: row.runReference ?? null,
    hop: row.hop ?? 1,
    hops: row.hops ?? 1,
    orderId: row.orderReference,
    orderUuid: row.orderId,
    amount: row.codAmountUsd > 0 ? row.codAmountUsd : o?.totalUsd,
    paymentType: PAYMENT_LABEL[o?.paymentMethod ?? ""] ?? o?.paymentMethod ?? "—",
    /** The raw method id (cod, wallet…): pages turn it into a label in the rider's language. */
    paymentMethod: o?.paymentMethod ?? "",
    items: legItems.length ? legItems.reduce((s, it) => s + it.qty, 0) : items.reduce((s, it) => s + it.qty, 0),
    legItems,
    legItemsText: (fr: boolean) => legItemsText(legItems, fr),
    attempts: row.attempts ?? 1,
    failureReason: row.failureReason ?? null,
    readyAt: row.readyAt ?? null,
    receivedAt: row.receivedAt ?? null,
    pickedUpAt: row.pickedUpAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    needsCode: !!row.needsCode,
    collectOld: !!row.collectOld,
    sellerName: row.sellerName,
    products: items.map((it) => ({
      productId: it.productId,
      name: it.productName,
      nameFr: it.productNameFr?.trim() || it.productName,
      sku: `SKU-${it.productId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      variant: it.variant || "Default",
      variantFr: it.variantFr?.trim() || null,
      qty: it.qty,
    })),
    stepsDone,
    codAmount: row.kind === "delivery" ? row.codAmountUsd : 0,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const s = socketClient.current;
    const onPush = () => void refresh();
    s?.on("task:updated", onPush);
    s?.on("delivery:updated", onPush);
    return () => {
      s?.off("task:updated", onPush);
      s?.off("delivery:updated", onPush);
    };
  }, [connected, isRider, refresh]);

  return useMemo(() => {
    const riderTasks = queue.map(toRiderTask);
    const mine = riderTasks;
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
      /** Every leg assigned to this rider (any status). */
      riderTasks,
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

/** Where the rider works (`rider:assignment`): the home warehouse. */
export interface RiderAssignment {
  hub: { id: string; name: string; city: string; address: string | null; lat?: number | null; lng?: number | null } | null;
}

export function useRiderAssignment() {
  const rt = useRealtime();
  const [data, setData] = useState<RiderAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const ready = rt.status === "connected" && rt.user?.role === "rider";

  useEffect(() => {
    if (!ready) return;
    let live = true;
    socketClient
      .request<RiderAssignment>("rider:assignment")
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "Could not load your warehouse.");
      });
    return () => {
      live = false;
    };
  }, [ready, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, reload };
}
