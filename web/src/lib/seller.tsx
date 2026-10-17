"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { authApi } from "@/lib/realtime/auth-api";
import type {
  Dispute,
  Order,
  Payment,
  Payout,
  Product,
  Review,
  Seller,
  SellerStats,
} from "@/lib/realtime/types";

/**
 * Live seller data layer. Everything here derives from the signed-in seller's
 * REAL catalogue, orders, payouts, campaigns, tickets and reviews (read over
 * the one socket). Anything the server does not store is simply not shown.
 *
 * Two parts:
 *  - <SellerDataProvider> (mounted once in the /seller layout) owns the raw
 *    server state, refreshes it, listens to live pushes, and exposes the
 *    write actions. EVERY write rejects with the server's error message so
 *    the calling page can `toast(error.message)` and stay put.
 *  - useSellerData() derives the view-models the pages render.
 */

const DEFAULT_COMMISSION_PCT = 12;
const LOW_STOCK_THRESHOLD = 10;
/** Pushes arrive in bursts (an order + its payment + its delivery): coalesce the follow-up reads. */
const PUSH_DEBOUNCE_MS = 400;
const FALLBACK_IMAGE = "/brand/logo-stack.png";

// ─── Server shapes not (yet) in lib/realtime/types ───────────────────────────
export type SellerStore = Seller & {
  pickupAddress?: string | null;
  /** The plan stored on the row (may have lapsed). */
  plan?: string | null;
  planExpiresAt?: string | null;
  /** The plan actually in force right now (a lapsed paid plan reads "free"). */
  activePlan?: string;
};

/** A product row as `products:list` / `product:updated` return it for the owning seller. */
export type SellerProductRow = Product & {
  /** The stored listing price (`price` is the effective price shoppers pay). */
  basePrice?: number;
  campaignPct?: number;
  campaignId?: string | null;
  campaignName?: string | null;
  priceSource?: "base" | "flash" | "campaign";
};

export type SellerReview = Review & {
  status?: "visible" | "hidden";
  sellerReply?: string | null;
  sellerReplyAt?: string | null;
};

/** A public seller subscription plan (`sellers:plans`). */
export interface SellerPlanInfo {
  id: string;
  name: string;
  nameFr?: string;
  /** null = "contact sales" (cannot be bought online); 0 = free. */
  priceUsd: number | null;
  months: number;
  maxProducts?: number | null;
  features: string[];
  featuresFr?: string[];
  popular?: boolean;
}

export type PlanPayment = Payment & {
  purpose?: string;
  subject?: string | null;
  failureReason?: string | null;
};

export interface SubscribeResult {
  status: "active" | "pending";
  plan: SellerPlanInfo;
  payment: PlanPayment;
  seller: SellerStore;
}

export interface PayoutAvailability {
  earned: number;
  committed: number;
  available: number;
  commissionPct: number;
}

export type SellerPayout = Payout & {
  account?: string | null;
  providerRef?: string | null;
};

export interface Campaign {
  id: string;
  reference: string;
  sellerId: string | null;
  sellerName: string | null;
  name: string;
  nameFr: string | null;
  discount: number;
  productCount: number;
  budgetUsd: number;
  startDate: string | null;
  endDate: string | null;
  status: "draft" | "pending" | "scheduled" | "active" | "ended" | "rejected";
  /** Products the campaign covers; empty = every product of the store. */
  productIds?: string[];
  views: number;
  clicks: number;
  orders: number;
  revenueUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  from: string;
  role: string;
  text: string;
  at: string;
}

export interface SupportTicket {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  subject: string;
  category: string;
  orderId: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Replacement {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  sku: string;
  productName: string;
  reason: string | null;
  condition: string | null;
  status: "requested" | "approved" | "received" | "allocated" | "dispatched" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  nameFr?: string;
  price: number;
  originalPrice?: number | null;
  category: string;
  categoryFr?: string;
  stock: number;
  image?: string;
  description?: string;
}

export type StoreGateState =
  | "loading"
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

// ─── Small helpers ───────────────────────────────────────────────────────────
function request<T>(event: string, body?: unknown): Promise<T> {
  return socketClient.request<T>(event, body);
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...list];
  const next = [...list];
  next[i] = item;
  return next;
}

function parseTicket(raw: unknown): SupportTicket {
  const t = raw as Record<string, unknown>;
  let messages: SupportMessage[] = [];
  if (Array.isArray(t.messages)) messages = t.messages as SupportMessage[];
  else if (typeof t.messages === "string") {
    try {
      const parsed = JSON.parse(t.messages);
      if (Array.isArray(parsed)) messages = parsed as SupportMessage[];
    } catch {
      messages = [];
    }
  }
  return { ...(t as unknown as SupportTicket), messages };
}

function firstNameOnly(fullName: string): string {
  return (fullName ?? "").split(" ")[0] || "—";
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function cityFromAddress(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { city?: string };
    return a.city || "—";
  } catch {
    return "—";
  }
}

