"use client";

/**
 * Seller orders, shipping and tracking, built from what the server sends (docs/contracts/commerce.md §5,
 * logistics.md §6): the order's `city`, its `tracking.legs` (one row per delivery task the seller may see: their own
 * pickup, the transfer between warehouses, the delivery to the customer) and each line's fulfilment.
 * Nothing here is invented: a step is "done" only when a leg says so.
 */

import { useMemo } from "react";
import { localDay, localDateTime } from "@/lib/dates";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import type { BadgeVariant } from "@/lib/seller-labels";

// ─── Server shapes ───────────────────────────────────────────────────────────
export type LegKind =
  | "pickup"
  | "transfer"
  | "delivery"
  | "return_pickup"
  | "return_transfer"
  | "return_to_seller"
  | "replacement_delivery";

export type LegStatus = "unassigned" | "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";

export interface TrackingLeg {
  id: string;
  kind: LegKind;
  status: LegStatus;
  riderFirstName: string | null;
  readyAt: string | null;
  receivedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  failureReason: string | null;
  /** Transfer hop (1-based) and the number of hops; 1 of 1 on every other leg. Absent on an old server. */
  hop?: number;
  hops?: number;
  /** The transfer run (manifest) the parcel travels in. */
  runReference?: string | null;
}

export interface OrderTracking {
  carrier: string;
  currentLeg: LegKind | null;
  riderFirstName: string | null;
  lastUpdateAt: string | null;
  legs: TrackingLeg[];
}

/** A row of `orders:sellerList`. */
export interface ServerSellerOrder {
  id: string;
  reference: string;
  status: string;
  packageStatus: string;
  paymentMethod: string;
  estimatedDeliveryDate?: string | null;
  createdAt: string;
  customerName: string;
  city: string | null;
  tracking: OrderTracking | null;
  items: {
    id: string;
    productName: string;
    productNameFr?: string | null;
    qty: number;
    priceUsd: number;
    fulfilment?: string;
  }[];
  subtotalUsd: number;
  totalUsd: number;
  sellerCount: number;
  otherSellersPacking?: number;
}

// ─── Labels ──────────────────────────────────────────────────────────────────
const LEG_KIND: Record<LegKind, { en: string; fr: string }> = {
  pickup: { en: "Pickup from your location", fr: "Enlèvement chez vous" },
  transfer: { en: "Transfer between warehouses", fr: "Transfert entre entrepôts" },
  delivery: { en: "Delivery to the customer", fr: "Livraison au client" },
  return_pickup: { en: "Return pickup from the customer", fr: "Enlèvement du retour chez le client" },
  return_transfer: { en: "Return transfer between warehouses", fr: "Transfert du retour entre entrepôts" },
  return_to_seller: { en: "Return to you", fr: "Retour vers vous" },
  replacement_delivery: { en: "Replacement delivery", fr: "Livraison du remplacement" },
};
export const legKindLabel = (k: string, fr: boolean) => (LEG_KIND[k as LegKind] ? (fr ? LEG_KIND[k as LegKind].fr : LEG_KIND[k as LegKind].en) : k.replace(/_/g, " "));

const LEG_STATUS: Record<LegStatus, { en: string; fr: string; variant: BadgeVariant }> = {
  unassigned: { en: "Waiting for a rider", fr: "En attente d'un livreur", variant: "warning" },
  assigned: { en: "Rider assigned", fr: "Livreur assigné", variant: "info" },
  picked_up: { en: "Picked up", fr: "Collecté", variant: "info" },
  in_transit: { en: "On the way", fr: "En route", variant: "info" },
  delivered: { en: "Done", fr: "Terminé", variant: "success" },
  failed: { en: "Failed", fr: "Échec", variant: "danger" },
};
export const legStatusLabel = (s: string, fr: boolean) => (LEG_STATUS[s as LegStatus] ? (fr ? LEG_STATUS[s as LegStatus].fr : LEG_STATUS[s as LegStatus].en) : s.replace(/_/g, " "));
export const legStatusVariant = (s: string): BadgeVariant => LEG_STATUS[s as LegStatus]?.variant ?? "default";

