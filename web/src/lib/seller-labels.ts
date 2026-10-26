/**
 * Shared EN/FR labels + badge colours for the REAL server statuses the seller
 * portal shows (orders, shipping, products, payouts, returns, campaigns,
 * support tickets, replacements). Nothing here is invented: every key is a
 * value the API can actually produce.
 */
import { packageStatusTone, lineStateTone } from "./seller-packages";
import type { LineState } from "./seller-packages";
import { portalIsFrench, sellerErrorText } from "./seller-errors";

export type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "purple" | "info";
type Labels = Record<string, { en: string; fr: string; variant: BadgeVariant }>;

function pick(map: Labels, key: string, fr: boolean): string {
  const hit = map[key];
  if (hit) return fr ? hit.fr : hit.en;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function variantOf(map: Labels, key: string): BadgeVariant {
  return map[key]?.variant ?? "default";
}

// ─── Orders (orders.status) ──────────────────────────────────────────────────
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
] as const;

const ORDER: Labels = {
  pending: { en: "Pending", fr: "En attente", variant: "warning" },
  confirmed: { en: "Confirmed", fr: "Confirmée", variant: "info" },
  processing: { en: "Processing", fr: "En préparation", variant: "info" },
  shipped: { en: "Shipped", fr: "Expédiée", variant: "info" },
  out_for_delivery: { en: "Out for delivery", fr: "En cours de livraison", variant: "info" },
  delivered: { en: "Delivered", fr: "Livrée", variant: "success" },
  cancelled: { en: "Cancelled", fr: "Annulée", variant: "danger" },
  returned: { en: "Returned", fr: "Retournée", variant: "danger" },
};
export const orderStatusLabel = (s: string, fr: boolean) => pick(ORDER, s, fr);
export const orderStatusVariant = (s: string) => variantOf(ORDER, s);
export const ORDER_STATUS_OPTIONS = ORDER_STATUSES.map((value) => ({
  value,
  label: ORDER[value].en,
  labelFr: ORDER[value].fr,
}));

// ─── Package status (the seller's own parcel on an order; from the server) ───
export {
  PACKAGE_STATUS_OPTIONS,
  packageStatusLabel,
  lineStateLabel,
} from "./seller-packages";
export const packageStatusVariant = (s: string): BadgeVariant => packageStatusTone(s);
export const lineStateVariant = (s: LineState): BadgeVariant => lineStateTone(s);

// ─── Shipping (derived from the package status) ───────────────────────────
const SHIPPING: Labels = {
  pending: { en: "Awaiting confirmation", fr: "En attente de confirmation", variant: "warning" },
  awaiting_pickup: { en: "Awaiting pickup", fr: "En attente d'enlèvement", variant: "info" },
  ready: { en: "Marked ready", fr: "Marqué prêt", variant: "info" },
  at_hub: { en: "At the hub", fr: "Au hub", variant: "info" },
  rider_assigned: { en: "Rider assigned", fr: "Livreur assigné", variant: "info" },
  picked_up: { en: "Picked up", fr: "Collecté", variant: "info" },
  in_transit: { en: "Out for delivery", fr: "En cours de livraison", variant: "info" },
  delivered: { en: "Delivered", fr: "Livrée", variant: "success" },
  cancelled: { en: "Cancelled", fr: "Annulée", variant: "danger" },
  returned: { en: "Returned", fr: "Retournée", variant: "danger" },
};
export const shippingStatusLabel = (s: string, fr: boolean) => pick(SHIPPING, s, fr);
export const shippingStatusVariant = (s: string) => variantOf(SHIPPING, s);
export const SHIPPING_STATUS_OPTIONS = Object.entries(SHIPPING).map(([value, v]) => ({
  value,
  label: v.en,
  labelFr: v.fr,
}));

