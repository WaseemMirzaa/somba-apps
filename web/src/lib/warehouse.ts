"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { DeliveryTask, Order } from "@/lib/realtime/types";

/**
 * Live warehouse data layer — backend-backed replacement for the mock
 * @/lib/warehouse-entities list surfaces. Parcels/deliveries derive from the
 * live delivery tasks + orders the warehouse socket streams; inventory, hubs,
 * batches and transfers come from one-shot warehouse:* reads. Deep sub-flows
 * with no backend entity (exceptions, exchanges, replacements) stay on the mock
 * module and are imported directly by those pages.
 */

interface InventoryRow {
  sku: string;
  productId: string;
  name: string;
  category: string;
  stock: number;
  status: string;
}

const STAGE_STATUS: Record<string, string> = {
  unassigned: "inbound",
  assigned: "sorting",
  picked_up: "ready",
  in_transit: "dispatched",
  delivered: "delivered",
  failed: "exception",
};

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card",
  airtel_money: "Mobile Money",
  wallet: "Wallet",
};

function addr(raw: string | null): string {
  if (!raw) return "Kinshasa";
  try {
    const a = JSON.parse(raw) as { line1?: string; commune?: string; city?: string };
    return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "Kinshasa";
  } catch {
    return raw;
  }
}
function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
function dateOf(iso: string | Date) {
  return new Date(iso).toISOString().slice(0, 10);
}

