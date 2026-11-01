"use client";

/**
 * After-sale on the seller side: returns, disputes, replacements, exchanges (docs/contracts/after-sale.md §2-§3).
 * Types of what the server sends a seller (customer first name only, no customerId), EN/FR label tables, and the live
 * lists the pages read. Nothing here is stored in the browser: the server is the one source.
 */

import { useState } from "react";
import { pickText, variantDisplay } from "@/lib/i18n-fields";
import { useLiveQuery, useSocketEvent, type LiveQuery } from "@/lib/seller-api";
import type { BadgeVariant } from "@/lib/seller-labels";

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export type CaseType = "return" | "dispute";
export type CaseStatus = "open" | "resolved" | "rejected";
export type CaseStage =
  | "awaiting_seller"
  | "seller_replied"
  | "seller_rejected"
  | "seller_timeout"
  | "escalated"
  | "approved"
  | "pickup"
  | "received"
  | "closed";
export type ItemCondition = "resellable" | "damaged" | "unsellable";
export type CaseOutcome = "refund_full" | "refund_partial" | "replacement" | "reject" | "return_refund";

export interface CaseItem {
  id: string;
  disputeId: string;
  orderItemId: string | null;
  productId: string | null;
  productName: string;
  productNameFr?: string | null;
  variant: string | null;
  variantFr?: string | null;
  qty: number;
  unitPriceUsd: number;
  refundUsd: number;
  condition: ItemCondition | null;
  restockedQty: number;
}

export interface CaseMessage {
  id: string;
  disputeId: string;
  authorId?: string | null;
  authorName: string;
  role: string;
  text: string;
  attachments: string[];
  createdAt: string;
}

/** A return or a dispute as a seller receives it (`DisputeView`, seller copy). */
export interface SellerCase {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  type: CaseType;
  category: string | null;
  reason: string;
  status: CaseStatus;
  stage: CaseStage;
  attachments: string[];
  items: CaseItem[];
  sellerId: string | null;
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  escalatedAt: string | null;
  resolution: string | null;
  resolutionFr?: string | null;
  outcome: CaseOutcome | null;
  refundUsd: number | null;
  refundTo: "wallet" | "phone" | null;
  receivedAt: string | null;
  gradedAt: string | null;
  pickupTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: CaseMessage[];
  messageCount?: number;
}

export type ReplacementStatus = "requested" | "approved" | "received" | "allocated" | "dispatched" | "delivered" | "rejected";
export type ExchangeStatus = "requested" | "approved" | "received" | "ready" | "dispatched" | "delivered" | "rejected";