// ─── Products (products.status) ──────────────────────────────────────────────
const PRODUCT: Labels = {
  live: { en: "Live", fr: "En ligne", variant: "success" },
  pending: { en: "Pending review", fr: "En attente de validation", variant: "warning" },
  rejected: { en: "Rejected", fr: "Rejeté", variant: "danger" },
  draft: { en: "Unavailable (paused)", fr: "Indisponible (en pause)", variant: "default" },
  removed: { en: "Removed", fr: "Supprimé", variant: "danger" },
};
export const productStatusLabel = (s: string, fr: boolean) => pick(PRODUCT, s, fr);
export const productStatusVariant = (s: string) => variantOf(PRODUCT, s);
export const PRODUCT_STATUS_OPTIONS = ["live", "pending", "rejected", "draft", "removed"].map((value) => ({
  value,
  label: PRODUCT[value].en,
  labelFr: PRODUCT[value].fr,
}));
export function productStatusExplain(s: string, fr: boolean): string | null {
  if (s === "pending")
    return fr
      ? "Cette annonce attend la validation d'un modérateur. Elle n'est pas visible par les clients."
      : "This listing is waiting for a moderator. Shoppers cannot see it yet.";
  if (s === "rejected")
    return fr
      ? "Un modérateur a refusé cette annonce. Contactez le support pour en savoir plus."
      : "A moderator rejected this listing. Contact support to find out why.";
  if (s === "draft")
    return fr
      ? "Annonce en pause : masquée de la boutique. Vous pouvez la remettre en ligne."
      : "Paused: hidden from the shop. You can put it back online.";
  if (s === "removed")
    return fr ? "Annonce supprimée." : "This listing was removed.";
  return null;
}

// ─── Payouts (payouts.status) ────────────────────────────────────────────────
export const PAYOUT_STATUSES = ["requested", "sending", "paid", "rejected"] as const;
const PAYOUT: Labels = {
  requested: { en: "Requested", fr: "Demandé", variant: "warning" },
  sending: { en: "Being sent", fr: "Envoi en cours", variant: "info" },
  paid: { en: "Paid", fr: "Payé", variant: "success" },
  rejected: { en: "Rejected", fr: "Rejeté", variant: "danger" },
};
export const payoutStatusLabel = (s: string, fr: boolean) => pick(PAYOUT, s, fr);
export const payoutStatusVariant = (s: string) => variantOf(PAYOUT, s);
export const PAYOUT_STATUS_OPTIONS = PAYOUT_STATUSES.map((value) => ({
  value,
  label: PAYOUT[value].en,
  labelFr: PAYOUT[value].fr,
}));

const PAYOUT_METHOD: Record<string, { en: string; fr: string }> = {
  bank: { en: "Bank transfer", fr: "Virement bancaire" },
  mobile_money: { en: "Mobile money", fr: "Mobile money" },
  wallet: { en: "Somba wallet", fr: "Portefeuille Somba" },
};
export const payoutMethodLabel = (m: string, fr: boolean) =>
  PAYOUT_METHOD[m] ? (fr ? PAYOUT_METHOD[m].fr : PAYOUT_METHOD[m].en) : m;

// ─── Transactions (derived payment status) ───────────────────────────────────
const TXN: Labels = {
  paid: { en: "Paid", fr: "Payé", variant: "success" },
  pending: { en: "Pending", fr: "En attente", variant: "warning" },
  refunded: { en: "Refunded", fr: "Remboursé", variant: "danger" },
};
export const txnStatusLabel = (s: string, fr: boolean) => pick(TXN, s, fr);
export const txnStatusVariant = (s: string) => variantOf(TXN, s);
export const TXN_STATUS_OPTIONS = ["paid", "pending", "refunded"].map((value) => ({
  value,
  label: TXN[value].en,
  labelFr: TXN[value].fr,
}));

// ─── Returns / disputes (disputes.status) ────────────────────────────────────
const CASE: Labels = {
  open: { en: "Open", fr: "Ouvert", variant: "warning" },
  resolved: { en: "Resolved", fr: "Résolu", variant: "success" },
  rejected: { en: "Rejected", fr: "Rejeté", variant: "danger" },
};
export const caseStatusLabel = (s: string, fr: boolean) => pick(CASE, s, fr);
export const caseStatusVariant = (s: string) => variantOf(CASE, s);
export const CASE_STATUS_OPTIONS = ["open", "resolved", "rejected"].map((value) => ({
  value,
  label: CASE[value].en,
  labelFr: CASE[value].fr,
}));

// ─── Campaigns ───────────────────────────────────────────────────────────────
const CAMPAIGN: Labels = {
  draft: { en: "Draft", fr: "Brouillon", variant: "default" },
  pending: { en: "Pending approval", fr: "En attente d'approbation", variant: "warning" },
  scheduled: { en: "Scheduled", fr: "Planifiée", variant: "info" },
  active: { en: "Active", fr: "Active", variant: "success" },
  ended: { en: "Ended", fr: "Terminée", variant: "default" },
  rejected: { en: "Rejected", fr: "Rejetée", variant: "danger" },
};
export const campaignStatusLabel = (s: string, fr: boolean) => pick(CAMPAIGN, s, fr);
export const campaignStatusVariant = (s: string) => variantOf(CAMPAIGN, s);
export const CAMPAIGN_STATUS_OPTIONS = Object.entries(CAMPAIGN).map(([value, v]) => ({
  value,
  label: v.en,
  labelFr: v.fr,
}));

