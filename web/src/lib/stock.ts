"use client";

import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useHubScope } from "@/lib/warehouse";
import { useOpsQuery } from "@/lib/warehouse-live";

/**
 * The warehouse stock ledger on the socket (`docs/contracts/warehouse-stock.md`): bins, on hand by SKU and bin, receiving
 * (from a scanned-in parcel or by hand), moves, cycle counts, stock-outs and the history. Staff always act on their own
 * warehouse (the server decides); an admin sends `hubId`.
 */

export interface StockBin {
  id: string;
  hubId: string;
  code: string;
  label: string | null;
  active: boolean;
  units: number;
  skus: number;
}

export interface OnHandRow {
  hubId: string;
  productId: string;
  variant: string;
  sku: string;
  name: string;
  nameFr: string;
  onHand: number;
  bins: { binId: string; code: string; qty: number }[];
}

export interface OnHand {
  total: number;
  units: number;
  rows: OnHandRow[];
}

export interface LedgerLine {
  id: string;
  hubId: string;
  productId: string;
  variant: string;
  sku: string;
  name: string;
  nameFr: string;
  kind: "receive" | "move" | "count" | "stock_out";
  reason: string;
  qty: number;
  delta: number;
  onHandAfter: number;
  fromBinCode: string | null;
  toBinCode: string | null;
  expectedQty: number | null;
  countedQty: number | null;
  taskId: string | null;
  orderId: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}

export interface ProductMatch {
  productId: string;
  sku: string;
  name: string;
  nameFr: string;
  variants: string[];
}

export interface Lookup {
  bin: { id: string; code: string; label: string | null; active: boolean } | null;
  products: ProductMatch[];
}

export interface ParcelLines {
  taskId: string;
  orderReference: string;
  kind: string;
  status: string;
  atHub: boolean;
  canReceive: boolean;
  lines: { productId: string; variant: string; sku: string; name: string; nameFr: string; qty: number; stocked: number; remaining: number }[];
}

export interface CountResult {
  binId: string;
  binCode: string;
  lines: { productId: string; variant: string; expected: number; counted: number; variance: number; ledgerId: string }[];
  totalVariance: number;
}

type Hub = { hubId?: string };

export const stockApi = {
  bins: (b: Hub = {}) => socketClient.request<StockBin[]>("stock:bins", b),
  createBin: (b: Hub & { code: string; label?: string }) => socketClient.request<StockBin>("stock:binCreate", b),
  updateBin: (b: Hub & { binId: string; label?: string; active?: boolean }) => socketClient.request<StockBin>("stock:binUpdate", b),
  onHand: (b: Hub & { search?: string; binId?: string; productId?: string; limit?: number; offset?: number } = {}) => socketClient.request<OnHand>("stock:onHand", b),
  history: (b: Hub & { productId?: string; variant?: string; binId?: string; kind?: string; limit?: number; offset?: number } = {}) => socketClient.request<LedgerLine[]>("stock:history", b),
  lookup: (b: Hub & { code: string }) => socketClient.request<Lookup>("stock:lookup", b),
  parcel: (b: Hub & { taskId: string }) => socketClient.request<ParcelLines>("stock:parcel", b),
  receiveParcel: (b: Hub & { taskId: string; binId?: string; binCode?: string; lines?: { productId: string; variant: string; qty: number }[]; note?: string; clientRef: string }) =>
    socketClient.request<{ taskId: string; lines: LedgerLine[] }>("stock:receiveParcel", b),
  receive: (b: Hub & { productId: string; variant?: string; qty: number; binId?: string; binCode?: string; reason?: string; note?: string; clientRef: string }) => socketClient.request<LedgerLine>("stock:receive", b),
  move: (b: Hub & { productId: string; variant?: string; qty: number; fromBinId: string; toBinId: string; note?: string; clientRef: string }) => socketClient.request<LedgerLine>("stock:move", b),
  out: (b: Hub & { productId: string; variant?: string; qty: number; binId: string; reason: string; note?: string; clientRef: string }) => socketClient.request<LedgerLine>("stock:out", b),
  count: (b: Hub & { binId: string; lines: { productId: string; variant: string; counted: number; expected?: number }[]; note?: string; clientRef: string }) => socketClient.request<CountResult>("stock:count", b),
};

/**
 * What the stock screens may do. The server decides and refuses; this only hides what would be refused:
 * staff of any tier receive, move and stock out; counting and bins need a supervisor or manager; admins other than
 * `admin` / `admin_operations` only read; an admin needs a warehouse picked before changing anything.
 */
export function useStockAccess() {
  const rt = useRealtime();
  const scope = useHubScope();
  const role = rt.user?.role ?? "";
  const isAdmin = role.startsWith("admin");
  const staffWrite = role === "warehouse_staff";
  const adminWrite = role === "admin" || role === "admin_operations";
  const write = staffWrite || adminWrite;
  const needsHub = isAdmin && !scope.hubId;
  return {
    /** Send as `hubId` (undefined for staff). */
    hubId: scope.hubId,
    isAdmin,
    /** May change stock at all (the server also needs a warehouse for an admin). */
    canWrite: write && !needsHub,
    /** Why writing is off, for the screen to say. */
    readOnlyWhy: (!write ? "role" : needsHub ? "hub" : null) as "role" | "hub" | null,
    /** Count a bin, create or switch off a bin. */
    canOversee: write && !needsHub && (adminWrite || scope.canAssign),
  };
}

/** Live on-hand / bins / history refresh on the server's `stock:updated` push. */
export function useStockQuery<T>(event: string, body: Record<string, unknown>, initial: T, enabled = true) {
  const scope = useHubScope();
  return useOpsQuery<T>(event, {
    initial,
    enabled,
    body: { ...(scope.hubId ? { hubId: scope.hubId } : {}), ...body },
    push: ["stock:updated"],
  });
}
