"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { authApi } from "@/lib/realtime/auth-api";
import type { Dispute, Payment, Payout } from "@/lib/realtime/types";

/**
 * Helpers for admin pages that talk to the server directly (request -> ack).
 * Rule: a success message is only ever shown after the request resolved.
 */

export function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return "Request failed.";
}

/** Server rows that carry more than the shared realtime types declare. */
export type PayoutRow = Payout & {
  account?: string | null;
  providerRef?: string | null;
  /** The network's receipt number of a pawaPay payout. */
  receiptRef?: string | null;
};
export type DisputeRow = Dispute;
export type PaymentRow = Payment & {
  purpose?: "order" | "topup" | "plan";
  /** For `purpose: "plan"`, the plan id being bought. */
  subject?: string | null;
  providerRef?: string | null;
  failureReason?: string | null;
  /** Where a refund went, and the state of a phone refund (pawaPay). */
  refundTo?: "wallet" | "phone" | null;
  refundStatus?: "sending" | "completed" | "failed" | null;
  refundedUsd?: number | null;
};

/** What the finance screens can offer (`payments:provider`): the live provider, refunds to the phone, pawaPay payouts. */
export interface PaymentCapabilities {
  provider: string | null;
  phoneRefunds: boolean;
  pawapayPayouts: boolean;
}
export interface FlashSaleServerRow {
  id: string;
  title: string;
  titleFr?: string | null;
  productId: string;
  productName: string;
  productNameFr?: string | null;
  flashPrice: number;
  discount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  basePrice?: number;
  /** nominated = proposed by a seller, waiting for marketing. */
  status?: "nominated" | "approved" | "declined";
  rejectReason?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  phase?: "scheduled" | "running" | "ended";
  startsInMs?: number | null;
  endsInMs?: number | null;
  createdAt?: string;
}
export interface PromoRow {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrder: number;
  description: string | null;
  active: boolean;
  maxUses: number | null;
  perUserLimit: number | null;
  expiresAt: string | null;
  isPublic: boolean;
}
export interface CampaignRow {
  id: string;
  reference: string;
  sellerId: string | null;
  sellerName: string | null;
  name: string;
  nameFr: string | null;
  discount: number;
  productCount: number;
  /** Product ids the discount covers; empty = every product of the campaign's store. */
  productIds?: string[] | null;
  budgetUsd: number;
  startDate: string | null;
  endDate: string | null;
  status: "draft" | "pending" | "scheduled" | "active" | "ended" | "rejected";
  /** Discount given so far, and what is left of the budget (null = no budget). */
  spentUsd?: number;
  budgetRemainingUsd?: number | null;
  rejectReason?: string | null;
  endedReason?: "dates" | "budget" | "withdrawn" | "admin" | null;
  views: number;
  clicks: number;
  orders: number;
  revenueUsd: number;
  createdAt: string;
}
export interface CmsServerRow {
  id: string;
  key: string;
  title: string;
  titleFr?: string | null;
  body: string;
  bodyFr?: string | null;
  type: string;
  active: boolean;
  updatedAt?: string;
}
export interface BroadcastServerRow {
  id: string;
  title: string;
  titleFr?: string | null;
  body: string;
  bodyFr?: string | null;
  audience: string;
  sentBy: string;
  recipients: number;
  createdAt: string;
}
export interface StaffRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  active?: boolean;
  /** Riders and warehouse staff: home warehouse (null = every warehouse). */
  hubId?: string | null;
  /** Warehouse staff only: operator / supervisor / manager. */
  warehouseTier?: "operator" | "supervisor" | "manager" | null;
}
export interface SupportMessage {
  id?: string;
  from: string;
  fromId?: string;
  role: string;
  text: string;
  at: string;
  attachments?: string[];
}
export interface SupportTicketRow {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  /** The creator's role: customer, seller, rider... */
  role?: string;
  subject: string;
  category: string;
  orderId: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Messages from staff the owner has not read / messages from the owner no agent has read. */
  userUnread?: number;
  staffUnread?: number;
  status: "open" | "pending" | "resolved" | "closed";
  messages: string | SupportMessage[];
  createdAt: string;
  updatedAt: string;
}
export function parseMessages(raw: string | SupportMessage[] | undefined): SupportMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw) as SupportMessage[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

/**
 * Loads a list through one socket request and keeps it fresh from push events.
 * `pushEvents` rows are upserted by id. Listeners are re-attached whenever the
 * connection state changes (the shared provider re-binds the socket on reconnect).
 */
export function useServerList<T extends { id: string }>(
  event: string,
  opts: { pushEvents?: string[]; body?: Record<string, unknown>; enabled?: boolean } = {},
) {
  const rt = useRealtime();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef(opts.body);
  useEffect(() => {
    bodyRef.current = opts.body;
  });
  const enabled = opts.enabled ?? true;
  const pushKey = (opts.pushEvents ?? []).join("|");

  const reload = useCallback(async () => {
    if (rt.status !== "connected" || !enabled) return;
    try {
      const rows = await socketClient.request<T[]>(event, bodyRef.current);
      setItems(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [event, rt.status, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (rt.status !== "connected" || !enabled || !pushKey) return;
    const sock = socketClient.current;
    if (!sock) return;
    const events = pushKey.split("|");
    const handler = (row: T) => setItems((cur) => upsertById(cur, row));
    events.forEach((ev) => sock.on(ev, handler));
    return () => {
      events.forEach((ev) => sock.off(ev, handler));
    };
  }, [rt.status, enabled, pushKey]);

  return { items, setItems, loading, error, reload };
}

/**
 * Wraps a server write: resolves true on success (after showing `success`),
 * shows the server's own error message and resolves false on failure.
 */
export function useRun() {
  const { toast } = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await fn();
        if (success) toast(success, "success");
        return true;
      } catch (e) {
        toast(errMsg(e), "error");
        return false;
      }
    },
    [toast],
  );
}

/** Roles that may create / edit / switch hubs (server group `hubs`). */
export function canManageHubs(role: string): boolean {
  return role === "admin" || role === "admin_operations";
}

/** Roles that may open the finance figures (`analytics:finance`). */
export function canSeeFinance(role: string): boolean {
  return role === "admin" || role === "admin_finance";
}

/**
 * Loading / error state of the live feed (orders, products, payments... arrive
 * through the realtime provider). `error` is the connection error, if any.
 */
export function useFeedState(): { loading: boolean; error: string | null } {
  const rt = useRealtime();
  if (rt.status === "error") return { loading: false, error: rt.error ?? "Cannot reach the server." };
  return { loading: rt.status !== "connected", error: null };
}

export function useRole(): string {
  const rt = useRealtime();
  return rt.user?.role ?? "guest";
}

/** Roles allowed to move money (refunds, payouts, manual payment decisions). */
export function canMoveMoney(role: string): boolean {
  return role === "admin" || role === "admin_finance";
}

export const ORDER_STATUS_LABEL: Record<string, { en: string; fr: string }> = {
  pending: { en: "Pending", fr: "En attente" },
  confirmed: { en: "Confirmed", fr: "Confirmée" },
  processing: { en: "Processing", fr: "En préparation" },
  shipped: { en: "Shipped", fr: "Expédiée" },
  out_for_delivery: { en: "Out for delivery", fr: "En livraison" },
  delivered: { en: "Delivered", fr: "Livrée" },
  cancelled: { en: "Cancelled", fr: "Annulée" },
  returned: { en: "Returned", fr: "Retournée" },
};

export function orderStatusLabel(status: string, fr: boolean): string {
  const l = ORDER_STATUS_LABEL[status];
  return l ? (fr ? l.fr : l.en) : status.replace(/_/g, " ");
}

export const ORDER_STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  confirmed: "info",
  processing: "info",
  shipped: "info",
  out_for_delivery: "info",
  delivered: "success",
  cancelled: "danger",
  returned: "default",
};

