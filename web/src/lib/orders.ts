"use client";

import { useMemo } from "react";
import { useRealtime } from "@/context/realtime-context";
import { useCatalog } from "@/lib/catalog";
import type { Order } from "@/lib/realtime/types";

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

function parseAddress(raw: string | null): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { line1?: string; city?: string };
    return [a.line1, a.city].filter(Boolean).join(", ") || "—";
  } catch {
    return raw;
  }
}

/** Map a live backend Order to the storefront order-detail shape. */
export function toOrderDetail(o: Order): OrderDetail {
  const idx = STATUS_FLOW.indexOf(o.status as (typeof STATUS_FLOW)[number]);
  const date = new Date(o.createdAt).toLocaleDateString();
  return {
    id: o.id,
    reference: o.reference,
    customer: o.customerName,
    customerPhone: "",
    customerAddress: parseAddress(o.shippingAddress),
    date,
    amount: o.totalUsd,
    paymentMethod: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
    paymentStatus:
      o.status === "cancelled" || o.status === "returned"
        ? "refunded"
        : idx >= 1
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
