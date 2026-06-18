/**
 * Inter-zone & inter-warehouse delivery flows for the warehouse portal.
 *
 * A parcel travels through one or more ordered legs depending on its delivery
 * type. The four types:
 *
 *  1. local         — same zone:        WH(zone A) → rider → customer (zone A)
 *  2. cross_zone     — same warehouse:   WH(zone A) → rider → customer (zone B)
 *  3. inter_warehouse— between hubs:     WH-A(zone A) → line-haul → WH-B(zone B)
 *                                        → rider → customer (zone B)
 *  4. return         — reverse of any:   customer → rider → WH-B → [transfer] → WH-A
 *
 * Inter-warehouse legs are grouped into a TransferRun (the line-haul board on
 * the Transfers tab); last-mile legs are handled by a rider.
 */

export type DeliveryType = "local" | "cross_zone" | "inter_warehouse" | "return";

export type LegKind = "pickup" | "line_haul" | "last_mile";
export type LegStatus = "pending" | "in_progress" | "done";

export type ParcelLeg = {
  kind: LegKind;
  from: string;
  to: string;
  /** Rider name (last-mile/pickup) or transfer-run reference (line-haul). */
  carrier: string;
  carrierKind: "rider" | "transfer";
  status: LegStatus;
  eta: string;
};

export type WarehouseParcel = {
  id: string;
  orderId: string;
  type: DeliveryType;
  /** First name only — seller/customer PII is not exposed warehouse-side. */
  customer: string;
  originWarehouse: string;
  originWarehouseId: string;
  destinationWarehouse?: string;
  destinationWarehouseId?: string;
  originZone: string;
  destinationZone: string;
  legs: ParcelLeg[];
  /** Index of the leg currently being executed. */
  currentLeg: number;
  status: string;
  statusFr: string;
  /** Set for inter_warehouse parcels (and inter-hub returns). */
  transferId?: string;
  updatedAt: string;
};

export type TransferStatus = "scheduled" | "loading" | "in_transit" | "arrived" | "received";

export type TransferRun = {
  id: string;
  fromWarehouse: string;
  fromWarehouseId: string;
  toWarehouse: string;
  toWarehouseId: string;
  fromZone: string;
  toZone: string;
  vehicle: string;
  driver: string;
  parcelIds: string[];
  status: TransferStatus;
  departAt: string;
  eta: string;
  /** outbound = fulfilment line-haul; return = parcels heading back to origin. */
  direction: "outbound" | "return";
};

// ─── Labels ────────────────────────────────────────────────────────────────

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, { en: string; fr: string }> = {
  local: { en: "Local · same zone", fr: "Local · même zone" },
  cross_zone: { en: "Cross-zone · same warehouse", fr: "Inter-zone · même entrepôt" },
  inter_warehouse: { en: "Inter-warehouse transfer", fr: "Transfert inter-entrepôts" },
  return: { en: "Return", fr: "Retour" },
};

export const DELIVERY_TYPE_SHORT: Record<DeliveryType, { en: string; fr: string }> = {
  local: { en: "Local", fr: "Local" },
  cross_zone: { en: "Cross-zone", fr: "Inter-zone" },
  inter_warehouse: { en: "Inter-warehouse", fr: "Inter-entrepôts" },
  return: { en: "Return", fr: "Retour" },
};

export const LEG_KIND_LABELS: Record<LegKind, { en: string; fr: string }> = {
  pickup: { en: "Pickup", fr: "Ramassage" },
  line_haul: { en: "Line-haul transfer", fr: "Transfert longue distance" },
  last_mile: { en: "Last-mile delivery", fr: "Livraison dernier km" },
};

export const LEG_STATUS_LABELS: Record<LegStatus, { en: string; fr: string }> = {
  pending: { en: "Pending", fr: "En attente" },
  in_progress: { en: "In progress", fr: "En cours" },
  done: { en: "Done", fr: "Terminé" },
};

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, { en: string; fr: string }> = {
  scheduled: { en: "Scheduled", fr: "Planifié" },
  loading: { en: "Loading", fr: "Chargement" },
  in_transit: { en: "In transit", fr: "En transit" },
  arrived: { en: "Arrived", fr: "Arrivé" },
  received: { en: "Received at hub", fr: "Reçu au hub" },
};

export function deliveryTypeLabel(type: DeliveryType, fr: boolean) {
  const l = DELIVERY_TYPE_LABELS[type];
  return fr ? l.fr : l.en;
}

// ─── Mock parcels (use cases) ────────────────────────────────────────────────

