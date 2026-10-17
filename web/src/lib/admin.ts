"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errMsg } from "@/lib/admin-live";
import type { Order, Product } from "@/lib/realtime/types";

/**
 * Live admin data layer. Orders and products come from the realtime feed; the
 * customer and fraud lists are loaded on demand (`want`) with real loading and
 * error state. Nothing here is invented: a field the server does not record is
 * simply not exposed.
 */

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  walletBalance: number;
  active: boolean;
  orders: number;
  spendUsd: number;
  createdAt: string;
}

interface FraudRow {
  id: string;
  type: string;
  severity: string;
  customer?: string;
  orderId?: string;
  score: number;
  status: string;
  createdAt?: string;
  date?: string;
}

function dateOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function parseAddress(raw: string | null): { city: string; address: string } {
  if (!raw) return { city: "—", address: "—" };
  try {
    const a = JSON.parse(raw) as { city?: string; line1?: string };
    return { city: a.city || "—", address: [a.line1, a.city].filter(Boolean).join(", ") || "—" };
  } catch {
    return { city: "—", address: raw };
  }
}

function buildOrders(orders: Order[], products: Product[]) {
  const bySeller = new Map(products.map((p) => [p.id, p]));
  return orders.map((o) => {
    const addr = parseAddress(o.shippingAddress);
    const first = o.items?.map((it) => bySeller.get(it.productId)).find((p) => p?.sellerId);
    return {
      id: o.reference,
      orderId: o.id,
      customerId: o.customerId,
      customer: o.customerName,
      customerAddress: addr.address,
      customerCity: addr.city,
      sellerId: first?.sellerId ?? null,
      seller: first?.sellerName ?? "—",
      amount: o.totalUsd,
      status: o.status,
      date: dateOf(o.createdAt),
      itemsCount: o.items?.reduce((s, it) => s + it.qty, 0) ?? 0,
    };
  });
}

function buildQueue(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sellerId: p.sellerId ?? "",
    seller: p.sellerName ?? "—",
    category: p.category,
    price: p.price,
    discount: p.discount ?? 0,
    description: p.description ?? "",
    status: (p.status === "live" || p.status === "approved"
      ? "approved"
      : p.status === "pending"
        ? "pending"
        : p.status === "removed"
          ? "removed"
          : p.status === "draft"
            ? "draft"
            : "rejected") as "pending" | "approved" | "rejected" | "removed" | "draft",
    rawStatus: p.status,
    image: p.image ?? "/brand/logo-stack.png",
    rating: p.rating,
    stock: p.stock,
  }));
}

export function useAdminData(want: { customers?: boolean; fraud?: boolean } = {}) {
  const rt = useRealtime();
  const wantCustomers = !!want.customers;
  const wantFraud = !!want.fraud;
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [loading, setLoading] = useState(wantCustomers || wantFraud);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = rt.user?.role?.startsWith("admin") ?? false;

  const refresh = useCallback(async () => {
    if (rt.status !== "connected" || !isAdmin) return;
    try {
      const [cus, fr] = await Promise.all([
        wantCustomers ? socketClient.request<CustomerRow[]>("customers:list") : Promise.resolve(null),
        wantFraud ? socketClient.request<FraudRow[]>("fraud:list") : Promise.resolve(null),
      ]);
      if (cus) setCustomers(cus);
      if (fr) setFraud(fr);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [rt.status, isAdmin, wantCustomers, wantFraud]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (rt.status !== "connected" || !isAdmin) return;
    const sock = socketClient.current;
    if (!sock) return;
    const events = ["customer:updated", "fraud:created", "fraud:updated"];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 400);
    };
    events.forEach((ev) => sock.on(ev, handler));
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((ev) => sock.off(ev, handler));
    };
  }, [rt.status, isAdmin, refresh]);

  const orderEntities = useMemo(() => buildOrders(rt.orders, rt.products), [rt.orders, rt.products]);
  const moderationQueue = useMemo(() => buildQueue(rt.products), [rt.products]);
  const customerEntities = useMemo(
    () =>
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone ?? "—",
        orders: c.orders,
        totalSpent: c.spendUsd,
        status: (c.active ? "active" : "suspended") as "active" | "suspended",
        joined: dateOf(c.createdAt),
        walletBalance: c.walletBalance,
      })),
    [customers],
  );
  const fraudAlerts = useMemo(
    () =>
      fraud.map((f) => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        customer: f.customer ?? "—",
        orderId: f.orderId,
        score: f.score,
        status: f.status,
        date: f.date ?? (f.createdAt ? dateOf(f.createdAt) : "—"),
      })),
    [fraud],
  );

  const actions = useMemo(() => {
    const run = async <T,>(ev: string, body?: Record<string, unknown>) => {
      const res = await socketClient.request<T>(ev, body);
      void refresh();
      return res;
    };
    return {
      setCustomerActive: (id: string, active: boolean) => run("customers:setActive", { id, active }),
      setFraudStatus: (id: string, status: string) => run("fraud:setStatus", { id, status }),
    };
  }, [refresh]);

  const feedLoading = rt.status !== "connected";
  return {
    orderEntities,
    moderationQueue,
    customerEntities,
    fraudAlerts,
    loading: feedLoading || loading,
    error: rt.status === "error" ? (rt.error ?? "Cannot reach the server.") : error,
    reload: refresh,
    getOrder: (id: string) => orderEntities.find((o) => o.id === id || o.orderId === id),
    getCustomer: (id: string | number) => customerEntities.find((c) => c.id === String(id)),
    getModerationProduct: (id: string | number) => moderationQueue.find((p) => p.id === String(id)),
    ...actions,
  };
}