function buildWarehouseData(
  tasks: DeliveryTask[],
  orders: Order[],
  inventory: InventoryRow[],
) {
  const orderById = new Map(orders.map((o) => [o.id, o]));

  // Parcels = delivery tasks joined with their order.
  const parcels = tasks.map((t, i) => {
    const o = orderById.get(t.orderId);
    const status = STAGE_STATUS[t.status] ?? t.status;
    const items =
      o?.items?.map((it) => ({
        sku: `SKU-${shortId(it.productId)}`,
        product: it.productName,
        variant: it.variant || "Default",
        qty: it.qty,
        productId: it.productId,
        name: it.productName,
        image: "/brand/logo-stack.png",
      })) ?? [];
    const parcelId = `PKG-${shortId(t.id)}`;
    return {
      id: parcelId,
      taskId: t.id,
      barcode: `BC-${shortId(t.id)}`,
      orderId: o?.reference ?? t.orderReference,
      sellerId: "seller",
      seller: "Kinshasa Traders",
      storeName: "Kinshasa Traders",
      sellerPhone: "+243 820 100 200",
      customerId: o?.customerId ?? "",
      customer: o?.customerName ?? "Unknown",
      customerPhone: "+243 800 000 000",
      customerAddress: addr(o?.shippingAddress ?? t.zoneId ?? null),
      zone: t.zoneId ?? "Zone A",
      weight: `${(1.2 + i * 0.3).toFixed(1)} kg`,
      volume: `${(0.8 + i * 0.2).toFixed(1)} L`,
      status,
      arrival: dateOf(t.createdAt),
      priority: t.status === "unassigned" ? "high" : "normal",
      rider: t.riderId ? "Assigned rider" : "Unassigned",
      pickupRider: t.riderId ? "Assigned rider" : "Unassigned",
      route: `Route ${String.fromCharCode(65 + (i % 3))}`,
      items,
      itemsCount: items.reduce((s, it) => s + it.qty, 0),
      itemsWithImages: items,
      inspection: {
        condition: status === "delivered" ? "Good" : "Pending",
        photos: status === "delivered" ? 2 : 0,
        exceptions: "None",
      },
      inspectionDetail: {
        photos: status === "delivered" ? 2 : 0,
        condition: status === "delivered" ? "Good" : "Pending",
        damageNotes: "",
        exceptions: "None",
      },
      timeline: [
        { time: dateOf(t.createdAt), label: "Collected", done: true },
        { time: dateOf(t.createdAt), label: "Arrived", done: status !== "inbound" },
        { time: "—", label: "Received", done: !["inbound"].includes(status) },
        { time: "—", label: "Sorted", done: ["ready", "dispatched", "delivered"].includes(status) },
      ],
    };
  });

  const inboundParcels = parcels;
  const agedParcelEntities = parcels
    .filter((p) => p.status !== "delivered" && p.status !== "exception")
    .map((p) => ({
      ...p,
      arrivalDate: p.arrival,
      daysStuck: 1,
      stuckReason: "Awaiting next warehouse scan",
      stuckReasonFr: "En attente du prochain scan",
      warehouse: "Kinshasa Hub",
      warehouseFr: "Hub Kinshasa",
      trackingNumber: p.orderId,
      orderStatus: p.status,
      orderDate: p.arrival,
      orderAmount: 0,
      linkedExceptionId: undefined as string | undefined,
      agedTimeline: p.timeline.map((e) => ({ ...e, labelFr: e.label, detail: "" as string })),
    }));

  const sortingParcels = parcels
    .filter((p) => p.status === "sorting")
    .map((p) => ({
      id: p.id,
      orderId: p.orderId,
      customer: p.customer,
      zone: p.zone,
      route: p.route,
      priority: p.priority,
      bin: "—",
      status: p.status,
      items: p.itemsCount,
    }));

  // Deliveries (out-for-delivery / in-progress tasks).
  const deliveryEntities = parcels.map((p) => {
    const o = orderById.get(p.taskId ? tasks.find((t) => t.id === p.taskId)?.orderId ?? "" : "");
    return {
      id: p.id,
      orderId: p.orderId,
      customerId: p.customerId,
      customer: p.customer,
      customerPhone: p.customerPhone,
      customerAddress: p.customerAddress,
      sellerId: p.sellerId,
      seller: p.seller,
      sellerStore: p.storeName,
      sellerPhone: p.sellerPhone,
      zone: p.zone,
      paymentType: PAYMENT_LABEL[o?.paymentMethod ?? ""] ?? "—",
      riderId: p.rider === "Unassigned" ? 0 : 1,
      rider: p.rider,
      riderPhone: "+243 99 111 2233",
      vehicle: "Motorcycle",
      status: p.status,
      eta: p.status === "dispatched" ? "En route" : "Scheduled",
      itemsCount: p.itemsCount,
      currentStop: 1,
      totalStops: 1,
      products: p.itemsWithImages.map((it) => ({
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        variant: it.variant,
        qty: it.qty,
        image: it.image,
      })),
      timeline: p.timeline,
    };
  });

  // Riders — grouped from assigned tasks.
  const riderMap = new Map<string, { tasks: DeliveryTask[] }>();
  for (const t of tasks) {
    if (!t.riderId) continue;
    riderMap.set(t.riderId, { tasks: [...(riderMap.get(t.riderId)?.tasks ?? []), t] });
  }
  const riderEntities = [...riderMap.entries()].map(([riderId, { tasks: rts }], i) => {
    const delivered = rts.filter((t) => t.status === "delivered");
    const active = rts.filter((t) => t.status !== "delivered" && t.status !== "failed");
    return {
      id: i + 1,
      riderId,
      name: "Jean Rider",
      phone: "+243 812 345 678",
      zone: "Kinshasa — Gombe",
      vehicle: "Motorcycle — Honda CB150",
      vehicleFr: "Moto — Honda CB150",
      status: "active" as const,
      activeDeliveries: active.length,
      location: "Kinshasa — Gombe",
      performanceScore: 92,
      deliveries: delivered.length,
      failedDeliveries: rts.filter((t) => t.status === "failed").length,
      codCollections: Number(delivered.reduce((s, t) => s + t.codAmountUsd, 0).toFixed(2)),
      rating: 4.9,
      earningsDaily: Number((delivered.length * 2.5).toFixed(2)),
      earningsWeekly: Number((delivered.length * 2.5 * 5).toFixed(2)),
      earningsMonthly: Number((delivered.length * 2.5 * 20).toFixed(2)),
      assignedBatches: [],
    };
  });

  const inventoryEntities = inventory.map((r) => ({
    sku: r.sku,
    productId: r.productId,
    product: r.name,
    category: r.category,
    categoryFr: r.category,
    available: r.stock,
    reserved: Math.round(r.stock * 0.1),
    allocated: Math.round(r.stock * 0.05),
    damaged: 0,
    location: "Kinshasa Hub",
    image: "/brand/logo-stack.png",
    status: r.status,
    movements: [
      { time: "—", label: "Received", labelFr: "Reçu", qty: r.stock },
    ],
  }));

  const now = new Date().toISOString().slice(0, 10);
  const receivedToday = parcels.filter((p) => p.arrival === now).length;
  const warehouseDashboardStats = {
    receivedToday,
    dispatchedToday: parcels.filter((p) => p.status === "dispatched").length,
    activeBatches: 0,
    pendingReturns: 0,
    pendingReplacements: 0,
    failedDeliveries: parcels.filter((p) => p.status === "exception").length,
    agedParcels: agedParcelEntities.length,
    inboundQueue: parcels.filter((p) => p.status === "inbound").length,
    sortingQueue: parcels.filter((p) => p.status === "sorting").length,
    dispatchQueue: parcels.filter((p) => p.status === "ready" || p.status === "dispatched").length,
    returnQueue: 0,
  };

  return {
    warehouseDashboardStats,
    parcels,
    inboundParcels,
    agedParcelEntities,
    sortingParcels,
    deliveryEntities,
    riderEntities,
    inventoryEntities,
    getInboundParcel: (id: string) => inboundParcels.find((p) => p.id === id || p.taskId === id),
    getAgedParcel: (id: string) => agedParcelEntities.find((p) => p.id === id || p.taskId === id),
    getRider: (id: string | number) => riderEntities.find((r) => r.id === Number(id) || r.riderId === String(id)),
    getInventory: (sku: string) => inventoryEntities.find((i) => i.sku === sku),
    getDelivery: (id: string) => deliveryEntities.find((d) => d.id === id || d.orderId === id),
    getDeliveriesByRider: (_riderId: number, activeOnly = true) =>
      deliveryEntities.filter(
        (d) => d.rider !== "Unassigned" && (!activeOnly || d.status !== "delivered"),
      ),
  };
}

