"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  isHubBound,
  useWarehouseSelf,
  type DeskFlags,
  type DeskQueue,
  type TaskView,
} from "@/lib/logistics";
import { useOpsQuery, type InventoryRow, type WarehouseRider } from "@/lib/warehouse-live";

/**
 * Warehouse data layer on top of the legs model (`docs/contracts/logistics.md`).
 * A "parcel" on the floor is one LEG of a journey (`TaskView`); the hub desk (`logistics:queue`) lists the legs the
 * warehouse manages, sends or receives. Everything refreshes on the `task:updated` push.
 */

export type DeskTask = TaskView & { desk: DeskFlags };

// ───────────────────────── hub scope (admins pick a warehouse, staff have their own) ─────────────────────────

const SCOPE_KEY = "somba-ops-hub";
const scopeListeners = new Set<() => void>();
let scopeMemory = "";

function readScope(): string {
  try {
    return window.localStorage.getItem(SCOPE_KEY) ?? scopeMemory;
  } catch {
    return scopeMemory;
  }
}
function setScope(id: string) {
  scopeMemory = id;
  try {
    if (id) window.localStorage.setItem(SCOPE_KEY, id);
    else window.localStorage.removeItem(SCOPE_KEY);
  } catch {
    /* storage blocked: the in-memory copy keeps it for this tab */
  }
  scopeListeners.forEach((fn) => fn());
}
function subscribeScope(fn: () => void) {
  scopeListeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    scopeListeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

/**
 * Which warehouse the pages are about. Staff: their own (the server decides, nothing is sent).
 * Admins: the warehouse picked in the hub selector, or all of them (`hubId` undefined).
 */
export function useHubScope() {
  const self = useWarehouseSelf();
  const picked = useSyncExternalStore(subscribeScope, readScope, () => "");
  const hubId = self.isAdmin ? picked || undefined : undefined;
  return {
    /** Send this as `hubId` in requests (undefined for staff and for "all warehouses"). */
    hubId,
    /** The warehouse whose legs "leave" / "arrive" in the tabs (staff: own hub, admin: the picked one). */
    effectiveHubId: self.isAdmin ? picked || null : self.hubId,
    isAdmin: self.isAdmin,
    picked,
    setPicked: setScope,
    tier: self.tier,
    canAssign: self.canAssign,
    canManage: self.canManage,
  };
}

// ───────────────────────── queue ─────────────────────────

/** The hub desk: every leg the warehouse manages, sends or receives (`logistics:queue`), live. */
export function useDeskQueue(opts: { status?: string; kind?: string; limit?: number } = {}) {
  const { hubId } = useHubScope();
  const q = useOpsQuery<DeskQueue | null>("logistics:queue", {
    initial: null,
    body: { ...(hubId ? { hubId } : {}), status: opts.status ?? "open", ...(opts.kind ? { kind: opts.kind } : {}), limit: opts.limit ?? 500 },
    push: ["task:updated", "hub:updated"],
  });
  const tasks = useMemo(() => (q.data?.tasks ?? []) as DeskTask[], [q.data]);
  return { ...q, tasks, counts: q.data?.counts ?? null, hubId: q.data?.hubId ?? null };
}

export interface DeskActions {
  assign: (taskId: string, riderId: string) => Promise<TaskView>;
  scanIn: (taskId: string) => Promise<{ task: TaskView; next: TaskView[] }>;
  scanOut: (taskId: string) => Promise<TaskView>;
}

export const deskActions: DeskActions = {
  assign: (taskId, riderId) => socketClient.request<TaskView>("logistics:assign", { taskId, riderId }),
  scanIn: (taskId) => socketClient.request<{ task: TaskView; next: TaskView[] }>("logistics:scanIn", { taskId }),
  scanOut: (taskId) => socketClient.request<TaskView>("logistics:dispatchTransfer", { taskId }),
};

// ───────────────────────── helpers ─────────────────────────

export function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/** What staff see on the parcel label and type into the scan field. */
export const parcelCode = (t: Pick<TaskView, "id">) => `PKG-${shortId(t.id)}`;

export const isOpenLeg = (t: Pick<TaskView, "status">) => t.status !== "delivered" && t.status !== "failed";

export function legAgeHours(t: Pick<TaskView, "createdAt">, now = Date.now()): number {
  const c = new Date(t.createdAt).getTime();
  return Number.isNaN(c) ? 0 : Math.max(0, (now - c) / 3_600_000);
}

/** Match a typed / scanned code against loaded legs (keyboard-wedge scanners type into inputs). */
export function findLeg<T extends TaskView>(legs: T[], raw: string): T | undefined {
  const code = raw.trim().toLowerCase();
  if (!code) return undefined;
  const short = code.replace(/^(pkg|bc)-?/, "").toUpperCase();
  const hits = legs.filter(
    (t) =>
      t.id.toLowerCase() === code ||
      parcelCode(t).toLowerCase() === code ||
      `bc-${shortId(t.id)}`.toLowerCase() === code ||
      t.orderReference.toLowerCase() === code ||
      t.orderId.toLowerCase() === code ||
      (short.length === 6 && shortId(t.id) === short),
  );
  // An order ref matches several legs: prefer the one waiting at the desk.
  return hits.find((t) => t.desk?.scanIn) ?? hits.find((t) => t.desk?.scanOut) ?? hits.find((t) => isOpenLeg(t)) ?? hits[0];
}

/** "Rider ab12" for an unassigned or unnamed leg, in the viewer's language. */
export function riderLabel(t: Pick<TaskView, "riderId" | "riderName">, fr: boolean): string {
  if (t.riderName) return t.riderName;
  return t.riderId ? (fr ? "Livreur" : "Rider") : fr ? "Non assigné" : "Unassigned";
}

/** Address text from either a JSON address object or plain text. */
export function addressText(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const a = JSON.parse(raw) as { line1?: string; commune?: string; city?: string };
    if (a && typeof a === "object") return [a.line1, a.commune, a.city].filter(Boolean).join(", ") || "—";
  } catch {
    /* plain text */
  }
  return raw;
}

