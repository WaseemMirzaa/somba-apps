import { products } from "./mock-data";
import { orderEntities, parcelEntities, batchEntities, sellerEntities } from "./entities";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WarehouseStats = {
  receivedToday: number;
  dispatchedToday: number;
  activeBatches: number;
  pendingReturns: number;
  pendingReplacements: number;
  failedDeliveries: number;
  agedParcels: number;
  inboundQueue: number;
  sortingQueue: number;
  dispatchQueue: number;
  returnQueue: number;
};

export type RiderEntity = {
  id: number;
  name: string;
  phone: string;
  zone: string;
  vehicle: string;
  status: "active" | "inactive";
  activeDeliveries: number;
  location: string;
  performanceScore: number;
  deliveries: number;
  failedDeliveries: number;
  rating: number;
  earningsDaily: number;
  earningsWeekly: number;
  earningsMonthly: number;
  assignedBatches: string[];
};

export type InventoryEntity = {
  sku: string;
  productId: number;
  product: string;
  category: string;
  available: number;
  reserved: number;
  allocated: number;
  damaged: number;
  location: string;
  image: string;
  movements: { time: string; label: string; qty: number }[];
};

export type DeliveryEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  customerPhone: string;
  customerAddress: string;
  riderId: number;
  rider: string;
  riderPhone: string;
  vehicle: string;
  status: string;
  eta: string;
  itemsCount: number;
  currentStop: number;
  totalStops: number;
};

export type ReturnEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  reason: string;
  status: string;
  productId: number;
  product: string;
  variant: string;
  qty: number;
  image: string;
  inspection: { condition: string; photos: number; notes: string };
  refund: { amount: number; method: string; status: string };
  timeline: { time: string; label: string; done?: boolean }[];
};

export type ReplacementEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  sku: string;
  status: string;
  returnedProduct: { sku: string; condition: string; inspection: string };
  newProduct: { sku: string; allocated: boolean; dispatchStatus: string };
  timeline: { time: string; label: string; done?: boolean }[];
};

export type ExchangeEntity = {
  id: string;
  orderId: string;
  customer: string;
  oldSku: string;
  newSku: string;
  priceDifference: number;
  status: string;
};

export type ExceptionEntity = {
  id: string;
  parcelId: string;
  orderId: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  reportedBy: string;
  createdDate: string;
  photos: number;
  notes: string;
  assignedStaff: string;
  resolution: string;
};

export type SortingParcel = {
  id: string;
  orderId: string;
  customer: string;
  zone: string;
  priority: string;
  route: string;
  status: string;
};

// ─── Stats ───────────────────────────────────────────────────────────────────

export const warehouseDashboardStats: WarehouseStats = {
  receivedToday: 128,
  dispatchedToday: 102,
  activeBatches: 2,
  pendingReturns: 18,
  pendingReplacements: 5,
  failedDeliveries: 7,
  agedParcels: 3,
  inboundQueue: 23,
  sortingQueue: 45,
  dispatchQueue: 67,
  returnQueue: 18,
};

// ─── Enhanced parcels (listing fields) ───────────────────────────────────────

export const inboundParcels = parcelEntities.map((p, i) => ({
  ...p,
  storeName: sellerEntities.find((s) => s.id === p.sellerId)?.storeName ?? p.seller,
  pickupRider: ["Marc T.", "Paul K.", "Jean D."][i % 3],
  itemsCount: p.items.reduce((s, it) => s + it.qty, 0),
  volume: `${(0.8 + i * 0.2).toFixed(1)} L`,
  customerPhone: orderEntities.find((o) => o.id === p.orderId)?.customerPhone ?? "",
  route: `Route ${String.fromCharCode(65 + (i % 3))}`,
  itemsWithImages: p.items.map((item, j) => ({
    ...item,
    productId: products[j % products.length]?.id ?? 1,
    image: products[j % products.length]?.image ?? "",
  })),
  inspectionDetail: {
    photos: p.inspection.photos,
    condition: p.inspection.condition,
    damageNotes: p.inspection.exceptions === "None" ? "" : p.inspection.exceptions,
    exceptions: p.inspection.exceptions,
  },
}));

// ─── Sorting board ───────────────────────────────────────────────────────────

export const sortingParcels: SortingParcel[] = parcelEntities
  .filter((p) => ["received", "sorting", "ready"].includes(p.status))
  .map((p, i) => ({
    id: p.id,
    orderId: p.orderId,
    customer: p.customer,
    zone: p.zone,
    priority: p.priority,
    route: `Route ${String.fromCharCode(65 + (i % 3))}`,
    status: p.status,
  }));