/** Where the parcel is, in the seller's words (derived from the legs; see `shippingStep`). */
export type ShippingStep =
  | "pending"
  | "awaiting_pickup"
  | "ready"
  | "rider_assigned"
  | "picked_up"
  | "at_hub"
  | "transfer_pending"
  | "in_transfer"
  | "at_destination"
  | "out_for_delivery"
  | "delivery_failed"
  | "delivered"
  | "cancelled"
  | "returned";

const STEP: Record<ShippingStep, { en: string; fr: string; variant: BadgeVariant }> = {
  pending: { en: "Awaiting payment", fr: "En attente de paiement", variant: "warning" },
  awaiting_pickup: { en: "To pack", fr: "À préparer", variant: "warning" },
  ready: { en: "Ready, waiting for the pickup rider", fr: "Prêt, en attente du livreur", variant: "info" },
  rider_assigned: { en: "Pickup rider assigned", fr: "Livreur d'enlèvement assigné", variant: "info" },
  picked_up: { en: "Picked up from you", fr: "Collecté chez vous", variant: "info" },
  at_hub: { en: "At the origin warehouse", fr: "À l'entrepôt d'origine", variant: "info" },
  transfer_pending: { en: "Waiting for the transfer", fr: "En attente du transfert", variant: "info" },
  in_transfer: { en: "In transfer between warehouses", fr: "En transfert entre entrepôts", variant: "info" },
  at_destination: { en: "At the destination warehouse", fr: "À l'entrepôt de destination", variant: "info" },
  out_for_delivery: { en: "Out for delivery", fr: "En cours de livraison", variant: "info" },
  delivery_failed: { en: "Delivery attempt failed", fr: "Tentative de livraison échouée", variant: "danger" },
  delivered: { en: "Delivered", fr: "Livré", variant: "success" },
  cancelled: { en: "Cancelled", fr: "Annulé", variant: "danger" },
  returned: { en: "Returned", fr: "Retourné", variant: "danger" },
};
export const SHIPPING_STEPS = Object.keys(STEP) as ShippingStep[];
export const shippingStepLabel = (s: string, fr: boolean) => (STEP[s as ShippingStep] ? (fr ? STEP[s as ShippingStep].fr : STEP[s as ShippingStep].en) : s.replace(/_/g, " "));
export const shippingStepVariant = (s: string): BadgeVariant => STEP[s as ShippingStep]?.variant ?? "default";
export const SHIPPING_STEP_OPTIONS = SHIPPING_STEPS.map((value) => ({ value, label: STEP[value].en, labelFr: STEP[value].fr }));

// ─── Derivations ─────────────────────────────────────────────────────────────
/** The newest leg of a kind (a failed leg is re-opened as a new task, so the latest one decides). */
export function latestLeg(tracking: OrderTracking | null | undefined, kind: LegKind): TrackingLeg | null {
  const legs = (tracking?.legs ?? []).filter((l) => l.kind === kind);
  if (legs.length === 0) return null;
  return legs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}

interface StepInput {
  orderStatus: string;
  packageStatus: string;
  tracking: OrderTracking | null | undefined;
}

/** Where the parcel is now, from the order status and the legs. */
export function shippingStep(o: StepInput): ShippingStep {
  if (o.orderStatus === "cancelled" || o.packageStatus === "cancelled") return "cancelled";
  if (o.orderStatus === "returned" || o.packageStatus === "returned") return "returned";
  if (o.orderStatus === "delivered" || o.packageStatus === "delivered") return "delivered";

  const delivery = latestLeg(o.tracking, "delivery");
  const transfer = latestLeg(o.tracking, "transfer");
  const pickup = latestLeg(o.tracking, "pickup");

  if (delivery) {
    if (delivery.status === "in_transit" || o.orderStatus === "out_for_delivery") return "out_for_delivery";
    if (delivery.status === "picked_up") return "out_for_delivery";
    if (delivery.status === "failed") return "delivery_failed";
    return transfer && transfer.status === "delivered" ? "at_destination" : "at_hub";
  }
  if (transfer) {
    if (transfer.status === "delivered") return "at_destination";
    if (transfer.status === "picked_up" || transfer.status === "in_transit") return "in_transfer";
    return "transfer_pending";
  }
  if (pickup) {
    if (pickup.status === "delivered") return "at_hub";
    if (pickup.status === "picked_up" || pickup.status === "in_transit") return "picked_up";
    if (pickup.status === "assigned") return "rider_assigned";
  }
  if (o.packageStatus === "at_hub") return "at_hub";
  if (o.packageStatus === "ready") return "ready";
  if (o.packageStatus === "pending") return "pending";
  if (o.packageStatus === "shipped") return "at_hub";
  if (o.packageStatus === "out_for_delivery") return "out_for_delivery";
  return "awaiting_pickup";
}