export const WAREHOUSE_PARCELS: WarehouseParcel[] = [
  // 1 — LOCAL: Kinshasa Hub Zone A → customer Zone A
  {
    id: "WP-5001",
    orderId: "ORD-2024-3101",
    type: "local",
    customer: "Marie",
    originWarehouse: "Kinshasa Hub",
    originWarehouseId: "WH-KIN",
    originZone: "Zone A — Gombe",
    destinationZone: "Zone A — Gombe",
    currentLeg: 0,
    status: "Out for delivery",
    statusFr: "En livraison",
    updatedAt: "2026-06-18 09:12",
    legs: [
      { kind: "last_mile", from: "Kinshasa Hub · Zone A — Gombe", to: "Customer · Zone A — Gombe", carrier: "Jean Mbiya", carrierKind: "rider", status: "in_progress", eta: "11:30" },
    ],
  },
  // 2 — CROSS-ZONE: Kinshasa Hub (Zone A) → customer Zone B
  {
    id: "WP-5002",
    orderId: "ORD-2024-3102",
    type: "cross_zone",
    customer: "Patrick",
    originWarehouse: "Kinshasa Hub",
    originWarehouseId: "WH-KIN",
    originZone: "Zone A — Gombe",
    destinationZone: "Zone B — Limete",
    currentLeg: 0,
    status: "Out for delivery",
    statusFr: "En livraison",
    updatedAt: "2026-06-18 09:40",
    legs: [
      { kind: "last_mile", from: "Kinshasa Hub · Zone A — Gombe", to: "Customer · Zone B — Limete", carrier: "Divine Ilunga", carrierKind: "rider", status: "in_progress", eta: "13:15" },
    ],
  },
  // 3 — INTER-WAREHOUSE: Paris (Zone A) → line-haul → Lyon → customer Rhône-Alpes
  {
    id: "WP-5003",
    orderId: "ORD-2024-3103",
    type: "inter_warehouse",
    customer: "Camille",
    originWarehouse: "Paris Fulfillment Center",
    originWarehouseId: "WH-PAR",
    destinationWarehouse: "Lyon Regional Hub",
    destinationWarehouseId: "WH-LYO",
    originZone: "Zone A — Île-de-France",
    destinationZone: "Zone Rhône-Alpes",
    currentLeg: 0,
    status: "In transit (line-haul)",
    statusFr: "En transit (longue distance)",
    transferId: "TR-9001",
    updatedAt: "2026-06-18 07:50",
    legs: [
      { kind: "line_haul", from: "Paris Fulfillment Center · Zone A — Île-de-France", to: "Lyon Regional Hub · Zone Rhône-Alpes", carrier: "TR-9001", carrierKind: "transfer", status: "in_progress", eta: "18 Jun 16:00" },
      { kind: "last_mile", from: "Lyon Regional Hub · Zone Rhône-Alpes", to: "Customer · Zone Rhône-Alpes", carrier: "Lucas Bernard", carrierKind: "rider", status: "pending", eta: "19 Jun 10:00" },
    ],
  },
  // 3b — INTER-WAREHOUSE already at destination hub, last-mile in progress
  {
    id: "WP-5004",
    orderId: "ORD-2024-3104",
    type: "inter_warehouse",
    customer: "Sophie",
    originWarehouse: "Paris Fulfillment Center",
    originWarehouseId: "WH-PAR",
    destinationWarehouse: "Lyon Regional Hub",
    destinationWarehouseId: "WH-LYO",
    originZone: "Zone B — Versailles",
    destinationZone: "Zone Rhône-Alpes",
    currentLeg: 1,
    status: "Out for delivery",
    statusFr: "En livraison",
    transferId: "TR-9003",
    updatedAt: "2026-06-18 08:30",
    legs: [
      { kind: "line_haul", from: "Paris Fulfillment Center · Zone B — Versailles", to: "Lyon Regional Hub · Zone Rhône-Alpes", carrier: "TR-9003", carrierKind: "transfer", status: "done", eta: "17 Jun 15:30" },
      { kind: "last_mile", from: "Lyon Regional Hub · Zone Rhône-Alpes", to: "Customer · Zone Rhône-Alpes", carrier: "Manon Petit", carrierKind: "rider", status: "in_progress", eta: "12:45" },
    ],
  },
  // 4 — RETURN (local): customer Zone B → rider pickup → Kinshasa Hub
  {
    id: "WP-5005",
    orderId: "ORD-2024-3088",
    type: "return",
    customer: "Espoir",
    originWarehouse: "Kinshasa Hub",
    originWarehouseId: "WH-KIN",
    originZone: "Zone B — Limete",
    destinationZone: "Zone A — Gombe",
    currentLeg: 0,
    status: "Pickup scheduled",
    statusFr: "Ramassage planifié",
    updatedAt: "2026-06-18 08:05",
    legs: [
      { kind: "pickup", from: "Customer · Zone B — Limete", to: "Kinshasa Hub · Zone A — Gombe", carrier: "Espoir Tshibangu", carrierKind: "rider", status: "pending", eta: "15:00" },
    ],
  },
  // 4b — RETURN (inter-warehouse): customer Lyon → Lyon Hub → transfer → Paris Hub
  {
    id: "WP-5006",
    orderId: "ORD-2024-3072",
    type: "return",
    customer: "Hugo",
    originWarehouse: "Lyon Regional Hub",
    originWarehouseId: "WH-LYO",
    destinationWarehouse: "Paris Fulfillment Center",
    destinationWarehouseId: "WH-PAR",
    originZone: "Zone Rhône-Alpes",
    destinationZone: "Zone A — Île-de-France",
    currentLeg: 1,
    status: "In transit (return line-haul)",
    statusFr: "En transit (retour longue distance)",
    transferId: "TR-9002",
    updatedAt: "2026-06-18 06:20",
    legs: [
      { kind: "pickup", from: "Customer · Zone Rhône-Alpes", to: "Lyon Regional Hub · Zone Rhône-Alpes", carrier: "Manon Petit", carrierKind: "rider", status: "done", eta: "17 Jun 17:00" },
      { kind: "line_haul", from: "Lyon Regional Hub · Zone Rhône-Alpes", to: "Paris Fulfillment Center · Zone A — Île-de-France", carrier: "TR-9002", carrierKind: "transfer", status: "in_progress", eta: "18 Jun 14:00" },
    ],
  },
  // extra LOCAL delivered
  {
    id: "WP-5007",
    orderId: "ORD-2024-3099",
    type: "local",
    customer: "Grace",
    originWarehouse: "Kinshasa Hub",
    originWarehouseId: "WH-KIN",
    originZone: "Zone C — Bandal",
    destinationZone: "Zone C — Bandal",
    currentLeg: 0,
    status: "Delivered",
    statusFr: "Livré",
    updatedAt: "2026-06-18 10:05",
    legs: [
      { kind: "last_mile", from: "Kinshasa Hub · Zone C — Bandal", to: "Customer · Zone C — Bandal", carrier: "Christ Kabeya", carrierKind: "rider", status: "done", eta: "Delivered" },
    ],
  },
];