// ─── Riders ──────────────────────────────────────────────────────────────────

export const riderEntities: RiderEntity[] = [
  {
    id: 1, name: "Jean-Pierre M.", phone: "+243 99 111 2233", zone: "Zone A",
    vehicle: "Motorcycle", status: "active", activeDeliveries: 8, location: "Gombe",
    performanceScore: 94, deliveries: 1240, failedDeliveries: 12,
    rating: 4.8, earningsDaily: 85, earningsWeekly: 520, earningsMonthly: 2100,
    assignedBatches: ["BATCH-001"],
  },
  {
    id: 2, name: "Paul Kabongo", phone: "+243 99 444 5566", zone: "Zone B",
    vehicle: "Van", status: "active", activeDeliveries: 5, location: "Limete",
    performanceScore: 88, deliveries: 890, failedDeliveries: 18,
    rating: 4.5, earningsDaily: 72, earningsWeekly: 445, earningsMonthly: 1780,
    assignedBatches: ["BATCH-002"],
  },
  {
    id: 3, name: "Marc Tshisekedi", phone: "+243 99 777 8899", zone: "Zone C",
    vehicle: "Motorcycle", status: "active", activeDeliveries: 3, location: "Bandal",
    performanceScore: 91, deliveries: 670, failedDeliveries: 8,
    rating: 4.7, earningsDaily: 68, earningsWeekly: 410, earningsMonthly: 1650,
    assignedBatches: [],
  },
];

// ─── Inventory ─────────────────────────────────────────────────────────────

export const inventoryEntities: InventoryEntity[] = products.slice(0, 6).map((p, i) => ({
  sku: `WH-SKU-${p.id}`,
  productId: p.id,
  product: p.name,
  category: p.category,
  available: [45, 23, 120, 89, 34, 67][i],
  reserved: [5, 2, 10, 4, 3, 8][i],
  allocated: [3, 1, 6, 2, 1, 4][i],
  damaged: [0, 0, 1, 0, 0, 0][i],
  location: `A${i + 1}-${(i + 1) * 10}`,
  image: p.image,
  movements: [
    { time: "2024-06-05", label: "Received", qty: 50 },
    { time: "2024-06-04", label: "Reserved", qty: 5 },
    { time: "2024-06-03", label: "Dispatched", qty: 12 },
  ],
}));

// ─── Active deliveries ───────────────────────────────────────────────────────

export const deliveryEntities: DeliveryEntity[] = orderEntities
  .filter((o) => o.status === "processing" || o.status === "delivered")
  .slice(0, 5)
  .map((o, i) => ({
    id: `DEL-${o.id.replace("ORD-", "")}`,
    orderId: o.id,
    customerId: o.customerId,
    customer: o.customer,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    riderId: riderEntities[i % riderEntities.length].id,
    rider: riderEntities[i % riderEntities.length].name,
    riderPhone: riderEntities[i % riderEntities.length].phone,
    vehicle: riderEntities[i % riderEntities.length].vehicle,
    status: o.status === "delivered" ? "delivered" : i % 2 === 0 ? "in_transit" : "out_for_delivery",
    eta: i % 2 === 0 ? "14:30" : "16:00",
    itemsCount: o.itemsCount,
    currentStop: i + 1,
    totalStops: 8,
  }));

// ─── Returns ─────────────────────────────────────────────────────────────────

export const returnEntities: ReturnEntity[] = [
  {
    id: "RET-001", orderId: "ORD-2024-001", customerId: 1, customer: "Marie Dubois",
    reason: "Wrong size", status: "pending_inspection", productId: 4,
    product: "Nike Air Max 270", variant: "Size 42", qty: 1,
    image: products[3].image,
    inspection: { condition: "Good", photos: 2, notes: "Unopened box" },
    refund: { amount: 129, method: "Wallet", status: "pending" },
    timeline: [
      { time: "2024-06-05", label: "Requested", done: true },
      { time: "2024-06-06", label: "Pickup Scheduled", done: true },
      { time: "—", label: "Warehouse Received", done: false },
      { time: "—", label: "Refund Processed", done: false },
    ],
  },
  {
    id: "RET-002", orderId: "ORD-2024-004", customerId: 4, customer: "Ahmed Hassan",
    reason: "Damaged item", status: "inspecting", productId: 5,
    product: "Dyson V15 Vacuum", variant: "Standard", qty: 1,
    image: products[4].image,
    inspection: { condition: "Damaged", photos: 4, notes: "Box crushed, motor noise" },
    refund: { amount: 649, method: "Original Payment", status: "pending" },
    timeline: [
      { time: "2024-06-04", label: "Requested", done: true },
      { time: "2024-06-05", label: "Received at Warehouse", done: true },
      { time: "2024-06-06", label: "Inspecting", done: true },
    ],
  },
];