/** What a leg is waiting for, as `logistics:custody` words it (`other_parcels`, `next_leg`, `<kind>:<status>`). */
export function waitingForText(w: string | null | undefined, fr: boolean): string {
  if (!w) return "—";
  if (w === "other_parcels") return fr ? "Attend les autres colis de la commande" : "Waiting for the order's other parcels";
  if (w === "next_leg") return fr ? "Prochain trajet à créer" : "Next leg to be created";
  const [kind, status] = w.split(":");
  const k: Record<string, { en: string; fr: string }> = {
    pickup: { en: "pickup", fr: "collecte" },
    transfer: { en: "transfer", fr: "transfert" },
    delivery: { en: "delivery", fr: "livraison" },
    return_transfer: { en: "return transfer", fr: "transfert de retour" },
    return_to_seller: { en: "return to seller", fr: "retour au vendeur" },
    replacement_delivery: { en: "replacement delivery", fr: "livraison de remplacement" },
  };
  const s: Record<string, { en: string; fr: string }> = {
    unassigned: { en: "no rider yet", fr: "pas encore de livreur" },
    assigned: { en: "rider assigned", fr: "livreur assigné" },
    picked_up: { en: "picked up", fr: "collecté" },
    in_transit: { en: "on the way", fr: "en route" },
    delivered: { en: "done", fr: "terminé" },
    failed: { en: "failed", fr: "échoué" },
  };
  const kk = k[kind];
  const ss = s[status];
  const kt = kk ? (fr ? kk.fr : kk.en) : kind;
  const st = ss ? (fr ? ss.fr : ss.en) : status;
  return fr ? `Prochain : ${kt} (${st})` : `Next: ${kt} (${st})`;
}

export { isHubBound };

// ───────────────────────── riders + inventory ─────────────────────────

export function useWarehouseData() {
  const { hubId } = useHubScope();
  const rt = useRealtime();
  const ridersQ = useOpsQuery<WarehouseRider[]>("warehouse:riders", {
    initial: [] as WarehouseRider[],
    body: hubId ? { hubId } : {},
    push: ["task:updated"],
  });
  const inventoryQ = useOpsQuery<InventoryRow[]>("warehouse:inventory", {
    initial: [] as InventoryRow[],
    push: ["product:updated"],
  });
  const buildBatch = useCallback(
    (taskIds: string[], riderId: string, riderName?: string) =>
      socketClient.request<{ id: string; reference: string }>("warehouse:buildBatch", { taskIds, riderId, riderName }),
    [],
  );
  return {
    riders: ridersQ.data,
    ridersLoading: ridersQ.loading,
    ridersError: ridersQ.error,
    reloadRiders: ridersQ.reload,
    inventory: inventoryQ.data,
    inventoryLoading: inventoryQ.loading,
    inventoryError: inventoryQ.error,
    buildBatch,
    connected: rt.status === "connected",
  };
}