// ─── Mock transfer runs (line-haul board) ────────────────────────────────────

export const TRANSFER_RUNS: TransferRun[] = [
  {
    id: "TR-9001",
    fromWarehouse: "Paris Fulfillment Center",
    fromWarehouseId: "WH-PAR",
    toWarehouse: "Lyon Regional Hub",
    toWarehouseId: "WH-LYO",
    fromZone: "Zone A — Île-de-France",
    toZone: "Zone Rhône-Alpes",
    vehicle: "Truck · FR-482-AB",
    driver: "Antoine Rousseau",
    parcelIds: ["WP-5003"],
    status: "in_transit",
    departAt: "18 Jun 06:00",
    eta: "18 Jun 16:00",
    direction: "outbound",
  },
  {
    id: "TR-9003",
    fromWarehouse: "Paris Fulfillment Center",
    fromWarehouseId: "WH-PAR",
    toWarehouse: "Lyon Regional Hub",
    toWarehouseId: "WH-LYO",
    fromZone: "Zone B — Versailles",
    toZone: "Zone Rhône-Alpes",
    vehicle: "Truck · FR-118-CD",
    driver: "Nicolas Girard",
    parcelIds: ["WP-5004"],
    status: "received",
    departAt: "17 Jun 06:00",
    eta: "17 Jun 15:30",
    direction: "outbound",
  },
  {
    id: "TR-9002",
    fromWarehouse: "Lyon Regional Hub",
    fromWarehouseId: "WH-LYO",
    toWarehouse: "Paris Fulfillment Center",
    toWarehouseId: "WH-PAR",
    fromZone: "Zone Rhône-Alpes",
    toZone: "Zone A — Île-de-France",
    vehicle: "Truck · FR-905-EF",
    driver: "Léa Moreau",
    parcelIds: ["WP-5006"],
    status: "in_transit",
    departAt: "18 Jun 05:30",
    eta: "18 Jun 14:00",
    direction: "return",
  },
  {
    id: "TR-9004",
    fromWarehouse: "Paris Fulfillment Center",
    fromWarehouseId: "WH-PAR",
    toWarehouse: "Lyon Regional Hub",
    toWarehouseId: "WH-LYO",
    fromZone: "Zone A — Île-de-France",
    toZone: "Zone Rhône-Alpes",
    vehicle: "Truck · FR-377-GH",
    driver: "Antoine Rousseau",
    parcelIds: [],
    status: "scheduled",
    departAt: "19 Jun 06:00",
    eta: "19 Jun 16:00",
    direction: "outbound",
  },
];

// ─── Selectors ───────────────────────────────────────────────────────────────

export function parcelsByType(type: DeliveryType | "all"): WarehouseParcel[] {
  return type === "all" ? WAREHOUSE_PARCELS : WAREHOUSE_PARCELS.filter((p) => p.type === type);
}

export function transferRunById(id: string): TransferRun | undefined {
  return TRANSFER_RUNS.find((t) => t.id === id);
}

export function parcelsForTransfer(transferId: string): WarehouseParcel[] {
  return WAREHOUSE_PARCELS.filter((p) => p.transferId === transferId);
}

export function deliveryTypeCounts(): Record<DeliveryType, number> {
  return WAREHOUSE_PARCELS.reduce(
    (acc, p) => ({ ...acc, [p.type]: (acc[p.type] ?? 0) + 1 }),
    { local: 0, cross_zone: 0, inter_warehouse: 0, return: 0 } as Record<DeliveryType, number>
  );
}