const FLOW = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];

/**
 * The ONE forward step an admin may take on an order. The server's
 * `orders:updateStatus` allows exactly: pending->confirmed, confirmed->processing,
 * processing->shipped, shipped->out_for_delivery, out_for_delivery->delivered,
 * delivered->returned. Anything else is refused (use `orders:adminCancel` to cancel).
 */
export function nextOrderStatuses(current: string): string[] {
  if (current === "delivered") return ["returned"];
  const idx = FLOW.indexOf(current);
  if (idx === -1 || idx === FLOW.length - 1) return [];
  return [FLOW[idx + 1]];
}

/** Statuses at which an operator may cancel an order (`orders:adminCancel`). */
export function canAdminCancel(status: string): boolean {
  return status === "pending" || status === "confirmed" || status === "processing";
}

export const DISPUTE_STATUS_LABEL: Record<string, { en: string; fr: string }> = {
  open: { en: "Open", fr: "Ouvert" },
  resolved: { en: "Resolved", fr: "Résolu" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};
export const DISPUTE_STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  open: "warning",
  resolved: "success",
  rejected: "danger",
};
export const DISPUTE_TYPE_LABEL: Record<string, { en: string; fr: string }> = {
  dispute: { en: "Dispute", fr: "Litige" },
  return: { en: "Return", fr: "Retour" },
};

export const SUPPORT_STATUS_LABEL: Record<string, { en: string; fr: string }> = {
  open: { en: "Open", fr: "Ouvert" },
  pending: { en: "Awaiting customer", fr: "En attente du client" },
  resolved: { en: "Resolved", fr: "Résolu" },
  closed: { en: "Closed", fr: "Fermé" },
};
export const SUPPORT_STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  open: "warning",
  pending: "info",
  resolved: "success",
  closed: "default",
};

/**
 * A key that changes whenever an order, a delivery leg or a dispute changes (not only when a row is added):
 * the newest `updatedAt` of each list plus its length. Use it as `refreshKey` of a socket query.
 */
export function useLiveKey(): string {
  const rt = useRealtime();
  const newest = (rows: { updatedAt?: string | null }[]) => rows.reduce((m, r) => (r.updatedAt && r.updatedAt > m ? r.updatedAt : m), "");
  return `${rt.orders.length}:${newest(rt.orders)}|${rt.deliveries.length}:${newest(rt.deliveries)}|${rt.disputes.length}:${newest(rt.disputes)}`;
}

