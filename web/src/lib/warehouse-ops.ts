"use client";

import { useMemo } from "react";
import { useHubScope } from "@/lib/warehouse";
import { socketClient } from "@/lib/realtime/socket-client";
import { useOpsQuery } from "@/lib/warehouse-live";
import type { HubOpsSettings } from "@/lib/warehouse-ops-format";

/**
 * Warehouse operations data (round 2): the warehouse's own settings, the aged-parcel board and the leg analytics. All over the
 * one authenticated socket, scoped by the server to the caller's warehouse (admins pick one in the hub bar). Counts and times
 * only: riders are salaried, nothing here carries pay.
 */

/** The settings of the warehouse in view (`hubSettings:get`); live, so a manager's save shows on every open screen. */
export function useHubOpsSettings() {
  const { hubId, effectiveHubId, isAdmin } = useHubScope();
  // An admin must pick a warehouse first; a staff member always has theirs.
  const q = useOpsQuery<HubOpsSettings | null>("hubSettings:get", {
    initial: null,
    body: hubId ? { hubId } : {},
    push: ["hubSettings:updated"],
    enabled: !isAdmin || !!effectiveHubId,
  });
  return { ...q, needsHub: isAdmin && !effectiveHubId };
}

export const saveHubOpsSettings = (hubId: string | undefined, patch: Record<string, unknown>) =>
  socketClient.request<HubOpsSettings>("hubSettings:update", { ...(hubId ? { hubId } : {}), ...patch });

/** What the aged-parcels page shows next to each leg. */
export interface AgedSummary {
  levels: [number, number, number];
  byTask: Record<string, { level: number; alertedAt: string | null }>;
  counts: [number, number, number];
}

export function useAgedSummary(enabled: boolean) {
  const { hubId } = useHubScope();
  return useOpsQuery<AgedSummary | null>("aged:summary", { initial: null, body: hubId ? { hubId } : {}, push: ["task:updated", "hubSettings:updated"], enabled });
}

/** Send a stuck parcel back to its seller (`aged:returnToSeller`): resolves with the closed leg and the new way-back legs. */
export const returnToSeller = (taskId: string) => socketClient.request<{ closed: { id: string }; legs: { id: string }[] }>("aged:returnToSeller", { taskId });

export interface LegStat {
  kind: string;
  completed: number;
  failed: number;
  avgHours: number | null;
  avgTransitMinutes: number | null;
}
export interface RiderStat {
  riderId: string;
  name: string;
  completed: number;
  failed: number;
  successRatePct: number | null;
}
export interface OpsAnalytics {
  hubId: string | null;
  range: { from: string; to: string; days: number };
  targetHours: number | null;
  onTime: { deliveries: number; onTime: number; late: number; ratePct: number | null };
  legs: LegStat[];
  riders: RiderStat[];
  totals: { completed: number; failed: number; voided: number };
}

/** On-time rate, time per leg and per-rider counts for a period (`analytics:legs`, managers and admins). */
export function useLegAnalytics(range: { from: string; to: string }, enabled: boolean) {
  const { hubId } = useHubScope();
  const body = useMemo(() => ({ ...(hubId ? { hubId } : {}), from: range.from, to: range.to }), [hubId, range.from, range.to]);
  return useOpsQuery<OpsAnalytics | null>("analytics:legs", { initial: null, body, push: ["task:updated"], enabled });
}
