"use client";

import { useMemo } from "react";
import { useRealtime } from "@/context/realtime-context";
import { useCatalog } from "@/lib/catalog";
import { pickText } from "@/lib/i18n-fields";
import type { Dispute, Order, Payment } from "@/lib/realtime/types";

const STATUS_FLOW = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

const PAYMENT_LABEL: Record<string, string> = {
  cod: "COD",
  stripe_card: "Card",
  airtel_money: "Airtel Money",
  orange_money: "Orange Money",
  vodacom_mpesa: "Vodacom M-Pesa",
  wallet: "Wallet",
};

export interface OrderDetail {
  id: string;
  reference: string;
  customer: string;
  customerPhone: string;
  customerAddress: string;
  date: string;
  /** Total charged (what the server computed). */
  amount: number;
  subtotal: number;
  deliveryFee: number;
  /** Promo-code discount already deducted. */
  discount: number;
  /** Campaign discount already deducted from the subtotal. */
  campaignDiscount: number;
  /** Raw payment method id (`cod`, `wallet`, `airtel_money`...). */
  paymentMethodId: string;
  paymentMethod: string;
  /** From the order's payment record: paid, refunded, failed or pending. */
  paymentStatus: "paid" | "refunded" | "failed" | "pending";
  status: string;
  /** Expected delivery day (YYYY-MM-DD), from the sellers' delivery times. */
  estimatedDeliveryDate: string | null;
  /** Who to call while the parcel is on its way (the server sends it only then). */
  rider: { name: string; phone: string | null } | null;
  itemsCount: number;
  items: {
    productId: string;
    name: string;
    /** French name snapshotted on the order line (equals `name` when there is none). */
    nameFr: string;
    sku: string;
    variant: string;
    /** French options snapshotted on the order line (null when there is none). */
    variantFr: string | null;
    qty: number;
    price: number;
    /** Normal price when a campaign or flash sale lowered the charged price. */
    listPrice: number | null;
    campaignPct: number;
    image: string;
  }[];
  timeline: { label: string; time: string; done: boolean }[];
}

function parseAddressObject(raw: string | null): { line1?: string; commune?: string; city?: string; phone?: string } | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    return a && typeof a === "object" ? a : null;
  } catch {
    return null;
  }
}

