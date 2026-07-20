"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Dispute, Order, Payout, Product, Seller } from "@/lib/realtime/types";

/**
 * Live admin data layer — the backend-backed replacement for the mock
 * @/lib/entities + @/lib/admin-entities modules. Everything derives from the
 * signed-in admin's socket, which streams the whole marketplace (all orders,
 * sellers, customers, payouts, disputes, products) plus one-shot admin reads
 * (KPIs, audit, fraud, CMS, roles, flash-sales). Shapes mirror the old mock
 * exports field-for-field so admin pages migrate with a one-line swap.
 *
 * Ids are backend uuid strings (the mock used numbers) — detail pages pass the
 * raw route id instead of Number(id).
 */

const COMMISSION_PCT = 12;

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card",
  airtel_money: "Mobile Money",
  wallet: "Wallet",
};

interface AdminStats {
  orders: number;
  gmv: number;
  revenue: number;
  customers: number;
  sellers: number;
  liveProducts: number;
  pendingDisputes: number;
  pendingPayouts: number;
  commissionUsd: number;
  ordersByStatus: Record<string, number>;
}

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

interface AuditRow {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp?: string;
  createdAt?: string;
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
interface FlashSaleRow {
  id: string;
  name: string;
  nameFr?: string;
  discountPct?: number;
  discount?: number;
  productCount?: number;
  status: string;
  startsAt?: string;
  endsAt?: string;
}
interface CmsRow {
  id?: string;
  key: string;
  title: string;
  type: string;
  active: boolean;
}
interface RoleDef {
  key: string;
  label: string;
  scope: string;
}
interface Broadcast {
  id: string;
  title: string;
  body: string;
  audience: string;
  createdAt: string;
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
function dateOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function parseCityAddr(raw: string | null): { city: string; address: string } {
  if (!raw) return { city: "Kinshasa", address: "—" };
  try {
    const a = JSON.parse(raw) as { city?: string; line1?: string };
    return { city: a.city || "Kinshasa", address: [a.line1, a.city].filter(Boolean).join(", ") || "—" };
  } catch {
    return { city: "Kinshasa", address: raw };
  }
}

function buildAdminData(
  orders: Order[],
  products: Product[],
  payouts: Payout[],
  disputes: Dispute[],
  stats: AdminStats | null,
  customers: CustomerRow[],
  sellers: Seller[],
  audit: AuditRow[],
  fraud: FraudRow[],
  flash: FlashSaleRow[],
  cms: CmsRow[],
  roles: RoleDef[],
  broadcasts: Broadcast[],
) {
  const productSeller = new Map(products.map((p) => [p.id, p.sellerId]));
  const productName = new Map(products.map((p) => [p.id, p.name]));

  // ── Orders (admin sees all) ────────────────────────────────────────────────
  const orderEntities = orders.map((o) => {
    const addr = parseCityAddr(o.shippingAddress);
    const firstSeller = o.items?.map((it) => productSeller.get(it.productId)).find(Boolean) ?? null;
    const commission = Math.round(o.totalUsd * (COMMISSION_PCT / 100));
    return {
      id: o.reference,
      orderId: o.id,
      customerId: o.customerId,
      customer: o.customerName,
      customerPhone: "—",
      customerAddress: addr.address,
      customerCity: addr.city,
      sellerId: firstSeller,
      seller: sellers.find((s) => s.id === firstSeller)?.name ?? "Somba&Teka",
      amount: o.totalUsd,
      status: o.status,
      paymentMethod: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
      paymentStatus:
        o.status === "cancelled" || o.status === "returned"
          ? "refunded"
          : o.status === "pending"
            ? "pending"
            : "paid",
      transactionId: `TXN-${o.reference}`,
      date: dateOf(o.createdAt),
      itemsCount: o.items?.reduce((s, it) => s + it.qty, 0) ?? 0,
      items: (o.items ?? []).map((it) => ({
        productId: it.productId,
        name: it.productName,
        sku: `SKU-${shortId(it.productId)}`,
        variant: it.variant || "Default",
        qty: it.qty,
        price: it.priceUsd,
        image: "/brand/logo-stack.png",
      })),
      warehouse: "Kinshasa Hub",
      rider: o.riderId ? "Assigned rider" : "—",
      trackingNumber: o.reference,
      commission,
      sellerEarnings: o.totalUsd - commission,
      refunds: o.status === "returned" ? o.totalUsd : 0,
      timeline: [
        { time: `${dateOf(o.createdAt)} 09:00`, label: "Placed", done: true },
        { time: `${dateOf(o.createdAt)} 12:00`, label: "Processing", done: o.status !== "pending" },
        { time: `${dateOf(o.createdAt)} 18:00`, label: "Delivered", done: o.status === "delivered" },
      ],
    };
  });

  // ── Sellers (admin) ─────────────────────────────────────────────────────────
  const sellerEntities = sellers.map((s) => {
    const productIds = new Set(products.filter((p) => p.sellerId === s.id).map((p) => p.id));
    const sellerOrders = orders.filter((o) => o.items?.some((it) => productIds.has(it.productId)));
    const revenue = sellerOrders.reduce(
      (sum, o) =>
        sum + (o.items ?? []).filter((it) => productIds.has(it.productId)).reduce((t, it) => t + it.priceUsd * it.qty, 0),
      0,
    );
    const sellerPayouts = payouts.filter((p) => p.sellerName === s.name);
    return {
      id: s.id,
      storeName: s.name,
      owner: s.name,
      email: "—",
      phone: "—",
      city: "Kinshasa",
      country: "DRC",
      address: "—",
      status: (s.status === "rejected" ? "suspended" : s.status) as "pending" | "approved" | "suspended",
      category: "General",
      date: dateOf(s.createdAt),
      orders: sellerOrders.length,
      revenue: Number(revenue.toFixed(2)),
      returns: sellerOrders.filter((o) => o.status === "returned").length,
      cancellations: sellerOrders.filter((o) => o.status === "cancelled").length,
      rating: s.rating,
      healthScore: Math.min(99, 70 + Math.round(s.rating * 5)),
      availableBalance: Number(
        sellerPayouts.filter((p) => p.status === "approved").reduce((t, p) => t + p.amountUsd, 0).toFixed(2),
      ),
      pendingBalance: Number(
        sellerPayouts.filter((p) => p.status === "requested").reduce((t, p) => t + p.amountUsd, 0).toFixed(2),
      ),
      paidBalance: Number(
        sellerPayouts.filter((p) => p.status === "paid").reduce((t, p) => t + p.amountUsd, 0).toFixed(2),
      ),
      commission: COMMISSION_PCT,
      productCount: productIds.size,
      badge: s.badge,
      timeline: [
        { time: dateOf(s.createdAt), label: "Registered" },
        { time: dateOf(s.createdAt), label: s.status === "approved" ? "Approved" : "Pending review", detail: `Status: ${s.status}`, detailFr: `Statut : ${s.status}` },
      ],
    };
  });

  // ── Customers (admin) ─────────────────────────────────────────────────────────
  const customerEntities = customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? "—",
    city: "Kinshasa",
    orders: c.orders,
    totalSpent: c.spendUsd,
    status: (c.active ? "active" : "suspended") as "active" | "suspended",
    joined: dateOf(c.createdAt),
    walletBalance: c.walletBalance,
  }));

  // ── Products / moderation (admin) ─────────────────────────────────────────────
  const moderationQueue = products.map((p) => ({
    id: p.id,
    name: p.name,
    sellerId: p.sellerId ?? "",
    seller: p.sellerName ?? "Somba&Teka",
    sellerRating: 4.6,
    category: p.category,
    brand: p.sellerName ?? "Somba&Teka",
    price: p.price,
    discount: p.discount ?? 0,
    description: p.description ?? "",
    status: (p.status === "live" ? "approved" : p.status === "pending" ? "pending" : "rejected") as
      | "pending"
      | "approved"
      | "rejected",
    submittedDate: "—",
    image: p.image ?? "/brand/logo-stack.png",
    images: [p.image ?? "/brand/logo-stack.png"],
    rating: p.rating,
    stock: p.stock,
  }));

  // ── Payouts (admin) ───────────────────────────────────────────────────────────
  const adminPayoutEntities = payouts.map((p) => ({
    id: p.reference,
    payoutId: p.id,
    sellerId: p.sellerId,
    seller: p.sellerName,
    amount: p.amountUsd,
    method: PAYMENT_LABEL[p.method] ?? p.method ?? "Bank Transfer",
    status: p.status as "requested" | "approved" | "rejected" | "paid",
    requestedAt: dateOf(p.createdAt),
    bankAccount: "****4521",
    note: p.note ?? "",
  }));

  // ── Audit / fraud / cms / roles / flash / broadcasts ──────────────────────────
  const auditLogs = audit.map((a) => ({
    id: a.id,
    actor: a.actor,
    role: a.role,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    before: "",
    after: "",
    timestamp: a.timestamp ?? (a.createdAt ? a.createdAt.slice(0, 16).replace("T", " ") : "—"),
  }));
  const fraudAlerts = fraud.map((f) => ({
    id: f.id,
    type: f.type,
    severity: f.severity,
    customer: f.customer ?? "Unknown",
    orderId: f.orderId,
    score: f.score,
    status: f.status,
    date: f.date ?? (f.createdAt ? dateOf(f.createdAt) : "—"),
  }));
  const cmsBlocks = cms.map((c) => ({
    id: c.id ?? c.key,
    type: c.type,
    title: c.title,
    editable: true,
    active: c.active,
  }));
  const flashSales = flash.map((f) => ({
    id: f.id,
    name: f.name,
    nameFr: f.nameFr ?? f.name,
    start: f.startsAt ? dateOf(f.startsAt) : "—",
    end: f.endsAt ? dateOf(f.endsAt) : "—",
    discount: f.discountPct ?? f.discount ?? 0,
    products: f.productCount ?? 0,
    status: f.status,
  }));
  const adminRoles = roles.map((r) => ({
    id: r.key,
    name: r.label,
    // The backend describes each role by scope text; expose it as the
    // permission list the roles page renders.
    permissions: r.scope ? r.scope.split(/,\s*/) : [],
  }));

  return {
    stats,
    orderEntities,
    sellerEntities,
    customerEntities,
    moderationQueue,
    adminPayoutEntities,
    auditLogs,
    fraudAlerts,
    cmsBlocks,
    flashSales,
    adminRoles,
    broadcasts,
    getOrder: (id: string) => orderEntities.find((o) => o.id === id || o.orderId === id),
    getSeller: (id: string | number) => sellerEntities.find((s) => s.id === String(id)),
    getCustomer: (id: string | number) => customerEntities.find((c) => c.id === String(id)),
    getModerationProduct: (id: string | number) => moderationQueue.find((p) => p.id === String(id)),
  };
}

