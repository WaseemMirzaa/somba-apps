"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";

/**
 * Generic live reads for the warehouse / fulfilment portals. Every call goes
 * over the one authenticated socket (`socketClient.request`); errors are kept
 * as readable sentences so the pages can show them instead of swallowing them.
 */

export function isOpsRole(role: string | undefined | null): boolean {
  return !!role && (role === "warehouse_staff" || role.startsWith("admin"));
}

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Request failed.";
}

export interface OpsQuery<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Replace one cached row locally (e.g. after a write whose ack carries the new row). */
  patch: (updater: (cur: T) => T) => void;
}

/**
 * Load `event` once the socket is connected (and re-load on every listed
 * server push, e.g. `exception:updated`). `initial` must be a stable value.
 */
export function useOpsQuery<T>(
  event: string,
  opts: { body?: Record<string, unknown>; push?: string[]; initial: T; enabled?: boolean },
): OpsQuery<T> {
  const rt = useRealtime();
  const [data, setData] = useState<T>(opts.initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bodyKey = JSON.stringify(opts.body ?? {});
  const pushKey = (opts.push ?? []).join("|");
  const enabled =
    (opts.enabled ?? true) && rt.status === "connected" && isOpsRole(rt.user?.role);

  const load = useCallback(async () => {
    try {
      const res = await socketClient.request<T>(event, JSON.parse(bodyKey));
      setData(res);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [event, bodyKey]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const s = socketClient.current;
    const names = pushKey ? pushKey.split("|") : [];
    const handler = () => void load();
    names.forEach((n) => s?.on(n, handler));
    return () => {
      names.forEach((n) => s?.off(n, handler));
    };
  }, [enabled, load, pushKey]);

  const patch = useCallback((updater: (cur: T) => T) => setData((cur) => updater(cur)), []);

  return useMemo(
    () => ({ data, loading, error, reload: load, patch }),
    [data, loading, error, load, patch],
  );
}

// ───────────────────────── analytics:warehouse ─────────────────────────

export interface WarehouseAnalytics {
  totalParcels: number;
  unassigned: number;
  inTransit: number;
  delivered: number;
  /** COD of parcels not delivered and not failed. */
  codToCollect: number;
  byStatus: Record<string, number>;
  /** Last 7 UTC days, oldest first. */
  throughput: { date: string; received: number; pickedUp: number; delivered: number }[];
  /** Average minutes rider pickup to delivery (parcels delivered in the last 30 days); null = no sample. */
  avgPickupToDeliveryMinutes: number | null;
  pickupToDeliverySamples: number;
  failureRatePct: number | null;
  failed30: number;
  delivered30: number;
  agedOver24h: number;
  /** Per delivery zone, last 30 days. */
  byZone: { zoneId: string | null; parcels: number; delivered: number; failed: number }[];
  /** Dispatch batches built per hub in the last 30 days (parcels are not assigned to hubs). */
  byHub: { hubId: string; hub: string; batches30: number }[];
}

/** Real warehouse figures from the server (`analytics:warehouse`), refreshed when deliveries or batches change. */
export function useWarehouseAnalytics() {
  return useOpsQuery<WarehouseAnalytics | null>("analytics:warehouse", {
    initial: null,
    push: ["delivery:updated", "batch:updated"],
  });
}

/** "3 h 20 min" / "45 min" from minutes. */
export function formatMinutes(min: number | null | undefined, fr: boolean): string {
  if (min == null) return "—";
  if (min < 1) return fr ? "< 1 min" : "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ───────────────────────── server row shapes ─────────────────────────

export interface WarehouseRider {
  id: string;
  name: string;
  phone: string | null;
  activeTasks: number;
}

export interface BatchRow {
  id: string;
  reference: string;
  hubId: string | null;
  riderId: string | null;
  riderName: string | null;
  /** JSON array of task ids. */
  taskIds: string;
  status: string;
  createdAt: string;
}

export function batchTaskIds(b: BatchRow): string[] {
  try {
    const parsed = JSON.parse(b.taskIds) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface ExceptionRow {
  id: string;
  reference: string;
  taskId: string | null;
  orderReference: string | null;
  type: "damaged" | "missing_item" | "wrong_item" | "address_issue" | "lost" | "other";
  severity: "low" | "medium" | "high";
  status: "open" | "investigating" | "resolved" | "escalated";
  hub: string | null;
  notes: string;
  resolution: string | null;
  raisedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRow {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  fromSku: string;
  fromName: string;
  toSku: string;
  toName: string;
  priceDiffUsd: number;
  reason: string | null;
  status: "requested" | "approved" | "received" | "ready" | "dispatched" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface ReplacementRow {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  sku: string;
  productName: string;
  reason: string | null;
  condition: string | null;
  status: "requested" | "approved" | "received" | "allocated" | "dispatched" | "rejected";
  dispatchStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferRow {
  id: string;
  reference: string;
  fromHub: string;
  toHub: string;
  sku: string;
  productName: string | null;
  qty: number;
  status: string;
  createdAt: string;
}

export interface HubRow {
  id: string;
  name: string;
  city: string;
  country: string | null;
  address?: string | null;
  capacity: number;
  /** Inactive hubs are listed but cannot take transfers. */
  active?: boolean;
}

export interface ReconcileRow {
  riderId: string;
  parcels: number;
  codUsd: number;
}

export interface InventoryRow {
  sku: string;
  productId: string;
  name: string;
  nameFr?: string | null;
  category: string;
  categoryFr?: string | null;
  stock: number;
  status: "ok" | "low" | "out" | string;
}

export interface ReturnDispute {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerId: string;
  customerName: string;
  type: "dispute" | "return";
  reason: string;
  status: "open" | "resolved" | "rejected";
  resolution: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ───────────────────────── labels (EN / FR) ─────────────────────────

type L = { en: string; fr: string };
export const pick = (l: L | undefined, fr: boolean, fallback = "") =>
  l ? (fr ? l.fr : l.en) : fallback;

export const EXCEPTION_TYPE: Record<string, L> = {
  damaged: { en: "Damaged", fr: "Endommagé" },
  missing_item: { en: "Missing item", fr: "Article manquant" },
  wrong_item: { en: "Wrong item", fr: "Mauvais article" },
  address_issue: { en: "Address issue", fr: "Problème d'adresse" },
  lost: { en: "Lost", fr: "Perdu" },
  other: { en: "Other", fr: "Autre" },
};

/** Where the dispatch of a replacement stands (`dispatchStatus`). */
export const DISPATCH_STATUS: Record<string, L> = {
  pending: { en: "Pending", fr: "En attente" },
  dispatched: { en: "Dispatched", fr: "Expédié" },
  delivered: { en: "Delivered", fr: "Livré" },
};

/** Where a delivery task stands (`delivery_tasks.status`). */
export const DELIVERY_TASK_STATUS: Record<string, L> = {
  unassigned: { en: "Unassigned", fr: "Non assignée" },
  assigned: { en: "Assigned", fr: "Assignée" },
  picked_up: { en: "Picked up", fr: "Collectée" },
  in_transit: { en: "On the way", fr: "En route" },
  delivered: { en: "Delivered", fr: "Livrée" },
  failed: { en: "Failed", fr: "Échouée" },
};

/** Stock level of an inventory row (`status` is ok / low / out). */
export const STOCK_STATUS: Record<string, L> = {
  ok: { en: "In stock", fr: "En stock" },
  low: { en: "Low", fr: "Faible" },
  out: { en: "Out of stock", fr: "Rupture" },
};

export const SEVERITY: Record<string, L> = {
  low: { en: "Low", fr: "Faible" },
  medium: { en: "Medium", fr: "Moyenne" },
  high: { en: "High", fr: "Élevée" },
};

export const EXCEPTION_STATUS: Record<string, L> = {
  open: { en: "Open", fr: "Ouvert" },
  investigating: { en: "Investigating", fr: "En investigation" },
  resolved: { en: "Resolved", fr: "Résolu" },
  escalated: { en: "Escalated", fr: "Escaladé" },
};

export const EXCHANGE_STATUS: Record<string, L> = {
  requested: { en: "Requested", fr: "Demandé" },
  approved: { en: "Approved", fr: "Approuvé" },
  received: { en: "Old item received", fr: "Ancien article reçu" },
  ready: { en: "New item ready", fr: "Nouvel article prêt" },
  dispatched: { en: "Dispatched", fr: "Expédié" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};

export const REPLACEMENT_STATUS: Record<string, L> = {
  requested: { en: "Requested", fr: "Demandé" },
  approved: { en: "Approved", fr: "Approuvé" },
  received: { en: "Faulty item received", fr: "Article défectueux reçu" },
  allocated: { en: "New unit allocated", fr: "Nouvelle unité allouée" },
  dispatched: { en: "Dispatched", fr: "Expédié" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};

export const TRANSFER_STATUS: Record<string, L> = {
  requested: { en: "Requested", fr: "Demandé" },
  in_transit: { en: "In transit", fr: "En transit" },
  received: { en: "Received", fr: "Reçu" },
};

export const BATCH_STATUS: Record<string, L> = {
  building: { en: "Building", fr: "En préparation" },
  dispatched: { en: "Dispatched", fr: "Expédié" },
  completed: { en: "Completed", fr: "Terminé" },
};

export function statusOptions(map: Record<string, L>) {
  return Object.entries(map).map(([value, l]) => ({ value, label: l.en, labelFr: l.fr }));
}

export function severityVariant(s: string): "danger" | "warning" | "default" {
  return s === "high" ? "danger" : s === "medium" ? "warning" : "default";
}

/** Next steps the server accepts for a replacement (any status is allowed; these are the sensible ones). */
export const REPLACEMENT_NEXT: Record<string, { to: string; danger?: boolean }[]> = {
  requested: [{ to: "approved" }, { to: "rejected", danger: true }],
  approved: [{ to: "received" }, { to: "rejected", danger: true }],
  received: [{ to: "allocated" }],
  allocated: [{ to: "dispatched" }],
  dispatched: [],
  rejected: [],
};

export const EXCHANGE_NEXT: Record<string, { to: string; danger?: boolean }[]> = {
  requested: [{ to: "approved" }, { to: "rejected", danger: true }],
  approved: [{ to: "received" }, { to: "rejected", danger: true }],
  received: [{ to: "ready" }],
  ready: [{ to: "dispatched" }],
  dispatched: [],
  rejected: [],
};

export function shortDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}
