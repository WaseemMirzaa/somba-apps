"use client";

import { useMemo } from "react";
import { useRealtime } from "@/context/realtime-context";
import { useCatalog } from "@/lib/catalog";
import type { Dispute, Order } from "@/lib/realtime/types";

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
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  seller: string;
  rider: string;
  warehouse: string;
  trackingNumber: string;
  transactionId: string;
  itemsCount: number;
  items: {
    productId: string;
    name: string;
    sku: string;
    variant: string;
    qty: number;
    price: number;
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

/** Map a live backend Order to the storefront order-detail shape. */
export function toOrderDetail(o: Order): OrderDetail {
  const idx = STATUS_FLOW.indexOf(o.status as (typeof STATUS_FLOW)[number]);
  const date = new Date(o.createdAt).toLocaleDateString();
  return {
    id: o.id,
    reference: o.reference,
    customer: o.customerName,
    customerPhone: parseAddressObject(o.shippingAddress)?.phone ?? "",
    customerAddress: parseAddress(o.shippingAddress),
    date,
    amount: o.totalUsd,
    paymentMethod: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
    paymentStatus:
      o.status === "cancelled" || o.status === "returned"
        ? "refunded"
        : idx >= 1 && o.paymentMethod !== "cod"
          ? "paid"
          : o.paymentMethod === "cod" && o.status === "delivered"
            ? "paid"
            : "pending",
    status: o.status,
    seller: "Somba&Teka",
    rider: o.riderId ? "Assigned rider" : "—",
    warehouse: "Kinshasa Hub",
    trackingNumber: o.reference,
    transactionId: `TXN-${o.reference}`,
    itemsCount: o.items?.reduce((s, i) => s + i.qty, 0) ?? 0,
    items: (o.items ?? []).map((it) => ({
      productId: it.productId,
      name: it.productName,
      sku: `SKU-${it.productId.slice(0, 6)}`,
      variant: it.variant,
      qty: it.qty,
      price: it.priceUsd,
      image: "",
    })),
    timeline: STATUS_FLOW.map((s, i) => ({
      label: s.replace(/_/g, " "),
      time: i <= idx ? date : "",
      done: idx < 0 ? false : i <= idx,
    })),
  };
}

/** The signed-in customer's live orders (list rows), with product images. */
export function useMyOrders(): OrderDetail[] {
  const { orders } = useRealtime();
  const catalog = useCatalog();
  return useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p.image]));
    const byName = new Map(catalog.map((p) => [p.name, p.image]));
    return orders.map((o) => {
      const d = toOrderDetail(o);
      d.items = d.items.map((it) => ({
        ...it,
        image:
          byId.get(it.productId) ||
          byName.get(it.name) ||
          "/brand/logo-stack.png",
      }));
      return d;
    });
  }, [orders, catalog]);
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

/** Statuses in which the customer may still cancel (the server refuses anything else). */
export function canCancelOrder(status: string): boolean {
  return status === "pending" || status === "confirmed";
}

/** Statuses in which a 4-digit handover code may exist for the rider. */
export function hasDeliveryCodeStage(status: string): boolean {
  return status === "processing" || status === "shipped" || status === "out_for_delivery";
}