type L2 = { en: string; fr: string };
export const DISPUTE_STAGE_LABEL: Record<string, L2> = {
  awaiting_seller: { en: "Waiting for the seller", fr: "En attente du vendeur" },
  seller_replied: { en: "Seller replied", fr: "Le vendeur a répondu" },
  seller_rejected: { en: "Seller said no", fr: "Refusé par le vendeur" },
  seller_timeout: { en: "Seller did not answer", fr: "Le vendeur n'a pas répondu" },
  escalated: { en: "With Somba support", fr: "Chez le support Somba" },
  approved: { en: "Approved, pickup being planned", fr: "Approuvé, collecte en préparation" },
  pickup: { en: "Pickup on its way", fr: "Collecte en cours" },
  received: { en: "Goods at the warehouse", fr: "Marchandise à l'entrepôt" },
  closed: { en: "Closed", fr: "Clôturé" },
};
export const DISPUTE_STAGE_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default" | "purple"> = {
  awaiting_seller: "warning",
  seller_replied: "info",
  seller_rejected: "danger",
  seller_timeout: "danger",
  escalated: "purple",
  approved: "info",
  pickup: "info",
  received: "info",
  closed: "default",
};
export const DISPUTE_CATEGORY_LABEL: Record<string, L2> = {
  missing: { en: "Missing item", fr: "Article manquant" },
  damaged: { en: "Damaged", fr: "Endommagé" },
  wrong_item: { en: "Wrong item", fr: "Mauvais article" },
  not_received: { en: "Not received", fr: "Non reçu" },
  not_as_described: { en: "Not as described", fr: "Non conforme" },
  changed_mind: { en: "Changed my mind", fr: "Changement d'avis" },
  defective: { en: "Defective", fr: "Défectueux" },
  other: { en: "Other", fr: "Autre" },
};
export const DISPUTE_OUTCOME_LABEL: Record<string, L2> = {
  refund_full: { en: "Full refund", fr: "Remboursement total" },
  refund_partial: { en: "Partial refund", fr: "Remboursement partiel" },
  replacement: { en: "Replacement", fr: "Remplacement" },
  reject: { en: "Rejected", fr: "Rejeté" },
  return_refund: { en: "Returned items refunded", fr: "Articles retournés remboursés" },
};
export const ITEM_CONDITION_LABEL: Record<string, L2> = {
  resellable: { en: "Resellable", fr: "Revendable" },
  damaged: { en: "Damaged", fr: "Endommagé" },
  unsellable: { en: "Unsellable", fr: "Invendable" },
};
/** Stages in which nobody has decided a return yet (Somba support may approve or refuse). */
export const RETURN_UNDECIDED = ["awaiting_seller", "seller_rejected", "seller_timeout", "escalated"];
export const lab = (m: Record<string, L2>, key: string | null | undefined, fr: boolean) => {
  const l = key ? m[key] : undefined;
  return l ? (fr ? l.fr : l.en) : (key ?? "—");
};

/** An upload path (`/uploads/x.jpg`) as a full URL the browser can load; other URLs pass through. */
export function assetUrl(u: string | null | undefined): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  return `${authApi.apiUrl}${u.startsWith("/") ? "" : "/"}${u}`;
}

/**
 * The finance fingerprint: changes whenever an order, a payment or a payout changes anywhere (the server pushes
 * `finance:changed {version, updatedAt}` a moment after each save). Use it as the `refreshKey` of the finance
 * queries: a status change refreshes the figures even when no row was added or removed.
 */
export function useFinanceVersion(enabled = true): string {
  const rt = useRealtime();
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (!enabled || rt.status !== "connected") return;
    const sock = socketClient.current;
    if (!sock) return;
    const onChanged = (p: { version?: string }) => setVersion(String(p?.version ?? Date.now()));
    sock.on("finance:changed", onChanged);
    return () => {
      sock.off("finance:changed", onChanged);
    };
  }, [enabled, rt.status]);
  return version;
}

export const ROLE_LABEL: Record<string, L2> = {
  customer: { en: "Customer", fr: "Client" },
  seller: { en: "Seller", fr: "Vendeur" },
  rider: { en: "Rider", fr: "Livreur" },
  warehouse_staff: { en: "Warehouse", fr: "Entrepôt" },
  admin: { en: "Admin", fr: "Admin" },
};
export const ROLE_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default" | "purple"> = {
  customer: "default",
  seller: "warning",
  rider: "info",
  warehouse_staff: "purple",
};
/** Uploads an image (`POST /api/v1/uploads`, Bearer) and returns its public URL. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${authApi.apiUrl}/api/v1/uploads`, {
    method: "POST",
    headers: { authorization: `Bearer ${authApi.getAccess() ?? ""}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string | string[] };
  if (!res.ok || !json.url) throw new Error(Array.isArray(json.message) ? json.message.join(" ") : (json.message ?? "Upload failed."));
  return json.url;
}