export type AdminData = ReturnType<typeof buildAdminData>;

export function useAdminData(): AdminData {
  const rt = useRealtime();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [flash, setFlash] = useState<FlashSaleRow[]>([]);
  const [cms, setCms] = useState<CmsRow[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

  const isAdmin = rt.user?.role?.startsWith("admin") ?? false;

  useEffect(() => {
    if (rt.status !== "connected" || !isAdmin) return;
    let alive = true;
    (async () => {
      const req = <T,>(ev: string, fallback: T) =>
        socketClient.request<T>(ev).catch(() => fallback);
      const [st, cus, sel, aud, fr, fl, cm, rl, br] = await Promise.all([
        req<AdminStats | null>("analytics:admin", null),
        req<CustomerRow[]>("customers:list", []),
        req<Seller[]>("sellers:list", []),
        req<AuditRow[]>("audit:list", []),
        req<FraudRow[]>("fraud:list", []),
        req<FlashSaleRow[]>("flashsales:list", []),
        req<CmsRow[]>("cms:list", []),
        req<RoleDef[]>("roles:defs", []),
        req<Broadcast[]>("broadcasts:list", []),
      ]);
      if (!alive) return;
      setStats(st);
      setCustomers(cus ?? []);
      setSellers(sel ?? []);
      setAudit(aud ?? []);
      setFraud(fr ?? []);
      setFlash(fl ?? []);
      setCms(cm ?? []);
      setRoles(rl ?? []);
      setBroadcasts(br ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [rt.status, isAdmin]);

  return useMemo(
    () =>
      buildAdminData(
        rt.orders,
        rt.products,
        rt.payouts,
        rt.disputes,
        stats,
        customers,
        sellers,
        audit,
        fraud,
        flash,
        cms,
        roles,
        broadcasts,
      ),
    [rt.orders, rt.products, rt.payouts, rt.disputes, stats, customers, sellers, audit, fraud, flash, cms, roles, broadcasts],
  );
}