function parseAddress(raw: string | null): string {
  if (!raw) return "—";
  const a = parseAddressObject(raw);
  if (!a) return raw;
  return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "—";
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

/** Map a live backend Order (+ its payment record) to the storefront order-detail shape. */
export function toOrderDetail(o: Order, payment?: Payment): OrderDetail {
  const idx = STATUS_FLOW.indexOf(o.status as (typeof STATUS_FLOW)[number]);
  const date = new Date(o.createdAt).toLocaleDateString();
  const ended = o.status === "cancelled" || o.status === "returned";
  const paymentStatus: OrderDetail["paymentStatus"] =
    payment?.status === "succeeded" ? "paid" : payment?.status === "refunded" ? "refunded" : payment?.status === "failed" ? "failed" : "pending";
  // The server records only creation and last-update times, so only those two steps carry a time.
  const timeline: OrderDetail["timeline"] = ended
    ? [
        { label: "pending", time: when(o.createdAt), done: true },
        { label: o.status, time: when(o.updatedAt), done: true },
      ]
    : STATUS_FLOW.map((s, i) => ({
        label: s,
        time: i === 0 ? when(o.createdAt) : i === idx ? when(o.updatedAt) : "",
        done: idx < 0 ? false : i <= idx,
      }));
  return {
    id: o.id,
    reference: o.reference,
    customer: o.customerName,
    customerPhone: parseAddressObject(o.shippingAddress)?.phone ?? "",
    customerAddress: parseAddress(o.shippingAddress),
    date,
    amount: o.totalUsd,
    subtotal: o.subtotalUsd,
    deliveryFee: o.deliveryFeeUsd,
    discount: o.discountUsd ?? 0,
    campaignDiscount: o.campaignDiscountUsd ?? 0,
    paymentMethodId: o.paymentMethod,
    paymentMethod: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
    paymentStatus: ended && paymentStatus === "paid" ? "refunded" : paymentStatus,
    status: o.status,
    estimatedDeliveryDate: o.estimatedDeliveryDate ?? null,
    rider: o.rider ?? null,
    itemsCount: o.items?.reduce((s, i) => s + i.qty, 0) ?? 0,
    items: (o.items ?? []).map((it) => ({
      productId: it.productId,
      name: it.productName,
      nameFr: pickText(true, it.productName, it.productNameFr),
      sku: `SKU-${it.productId.slice(0, 6)}`,
      variant: it.variant,
      variantFr: it.variantFr?.trim() ? it.variantFr : null,
      qty: it.qty,
      price: it.priceUsd,
      listPrice: it.listPriceUsd != null && it.listPriceUsd > it.priceUsd ? it.listPriceUsd : null,
      campaignPct: it.campaignPct ?? 0,
      image: "",
    })),
    timeline,
  };
}

/** The signed-in customer's live orders (list rows), with product images. */
export function useMyOrders(): OrderDetail[] {
  const { orders, payments } = useRealtime();
  const catalog = useCatalog();
  return useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p.image]));
    const byName = new Map(catalog.map((p) => [p.name, p.image]));
    const payByOrder = new Map<string, Payment>();
    for (const p of payments) if (p.orderId && !payByOrder.has(p.orderId)) payByOrder.set(p.orderId, p);
    return orders.map((o) => {
      const d = toOrderDetail(o, payByOrder.get(o.id));
      d.items = d.items.map((it) => ({
        ...it,
        image:
          byId.get(it.productId) ||
          byName.get(it.name) ||
          "/brand/logo-stack.png",
      }));
      return d;
    });
  }, [orders, payments, catalog]);
}

/** A single live order by id (uuid), with product images. */
export function useMyOrder(id: string | undefined): OrderDetail | undefined {
  const all = useMyOrders();
  return useMemo(() => {
    if (!id) return undefined;
    return all.find((x) => x.id === id || x.reference === id);
  }, [all, id]);
}

/** Dispute row as the server sends it (adds fields the shared type does not list). */
export type DisputeRow = Dispute & { receivedAt?: string | null; updatedAt?: string };

/** The signed-in customer's returns and disputes (live: `disputes:list` + `dispute:*` pushes). */
export function useMyDisputes(): DisputeRow[] {
  const { disputes } = useRealtime();
  return useMemo(
    () => [...(disputes as DisputeRow[])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [disputes],
  );
}

/** Human status for a return / dispute row. */
export function disputeStageLabel(d: DisputeRow, fr: boolean): string {
  if (d.status === "resolved") return fr ? "Résolu" : "Resolved";
  if (d.status === "rejected") return fr ? "Rejeté" : "Rejected";
  if (d.type === "return" && d.receivedAt) return fr ? "Colis reçu — en cours d'examen" : "Goods received — under review";
  return d.type === "return"
    ? fr ? "Demande reçue — en attente du retour du colis" : "Request received — waiting for the goods"
    : fr ? "Ouvert — en cours d'examen" : "Open — under review";
}

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  processing: "En préparation",
  shipped: "Expédiée",
  out_for_delivery: "En cours de livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
};

/** Customer-facing label for an order status (EN is the status with spaces). */
export function orderStatusLabel(status: string, fr: boolean): string {
  return fr ? (STATUS_FR[status] ?? status) : status.replace(/_/g, " ");
}

/** Same, with a capital first letter (timelines and headings). */
export function orderStatusTitle(status: string, fr: boolean): string {
  const l = orderStatusLabel(status, fr);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** Statuses in which the customer may still cancel (the server refuses anything else). */
export function canCancelOrder(status: string): boolean {
  return status === "pending" || status === "confirmed";
}

/** Statuses in which a 4-digit handover code may exist for the rider. */
export function hasDeliveryCodeStage(status: string): boolean {
  return status === "processing" || status === "shipped" || status === "out_for_delivery";
}