export interface SellerReplacement {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  sellerId: string | null;
  sku: string;
  productName: string;
  productNameFr?: string | null;
  reason: string | null;
  condition: string | null;
  qty: number;
  variant: string | null;
  attachments: string[];
  status: ReplacementStatus;
  dispatchStatus: string | null;
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  stockTaken: boolean | number | null;
  deliveryTaskId: string | null;
  deliveredAt: string | null;
  disputeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerExchange {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  sellerId: string | null;
  fromSku: string;
  fromName: string;
  fromNameFr?: string | null;
  fromVariant: string | null;
  toSku: string;
  toName: string;
  toNameFr?: string | null;
  toVariant: string | null;
  qty: number;
  priceDiffUsd: number;
  heldUsd: number | null;
  reason: string | null;
  status: ExchangeStatus;
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  stockTaken: boolean | number | null;
  deliveryTaskId: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A delivery leg of a replacement / exchange, as the seller hears it (`task:updated`, redacted). */
export interface CaseLeg {
  id: string;
  kind: string;
  status: string;
  riderName?: string | null;
  replacementId?: string | null;
  exchangeId?: string | null;
  disputeId?: string | null;
  updatedAt?: string;
}

// ─── Labels (EN / FR) ───────────────────────────────────────────────────────────────────────────────────────────────
interface Label {
  en: string;
  fr: string;
  variant: BadgeVariant;
}
type Table = Record<string, Label>;
const lab = (t: Table, k: string | null | undefined, fr: boolean): string => {
  if (!k) return "—";
  const h = t[k];
  return h ? (fr ? h.fr : h.en) : k.replace(/_/g, " ");
};
const tone = (t: Table, k: string | null | undefined): BadgeVariant => (k ? (t[k]?.variant ?? "default") : "default");

const RETURN_STAGE: Table = {
  awaiting_seller: { en: "Awaiting your answer", fr: "En attente de votre réponse", variant: "warning" },
  seller_rejected: { en: "You rejected it", fr: "Vous l'avez refusé", variant: "danger" },
  seller_timeout: { en: "No answer in time", fr: "Délai de réponse dépassé", variant: "danger" },
  escalated: { en: "With Somba support", fr: "Chez le support Somba", variant: "info" },
  approved: { en: "Approved, pickup to plan", fr: "Approuvé, collecte à planifier", variant: "info" },
  pickup: { en: "Pickup in progress", fr: "Collecte en cours", variant: "info" },
  received: { en: "At the warehouse", fr: "À l'entrepôt", variant: "info" },
  closed: { en: "Closed", fr: "Clôturé", variant: "default" },
};
const DISPUTE_STAGE: Table = {
  awaiting_seller: { en: "Reply needed", fr: "Réponse attendue", variant: "warning" },
  seller_replied: { en: "You replied, with support", fr: "Vous avez répondu, chez le support", variant: "info" },
  closed: { en: "Closed", fr: "Clôturé", variant: "default" },
};

/** The step a request is at, in the viewer's language (returns and disputes read the same stage differently). */
export const caseStageLabel = (type: CaseType, stage: string | null | undefined, fr: boolean) =>
  lab(type === "return" ? RETURN_STAGE : DISPUTE_STAGE, stage, fr);
export const caseStageVariant = (type: CaseType, stage: string | null | undefined) =>
  tone(type === "return" ? RETURN_STAGE : DISPUTE_STAGE, stage);

export const CASE_STAGE_OPTIONS = (type: CaseType) =>
  Object.entries(type === "return" ? RETURN_STAGE : DISPUTE_STAGE).map(([value, v]) => ({ value, label: v.en, labelFr: v.fr }));

const OUTCOME: Table = {
  refund_full: { en: "Full refund", fr: "Remboursement total", variant: "success" },
  refund_partial: { en: "Partial refund", fr: "Remboursement partiel", variant: "success" },
  return_refund: { en: "Refund for the returned items", fr: "Remboursement des articles retournés", variant: "success" },
  replacement: { en: "Replacement sent", fr: "Remplacement envoyé", variant: "info" },
  reject: { en: "Request refused", fr: "Demande refusée", variant: "danger" },
};
export const caseOutcomeLabel = (o: string | null | undefined, fr: boolean) => lab(OUTCOME, o, fr);
export const caseOutcomeVariant = (o: string | null | undefined) => tone(OUTCOME, o);

const CONDITION: Table = {
  resellable: { en: "Resellable", fr: "Revendable", variant: "success" },
  damaged: { en: "Damaged", fr: "Endommagé", variant: "warning" },
  unsellable: { en: "Unsellable", fr: "Invendable", variant: "danger" },
};
export const itemConditionLabel = (c: string | null | undefined, fr: boolean) => lab(CONDITION, c, fr);
export const itemConditionVariant = (c: string | null | undefined) => tone(CONDITION, c);

const CATEGORY: Table = {
  missing: { en: "Missing item", fr: "Article manquant", variant: "default" },
  damaged: { en: "Damaged", fr: "Endommagé", variant: "default" },
  wrong_item: { en: "Wrong item", fr: "Mauvais article", variant: "default" },
  not_received: { en: "Not received", fr: "Non reçu", variant: "default" },
  not_as_described: { en: "Not as described", fr: "Non conforme à la description", variant: "default" },
  changed_mind: { en: "Changed their mind", fr: "A changé d'avis", variant: "default" },
  defective: { en: "Defective", fr: "Défectueux", variant: "default" },
  other: { en: "Other", fr: "Autre", variant: "default" },
};
export const caseCategoryLabel = (c: string | null | undefined, fr: boolean) => lab(CATEGORY, c, fr);

const REFUND_TO: Record<string, { en: string; fr: string }> = {
  wallet: { en: "the customer's Somba wallet", fr: "le portefeuille Somba du client" },
  phone: { en: "the customer's mobile money", fr: "le mobile money du client" },
};
export const refundToLabel = (to: string | null | undefined, fr: boolean) =>
  to && REFUND_TO[to] ? (fr ? REFUND_TO[to].fr : REFUND_TO[to].en) : "—";

const THREAD_ROLE: Record<string, { en: string; fr: string }> = {
  customer: { en: "Customer", fr: "Client" },
  seller: { en: "You / your team", fr: "Vous / votre équipe" },
  admin: { en: "Somba support", fr: "Support Somba" },
  admin_support: { en: "Somba support", fr: "Support Somba" },
  admin_operations: { en: "Somba support", fr: "Support Somba" },
  admin_finance: { en: "Somba finance", fr: "Finance Somba" },
  warehouse_staff: { en: "Warehouse", fr: "Entrepôt" },
};
export const threadRoleLabel = (role: string, fr: boolean) =>
  THREAD_ROLE[role] ? (fr ? THREAD_ROLE[role].fr : THREAD_ROLE[role].en) : role.replace(/_/g, " ");

const REPLACEMENT_STATUS: Table = {
  requested: { en: "Awaiting your answer", fr: "En attente de votre réponse", variant: "warning" },
  approved: { en: "Approved", fr: "Approuvé", variant: "info" },
  received: { en: "Old unit received", fr: "Ancienne unité reçue", variant: "info" },
  allocated: { en: "New unit set aside", fr: "Nouvelle unité réservée", variant: "info" },
  dispatched: { en: "On its way to the customer", fr: "En route vers le client", variant: "info" },
  delivered: { en: "Delivered", fr: "Livré", variant: "success" },
  rejected: { en: "Rejected", fr: "Refusé", variant: "danger" },
};
const { allocated: _unusedAllocated, ...REPLACEMENT_WITHOUT_ALLOCATED } = REPLACEMENT_STATUS;
void _unusedAllocated;
const EXCHANGE_STATUS: Table = {
  ...REPLACEMENT_WITHOUT_ALLOCATED,
  received: { en: "Old item received", fr: "Ancien article reçu", variant: "info" },
  ready: { en: "New item ready", fr: "Nouvel article prêt", variant: "info" },
};
export const replacementStageLabel = (s: string, fr: boolean) => lab(REPLACEMENT_STATUS, s, fr);
export const replacementStageVariant = (s: string) => tone(REPLACEMENT_STATUS, s);
export const exchangeStageLabel = (s: string, fr: boolean) => lab(EXCHANGE_STATUS, s, fr);
export const exchangeStageVariant = (s: string) => tone(EXCHANGE_STATUS, s);
export const REPLACEMENT_STAGE_OPTIONS = Object.entries(REPLACEMENT_STATUS).map(([value, v]) => ({ value, label: v.en, labelFr: v.fr }));
export const EXCHANGE_STAGE_OPTIONS = Object.entries(EXCHANGE_STATUS).map(([value, v]) => ({ value, label: v.en, labelFr: v.fr }));

const LEG_KIND: Record<string, { en: string; fr: string }> = {
  pickup: { en: "Pickup from your store", fr: "Collecte chez vous" },
  transfer: { en: "Transfer between warehouses", fr: "Transfert entre entrepôts" },
  replacement_delivery: { en: "Delivery to the customer", fr: "Livraison au client" },
  return_transfer: { en: "Return transfer", fr: "Transfert du retour" },
  return_to_seller: { en: "Return to your store", fr: "Retour chez vous" },
};
export const legKindLabel = (k: string, fr: boolean) => (LEG_KIND[k] ? (fr ? LEG_KIND[k].fr : LEG_KIND[k].en) : k.replace(/_/g, " "));
const LEG_STATUS: Record<string, { en: string; fr: string }> = {
  unassigned: { en: "Waiting for a rider", fr: "En attente d'un livreur" },
  assigned: { en: "Rider assigned", fr: "Livreur assigné" },
  picked_up: { en: "Picked up", fr: "Collecté" },
  in_transit: { en: "In transit", fr: "En transit" },
  delivered: { en: "Delivered", fr: "Livré" },
  failed: { en: "Failed", fr: "Échec" },
};
export const legStatusLabel = (s: string, fr: boolean) => (LEG_STATUS[s] ? (fr ? LEG_STATUS[s].fr : LEG_STATUS[s].en) : s.replace(/_/g, " "));

// ─── Helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The option label of a line ("Size: 42"); nothing for a product without options (the server stores "Default"). */
export const variantText = (variant: string | null | undefined, translated: string | null | undefined, fr: boolean): string =>
  !variant || /^default$/i.test(variant.trim()) ? "" : variantDisplay(variant, translated, fr);

/** " (Size: 42)" or "" — for a name followed by its option. */
export const variantSuffix = (variant: string | null | undefined, fr: boolean): string => {
  const v = variantText(variant, null, fr);
  return v ? ` (${v})` : "";
};

/** Product name on a line / snapshot in the viewer's language. */
export const nameOf = (fr: boolean, en: string | null | undefined, frText: string | null | undefined) => pickText(fr, en, frText);

/** True when the request waits for the seller's answer (the pages highlight these and the dashboard counts them). */
export const needsSeller = (c: { status?: string; stage?: string }) => c.status === "open" && c.stage === "awaiting_seller";

export const MIN_REASON = 5;

/** Sum of the lines of a request (what the customer asks for, before any refund decision). */
export const caseValue = (c: SellerCase): number => c.items.reduce((s, i) => s + i.unitPriceUsd * i.qty, 0);

// ─── Live reads ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Every return or dispute of the store, live (`dispute:created` / `dispute:updated`). */
export function useCases(type: CaseType): LiveQuery<SellerCase[]> {
  const q = useLiveQuery<SellerCase[]>(type === "return" ? "returns:list" : "disputes:list", type === "return" ? { limit: 200 } : { type, limit: 200 }, {
    pushes: ["dispute:created", "dispute:updated"],
    debounceMs: 250,
  });
  return q;
}

/** One request with its thread (`id` = the record id; see `resolveRecordId` for references). */
export function useCase(id: string | null) {
  const q = useLiveQuery<SellerCase>("disputes:get", id ? { id } : null, {
    pushes: ["dispute:updated"],
    pick: (p) => (p as { id?: string } | null)?.id === id,
    debounceMs: 150,
  });
  const { setData } = q;
  // A new message arrives complete in its push: append it without another read.
  useSocketEvent<{ disputeId: string; message: CaseMessage }>("dispute:message", (p) => {
    if (!p?.message) return;
    setData((cur) => {
      if (!cur || cur.id !== p.disputeId) return cur;
      const list = cur.messages ?? [];
      if (list.some((m) => m.id === p.message.id)) return cur;
      return { ...cur, messages: [...list, p.message], messageCount: (cur.messageCount ?? list.length) + 1 };
    });
  });
  return q;
}

export function useReplacements(): LiveQuery<SellerReplacement[]> {
  return useLiveQuery<SellerReplacement[]>("replacements:list", { limit: 200 }, { pushes: ["replacement:updated"], debounceMs: 250 });
}
export function useExchanges(): LiveQuery<SellerExchange[]> {
  return useLiveQuery<SellerExchange[]>("exchanges:list", { limit: 200 }, { pushes: ["exchange:updated"], debounceMs: 250 });
}
export function useReplacement(id: string | null) {
  return useLiveQuery<SellerReplacement>("replacements:get", id ? { id } : null, {
    pushes: ["replacement:updated"],
    pick: (p) => (p as { id?: string } | null)?.id === id,
    debounceMs: 150,
  });
}
export function useExchange(id: string | null) {
  return useLiveQuery<SellerExchange>("exchanges:get", id ? { id } : null, {
    pushes: ["exchange:updated"],
    pick: (p) => (p as { id?: string } | null)?.id === id,
    debounceMs: 150,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Lists show a reference ("RET-1234"), notices link the id: read the id from the list when handed a reference. */
export function resolveRecordId<T extends { id: string; reference: string }>(idOrRef: string, list: T[] | null): { id: string | null; waiting: boolean } {
  if (UUID.test(idOrRef)) return { id: idOrRef, waiting: false };
  if (!list) return { id: null, waiting: true };
  const hit = list.find((x) => x.reference === idOrRef);
  return { id: hit?.id ?? null, waiting: false };
}

/**
 * The delivery legs of one replacement / exchange the seller hears about (the pickup from the store, the transfer):
 * `task:updated` reaches the seller in a redacted view, so the legs are collected here as they arrive.
 */
export function useCaseLegs(recordId: string | null): CaseLeg[] {
  const [legs, setLegs] = useState<CaseLeg[]>([]);
  useSocketEvent<CaseLeg>(["task:updated", "delivery:updated"], (leg) => {
    if (!leg || !recordId) return;
    if ((leg.replacementId ?? leg.exchangeId ?? leg.disputeId) !== recordId) return;
    setLegs((cur) => {
      const i = cur.findIndex((l) => l.id === leg.id);
      if (i === -1) return [...cur, leg];
      const next = [...cur];
      next[i] = leg;
      return next;
    });
  });
  return legs;
}