export interface JourneyEvent {
  time: string;
  label: string;
  detail?: string;
  done: boolean;
}

const stamp = (iso: string | null | undefined) => (iso ? localDateTime(iso) : "");

interface JourneyInput extends StepInput {
  createdAt: string;
  readyAt: string | null;
}

/**
 * The real journey of the parcel, step by step. A step is done only when the order or one of its legs says so;
 * the transfer steps appear only when the server created a transfer leg (origin and destination warehouses differ).
 */
export function buildJourney(o: JourneyInput, fr: boolean): JourneyEvent[] {
  const T = (en: string, frText: string) => (fr ? frText : en);
  const closed = o.orderStatus === "cancelled" || o.packageStatus === "cancelled";
  const pickup = latestLeg(o.tracking, "pickup");
  const transfer = latestLeg(o.tracking, "transfer");
  const delivery = latestLeg(o.tracking, "delivery");
  const rider = (l: TrackingLeg | null) => (l?.riderFirstName ? T(`Rider: ${l.riderFirstName}`, `Livreur : ${l.riderFirstName}`) : undefined);
  const failed = (l: TrackingLeg | null) =>
    l && (l.attempts > 1 || l.failureReason)
      ? T(`Attempt ${l.attempts}${l.failureReason ? ` — ${l.failureReason}` : ""}`, `Tentative ${l.attempts}${l.failureReason ? ` — ${l.failureReason}` : ""}`)
      : undefined;
  const packageDone = ["ready", "at_hub", "shipped", "out_for_delivery", "delivered"].includes(o.packageStatus);
  const pickupAssigned = !!pickup && pickup.status !== "unassigned";
  const pickupTaken = !!pickup && (pickup.status === "picked_up" || pickup.status === "in_transit" || pickup.status === "delivered");
  const atOrigin = (!!pickup && pickup.status === "delivered") || ["at_hub", "shipped", "out_for_delivery", "delivered"].includes(o.packageStatus);

  const events: JourneyEvent[] = [
    { time: localDateTime(o.createdAt), label: T("Placed", "Commandée"), done: true },
    { time: "", label: T("Confirmed", "Confirmée"), done: o.orderStatus !== "pending" && o.orderStatus !== "cancelled" },
    { time: stamp(o.readyAt), label: T("Package ready (you)", "Colis prêt (vous)"), done: packageDone },
    { time: stamp(pickup?.updatedAt && pickupAssigned ? pickup.updatedAt : null), label: T("Pickup rider assigned", "Livreur d'enlèvement assigné"), detail: rider(pickup), done: pickupAssigned },
    { time: stamp(pickup?.pickedUpAt), label: T("Picked up from your location", "Collecté chez vous"), detail: failed(pickup), done: pickupTaken },
    { time: stamp(pickup?.receivedAt ?? pickup?.deliveredAt), label: T("At the origin warehouse", "À l'entrepôt d'origine"), done: atOrigin },
  ];
  if (transfer) {
    events.push(
      { time: stamp(transfer.pickedUpAt), label: T("Transfer to the destination warehouse", "Transfert vers l'entrepôt de destination"), detail: failed(transfer), done: transfer.status === "picked_up" || transfer.status === "in_transit" || transfer.status === "delivered" },
      { time: stamp(transfer.receivedAt ?? transfer.deliveredAt), label: T("At the destination warehouse", "À l'entrepôt de destination"), done: transfer.status === "delivered" },
    );
  }
  events.push(
    {
      time: stamp(delivery?.pickedUpAt),
      label: T("Out for delivery", "En cours de livraison"),
      detail: [rider(delivery), failed(delivery)].filter(Boolean).join(" · ") || undefined,
      done: !!delivery && (delivery.status === "picked_up" || delivery.status === "in_transit" || delivery.status === "delivered") || ["out_for_delivery", "delivered"].includes(o.orderStatus),
    },
    { time: stamp(delivery?.deliveredAt), label: T("Delivered", "Livrée"), done: o.orderStatus === "delivered" },
  );
  if (closed) events.push({ time: "", label: T("Cancelled", "Annulée"), done: true });
  if (o.orderStatus === "returned") events.push({ time: "", label: T("Returned", "Retournée"), done: true });
  return events;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
/** Save text the server built (a CSV) as a file. A BOM is added when missing so Excel reads accents. */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const body = text.charCodeAt(0) === 0xfeff ? text : "﻿" + text;
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Shipments (one per order that has left "to pack") ───────────────────────
export interface Shipment {
  id: string;
  orderId: string; // the reference shown to people
  orderRealId: string;
  status: ShippingStep;
  createdDate: string;
  carrier: string;
  riderFirstName: string | null;
  currentLeg: LegKind | null;
  lastUpdateAt: string | null;
  legs: TrackingLeg[];
  readyAt: string | null;
  createdAt: string;
  orderStatus: string;
  packageStatus: string;
  tracking: OrderTracking | null;
  pickupAddress: string | null;
  customer: { name: string; city: string };
  products: { itemId: string; productId: string; name: string; sku: string; qty: number; price: number; variant: string; image: string }[];
}

/**
 * Shipments for the shipping pages, from the portal's live orders (their `tracking` is kept fresh by the order
 * pushes and by the task pushes). An order still to pack or unpaid has no shipment yet.
 */
export function useSellerShipments() {
  const { sellerOrderList, sellerStore, load } = useSellerData();
  const { locale } = useLocale();
  void locale;
  const shipments = useMemo<Shipment[]>(
    () =>
      sellerOrderList
        .map((o) => {
          const tracking = (o as { tracking?: OrderTracking | null }).tracking ?? null;
          const status = shippingStep({ orderStatus: o.orderStatus, packageStatus: o.packageStatus, tracking });
          return { o, tracking, status };
        })
        .filter(({ status }) => status !== "pending" && status !== "awaiting_pickup")
        .map(({ o, tracking, status }) => ({
          id: `SHP-${o.id.replace(/[^0-9A-Za-z]/g, "").slice(-6)}`,
          orderId: o.id,
          orderRealId: o.orderId,
          status,
          createdDate: localDay(o.createdAt),
          carrier: tracking?.carrier ?? "Somba&Teka",
          riderFirstName: tracking?.riderFirstName ?? null,
          currentLeg: tracking?.currentLeg ?? null,
          lastUpdateAt: tracking?.lastUpdateAt ?? null,
          legs: tracking?.legs ?? [],
          readyAt: o.readyAt,
          createdAt: o.createdAt,
          orderStatus: o.orderStatus,
          packageStatus: o.packageStatus,
          tracking,
          pickupAddress: sellerStore.pickupAddress || null,
          customer: { name: o.customer, city: o.customerCity },
          products: o.items_detail.map((it) => ({
            itemId: it.itemId,
            productId: it.productId,
            name: it.name,
            sku: it.sku,
            qty: it.qty,
            price: it.price,
            variant: it.variant,
            image: it.image,
          })),
        })),
    [sellerOrderList, sellerStore.pickupAddress],
  );
  return {
    shipments,
    load,
    get: (id: string) => shipments.find((s) => s.id === id),
    getByOrder: (orderId: string) => shipments.find((s) => s.orderId === orderId || s.orderRealId === orderId),
  };
}
