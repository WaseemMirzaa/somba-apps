/**
 * "Pack and label several orders": the shape of what `orders:sellerGroups` answers, and the small rules behind the seller's panel
 * (which orders are ticked, the button text). No imports: `npm test` loads this file on its own.
 */

export interface PackOrder {
  id: string;
  reference: string;
  createdAt: string;
  customerFirstName: string | null;
  /** `to_pack` (nothing packed yet), `partly_ready`, `ready` (already in a box set that no rider collected yet). */
  packageStatus: "to_pack" | "partly_ready" | "ready";
  groupId: string | null;
  items: { name: string; nameFr?: string | null; variant: string | null; variantFr?: string | null; qty: number }[];
}

export interface PackCluster {
  /** An opaque name for the cluster (the server hashes the address into it). */
  key: string;
  dayKey: string;
  /** Commune and city only. */
  area: string | null;
  deliveryMode: "standard" | "express";
  orders: PackOrder[];
}

/** The orders of a cluster that are ticked, in the cluster's order. */
export function clusterSelection(orders: readonly PackOrder[], picked: ReadonlySet<string>): PackOrder[] {
  return orders.filter((o) => picked.has(o.id));
}

/** The label-only button: "Pack and label 3 orders". */
export function packButtonText(n: number, fr: boolean): string {
  if (n <= 1) return fr ? "Préparer et étiqueter la commande" : "Pack and label the order";
  return fr ? `Préparer et étiqueter ${n} commandes` : `Pack and label ${n} orders`;
}
