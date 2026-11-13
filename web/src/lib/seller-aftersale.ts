"use client";

import { useLiveQuery } from "@/lib/seller-api";
import type { LiveQuery } from "@/lib/seller-api";
import { useStoreGate } from "@/lib/seller";
import { LEG_STATUS, pickL } from "@/lib/logistics";
import type { L } from "@/lib/after-sale-text";
import type { TextI18n } from "@/lib/text-i18n";

/**
 * The seller portal's READ-ONLY after-sale sections (docs/contracts/admin-controls.md §13): Returns, Exchanges, Replacements and
 * the Express card in Store settings. Admin switches each on (a default per section, an override per store); the store's
 * `afterSaleAccess` arrives on `sellers:mine` and live on `seller:updated`. KOMORIKO support decides every case: the seller only
 * reads and talks to support in a private thread the customer never sees.
 */
export type CaseKind = "return" | "exchange" | "replacement";
export type SectionKey = "returns" | "exchanges" | "replacements" | "express";
/** The two visibility switches (§13): what a store that has a section on may also read of the customer's words. */
export type VisibilityKey = "customerThread" | "reasons";
/** Every switch admin sets, per platform default and per store. */
export type AccessKey = SectionKey | VisibilityKey;
export type AfterSaleAccess = Record<AccessKey, boolean>;
export const NO_ACCESS: AfterSaleAccess = { returns: false, exchanges: false, replacements: false, express: false, customerThread: false, reasons: false };

export interface SectionMeta {
  kind: CaseKind;
  key: SectionKey;
  href: string;
  /** The list event and the detail event; the live push that follows a case. */
  listEvent: string;
  getEvent: string;
  push: string;
  titleEn: string;
  titleFr: string;
  subEn: string;
  subFr: string;
  idEn: string;
  idFr: string;
}

export const SECTIONS: Record<CaseKind, SectionMeta> = {
  return: {
    kind: "return",
    key: "returns",
    href: "/seller/returns",
    listEvent: "returns:list",
    getEvent: "disputes:get",
    push: "dispute:updated",
    titleEn: "Returns",
    titleFr: "Retours",
    subEn: "Returns on your items. KOMORIKO support decides them: you can follow each one here and message support.",
    subFr: "Retours sur vos articles. Le support KOMORIKO les décide : suivez chacun ici et écrivez au support.",
    idEn: "Return ID",
    idFr: "N° retour",
  },
  exchange: {
    kind: "exchange",
    key: "exchanges",
    href: "/seller/exchanges",
    listEvent: "exchanges:list",
    getEvent: "exchanges:get",
    push: "exchange:updated",
    titleEn: "Exchanges",
    titleFr: "Échanges",
    subEn: "Exchanges requested on your items. KOMORIKO support decides them: you can follow each one here and message support.",
    subFr: "Échanges demandés sur vos articles. Le support KOMORIKO les décide : suivez chacun ici et écrivez au support.",
    idEn: "Exchange ID",
    idFr: "N° échange",
  },
  replacement: {
    kind: "replacement",
    key: "replacements",
    href: "/seller/replacements",
    listEvent: "replacements:list",
    getEvent: "replacements:get",
    push: "replacement:updated",
    titleEn: "Replacements",
    titleFr: "Remplacements",
    subEn: "Replacements requested on your items. KOMORIKO support decides them: you can follow each one here and message support.",
    subFr: "Remplacements demandés sur vos articles. Le support KOMORIKO les décide : suivez chacun ici et écrivez au support.",
    idEn: "Replacement ID",
    idFr: "N° remplacement",
  },
};

export const BANNER = {
  en: "KOMORIKO support handles this request. You can follow it here and message support.",
  fr: "Le support KOMORIKO traite cette demande. Vous pouvez la suivre ici et écrire au support.",
};