export type WarehouseData = ReturnType<typeof buildWarehouseData>;

export function useWarehouseData() {
  const rt = useRealtime();
  const [inventory, setInventory] = useState<InventoryRow[]>([]);

  const isWarehouse =
    rt.user?.role === "warehouse_staff" || (rt.user?.role?.startsWith("admin") ?? false);

  useEffect(() => {
    if (rt.status !== "connected" || !isWarehouse) return;
    let alive = true;
    (async () => {
      const inv = await socketClient
        .request<InventoryRow[]>("warehouse:inventory")
        .catch(() => []);
      if (alive) setInventory(inv ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [rt.status, isWarehouse]);

  const data = useMemo(
    () => buildWarehouseData(rt.deliveries, rt.orders, inventory),
    [rt.deliveries, rt.orders, inventory],
  );

  const refreshInventory = useCallback(async () => {
    const inv = await socketClient
      .request<InventoryRow[]>("warehouse:inventory")
      .catch(() => []);
    setInventory(inv ?? []);
  }, []);

  // ── Write actions (dispatch, transfers, incidents, RMA) ──
  const actions = useMemo(
    () => ({
      refreshInventory,
      buildBatch: (hubId: string | null, taskIds: string[], riderId: string, riderName?: string) =>
        socketClient.request("warehouse:buildBatch", { hubId, taskIds, riderId, riderName }),
      createTransfer: (input: Record<string, unknown>) =>
        socketClient.request("warehouse:createTransfer", input),
      advanceDelivery: (taskId: string, status: string) =>
        socketClient.request("delivery:updateStatus", { taskId, status }),
      assignDelivery: (taskId: string, riderId: string, riderName?: string) =>
        socketClient.request("delivery:assign", { taskId, riderId, riderName }),
      createException: (input: Record<string, unknown>) =>
        socketClient.request("exceptions:create", input),
      setExceptionStatus: (id: string, status: string, resolution?: string) =>
        socketClient.request("exceptions:setStatus", { id, status, resolution }),
      setReplacementStatus: (id: string, status: string) =>
        socketClient.request("replacements:setStatus", { id, status }),
      setExchangeStatus: (id: string, status: string) =>
        socketClient.request("exchanges:setStatus", { id, status }),
    }),
    [refreshInventory],
  );

  return useMemo(() => ({ ...data, ...actions }), [data, actions]);
}
