"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
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
};
export type DisputeRow = Dispute & { receivedAt?: string | null };
export type PaymentRow = Payment & {
  purpose?: "order" | "topup" | "plan";
  /** For `purpose: "plan"`, the plan id being bought. */
  subject?: string | null;
  providerRef?: string | null;
  failureReason?: string | null;
};
export interface FlashSaleServerRow {
  id: string;
  title: string;
  productId: string;
  productName: string;
  flashPrice: number;
  discount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
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
  body: string;
  type: string;
  active: boolean;
  updatedAt?: string;
}
export interface BroadcastServerRow {
  id: string;
  title: string;
  body: string;
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
}
export interface SupportMessage {
  from: string;
  role: string;
  text: string;
  at: string;
}
export interface SupportTicketRow {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  subject: string;
  category: string;
  orderId: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  messages: string | SupportMessage[];
  createdAt: string;
  updatedAt: string;
}
export interface ZoneSetting {
  id: string;
  name: string;
  nameFr?: string;
  city: string;
  feeUsd: number;
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

/** Statuses an admin may move an order to (mirrors the server rules). */
export function nextOrderStatuses(current: string): string[] {
  if (current === "cancelled" || current === "returned") return [];
  if (current === "delivered") return ["returned"];
  const idx = FLOW.indexOf(current);
  if (idx === -1) return [];
  return FLOW.slice(idx + 1);
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