/** What the server serves a store of a case: the customer's first name, never the thread of the customer. */
export interface SellerCase {
  sellerView: true;
  kind: CaseKind;
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerFirstName: string;
  status: string;
  stage: string | null;
  category: string | null;
  reason: string | null;
  reasonI18n?: TextI18n;
  attachments: string[];
  items: { name: string; nameFr: string | null; variant: string | null; variantFr: string | null; qty: number }[];
  decisionNote: string | null;
  decisionNoteFr: string | null;
  decisionNoteI18n?: TextI18n;
  refundUsd: number | null;
  priceDiffUsd: number | null;
  dispatchStatus: string | null;
  timeline: { key: string; done: boolean; at: string | null }[];
  legs: { pickup: string | null; returnToSeller: string | null } | null;
  createdAt: string;
  updatedAt: string;
  unread: number;
  /** The customer's reason, category, photos and support's decision note were removed by the server (admin has not shown them to this store). */
  reasonHidden?: boolean;
  /** Admin shares the customer <-> support conversation of cases with this store (read-only). */
  customerThreadShared?: boolean;
}

/** One line of the customer <-> support conversation as a store that was shown it reads it. */
export interface CustomerConversationMessage {
  id: string;
  caseId: string;
  side: "customer" | "support";
  authorName: string;
  text: string;
  textI18n?: TextI18n;
  attachments: string[];
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  caseKind: CaseKind;
  caseId: string;
  authorId: string | null;
  authorName: string;
  authorSide: "seller" | "support";
  text: string;
  textI18n?: TextI18n;
  createdAt: string;
  readBySellerAt: string | null;
  readBySupportAt: string | null;
}

/** Which sections this store sees right now (all off until admin switches them on; live). */
export function useAfterSaleAccess(): { loaded: boolean; access: AfterSaleAccess } {
  const { state, seller } = useStoreGate();
  const raw = seller?.afterSaleAccess;
  return { loaded: state !== "loading", access: { ...NO_ACCESS, ...(raw ?? {}) } };
}

export const PAGE_SIZE = 20;

/** One page of the store's cases of a kind (server paging: `limit` + `offset`; one extra row tells whether another page exists). */
export function useCasePage(kind: CaseKind, page: number, status: string): LiveQuery<SellerCase[]> {
  const meta = SECTIONS[kind];
  return useLiveQuery<SellerCase[]>(
    meta.listEvent,
    { scope: "store", limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE, ...(status ? { status } : {}) },
    { pushes: [meta.push, "caseThread:message", "seller:updated"], pick: (p, name) => name === "seller:updated" || !!(p as { sellerView?: boolean })?.sellerView || (p as { caseKind?: string })?.caseKind === kind },
  );
}

export function useCaseDetail(kind: CaseKind, id: string): LiveQuery<SellerCase> {
  const meta = SECTIONS[kind];
  return useLiveQuery<SellerCase>(meta.getEvent, { id }, { pushes: [meta.push, "seller:updated"], pick: (p, name) => name === "seller:updated" || (p as { id?: string })?.id === id });
}

/** The customer <-> support conversation of a case, read-only (only while admin shares it: the server refuses otherwise). Live. */
export function useCustomerConversation(kind: CaseKind, caseId: string, shared: boolean): LiveQuery<CustomerConversationMessage[]> {
  return useLiveQuery<CustomerConversationMessage[]>("caseThread:customer", shared ? { kind, caseId } : null, {
    pushes: ["caseThread:customerMessage"],
    pick: (p) => (p as { caseId?: string })?.caseId === caseId,
  });
}

/** Unread support messages per section (the nav badges), live. */
export function useThreadUnread(enabled: boolean): { returns: number; exchanges: number; replacements: number; total: number } {
  const q = useLiveQuery<{ returns: number; exchanges: number; replacements: number; total: number }>("caseThread:unread", enabled ? {} : null, {
    pushes: ["caseThread:message", "seller:updated"],
  });
  return q.data ?? { returns: 0, exchanges: 0, replacements: 0, total: 0 };
}

// ── Words ────────────────────────────────────────────────────────────────────

const RETURN_STAGE: Record<string, L> = {
  awaiting_support: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  escalated: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  awaiting_seller: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  seller_replied: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  seller_rejected: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  seller_timeout: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  approved: { en: "Approved: pickup being arranged", fr: "Approuvé : collecte en préparation" },
  pickup: { en: "Goods on their way back", fr: "Articles en route" },
  received: { en: "Received at the warehouse", fr: "Reçu à l'entrepôt" },
  closed: { en: "Closed", fr: "Clôturé" },
};