// ─── Replacements ────────────────────────────────────────────────────────────

export const replacementEntities: ReplacementEntity[] = [
  {
    id: "REP-001", orderId: "ORD-2024-002", customerId: 2, customer: "John Smith",
    sku: "SKU-3", status: "allocated",
    returnedProduct: { sku: "SKU-3", condition: "Defective", inspection: "Audio issue confirmed" },
    newProduct: { sku: "SKU-3-NEW", allocated: true, dispatchStatus: "ready" },
    timeline: [
      { time: "2024-06-03", label: "Requested", done: true },
      { time: "2024-06-04", label: "Approved", done: true },
      { time: "2024-06-05", label: "Received", done: true },
      { time: "2024-06-06", label: "Allocated", done: true },
      { time: "—", label: "Dispatched", done: false },
    ],
  },
  {
    id: "REP-002", orderId: "ORD-2024-006", customerId: 3, customer: "Pierre Laurent",
    sku: "SKU-8", status: "pending",
    returnedProduct: { sku: "SKU-8", condition: "Pending", inspection: "Awaiting receipt" },
    newProduct: { sku: "SKU-8-NEW", allocated: false, dispatchStatus: "pending" },
    timeline: [
      { time: "2024-06-05", label: "Requested", done: true },
      { time: "2024-06-06", label: "Approved", done: true },
    ],
  },
];

// ─── Exchanges ───────────────────────────────────────────────────────────────

export const exchangeEntities: ExchangeEntity[] = [
  { id: "EXC-001", orderId: "ORD-2024-003", customer: "Sophie Martin", oldSku: "SKU-4-42", newSku: "SKU-4-44", priceDifference: 0, status: "pending" },
  { id: "EXC-002", orderId: "ORD-2024-001", customer: "Marie Dubois", oldSku: "SKU-1-128", newSku: "SKU-1-256", priceDifference: 100, status: "approved" },
];

// ─── Exceptions ──────────────────────────────────────────────────────────────

export const exceptionEntities: ExceptionEntity[] = [
  {
    id: "INC-001", parcelId: "PKG-002", orderId: "ORD-2024-006", type: "Damaged Parcel",
    severity: "high", status: "open", reportedBy: "Receiver Staff", createdDate: "2024-06-05",
    photos: 3, notes: "Corner crushed during inbound", assignedStaff: "Supervisor A",
    resolution: "Pending investigation",
  },
  {
    id: "INC-002", parcelId: "PKG-005", orderId: "ORD-2024-004", type: "Missing Item",
    severity: "critical", status: "investigating", reportedBy: "Sorter B", createdDate: "2024-06-04",
    photos: 1, notes: "1 of 2 items missing from package", assignedStaff: "Ops Manager",
    resolution: "Seller notified",
  },
  {
    id: "INC-003", parcelId: "—", orderId: "ORD-2024-003", type: "Cash Difference",
    severity: "medium", status: "resolved", reportedBy: "Finance", createdDate: "2024-06-03",
    photos: 0, notes: "Rider short $60 on shift", assignedStaff: "Finance Team",
    resolution: "Adjusted from rider deposit",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getInboundParcel(id: string) {
  return inboundParcels.find((p) => p.id === id);
}

export function getRider(id: number) {
  return riderEntities.find((r) => r.id === id);
}

export function getInventory(sku: string) {
  return inventoryEntities.find((i) => i.sku === sku);
}

export function getDelivery(id: string) {
  return deliveryEntities.find((d) => d.id === id);
}

export function getReturn(id: string) {
  return returnEntities.find((r) => r.id === id);
}

export function getReplacement(id: string) {
  return replacementEntities.find((r) => r.id === id);
}

export function getExchange(id: string) {
  return exchangeEntities.find((e) => e.id === id);
}

export function getException(id: string) {
  return exceptionEntities.find((e) => e.id === id);
}

export { batchEntities, parcelEntities };
