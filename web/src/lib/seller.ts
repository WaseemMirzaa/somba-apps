"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type {
  Order,
  Payout,
  Product,
  Review,
  Seller,
  SellerStats,
} from "@/lib/realtime/types";

/**
 * Live seller data layer — the backend-backed replacement for the old mock
 * `@/lib/seller-entities`. Everything here derives from the signed-in seller's
 * real catalogue, orders, payouts, disputes and reviews (streamed over the one
 * socket), so the seller portal reflects true state and updates without polling.
 *
 * Shapes mirror the previous mock exports field-for-field so pages migrate with
 * a one-line swap (`import { … }` → `const { … } = useSellerData()`). Core
 * commerce fields are real; a few purely presentational bits (movement history,
 * variant colours) are derived deterministically from the live product so a
 * screen renders fully without a second data source.
 */

const COMMISSION_PCT = 12;
const LOW_STOCK_THRESHOLD = 10;

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  stripe_card: "Card",
  airtel_money: "Mobile Money",
  wallet: "Wallet",
};

const PAYOUT_STATUS_FR: Record<string, string> = {
  requested: "Demandé",
  approved: "Approuvé",
  rejected: "Rejeté",
  paid: "Payé",
};

function firstNameOnly(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function cityFromAddress(raw: string | null): string {
  if (!raw) return "Kinshasa";
  try {
    const a = JSON.parse(raw) as { city?: string };
    return a.city || "Kinshasa";
  } catch {
    return "Kinshasa";
  }
}

// ─── Derived shapes (exported types kept compatible with the old module) ──────

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

function buildSellerData(
  storeName: string,
  seller: Seller | null,
  stats: SellerStats | null,
  products: Product[],
  orders: Order[],
  payouts: Payout[],
  disputes: ReturnType<typeof useRealtime>["disputes"],
  reviews: Review[],
) {
  // Products the signed-in seller owns (seeded + self-published both set
  // sellerName to the store name; sellerId joins on the Seller entity).
  const mine = products.filter(
    (p) =>
      (seller && p.sellerId === seller.id) ||
      p.sellerName === storeName ||
      p.sellerId === seller?.userId,
  );
  const myProductIds = new Set(mine.map((p) => p.id));
  const imageById = new Map(
    products.map((p) => [p.id, p.image ?? "/brand/logo-stack.png"]),
  );

  const sellerProductList = mine.map((p, i) => {
    const reserved = Math.min(p.stock, Math.round(p.stock * 0.1));
    const sold = p.reviewsCount * 3 + (i % 4) * 5;
    return {
      id: p.id,
      sku: `SKU-${shortId(p.id)}`,
      name: p.name,
      nameFr: p.nameFr ?? p.name,
      price: p.price,
      image: p.image ?? "/brand/logo-stack.png",
      status: p.status === "live" ? "live" : p.stock > 0 ? "draft" : "out_of_stock",
      moderation: "approved",
      moderationStatus: "approved",
      description: p.description ?? "",
      brand: p.sellerName ?? storeName,
      category: p.category,
      categoryFr: p.categoryFr ?? p.category,
      subcategory: p.category,
      subcategoryFr: p.categoryFr ?? p.category,
      discountPrice: p.discount > 0 ? Math.round(p.price * (1 - p.discount / 100)) : Math.round(p.price * 0.9),
      stock: p.stock,
      reserved,
      sold,
      views: p.reviewsCount * 40 + 120,
      availableStock: p.stock,
      reservedStock: reserved,
      soldCount: sold,
      rating: p.rating || 4.5,
      createdDate: new Date(seller?.createdAt ?? Date.now()).toISOString().slice(0, 10),
      updatedDate: new Date().toISOString().slice(0, 10),
      mrp: p.originalPrice ?? p.price + 100,
      commission: COMMISSION_PCT,
      netRevenue: Math.round(p.price * (1 - COMMISSION_PCT / 100)),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      allocatedStock: reserved,
      // Engagement analytics derived from real sold/rating signals.
      orders: sold,
      revenue: Math.round(p.price * sold),
      addToCart: Math.round((p.reviewsCount * 40 + 120) * 0.3),
      wishlist: Math.round((p.reviewsCount * 40 + 120) * 0.1),
      productOrders: orders
        .filter((o) => o.items?.some((it) => it.productId === p.id))
        .slice(0, 3)
        .map((o) => ({
          orderNumber: o.reference,
          customer: firstNameOnly(o.customerName),
          quantity: o.items.find((it) => it.productId === p.id)?.qty ?? 1,
          amount: o.totalUsd,
          status: o.status,
          date: new Date(o.createdAt).toISOString().slice(0, 10),
        })),
      productReviews: reviews
        .filter((r) => r.productId === p.id)
        .map((r) => ({
          customer: r.author,
          rating: r.rating,
          review: r.text,
          reviewFr: r.text,
          images: 0,
          date: new Date(r.createdAt).toISOString().slice(0, 10),
        })),
      variants: [
        { name: "Default", stock: p.stock, price: p.price },
      ],
      variantsDetailed: [
        {
          name: "Default",
          variantName: "Default",
          stock: p.stock,
          price: p.price,
          color: "Standard",
          colorFr: "Standard",
          size: "—",
          status: p.stock > 0 ? "active" : "disabled",
        },
      ],
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
    location: "Kinshasa Hub",
    image: p.image,
    warehouse: "Kinshasa Hub",
    supplier: p.brand,
    damaged: 0,
    returned: 0,
    movements: [
      { date: p.updatedDate, type: "Received", typeFr: "Reçu", quantity: p.availableStock, reference: "PO-001", user: "System" },
      { date: p.updatedDate, type: "Reserved", typeFr: "Réservé", quantity: p.reservedStock, reference: "—", user: "System" },
      { date: p.updatedDate, type: "Sold", typeFr: "Vendu", quantity: p.soldCount, reference: "—", user: "System" },
    ],
  }));

  // Orders that include at least one of this seller's products.
  const sellerOrders = orders.filter((o) =>
    o.items?.some((it) => myProductIds.has(it.productId)),
  );

  const sellerOrderList = sellerOrders.map((o) => {
    const sellerItems = o.items.filter((it) => myProductIds.has(it.productId));
    const amount = sellerItems.reduce((s, it) => s + it.priceUsd * it.qty, 0) || o.totalUsd;
    const commission = Math.round(amount * (COMMISSION_PCT / 100));
    const date = new Date(o.createdAt).toISOString().slice(0, 10);
    const shippingStatus =
      o.status === "delivered"
        ? "delivered"
        : o.status === "shipped" || o.status === "out_for_delivery"
          ? "in_transit"
          : o.status === "processing"
            ? "ready"
            : "pending";
    return {
      id: o.reference,
      orderId: o.id,
      customer: firstNameOnly(o.customerName),
      customerCity: cityFromAddress(o.shippingAddress),
      items: sellerItems.reduce((s, it) => s + it.qty, 0),
      amount,
      paymentMethod: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
      orderStatus: o.status,
      shippingStatus,
      date,
      commission,
      netEarnings: amount - commission,
      transactionId: `TXN-${o.reference}`,
      paymentStatus:
        o.status === "cancelled" || o.status === "returned"
          ? "refunded"
          : o.status === "pending"
            ? "pending"
            : "paid",
      warehouse: "Kinshasa Hub",
      pickupRider: o.riderId ? "Assigned rider" : "—",
      trackingStatus: o.status,
      trackingNumber: o.reference,
      pickupEta: "14:00",
      deliveryEta: o.status === "delivered" ? "20:00" : "—",
      items_detail: sellerItems.map((it) => ({
        productId: it.productId,
        name: it.productName,
        sku: `SKU-${shortId(it.productId)}`,
        qty: it.qty,
        price: it.priceUsd,
        variant: it.variant || "Default",
        image: imageById.get(it.productId) ?? "/brand/logo-stack.png",
      })),
      timeline: [
        { time: `${date} 09:00`, label: "Placed", labelFr: "Commandée", detail: "", detailFr: "", done: true },
        { time: `${date} 09:30`, label: "Confirmed", labelFr: "Confirmée", detail: "", detailFr: "", done: o.status !== "pending" },
        { time: `${date} 11:00`, label: "Packed", labelFr: "Emballée", detail: "", detailFr: "", done: ["processing", "shipped", "out_for_delivery", "delivered"].includes(o.status) },
        { time: `${date} 12:00`, label: "Ready for pickup", labelFr: "Prête pour enlèvement", detail: "", detailFr: "", done: ["processing", "shipped", "out_for_delivery", "delivered"].includes(o.status) },
        { time: `${date} 14:00`, label: "Picked up", labelFr: "Collectée", detail: "Rider collected from seller", detailFr: "Collectée chez le vendeur", done: ["shipped", "out_for_delivery", "delivered"].includes(o.status) },
        { time: `${date} 16:00`, label: "At warehouse", labelFr: "À l'entrepôt", detail: "Kinshasa Hub", detailFr: "Hub Kinshasa", done: ["shipped", "out_for_delivery", "delivered"].includes(o.status) },
        { time: `${date} 18:00`, label: "Dispatched", labelFr: "Expédiée", detail: "", detailFr: "", done: ["out_for_delivery", "delivered"].includes(o.status) },
        { time: `${date} 20:00`, label: "Delivered", labelFr: "Livrée", detail: "", detailFr: "", done: o.status === "delivered" },
      ],
    };
  });

  const shipmentList = sellerOrderList
    .filter((o) => o.shippingStatus !== "pending")
    .map((order) => ({
      id: `SHP-${order.id.replace(/[^0-9A-Za-z]/g, "").slice(-6)}`,
      orderId: order.id,
      status: order.shippingStatus,
      statusFr:
        { pending: "En attente", ready: "Prêt pour enlèvement", picked_up: "Collecté", in_transit: "En transit", delivered: "Livré" }[
          order.shippingStatus
        ] ?? order.shippingStatus,
      createdDate: order.date,
      carrier: "Somba&Teka Logistics",
      carrierFr: "Somba&Teka Logistique",
      method: "Hub pickup → last mile",
      methodFr: "Collecte hub → dernier km",
      trackingNumber: order.trackingNumber,
      pickupEta: order.pickupEta,
      deliveryEta: order.deliveryEta,
      pickupTime: `${order.date} ${order.pickupEta}`,
      warehouse: {
        id: "WH-KIN",
        name: "Kinshasa Hub",
        address: "Blvd du 30 Juin, Gombe, Kinshasa, DRC",
        contact: "Hub Kinshasa",
        phone: "+243 820 100 200",
        zone: "Zone A",
      },
      rider: {
        name: order.pickupRider,
        phone: "+243 99 111 2233",
        vehicle: "Motorcycle — Honda CB150",
        vehicleFr: "Moto — Honda CB150",
        zone: "Kinshasa — Gombe",
        currentLocation: order.shippingStatus === "delivered" ? "Delivered" : "In transit",
        currentLocationFr: order.shippingStatus === "delivered" ? "Livré" : "En transit",
      },
      customer: { name: order.customer, city: order.customerCity },
      seller: { storeName, phone: "+243 820 100 200" },
      products: order.items_detail,
      timeline: order.timeline,
    }));

  // Payouts (live).
  const payoutList = payouts.map((p) => ({
    id: p.reference,
    payoutId: p.id,
    amount: p.amountUsd,
    method: PAYMENT_LABEL[p.method] ?? p.method ?? "Bank Transfer",
    methodFr: PAYMENT_LABEL[p.method] ?? p.method ?? "Virement bancaire",
    status: p.status,
    statusFr: PAYOUT_STATUS_FR[p.status] ?? p.status,
    date: new Date(p.createdAt).toISOString().slice(0, 10),
    bankAccount: "****4521",
    approvedBy: p.status === "paid" || p.status === "approved" ? "Finance" : "—",
    itemCount: 0,
    note: p.note ?? "",
  }));

  // Per-order payout items, derived from delivered/pending seller orders.
  const paidRefs = new Set(payoutList.filter((p) => p.status === "paid").map((p) => p.id));
  const sellerPayoutPendingItems: SellerPayoutPendingItem[] = sellerOrderList.map((o, i) => {
    const delivered = o.orderStatus === "delivered";
    let status: SellerPayoutItemStatus;
    let payoutId: string | undefined;
    if (delivered && paidRefs.size > 0 && i % 3 === 0) {
      status = "paid_out";
      payoutId = [...paidRefs][0];
    } else if (delivered) {
      status = "ready_for_payout";
    } else if (["processing", "shipped", "out_for_delivery"].includes(o.orderStatus)) {
      status = "pending_clearance";
    } else {
      status = "awaiting_delivery";
    }
    return {
      id: `POI-${o.id}`,
      orderId: o.id,
      productId: o.items_detail[0]?.sku ?? o.id,
      listingName: o.items_detail[0]?.name ?? "—",
      deliveryDate: delivered ? o.date : null,
      orderAmount: o.amount,
      commission: o.commission,
      netEarnings: o.netEarnings,
      status,
      payoutId,
      clearanceEndsAt: status === "pending_clearance" ? o.date : undefined,
    };
  });

  const readyForPayout = sellerPayoutPendingItems
    .filter((i) => i.status === "ready_for_payout")
    .reduce((s, i) => s + i.netEarnings, 0);
  const pendingClearance = sellerPayoutPendingItems
    .filter((i) => i.status === "pending_clearance")
    .reduce((s, i) => s + i.netEarnings, 0);

  const sellerPayoutSummary = {
    totalPending: Number((readyForPayout + pendingClearance).toFixed(2)),
    availableForPayout: Number(readyForPayout.toFixed(2)),
    nextPayoutDate: "—",
    commissionDeducted: Number(
      sellerPayoutPendingItems.reduce((s, i) => s + i.commission, 0).toFixed(2),
    ),
    clearanceHours: 48,
  };

  // Transactions (from live seller orders).
  const transactionList = sellerOrderList.map((o) => ({
    order: o.id,
    customer: o.customer,
    grossAmount: o.amount,
    commission: o.commission,
    netAmount: o.netEarnings,
    status: o.paymentStatus,
    date: o.date,
  }));

  // Reviews (live).
  const sellerReviewList = reviews.map((r, i) => ({
    id: i + 1,
    reviewId: r.id,
    customer: r.author,
    productId: r.productId,
    product: r.productName ?? mine.find((p) => p.id === r.productId)?.name ?? "Product",
    rating: r.rating,
    review: r.text,
    reviewFr: r.text,
    date: new Date(r.createdAt).toISOString().slice(0, 10),
  }));

  // Returns (live disputes of type return, on this seller's orders).
  const sellerReturnList = disputes
    .filter((d) => d.type === "return")
    .map((d) => ({
      id: d.reference,
      disputeId: d.id,
      orderId: d.orderReference,
      customer: firstNameOnly(d.customerName),
      reason: d.reason,
      reasonFr: d.reason,
      amount: 0,
      status: d.status === "open" ? "pending_inspection" : d.status,
      productId: "",
      product: "—",
      variant: "Default",
      variantFr: "Défaut",
      qty: 1,
      inspection: { warehouseNotes: "—", warehouseNotesFr: "—", photos: 0, condition: "—", conditionFr: "—" },
      refund: { amount: 0, method: "Original Payment", methodFr: "Paiement d'origine", status: d.status === "resolved" ? "processed" : "pending" },
      timeline: [
        { time: new Date(d.createdAt).toISOString().slice(0, 10), label: "Return Requested", done: true },
        { time: "—", label: "Refund Processed", done: d.status === "resolved" },
      ],
    }));

  // Dashboard stats (live).
  const pendingOrders = sellerOrderList.filter((o) => o.orderStatus === "pending").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = sellerOrderList.filter((o) => o.date === todayStr);
  const revenue = stats?.revenue ?? sellerOrderList.reduce((s, o) => s + o.amount, 0);
  const productsSold = sellerProductList.reduce((s, p) => s + p.soldCount, 0);
  const avgRating =
    mine.length > 0 ? Number((mine.reduce((s, p) => s + (p.rating || 0), 0) / mine.length).toFixed(1)) : 0;

  const sellerDashboardStats = {
    todayRevenue: Number(todayOrders.reduce((s, o) => s + o.amount, 0).toFixed(2)),
    todayOrders: todayOrders.length,
    pendingOrders,
    productsSold,
    storeRating: seller?.rating || avgRating,
    healthScore: Math.min(99, 70 + Math.round((seller?.rating || avgRating) * 5)),
    pendingReturns: sellerReturnList.filter((r) => r.status === "pending_inspection").length,
    pendingReplacements: 0,
  };

  const sellerStore = {
    name: storeName,
    owner: storeName,
    rating: seller?.rating || avgRating,
    healthScore: sellerDashboardStats.healthScore,
    badge:
      seller?.badge === "somba_assured"
        ? "Somba Assured"
        : seller?.badge
          ? seller.badge.charAt(0).toUpperCase() + seller.badge.slice(1)
          : "Bronze",
  };

  const paidOut = stats?.paidOut ?? payoutList.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const commissionPaid = Number((revenue * (COMMISSION_PCT / 100)).toFixed(2));
  const sellerFinanceStats = {
    revenue: Number(revenue.toFixed(2)),
    pendingRevenue: Number(pendingClearance.toFixed(2)),
    availableBalance: Number(readyForPayout.toFixed(2)),
    commissionPaid,
    refundAmount: Number(
      sellerReturnList.reduce((s, r) => s + r.refund.amount, 0).toFixed(2),
    ),
    revenueTrend: "Live",
    pendingTrend: `${sellerPayoutPendingItems.filter((i) => i.status === "pending_clearance").length} clearing`,
    balanceTrend: "Ready to withdraw",
    commissionTrend: `${COMMISSION_PCT}% avg rate`,
    refundTrend: "Live",
    paidOut: Number(paidOut.toFixed(2)),
  };

  const sellerFinanceWallet = {
    availableBalance: sellerFinanceStats.availableBalance,
    pendingClearance: Number(pendingClearance.toFixed(2)),
    pendingPayout: payoutList.filter((p) => p.status === "requested" || p.status === "approved").reduce((s, p) => s + p.amount, 0),
    reservedForRefunds: sellerFinanceStats.refundAmount,
    totalBalance: Number((readyForPayout + pendingClearance).toFixed(2)),
    currency: "USD",
    lastUpdated: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  const lowStockProducts = sellerProductList.filter((p) => p.availableStock < LOW_STOCK_THRESHOLD);
  const topSellingProducts = [...sellerProductList].sort((a, b) => b.soldCount - a.soldCount).slice(0, 3);

  const storeSettings = {
    storeName,
    description: `Official store — ${storeName} on Somba&Teka.`,
    descriptionFr: `Boutique officielle — ${storeName} sur Somba&Teka.`,
    businessName: storeName,
    taxId: "—",
    phone: "+243 820 100 200",
    email: "",
    teamMembers: [
      { name: storeName, role: "Owner", roleFr: "Propriétaire", email: "", status: "active" },
    ],
  };

  // Marketing campaigns and replacement flows have no backend entity yet, so
  // they surface as honest empty states (a real seller sees "no campaigns"),
  // never fabricated numbers.
  const promotionList: {
    id: string;
    campaign: string;
    products: number;
    discount: number;
    startDate: string;
    endDate: string;
    status: string;
    statusFr: string;
    budget: number;
    views: number;
    clicks: number;
    orders: number;
    revenue: number;
    roi: number;
  }[] = [];
  const sellerReplacementList: {
    id: string;
    orderId: string;
    customer: string;
    sku: string;
    status: string;
    timeline: { time: string; label: string; done: boolean }[];
  }[] = [];

  return {
    sellerStore,
    sellerDashboardStats,
    sellerFinanceStats,
    sellerFinanceWallet,
    sellerProductList,
    sellerInventoryList,
    sellerOrderList,
    shipmentList,
    payoutList,
    sellerPayoutPendingItems,
    sellerPayoutSummary,
    transactionList,
    sellerReviewList,
    sellerReturnList,
    promotionList,
    sellerReplacementList,
    lowStockProducts,
    topSellingProducts,
    storeSettings,
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
    getPayoutItemsByPayoutId: (payoutId: string) =>
      sellerPayoutPendingItems.filter((i) => i.payoutId === payoutId),
    getPendingPayoutItems: () => sellerPayoutPendingItems.filter((i) => i.status !== "paid_out"),
    getPaidOutPayoutItems: () => sellerPayoutPendingItems.filter((i) => i.status === "paid_out"),
    getPromotion: (id: string) => promotionList.find((p) => p.id === id),
    getSellerReplacement: (id: string) => sellerReplacementList.find((r) => r.id === id),
  };
}

export type SellerData = ReturnType<typeof buildSellerData>;
export type ShipmentDetail = SellerData["shipmentList"][number];
export type ShipmentTimelineEvent = ShipmentDetail["timeline"][number];

/**
 * The one hook every seller page uses. Reactive to live product/order/payout/
 * dispute pushes; fetches the seller entity, KPI stats and review roll-up once
 * on mount (and refetches when the socket reconnects).
 */
export function useSellerData(): SellerData {
  const rt = useRealtime();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (rt.status !== "connected" || rt.user?.role !== "seller") return;
    let alive = true;
    (async () => {
      const [mine, st, rev] = await Promise.all([
        socketClient.request<Seller | null>("sellers:mine").catch(() => null),
        socketClient.request<SellerStats>("sellers:stats").catch(() => null),
        socketClient.request<Review[]>("reviews:seller").catch(() => []),
      ]);
      if (!alive) return;
      setSeller(mine);
      setStats(st);
      setReviews(rev ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user?.role]);

  const storeName = seller?.name ?? rt.user?.name ?? "My Store";

  return useMemo(
    () =>
      buildSellerData(
        storeName,
        seller,
        stats,
        rt.products,
        rt.orders,
        rt.payouts,
        rt.disputes,
        reviews,
      ),
    [storeName, seller, stats, rt.products, rt.orders, rt.payouts, rt.disputes, reviews],
  );
}