const SWAP_STATUS: Record<string, L> = {
  requested: { en: "With KOMORIKO support", fr: "Chez le support KOMORIKO" },
  approved: { en: "Approved: preparing the new item", fr: "Approuvé : préparation du nouvel article" },
  received: { en: "Preparing the new item", fr: "Préparation du nouvel article" },
  allocated: { en: "New item ready", fr: "Nouvel article prêt" },
  ready: { en: "New item ready", fr: "Nouvel article prêt" },
  dispatched: { en: "On its way to the customer", fr: "En route vers le client" },
  delivered: { en: "Delivered", fr: "Livré" },
  rejected: { en: "Declined by KOMORIKO support", fr: "Refusé par le support KOMORIKO" },
};

/** The status line of a case, in the portal's language. */
export function caseStatusText(c: Pick<SellerCase, "kind" | "status" | "stage">, fr: boolean): string {
  if (c.kind === "return") {
    if (c.status === "rejected") return fr ? "Refusé par le support KOMORIKO" : "Declined by KOMORIKO support";
    if (c.status === "resolved") return fr ? "Remboursé" : "Refunded";
    return pickL(RETURN_STAGE[c.stage ?? ""], fr, c.stage ?? c.status);
  }
  return pickL(SWAP_STATUS[c.status], fr, c.status);
}

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "default";
export function caseStatusVariant(c: Pick<SellerCase, "kind" | "status" | "stage">): BadgeVariant {
  if (c.status === "rejected") return "danger";
  if (c.status === "resolved" || c.status === "delivered" || c.stage === "closed") return "success";
  if (c.status === "requested" || c.stage === "awaiting_support") return "warning";
  return "info";
}

const STEP: Record<string, L> = {
  opened: { en: "Request opened", fr: "Demande ouverte" },
  requested: { en: "Request opened", fr: "Demande ouverte" },
  approved: { en: "Approved by KOMORIKO support", fr: "Approuvé par le support KOMORIKO" },
  refused: { en: "Declined by KOMORIKO support", fr: "Refusé par le support KOMORIKO" },
  rejected: { en: "Declined by KOMORIKO support", fr: "Refusé par le support KOMORIKO" },
  pickup: { en: "A rider collects the goods", fr: "Un livreur collecte les articles" },
  received: { en: "Received at the warehouse", fr: "Reçu à l'entrepôt" },
  closed: { en: "Closed", fr: "Clôturé" },
  ready: { en: "New item ready", fr: "Nouvel article prêt" },
  allocated: { en: "New item ready", fr: "Nouvel article prêt" },
  dispatched: { en: "On its way", fr: "En route" },
  delivered: { en: "Delivered", fr: "Livré" },
};
export const stepText = (key: string, fr: boolean) => pickL(STEP[key], fr, key);

/** A pickup / return-to-store leg status ("Assigned", "On the way", ...). */
export const legText = (status: string | null | undefined, fr: boolean): string => (status ? pickL((LEG_STATUS as Record<string, L>)[status], fr, status) : fr ? "Pas encore planifiée" : "Not planned yet");

export const itemLabel = (i: SellerCase["items"][number], fr: boolean): string => {
  const name = fr && i.nameFr ? i.nameFr : i.name;
  const variant = fr && i.variantFr ? i.variantFr : i.variant;
  return `${name}${variant && variant !== "Default" ? ` · ${variant}` : ""}`;
};

/** The status filter options of the lists. */
export function statusOptions(kind: CaseKind, fr: boolean): { value: string; label: string }[] {
  const t = (en: string, frT: string) => (fr ? frT : en);
  if (kind === "return") return [{ value: "", label: t("All", "Tous") }, { value: "open", label: t("Open", "En cours") }, { value: "resolved", label: t("Refunded", "Remboursés") }, { value: "rejected", label: t("Declined", "Refusés") }];
  return [{ value: "", label: t("All", "Tous") }, { value: "requested", label: t("With support", "Chez le support") }, { value: "approved", label: t("Approved", "Approuvés") }, { value: "dispatched", label: t("On its way", "En route") }, { value: "delivered", label: t("Delivered", "Livrés") }, { value: "rejected", label: t("Declined", "Refusés") }];
}