const money = (n: number) => Number(n.toFixed(2));
const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Upload one product photo (JPEG/PNG/WebP, ≤ 5 MB) and return its public URL. */
export async function uploadImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Only JPEG, PNG or WebP images are allowed.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("That image is larger than 5 MB.");
  }
  const send = (token: string | null) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${authApi.apiUrl}/api/v1/uploads`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  };
  let res = await send(authApi.getAccess());
  if (res.status === 401) {
    const refresh = authApi.getRefresh();
    if (refresh) {
      try {
        const fresh = await authApi.refresh(refresh);
        authApi.saveTokens(fresh);
        res = await send(fresh.accessToken);
      } catch {
        /* fall through with the 401 */
      }
    }
  }
  const json = (await res.json().catch(() => ({}))) as {
    url?: string;
    message?: string | string[];
  };
  if (!res.ok || !json.url) {
    const msg = Array.isArray(json.message) ? json.message.join(" ") : json.message;
    throw new Error(msg ?? `Upload failed (${res.status}).`);
  }
  return json.url;
}

// ─── Derived shapes ──────────────────────────────────────────────────────────
export type SellerPayoutItemStatus =
  | "awaiting_delivery"
  | "pending_clearance"
  | "ready_for_payout"
  | "paid_out";

export interface SellerPayoutPendingItem {
  id: string;
  orderId: string;
  productId: string;
  listingName: string;
  deliveryDate: string | null;
  orderAmount: number;
  commission: number;
  netEarnings: number;
  status: SellerPayoutItemStatus;
  payoutId?: string;
  clearanceEndsAt?: string;
}

export interface StatementRow {
  month: string; // YYYY-MM
  orders: number;
  gross: number;
  commission: number;
  net: number;
  paidOut: number;
}

interface BuildInput {
  storeName: string;
  seller: SellerStore | null;
  stats: SellerStats | null;
  products: SellerProductRow[];
  orders: Order[];
  payouts: SellerPayout[];
  disputes: Dispute[];
  reviews: SellerReview[];
  available: PayoutAvailability | null;
  campaigns: Campaign[];
  replacements: Replacement[];
  readyAt: Record<string, string>;
}

function buildSellerData(input: BuildInput) {
  const {
    storeName, seller, stats, products, orders, payouts, disputes, reviews,
    available, campaigns, replacements, readyAt,
  } = input;
  const commissionPct = available?.commissionPct ?? DEFAULT_COMMISSION_PCT;
  const rate = commissionPct / 100;

  const mine = products.filter(
    (p) =>
      p.status !== "removed" &&
      ((seller && p.sellerId === seller.id) || (!!seller?.userId && p.sellerId === seller.userId)),
  );
  const imageById = new Map(mine.map((p) => [p.id, p.image || FALLBACK_IMAGE]));

  // Orders of this seller. The server already scopes `orders:list` to the
  // seller's own lines, so no extra filtering is needed here.
  const sellerOrders = orders.filter((o) => (o.items?.length ?? 0) > 0);

  const countsAsSale = (o: Order) => o.status !== "cancelled" && o.status !== "returned" && o.status !== "pending";

  // Per-product sales from real orders.
  const soldByProduct = new Map<string, { qty: number; revenue: number; orders: number; inFlight: number }>();
  for (const o of sellerOrders) {
    for (const it of o.items ?? []) {
      const cur = soldByProduct.get(it.productId) ?? { qty: 0, revenue: 0, orders: 0, inFlight: 0 };
      if (countsAsSale(o)) {
        cur.qty += it.qty;
        cur.revenue += it.priceUsd * it.qty;
        cur.orders += 1;
        if (o.status !== "delivered") cur.inFlight += it.qty;
      }
      soldByProduct.set(it.productId, cur);
    }
  }

  const sellerProductList = mine.map((p) => {
    const sale = soldByProduct.get(p.id) ?? { qty: 0, revenue: 0, orders: 0, inFlight: 0 };
    // `price` from the server is the EFFECTIVE price (after a campaign / flash
    // sale); the stored list price is `basePrice`. Pages show/edit the list
    // price and surface the promotion separately.
    const listPrice = p.basePrice ?? p.price;
    const priceSource = p.priceSource ?? "base";
    // While a promotion runs the server's `originalPrice` is the "was" price
    // (= max(compare-at, list price)); only a value above the list price is a real compare-at.
    const compareAt = priceSource === "base" ? p.originalPrice : p.originalPrice && p.originalPrice > listPrice ? p.originalPrice : null;
    return {
      id: p.id,
      sku: `SKU-${shortId(p.id)}`,
      name: p.name,
      nameFr: p.nameFr ?? p.name,
      price: listPrice,
      originalPrice: compareAt,
      effectivePrice: p.price,
      priceSource,
      campaignPct: p.campaignPct ?? 0,
      campaignName: p.campaignName ?? null,
      image: p.image || FALLBACK_IMAGE,
      hasImage: !!p.image,
      status: p.status, // REAL: live | pending | rejected | draft | approved
      description: p.description ?? "",
      brand: p.sellerName ?? storeName,
      category: p.category,
      categoryFr: p.categoryFr ?? p.category,
      stock: p.stock,
      reserved: sale.inFlight,
      sold: sale.qty,
      availableStock: p.stock,
      reservedStock: sale.inFlight,
      soldCount: sale.qty,
      rating: p.rating || 0,
      reviewsCount: p.reviewsCount,
      commission: commissionPct,
      netRevenue: money(p.price * (1 - rate)), // per sale at the price shoppers pay now
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      allocatedStock: sale.inFlight,
      orders: sale.orders,
      revenue: money(sale.revenue),
      productOrders: sellerOrders
        .filter((o) => countsAsSale(o) && o.items?.some((it) => it.productId === p.id))
        .slice(0, 10)
        .map((o) => ({
          orderNumber: o.reference,
          customer: firstNameOnly(o.customerName),
          quantity: o.items.find((it) => it.productId === p.id)?.qty ?? 1,
          amount: o.items
            .filter((it) => it.productId === p.id)
            .reduce((s, it) => s + it.priceUsd * it.qty, 0),
          status: o.status,
          date: dayOf(o.createdAt),
        })),
      productReviews: reviews
        .filter((r) => r.productId === p.id)
        .map((r) => ({
          customer: r.author,
          rating: r.rating,
          review: r.text,
          reply: r.sellerReply ?? null,
          date: dayOf(r.createdAt),
        })),
    };
  });

  const sellerInventoryList = sellerProductList.map((p) => ({
    sku: p.sku,
    productId: p.id,
    product: p.name,
    category: p.category,
    categoryFr: p.categoryFr,
    available: p.availableStock,
    reserved: p.reservedStock,
    allocated: p.allocatedStock,
    sold: p.soldCount,
    image: p.image,
    status: p.status,
    // Real movements: one "Sold" line per order containing this product.
    movements: p.productOrders.map((o) => ({
      date: o.date,
      type: "Sold",
      typeFr: "Vendu",
      quantity: -o.quantity,
      reference: o.orderNumber,
    })),
  }));

  // ── Orders ──
  const sellerOrderList = sellerOrders.map((o) => {
    const amount = money(
      (o.items ?? []).reduce((s, it) => s + it.priceUsd * it.qty, 0) || o.totalUsd,
    );
    const commission = money(amount * rate);
    const date = dayOf(o.createdAt);
    const ready = readyAt[o.id];
    // Shipping status comes straight from the live order status.
    let shippingStatus: string;
    switch (o.status) {
      case "pending": shippingStatus = "pending"; break;
      case "confirmed": shippingStatus = ready ? "ready" : "awaiting_pickup"; break;
      case "processing": shippingStatus = "rider_assigned"; break;
      case "shipped": shippingStatus = "picked_up"; break;
      case "out_for_delivery": shippingStatus = "in_transit"; break;
      case "delivered": shippingStatus = "delivered"; break;
      default: shippingStatus = o.status; // cancelled | returned
    }
    const paymentStatus =
      o.status === "cancelled" || o.status === "returned"
        ? "refunded"
        : o.status === "pending" || (o.paymentMethod === "cod" && o.status !== "delivered")
          ? "pending"
          : "paid";
    const past = (list: string[]) => list.includes(o.status);
    const timeline = [
      { time: date, label: "Placed", labelFr: "Commandée", detail: "", detailFr: "", done: true },
      { time: "", label: "Confirmed", labelFr: "Confirmée", detail: "", detailFr: "", done: o.status !== "pending" && o.status !== "cancelled" },
      { time: ready ? new Date(ready).toISOString().slice(0, 16).replace("T", " ") : "", label: "Package ready (you)", labelFr: "Colis prêt (vous)", detail: "", detailFr: "", done: !!ready || past(["processing", "shipped", "out_for_delivery", "delivered"]) },
      { time: "", label: "Rider assigned", labelFr: "Livreur assigné", detail: "", detailFr: "", done: past(["processing", "shipped", "out_for_delivery", "delivered"]) },
      { time: "", label: "Picked up", labelFr: "Collecté", detail: "", detailFr: "", done: past(["shipped", "out_for_delivery", "delivered"]) },
      { time: "", label: "Out for delivery", labelFr: "En cours de livraison", detail: "", detailFr: "", done: past(["out_for_delivery", "delivered"]) },
      { time: "", label: "Delivered", labelFr: "Livrée", detail: "", detailFr: "", done: o.status === "delivered" },
    ];
    return {
      id: o.reference,
      orderId: o.id,
      customer: firstNameOnly(o.customerName),
      customerCity: cityFromAddress(o.shippingAddress),
      items: (o.items ?? []).reduce((s, it) => s + it.qty, 0),
      amount,
      paymentMethod: o.paymentMethod,
      orderStatus: o.status,
      shippingStatus,
      readyAt: ready ?? null,
      date,
      createdAt: o.createdAt,
      commission,
      netEarnings: money(amount - commission),
      paymentStatus,
      hasRider: !!o.riderId || ["processing", "shipped", "out_for_delivery", "delivered"].includes(o.status),
      items_detail: (o.items ?? []).map((it) => ({
        productId: it.productId,
        name: it.productName,
        sku: `SKU-${shortId(it.productId)}`,
        qty: it.qty,
        price: it.priceUsd,
        variant: it.variant || "",
        image: imageById.get(it.productId) ?? FALLBACK_IMAGE,
      })),
      timeline,
    };
  });

  // Shipments: one per order that left the "pending" state. Only facts the
  // server gave us — no invented warehouses, riders or phone numbers.
  const shipmentList = sellerOrderList
    .filter((o) => o.shippingStatus !== "pending")
    .map((order) => ({
      id: `SHP-${order.id.replace(/[^0-9A-Za-z]/g, "").slice(-6)}`,
      orderId: order.id,
      orderRealId: order.orderId,
      status: order.shippingStatus,
      createdDate: order.date,
      carrier: "Somba&Teka Logistics",
      carrierFr: "Somba&Teka Logistique",
      trackingNumber: order.id,
      riderAssigned: order.hasRider,
      readyAt: order.readyAt,
      pickupAddress: seller?.pickupAddress ?? null,
      customer: { name: order.customer, city: order.customerCity },
      seller: { storeName },
      products: order.items_detail,
      timeline: order.timeline,
    }));

  // ── Payouts ──
  const payoutList = payouts.map((p) => ({
    id: p.reference,
    payoutId: p.id,
    amount: p.amountUsd,
    methodKey: p.method,
    status: p.status,
    date: dayOf(p.createdAt),
    account: p.account ?? null,
    providerRef: p.providerRef ?? null,
    note: p.note ?? "",
  }));

  // Per-order earnings (delivered = earned; the rest is on its way).
  const sellerPayoutPendingItems: SellerPayoutPendingItem[] = sellerOrderList
    .filter((o) => o.orderStatus !== "cancelled" && o.orderStatus !== "returned")
    .map((o) => {
      const status: SellerPayoutItemStatus =
        o.orderStatus === "delivered"
          ? "ready_for_payout"
          : ["processing", "shipped", "out_for_delivery"].includes(o.orderStatus)
            ? "pending_clearance"
            : "awaiting_delivery";
      return {
        id: `POI-${o.id}`,
        orderId: o.id,
        productId: o.items_detail[0]?.productId ?? o.id,
        listingName: o.items_detail[0]?.name ?? "—",
        deliveryDate: o.orderStatus === "delivered" ? o.date : null,
        orderAmount: o.amount,
        commission: o.commission,
        netEarnings: o.netEarnings,
        status,
      };
    });

  const inDeliveryNet = sellerPayoutPendingItems
    .filter((i) => i.status !== "ready_for_payout")
    .reduce((s, i) => s + i.netEarnings, 0);

  const sellerPayoutSummary = {
    totalPending: money(inDeliveryNet),
    availableForPayout: available?.available ?? 0,
    earned: available?.earned ?? 0,
    committed: available?.committed ?? 0,
    commissionPct,
    availableLoaded: available !== null,
    commissionDeducted: money(sellerPayoutPendingItems.reduce((s, i) => s + i.commission, 0)),
  };

  // Transactions (derived from live seller orders).
  const transactionList = sellerOrderList.map((o) => ({
    order: o.id,
    customer: o.customer,
    grossAmount: o.amount,
    commission: o.commission,
    netAmount: o.netEarnings,
    status: o.paymentStatus,
    date: o.date,
  }));

  // Monthly statements from delivered orders + paid payouts.
  const stmt = new Map<string, StatementRow>();
  const row = (month: string): StatementRow => {
    let r = stmt.get(month);
    if (!r) {
      r = { month, orders: 0, gross: 0, commission: 0, net: 0, paidOut: 0 };
      stmt.set(month, r);
    }
    return r;
  };
  for (const o of sellerOrderList) {
    if (o.orderStatus !== "delivered") continue;
    const r = row(o.date.slice(0, 7));
    r.orders += 1;
    r.gross += o.amount;
    r.commission += o.commission;
    r.net += o.netEarnings;
  }
  for (const p of payouts) {
    if (p.status !== "paid") continue;
    row(dayOf(p.createdAt).slice(0, 7)).paidOut += p.amountUsd;
  }
  const statements: StatementRow[] = [...stmt.values()]
    .map((r) => ({
      ...r,
      gross: money(r.gross),
      commission: money(r.commission),
      net: money(r.net),
      paidOut: money(r.paidOut),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  // Real revenue by category (sales that count: not pending / cancelled / returned).
  const productById = new Map(products.map((p) => [p.id, p]));
  const catMap = new Map<string, { category: string; categoryFr: string; gross: number; orders: Set<string> }>();
  for (const o of sellerOrders) {
    if (!countsAsSale(o)) continue;
    for (const it of o.items ?? []) {
      const prod = productById.get(it.productId);
      const key = prod?.category ?? "—";
      const cur = catMap.get(key) ?? { category: key, categoryFr: prod?.categoryFr ?? key, gross: 0, orders: new Set<string>() };
      cur.gross += it.priceUsd * it.qty;
      cur.orders.add(o.id);
      catMap.set(key, cur);
    }
  }
  const categoryRevenue = [...catMap.values()]
    .map((c) => ({
      category: c.category,
      categoryFr: c.categoryFr,
      gross: money(c.gross),
      commission: money(c.gross * rate),
      net: money(c.gross * (1 - rate)),
      orders: c.orders.size,
      rate: commissionPct,
    }))
    .sort((a, b) => b.gross - a.gross);

  // Reviews on this store's products, newest first; `reply` is the seller's public answer.
  const sellerReviewList = [...reviews]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      id: r.id,
      reviewId: r.id,
      customer: r.author,
      productId: r.productId,
      product: r.productName ?? mine.find((p) => p.id === r.productId)?.name ?? "—",
      rating: r.rating,
      review: r.text,
      reply: r.sellerReply ?? null,
      repliedAt: r.sellerReplyAt ?? null,
      date: dayOf(r.createdAt),
    }));

  // Returns / disputes visible to this account.
  const orderAmountByRef = new Map(sellerOrderList.map((o) => [o.id, o.amount]));
  const toCase = (d: Dispute) => ({
    id: d.reference,
    disputeId: d.id,
    orderId: d.orderReference,
    customer: firstNameOnly(d.customerName),
    reason: d.reason,
    resolution: d.resolution ?? "",
    amount: orderAmountByRef.get(d.orderReference) ?? 0,
    status: d.status,
    type: d.type,
    date: dayOf(d.createdAt),
    createdAt: d.createdAt,
  });
  const sellerReturnList = disputes.filter((d) => d.type === "return").map(toCase);
  const sellerDisputeList = disputes.filter((d) => d.type === "dispute").map(toCase);

  // Dashboard stats (live).
  const pendingOrders = sellerOrderList.filter((o) => o.orderStatus === "pending" || o.orderStatus === "confirmed").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = sellerOrderList.filter((o) => o.date === todayStr);
  const liveRevenue = sellerOrderList
    .filter((o) => o.orderStatus !== "cancelled" && o.orderStatus !== "returned" && o.orderStatus !== "pending")
    .reduce((s, o) => s + o.amount, 0);
  const revenue = stats?.revenue ?? liveRevenue;
  const productsSold = sellerProductList.reduce((s, p) => s + p.soldCount, 0);
  // Store rating: the server's own figure, else the review-weighted mean of the rated listings.
  const rated = mine.filter((p) => (p.reviewsCount ?? 0) > 0);
  const ratedCount = rated.reduce((s, p) => s + p.reviewsCount, 0);
  const avgRating = ratedCount > 0 ? Number((rated.reduce((s, p) => s + p.rating * p.reviewsCount, 0) / ratedCount).toFixed(1)) : 0;

  const sellerDashboardStats = {
    todayRevenue: money(todayOrders.reduce((s, o) => s + o.amount, 0)),
    todayOrders: todayOrders.length,
    pendingOrders,
    productsSold,
    storeRating: seller?.rating || avgRating,
    pendingReturns: sellerReturnList.filter((r) => r.status === "open").length,
    pendingReplacements: replacements.filter((r) => r.status === "requested").length,
  };

  const sellerStore = {
    name: storeName,
    owner: storeName,
    rating: seller?.rating || avgRating,
    status: seller?.status ?? "pending",
    pickupAddress: seller?.pickupAddress ?? "",
    badge:
      seller?.badge === "somba_assured"
        ? "Somba Assured"
        : seller?.badge
          ? seller.badge.charAt(0).toUpperCase() + seller.badge.slice(1)
          : "Bronze",
  };

  const paidOut = stats?.paidOut ?? payoutList.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const commissionPaid = money(revenue * rate);
  const refundAmount = money(
    sellerOrderList
      .filter((o) => o.orderStatus === "cancelled" || o.orderStatus === "returned")
      .reduce((s, o) => s + o.amount, 0),
  );
  const sellerFinanceStats = {
    revenue: money(revenue),
    pendingRevenue: money(inDeliveryNet),
    availableBalance: available?.available ?? 0,
    earned: available?.earned ?? 0,
    committed: available?.committed ?? 0,
    commissionPaid,
    refundAmount,
    paidOut: money(paidOut),
    commissionPct,
    availableLoaded: available !== null,
  };

  const lowStockProducts = sellerProductList.filter(
    (p) => p.status !== "rejected" && p.availableStock < LOW_STOCK_THRESHOLD,
  );
  const topSellingProducts = [...sellerProductList].sort((a, b) => b.soldCount - a.soldCount).slice(0, 5);

  const storeSettings = {
    storeName,
    pickupAddress: seller?.pickupAddress ?? "",
  };

  // Campaigns (live).
  const promotionList = campaigns.map((c) => ({
    id: c.id,
    reference: c.reference,
    campaign: c.name,
    products: c.productCount,
    productIds: c.productIds ?? [],
    discount: c.discount,
    startDate: c.startDate ?? "—",
    endDate: c.endDate ?? "—",
    status: c.status,
    budget: c.budgetUsd,
    views: c.views,
    clicks: c.clicks,
    orders: c.orders,
    revenue: c.revenueUsd,
    roi: c.budgetUsd > 0 ? Number((c.revenueUsd / c.budgetUsd).toFixed(2)) : 0,
  }));

  // Replacements (live, read-only).
  const sellerReplacementList = replacements.map((r) => ({
    id: r.reference,
    replacementId: r.id,
    orderId: r.orderReference,
    customer: firstNameOnly(r.customerName),
    sku: r.sku,
    productName: r.productName,
    reason: r.reason ?? "",
    condition: r.condition ?? "",
    status: r.status,
    date: dayOf(r.createdAt),
  }));

  // Recent activity: the latest real events of this store, newest first.
  const activity: { at: string; kind: "order" | "payout" | "review" | "campaign"; text: string; textFr: string; href: string }[] = [];
  for (const o of sellerOrderList) {
    activity.push({
      at: o.createdAt,
      kind: "order",
      text: `New order ${o.id} — $${o.amount.toFixed(2)}`,
      textFr: `Nouvelle commande ${o.id} — ${o.amount.toFixed(2)} $`,
      href: `/seller/orders/${o.id}`,
    });
  }
  for (const p of payouts) {
    const word: Record<string, [string, string]> = {
      requested: ["requested", "demandé"],
      approved: ["approved", "approuvé"],
      paid: ["paid", "versé"],
      rejected: ["rejected", "refusé"],
    };
    const [en, frw] = word[p.status] ?? [p.status, p.status];
    activity.push({
      at: p.createdAt,
      kind: "payout",
      text: `Payout ${p.reference} ${en} — $${p.amountUsd.toFixed(2)}`,
      textFr: `Paiement ${p.reference} ${frw} — ${p.amountUsd.toFixed(2)} $`,
      href: `/seller/finance/payouts/${p.id}`,
    });
  }
  for (const r of reviews) {
    const name = r.productName ?? mine.find((p) => p.id === r.productId)?.name ?? "—";
    activity.push({
      at: r.createdAt,
      kind: "review",
      text: `Review received — ${r.rating}★ on ${name}`,
      textFr: `Avis reçu — ${r.rating}★ sur ${name}`,
      href: "/seller/reviews",
    });
  }
  for (const c of campaigns) {
    activity.push({
      at: c.updatedAt || c.createdAt,
      kind: "campaign",
      text: `Campaign ${c.name}: ${c.status}`,
      textFr: `Campagne ${c.name} : ${c.status}`,
      href: `/seller/promotions/${c.id}`,
    });
  }
  const recentActivity = activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return {
    sellerStore,
    recentActivity,
    sellerDashboardStats,
    sellerFinanceStats,
    sellerProductList,
    sellerInventoryList,
    sellerOrderList,
    shipmentList,
    payoutList,
    sellerPayoutPendingItems,
    sellerPayoutSummary,
    transactionList,
    statements,
    categoryRevenue,
    sellerReviewList,
    sellerReturnList,
    sellerDisputeList,
    promotionList,
    sellerReplacementList,
    lowStockProducts,
    topSellingProducts,
    storeSettings,
    commissionPct,
    // Lookups
    getSellerProductFull: (id: string | number) =>
      sellerProductList.find((p) => p.id === String(id)),
    getSellerInventory: (sku: string) => sellerInventoryList.find((i) => i.sku === sku),
    getSellerOrder: (id: string) =>
      sellerOrderList.find((o) => o.id === id || o.orderId === id),
    getShipment: (id: string) => shipmentList.find((s) => s.id === id),
    getShipmentByOrderId: (orderId: string) => shipmentList.find((s) => s.orderId === orderId),
    getSellerReturn: (id: string) => sellerReturnList.find((r) => r.id === id),
    getPayout: (id: string) => payoutList.find((p) => p.id === id || p.payoutId === id),
    getSellerPayoutItems: () => sellerPayoutPendingItems,
    getPendingPayoutItems: () => sellerPayoutPendingItems.filter((i) => i.status !== "paid_out"),
    getPromotion: (id: string) => promotionList.find((p) => p.id === id || p.reference === id),
    getSellerReplacement: (id: string) =>
      sellerReplacementList.find((r) => r.id === id || r.replacementId === id),
  };
}

export type SellerData = ReturnType<typeof buildSellerData>;
export type ShipmentDetail = SellerData["shipmentList"][number];
export type ShipmentTimelineEvent = ShipmentDetail["timeline"][number];

// ─── Provider ────────────────────────────────────────────────────────────────
interface Actions {
  /** sellers:register {name} — creates the store (status pending). */
  registerStore: (name: string) => Promise<SellerStore>;
  /** sellers:update {name?, pickupAddress?} */
  updateStore: (patch: { name?: string; pickupAddress?: string | null }) => Promise<SellerStore>;
  createProduct: (input: ProductInput) => Promise<Product>;
  /** Only send the fields that changed: `price` is the stored LIST price, never the discounted one. */
  updateProduct: (id: string, patch: Partial<ProductInput> & { status?: "live" | "draft" }) => Promise<Product>;
  pauseProduct: (id: string) => Promise<Product>;
  publishProduct: (id: string) => Promise<Product>;
  deleteProduct: (id: string) => Promise<void>;
  adjustStock: (id: string, stock: number) => Promise<Product>;
  createCampaign: (input: {
    name: string;
    discount?: number;
    startDate?: string;
    endDate?: string;
    budgetUsd?: number;
    /** The seller's own product ids; omitted / empty = every product of the store. */
    productIds?: string[];
  }) => Promise<Campaign>;
  requestPayout: (input: { amountUsd: number; method: "bank" | "mobile_money" | "wallet"; account?: string }) => Promise<SellerPayout>;
  /** orders:sellerReady — only flags the order as ready AFTER the server accepted. */
  sellerReady: (orderId: string) => Promise<void>;
  openTicket: (input: { subject: string; message: string; category?: string; orderId?: string }) => Promise<SupportTicket>;
  replyTicket: (id: string, text: string) => Promise<SupportTicket>;
  /** reviews:reply — publishes (or replaces) the seller's public answer to a review. */
  replyReview: (reviewId: string, text: string) => Promise<SellerReview>;
  uploadImage: (file: File) => Promise<string>;
}

/** What the portal knows about how fresh its data is. */
export interface SellerLoadState {
  /** First load of the core lists has not finished yet. */
  loading: boolean;
  /** The server's message for the first core read that failed (null when all is well). */
  error: string | null;
  retry: () => Promise<void>;
}

interface SellerCtx {
  seller: SellerStore | null;
  sellerLoaded: boolean;
  stats: SellerStats | null;
  reviews: SellerReview[];
  ownProducts: SellerProductRow[] | null;
  ordersRaw: Order[] | null;
  available: PayoutAvailability | null;
  campaigns: Campaign[];
  tickets: SupportTicket[];
  replacements: Replacement[];
  plans: SellerPlanInfo[] | null;
  readyAt: Record<string, string>;
  load: SellerLoadState;
  /** Increments (debounced) whenever a push changed something analytics are computed from. */
  liveTick: number;
  refresh: () => Promise<void>;
  actions: Actions;
}

const SellerContext = createContext<SellerCtx | null>(null);

/** Keys of the reads a page cannot do without; a failure of one shows the error + retry. */
const CORE_KEYS = ["products", "orders", "reviews", "campaigns"] as const;

export function SellerDataProvider({ children }: { children: React.ReactNode }) {
  const rt = useRealtime();
  const isSeller = rt.status === "connected" && rt.user?.role === "seller";
  const userId = rt.user?.id ?? null;

  const [seller, setSeller] = useState<SellerStore | null>(null);
  const [sellerLoaded, setSellerLoaded] = useState(false);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [ownProducts, setOwnProducts] = useState<SellerProductRow[] | null>(null);
  const [ordersRaw, setOrdersRaw] = useState<Order[] | null>(null);
  const [available, setAvailable] = useState<PayoutAvailability | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [plans, setPlans] = useState<SellerPlanInfo[] | null>(null);
  const [readyAt, setReadyAt] = useState<Record<string, string>>({});
  const [liveTick, setLiveTick] = useState(0);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Remembered "ready" flags (only ever written after the server accepted).
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`somba-seller-ready:${userId}`);
       
      if (raw) setReadyAt(JSON.parse(raw) as Record<string, string>);
    } catch {
      /* storage unavailable */
    }
  }, [userId]);

  /** Run one read; remember the server's error text for it (cleared on success). */
  const read = useCallback(async <T,>(key: string, event: string, apply: (v: T) => void, body?: unknown) => {
    try {
      apply(await request<T>(event, body));
      setErrors((cur) => {
        if (!(key in cur)) return cur;
        const { [key]: _gone, ...rest } = cur;
        void _gone;
        return rest;
      });
    } catch (e) {
      setErrors((cur) => ({ ...cur, [key]: e instanceof Error ? e.message : "Request failed." }));
    }
  }, []);

  const refreshSeller = useCallback(
    () => read<SellerStore | null>("seller", "sellers:mine", (m) => { setSeller(m); setSellerLoaded(true); }),
    [read],
  );
  const refreshProducts = useCallback(() => read<SellerProductRow[]>("products", "products:list", setOwnProducts), [read]);
  const refreshOrders = useCallback(() => read<Order[]>("orders", "orders:list", setOrdersRaw), [read]);
  const refreshAvailable = useCallback(() => read<PayoutAvailability>("available", "payouts:available", setAvailable), [read]);
  const refreshStats = useCallback(() => read<SellerStats>("stats", "sellers:stats", setStats), [read]);
  const refreshReviews = useCallback(() => read<SellerReview[]>("reviews", "reviews:seller", (r) => setReviews(r ?? [])), [read]);
  const refreshCampaigns = useCallback(() => read<Campaign[]>("campaigns", "campaigns:list", (c) => setCampaigns(c ?? [])), [read]);
  const refreshTickets = useCallback(
    () => read<unknown[]>("tickets", "support:list", (t) => setTickets((t ?? []).map(parseTicket))),
    [read],
  );
  const refreshReplacements = useCallback(
    () => read<Replacement[]>("replacements", "replacements:list", (r) => setReplacements(r ?? [])),
    [read],
  );
  const refreshPlans = useCallback(() => read<SellerPlanInfo[]>("plans", "sellers:plans", setPlans), [read]);

  const refresh = useCallback(async () => {
    await refreshSeller();
    await Promise.allSettled([
      refreshProducts(),
      refreshOrders(),
      refreshAvailable(),
      refreshStats(),
      refreshReviews(),
      refreshCampaigns(),
      refreshTickets(),
      refreshReplacements(),
      refreshPlans(),
    ]);
    setFirstLoadDone(true);
    setLiveTick((n) => n + 1);
  }, [refreshSeller, refreshProducts, refreshOrders, refreshAvailable, refreshStats, refreshReviews, refreshCampaigns, refreshTickets, refreshReplacements, refreshPlans]);

  // Initial load, and again every time the socket (re)connects and the server
  // says `ready` (isSeller flips false → true): whatever was pushed while we
  // were offline is read back. There is NO polling.
  useEffect(() => {
    if (!isSeller) return;
     
    void refresh();
  }, [isSeller, refresh]);

  // Debounced follow-up reads after pushes: the derived figures (balance, stats,
  // analytics) change when an order / payout / notification arrives.
  const followUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFollowUp = useCallback(
    (what: { money?: boolean; analytics?: boolean; cases?: boolean }) => {
      if (followUp.current) clearTimeout(followUp.current);
      pendingWhat.current = {
        money: pendingWhat.current.money || what.money,
        analytics: pendingWhat.current.analytics || what.analytics,
        cases: pendingWhat.current.cases || what.cases,
      };
      followUp.current = setTimeout(() => {
        const w = pendingWhat.current;
        pendingWhat.current = {};
        followUp.current = null;
        if (w.money) {
          void refreshStats();
          void refreshAvailable();
        }
        if (w.cases) void refreshReplacements();
        if (w.analytics) setLiveTick((n) => n + 1);
      }, PUSH_DEBOUNCE_MS);
    },
    [refreshStats, refreshAvailable, refreshReplacements],
  );
  const pendingWhat = useRef<{ money?: boolean; analytics?: boolean; cases?: boolean }>({});
  useEffect(
    () => () => {
      if (followUp.current) clearTimeout(followUp.current);
    },
    [],
  );

  // Live pushes the server sends to a seller (their own orders, listings,
  // payouts, reviews, campaigns, tickets, store row and notifications).
  useEffect(() => {
    if (!isSeller) return;
    const s = socketClient.current;
    if (!s) return;
    const onOrder = (o: Order) => {
      setOrdersRaw((cur) => upsert(cur ?? [], o));
      scheduleFollowUp({ money: true, analytics: true });
    };
    const onProduct = (p: SellerProductRow) => {
      let reviewsMoved = false;
      setOwnProducts((cur) => {
        const prev = cur?.find((x) => x.id === p.id);
        reviewsMoved = !!prev && (prev.reviewsCount !== p.reviewsCount || prev.rating !== p.rating);
        // A product the push says is removed leaves the list.
        if (p.status === "removed") return (cur ?? []).filter((x) => x.id !== p.id);
        return upsert(cur ?? [], p);
      });
      // A new / hidden review changes the product's rating: the server does not push the review
      // itself to the seller, but it does push the product, so re-read the feed.
      if (reviewsMoved) {
        void refreshReviews();
        scheduleFollowUp({ analytics: true });
      }
    };
    const onReview = (r: SellerReview) => {
      setReviews((cur) => {
        // Hidden by a moderator: it leaves the seller's feed.
        if (r.status === "hidden") return cur.filter((x) => x.id !== r.id);
        const has = cur.some((x) => x.id === r.id);
        return has ? cur.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [r, ...cur];
      });
      scheduleFollowUp({ analytics: true });
    };
    const onSeller = (x: SellerStore) => {
      if (x.userId === userId) {
        setSeller(x);
        setSellerLoaded(true);
        void refreshProducts();
        scheduleFollowUp({ money: true });
      }
    };
    const onPayout = () => scheduleFollowUp({ money: true });
    const onNotify = () => scheduleFollowUp({ money: true, cases: true });
    const onCampaign = (c: Campaign) => setCampaigns((cur) => upsert(cur, c));
    const onTicket = (t: unknown) => setTickets((cur) => upsert(cur, parseTicket(t)));
    const onReplacement = (r: Replacement) => setReplacements((cur) => upsert(cur, r));
    s.on("order:created", onOrder);
    s.on("order:updated", onOrder);
    s.on("product:created", onProduct);
    s.on("product:updated", onProduct);
    s.on("review:created", onReview);
    s.on("review:updated", onReview);
    s.on("seller:updated", onSeller);
    s.on("payout:created", onPayout);
    s.on("payout:updated", onPayout);
    s.on("notification:new", onNotify);
    s.on("campaign:updated", onCampaign);
    s.on("support:updated", onTicket);
    s.on("replacement:updated", onReplacement);
    return () => {
      s.off("order:created", onOrder);
      s.off("order:updated", onOrder);
      s.off("product:created", onProduct);
      s.off("product:updated", onProduct);
      s.off("review:created", onReview);
      s.off("review:updated", onReview);
      s.off("seller:updated", onSeller);
      s.off("payout:created", onPayout);
      s.off("payout:updated", onPayout);
      s.off("notification:new", onNotify);
      s.off("campaign:updated", onCampaign);
      s.off("support:updated", onTicket);
      s.off("replacement:updated", onReplacement);
    };
  }, [isSeller, userId, scheduleFollowUp, refreshProducts, refreshReviews]);

  // A sign-out / account switch clears everything.
  useEffect(() => {
    if (rt.user?.role === "seller") return;
     
    setSeller(null);
    setSellerLoaded(false);
    setStats(null);
    setReviews([]);
    setOwnProducts(null);
    setOrdersRaw(null);
    setAvailable(null);
    setCampaigns([]);
    setTickets([]);
    setReplacements([]);
    setPlans(null);
    setErrors({});
    setFirstLoadDone(false);
     
  }, [rt.user?.role, userId]);

  const actions = useMemo<Actions>(() => {
    const afterProductWrite = async (p: SellerProductRow): Promise<SellerProductRow> => {
      setOwnProducts((cur) => upsert(cur ?? [], p));
      void refreshProducts();
      return p;
    };
    return {
      registerStore: async (name) => {
        const s = await request<SellerStore>("sellers:register", { name });
        setSeller(s);
        setSellerLoaded(true);
        return s;
      },
      updateStore: async (patch) => {
        const s = await request<SellerStore>("sellers:update", patch);
        setSeller((cur) => ({ ...(cur ?? ({} as SellerStore)), ...s }));
        return s;
      },
      createProduct: async (input) =>
        afterProductWrite(await request<SellerProductRow>("products:create", input)),
      updateProduct: async (id, patch) =>
        afterProductWrite(await request<SellerProductRow>("products:update", { id, patch })),
      pauseProduct: async (id) =>
        afterProductWrite(await request<SellerProductRow>("products:update", { id, patch: { status: "draft" } })),
      publishProduct: async (id) =>
        afterProductWrite(await request<SellerProductRow>("products:update", { id, patch: { status: "live" } })),
      deleteProduct: async (id) => {
        await request("products:delete", { id });
        setOwnProducts((cur) => (cur ?? []).filter((p) => p.id !== id));
        void refreshProducts();
      },
      adjustStock: async (id, stock) =>
        afterProductWrite(await request<SellerProductRow>("products:update", { id, patch: { stock } })),
      createCampaign: async (input) => {
        const c = await request<Campaign>("campaigns:create", input);
        setCampaigns((cur) => upsert(cur, c));
        return c;
      },
      requestPayout: async (input) => {
        const p = await request<SellerPayout>("payouts:request", input);
        void refreshAvailable();
        return p;
      },
      sellerReady: async (orderId) => {
        const task = await request<{ readyAt?: string | null }>("orders:sellerReady", { orderId });
        const when = task?.readyAt ? new Date(task.readyAt).toISOString() : new Date().toISOString();
        setReadyAt((cur) => {
          const next = { ...cur, [orderId]: when };
          try {
            if (userId) localStorage.setItem(`somba-seller-ready:${userId}`, JSON.stringify(next));
          } catch { /* storage unavailable */ }
          return next;
        });
        void refreshOrders();
      },
      openTicket: async (input) => {
        const t = parseTicket(await request<unknown>("support:open", input));
        setTickets((cur) => upsert(cur, t));
        return t;
      },
      replyTicket: async (id, text) => {
        const t = parseTicket(await request<unknown>("support:reply", { id, text }));
        setTickets((cur) => upsert(cur, t));
        return t;
      },
      replyReview: async (reviewId, text) => {
        const saved = await request<SellerReview>("reviews:reply", { reviewId, text });
        setReviews((cur) => cur.map((x) => (x.id === saved.id ? { ...x, ...saved, productName: x.productName } : x)));
        return saved;
      },
      uploadImage,
    };
  }, [refreshProducts, refreshAvailable, refreshOrders, userId]);

  const load = useMemo<SellerLoadState>(() => {
    const failed = CORE_KEYS.find((k) => errors[k]);
    return { loading: !firstLoadDone, error: failed ? errors[failed] : null, retry: refresh };
  }, [firstLoadDone, errors, refresh]);

  const value = useMemo<SellerCtx>(
    () => ({
      seller, sellerLoaded, stats, reviews, ownProducts, ordersRaw, available,
      campaigns, tickets, replacements, plans, readyAt, load, liveTick, refresh, actions,
    }),
    [seller, sellerLoaded, stats, reviews, ownProducts, ordersRaw, available, campaigns, tickets, replacements, plans, readyAt, load, liveTick, refresh, actions],
  );

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

function useSellerCtx(): SellerCtx {
  const ctx = useContext(SellerContext);
  if (!ctx) throw new Error("useSellerData must be used inside <SellerDataProvider>.");
  return ctx;
}

/** Store approval state used by the portal gate. */
export function useStoreGate(): { state: StoreGateState; seller: SellerStore | null } {
  const ctx = useSellerCtx();
  const state: StoreGateState = !ctx.sellerLoaded
    ? "loading"
    : !ctx.seller
      ? "none"
      : ctx.seller.status;
  return { state, seller: ctx.seller };
}

/** Support tickets (live) and their actions. */
export function useSellerTickets() {
  const ctx = useSellerCtx();
  return { tickets: ctx.tickets, openTicket: ctx.actions.openTicket, replyTicket: ctx.actions.replyTicket };
}

/** Loading / error state of the portal's core lists (for the "loading", "failed + retry" UI). */
export function useSellerLoad(): SellerLoadState {
  return useSellerCtx().load;
}

/** Bumps (debounced) whenever a push changed what the analytics are computed from. */
export function useSellerLiveTick(): number {
  return useSellerCtx().liveTick;
}

/** The plan the store is on right now, with its listing quota. */
export function useSellerPlan() {
  const ctx = useSellerCtx();
  const planId = ctx.seller?.activePlan ?? ctx.seller?.plan ?? "free";
  const plan = ctx.plans?.find((p) => p.id === planId) ?? null;
  const used = (ctx.ownProducts ?? []).filter((p) => p.status !== "removed").length;
  const max = plan?.maxProducts ?? null;
  return {
    plans: ctx.plans,
    planId,
    plan,
    expiresAt: planId === "free" ? null : (ctx.seller?.planExpiresAt ?? null),
    used,
    max,
    /** True when the store holds as many listings as its plan allows. */
    atLimit: max !== null && used >= max,
    loaded: ctx.plans !== null && ctx.ownProducts !== null,
  };
}

/** The one hook every seller page uses. */
export function useSellerData() {
  const rt = useRealtime();
  const ctx = useSellerCtx();
  const storeName = ctx.seller?.name ?? rt.user?.name ?? "My Store";

  const data = useMemo(
    () =>
      buildSellerData({
        storeName,
        seller: ctx.seller,
        stats: ctx.stats,
        products: ctx.ownProducts ?? (rt.products as SellerProductRow[]),
        orders: ctx.ordersRaw ?? rt.orders,
        payouts: rt.payouts as SellerPayout[],
        disputes: rt.disputes,
        reviews: ctx.reviews,
        available: ctx.available,
        campaigns: ctx.campaigns,
        replacements: ctx.replacements,
        readyAt: ctx.readyAt,
      }),
    [storeName, ctx.seller, ctx.stats, ctx.ownProducts, ctx.ordersRaw, ctx.reviews, ctx.available, ctx.campaigns, ctx.replacements, ctx.readyAt, rt.products, rt.orders, rt.payouts, rt.disputes],
  );

  return useMemo(
    () => ({
      ...data,
      ...ctx.actions,
      seller: ctx.seller,
      availability: ctx.available,
      refresh: ctx.refresh,
      load: ctx.load,
      /** The raw server row of one of the seller's products (for the edit form). */
      getRawProduct: (id: string): SellerProductRow | undefined =>
        (ctx.ownProducts ?? (rt.products as SellerProductRow[])).find((p) => p.id === id),
      productsLoaded: ctx.ownProducts !== null,
    }),
    [data, ctx.actions, ctx.seller, ctx.available, ctx.refresh, ctx.load, ctx.ownProducts, rt.products],
  );
}