// ─── Support tickets ─────────────────────────────────────────────────────────
const TICKET: Labels = {
  open: { en: "Open", fr: "Ouvert", variant: "warning" },
  pending: { en: "Awaiting your reply", fr: "En attente de votre réponse", variant: "info" },
  resolved: { en: "Resolved", fr: "Résolu", variant: "success" },
  closed: { en: "Closed", fr: "Fermé", variant: "default" },
};
export const ticketStatusLabel = (s: string, fr: boolean) => pick(TICKET, s, fr);
export const ticketStatusVariant = (s: string) => variantOf(TICKET, s);
export const TICKET_STATUS_OPTIONS = Object.entries(TICKET).map(([value, v]) => ({
  value,
  label: v.en,
  labelFr: v.fr,
}));

// ─── Replacements ────────────────────────────────────────────────────────────
const REPLACEMENT: Labels = {
  requested: { en: "Requested", fr: "Demandé", variant: "warning" },
  approved: { en: "Approved", fr: "Approuvé", variant: "info" },
  received: { en: "Received at hub", fr: "Reçu au hub", variant: "info" },
  allocated: { en: "Allocated", fr: "Alloué", variant: "info" },
  dispatched: { en: "Dispatched", fr: "Expédié", variant: "success" },
  rejected: { en: "Rejected", fr: "Rejeté", variant: "danger" },
};
export const replacementStatusLabelReal = (s: string, fr: boolean) => pick(REPLACEMENT, s, fr);
export const replacementStatusVariantReal = (s: string) => variantOf(REPLACEMENT, s);
export const REPLACEMENT_STATUS_OPTIONS = Object.entries(REPLACEMENT).map(([value, v]) => ({
  value,
  label: v.en,
  labelFr: v.fr,
}));

// ─── Exchanges ───────────────────────────────────────────────────────────────
const EXCHANGE: Labels = {
  requested: { en: "Requested", fr: "Demandé", variant: "warning" },
  approved: { en: "Approved", fr: "Approuvé", variant: "info" },
  received: { en: "Received at hub", fr: "Reçu au hub", variant: "info" },
  ready: { en: "Ready to send", fr: "Prêt à l'envoi", variant: "info" },
  dispatched: { en: "Dispatched", fr: "Expédié", variant: "success" },
  rejected: { en: "Rejected", fr: "Rejeté", variant: "danger" },
};
export const exchangeStatusLabel = (s: string, fr: boolean) => pick(EXCHANGE, s, fr);
export const exchangeStatusVariant = (s: string) => variantOf(EXCHANGE, s);
export const EXCHANGE_STATUS_OPTIONS = Object.entries(EXCHANGE).map(([value, v]) => ({
  value,
  label: v.en,
  labelFr: v.fr,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Download a real CSV (UTF-8 with BOM so Excel opens accents correctly). */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errMessage(e: unknown, fallback = "Something went wrong."): string {
  // The server answers in English; known texts are shown in French when the portal is in French (seller-errors.ts).
  if (e instanceof Error && e.message) return sellerErrorText(e);
  if (typeof e === "string" && e) return sellerErrorText(e);
  return portalIsFrench() && fallback === "Something went wrong." ? "Une erreur est survenue. Réessayez." : fallback;
}

// ─── Payment methods on orders (orders.paymentMethod) ────────────────────────
const ORDER_PAYMENT: Record<string, { en: string; fr: string }> = {
  wallet: { en: "Somba wallet", fr: "Portefeuille Somba" },
  cod: { en: "Cash on delivery", fr: "Paiement à la livraison" },
  airtel_money: { en: "Airtel Money", fr: "Airtel Money" },
  orange_money: { en: "Orange Money", fr: "Orange Money" },
  vodacom_mpesa: { en: "Vodacom M-Pesa", fr: "Vodacom M-Pesa" },
  stripe_card: { en: "Card", fr: "Carte" },
};
export const paymentMethodLabel = (m: string, fr: boolean) =>
  ORDER_PAYMENT[m] ? (fr ? ORDER_PAYMENT[m].fr : ORDER_PAYMENT[m].en) : m;
