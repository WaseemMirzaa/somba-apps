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
  vehicleFr: string;
  status: "active" | "inactive";
  activeDeliveries: number;
  location: string;
  performanceScore: number;
  deliveries: number;
  failedDeliveries: number;
  codCollections: number;
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
  categoryFr: string;
  available: number;
  reserved: number;
  allocated: number;
  damaged: number;
  location: string;
  image: string;
  movements: { time: string; label: string; labelFr: string; qty: number }[];
};

export type DeliveryProduct = {
  productId: number;
  name: string;
  sku: string;
  variant: string;
  qty: number;
  image: string;
};

export type DeliveryEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  customerPhone: string;
  customerAddress: string;
  sellerId: number;
  seller: string;
  sellerStore: string;
  sellerPhone: string;
  zone: string;
  paymentType: string;
  riderId: number;
  rider: string;
  riderPhone: string;
  vehicle: string;
  status: string;
  eta: string;
  codAmount: number;
  itemsCount: number;
  currentStop: number;
  totalStops: number;
  products: DeliveryProduct[];
  timeline: { time: string; label: string; done?: boolean; detail?: string }[];
};

export type ReturnEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  reason: string;
  reasonFr: string;
  customerComment?: string;
  customerCommentFr?: string;
  returnType: "refund" | "replacement" | "exchange";
  status: string;
  statusFr: string;
  createdAt: string;
  productId: number;
  product: string;
  variant: string;
  variantFr: string;
  qty: number;
  image: string;
  inspection: { condition: string; conditionFr: string; photos: number; notes: string; notesFr: string };
  refund: { amount: number; method: string; methodFr: string; status: string; statusFr: string };
  timeline: { time: string; label: string; done?: boolean; detail?: string; detailFr?: string; highlight?: boolean }[];
};

export type ReplacementProductInfo = {
  sku: string;
  productId: number;
  name: string;
  nameFr: string;
  variant: string;
  variantFr: string;
  image: string;
  price: number;
};

export type ReplacementDispatchInfo = {
  status: string;
  statusFr: string;
  batchId?: string;
  rider?: string;
  riderPhone?: string;
  vehicle?: string;
  eta?: string;
  etaFr?: string;
  window?: string;
  windowFr?: string;
};

export type ReplacementEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  sellerId: number;
  sellerName: string;
  sku: string;
  status: string;
  statusFr: string;
  reason: string;
  reasonFr: string;
  customerComment?: string;
  customerCommentFr?: string;
  createdAt: string;
  warehouse: string;
  returnedProduct: ReplacementProductInfo & {
    condition: string;
    conditionFr: string;
    inspection: string;
    inspectionFr: string;
    inspectionPhotos: number;
  };
  newProduct: ReplacementProductInfo & {
    warehouseLocation: string;
    warehouseLocationFr: string;
    allocated: boolean;
    allocatedAt?: string;
    dispatch: ReplacementDispatchInfo;
  };
  timeline: { time: string; label: string; labelFr: string; done?: boolean; detail?: string; detailFr?: string }[];
};

export type ExchangeProduct = {
  sku: string;
  productId: number;
  name: string;
  nameFr: string;
  variant: string;
  variantFr: string;
  image: string;
  price: number;
};

export type ExchangeEntity = {
  id: string;
  orderId: string;
  customerId: number;
  customer: string;
  sellerId: number;
  sellerName: string;
  reason: string;
  reasonFr: string;
  customerComment?: string;
  customerCommentFr?: string;
  createdAt: string;
  status: string;
  statusFr: string;
  oldProduct: ExchangeProduct;
  newProduct: ExchangeProduct;
  priceDifference: number;
  photos: string[];
  warehouse: string;
  timeline: { time: string; label: string; labelFr: string; done?: boolean }[];
};

export type CodReconciliationEntity = {
  id: string;
  riderId: number;
  rider: string;
  shift: string;
  vehicle: string;
  expected: number;
  collected: number;
  difference: number;
  status: string;
  orders: { orderId: string; codAmount: number; collected: number }[];
};

export type ShiftReconciliationOrder = {
  orderId: string;
  customer: string;
  expected: number;
  collected: number;
  status: "collected" | "partial" | "failed" | "pending";
};

export type ShiftReconciliationEntity = {
  id: string;
  shiftDate: string;
  shiftName: string;
  shiftNameFr: string;
  warehouse: string;
  warehouseFr: string;
  supervisor: string;
  riderId: number;
  rider: string;
  riderPhone: string;
  zone: string;
  vehicle: string;
  expectedCollections: number;
  amountReceived: number | null;
  variance: number;
  ordersCount: number;
  status: "pending" | "investigating" | "reconciled" | "approved";
  varianceNotes?: string;
  varianceNotesFr?: string;
  timeline: { time: string; label: string; labelFr: string; done?: boolean }[];
  orders: ShiftReconciliationOrder[];
};

export type ExceptionEntity = {
  id: string;
  parcelId: string;
  orderId: string;
  type: string;
  typeFr: string;
  severity: "low" | "medium" | "high" | "critical";
  severityFr: string;
  status: string;
  statusFr: string;
  reportedBy: string;
  reportedByFr: string;
  createdDate: string;
  photos: number;
  notes: string;
  notesFr: string;
  assignedStaff: string;
  assignedStaffFr: string;
  resolution: string;
  resolutionFr: string;
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

// ─── Aged / stuck parcels ────────────────────────────────────────────────────

const AGED_STUCK_META: Record<
  string,
  { arrivalDate: string; daysStuck: number; stuckReason: string; stuckReasonFr: string; linkedExceptionId?: string }
> = {
  "PKG-005": {
    arrivalDate: "2024-06-04",
    daysStuck: 2,
    stuckReason: "Missing item exception — awaiting seller response",
    stuckReasonFr: "Exception article manquant — en attente réponse vendeur",
    linkedExceptionId: "INC-002",
  },
  "PKG-006": {
    arrivalDate: "2024-06-03",
    daysStuck: 3,
    stuckReason: "Awaiting inbound receiving scan",
    stuckReasonFr: "En attente du scan de réception entrant",
  },
  "PKG-007": {
    arrivalDate: "2024-06-02",
    daysStuck: 4,
    stuckReason: "Low priority — sorting backlog in Zone C",
    stuckReasonFr: "Priorité basse — retard de tri en Zone C",
  },
  "PKG-008": {
    arrivalDate: "2024-06-01",
    daysStuck: 5,
    stuckReason: "Inspection pending — item count mismatch",
    stuckReasonFr: "Inspection en attente — écart de quantité",
  },
};

export type AgedParcelEntity = (typeof inboundParcels)[number] & {
  arrivalDate: string;
  daysStuck: number;
  stuckReason: string;
  stuckReasonFr: string;
  warehouse: string;
  warehouseFr: string;
  trackingNumber: string;
  orderStatus: string;
  orderDate: string;
  orderAmount: number;
  linkedExceptionId?: string;
  agedTimeline: {
    time: string;
    label: string;
    labelFr: string;
    done?: boolean;
    detail?: string;
    highlight?: boolean;
  }[];
};

export const agedParcelEntities: AgedParcelEntity[] = inboundParcels
  .filter((p) => p.status === "inbound" || p.priority === "low")
  .map((p) => {
    const order = orderEntities.find((o) => o.id === p.orderId);
    const meta = AGED_STUCK_META[p.id] ?? {
      arrivalDate: "2024-06-04",
      daysStuck: 1,
      stuckReason: "Parcel stalled in warehouse queue",
      stuckReasonFr: "Colis bloqué dans la file entrepôt",
    };
    return {
      ...p,
      ...meta,
      warehouse: order?.warehouse ?? "Kinshasa Hub",
      warehouseFr: "Hub Kinshasa",
      trackingNumber: order ? `TRK-${order.id.replace("ORD-", "")}` : "—",
      orderStatus: order?.status ?? "unknown",
      orderDate: order?.date ?? "—",
      orderAmount: order?.amount ?? 0,
      agedTimeline: [
        { time: "07:00", label: "Collected from seller", labelFr: "Collecté chez le vendeur", done: true },
        {
          time: `${meta.arrivalDate} ${p.arrival}`,
          label: "Arrived at hub",
          labelFr: "Arrivé au hub",
          done: true,
        },
        {
          time: meta.arrivalDate,
          label: "Flagged as aged / stuck",
          labelFr: "Signalé comme bloqué",
          done: true,
          detail: meta.stuckReason,
          highlight: true,
        },
        { time: "—", label: "Received", labelFr: "Reçu", done: ["received", "sorting", "ready", "dispatched"].includes(p.status) },
        { time: "—", label: "Sorted", labelFr: "Trié", done: ["sorting", "ready", "dispatched"].includes(p.status) },
        { time: "—", label: "Dispatched", labelFr: "Expédié", done: p.status === "dispatched" },
      ],
    };
  });

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
    vehicle: "Motorcycle", vehicleFr: "Moto", status: "active", activeDeliveries: 8, location: "Gombe",
    performanceScore: 94, deliveries: 1240, failedDeliveries: 12, codCollections: 45200,
    rating: 4.8, earningsDaily: 85, earningsWeekly: 520, earningsMonthly: 2100,
    assignedBatches: ["BATCH-001"],
  },
  {
    id: 2, name: "Paul Kabongo", phone: "+243 99 444 5566", zone: "Zone B",
    vehicle: "Van", vehicleFr: "Camionnette", status: "active", activeDeliveries: 5, location: "Limete",
    performanceScore: 88, deliveries: 890, failedDeliveries: 18, codCollections: 32100,
    rating: 4.5, earningsDaily: 72, earningsWeekly: 445, earningsMonthly: 1780,
    assignedBatches: ["BATCH-002"],
  },
  {
    id: 3, name: "Marc Tshisekedi", phone: "+243 99 777 8899", zone: "Zone C",
    vehicle: "Motorcycle", vehicleFr: "Moto", status: "active", activeDeliveries: 3, location: "Bandal",
    performanceScore: 91, deliveries: 670, failedDeliveries: 8, codCollections: 28900,
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
  categoryFr: p.categoryFr,
  available: [45, 23, 120, 89, 34, 67][i],
  reserved: [5, 2, 10, 4, 3, 8][i],
  allocated: [3, 1, 6, 2, 1, 4][i],
  damaged: [0, 0, 1, 0, 0, 0][i],
  location: `A${i + 1}-${(i + 1) * 10}`,
  image: p.image,
  movements: [
    { time: "2024-06-05", label: "Received", labelFr: "Reçu", qty: 50 },
    { time: "2024-06-04", label: "Reserved", labelFr: "Réservé", qty: 5 },
    { time: "2024-06-03", label: "Dispatched", labelFr: "Expédié", qty: 12 },
  ],
}));

// ─── Active deliveries ───────────────────────────────────────────────────────

const ETAS = ["13:15", "13:45", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

function buildDeliveryEntity(
  order: typeof orderEntities[number],
  rider: RiderEntity,
  seq: number,
  status: "in_transit" | "out_for_delivery" | "delivered",
  totalStops: number,
): DeliveryEntity {
  const seller = sellerEntities.find((s) => s.id === order.sellerId) ?? sellerEntities[0];
  const doneSteps = status === "delivered" ? 5 : seq % 2 === 0 ? 4 : 3;

  return {
    id: `DEL-${rider.id}-${String(seq).padStart(3, "0")}`,
    orderId: order.id,
    customerId: order.customerId,
    customer: order.customer,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    sellerId: seller.id,
    seller: seller.owner,
    sellerStore: seller.storeName,
    sellerPhone: seller.phone,
    zone: order.customerCity ?? rider.zone,
    paymentType: order.paymentMethod,
    riderId: rider.id,
    rider: rider.name,
    riderPhone: rider.phone,
    vehicle: rider.vehicle,
    status,
    eta: ETAS[(seq - 1) % ETAS.length],
    codAmount: order.paymentMethod === "COD" ? order.amount : 0,
    itemsCount: order.itemsCount,
    currentStop: seq,
    totalStops,
    products: order.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      variant: item.variant,
      qty: item.qty,
      image: item.image,
    })),
    timeline: [
      { time: `${order.date} 09:00`, label: "Order placed", done: doneSteps >= 1 },
      { time: `${order.date} 10:30`, label: "Picked from seller", done: doneSteps >= 2 },
      { time: `${order.date} 11:45`, label: "At warehouse", done: doneSteps >= 3 },
      { time: `${order.date} 13:00`, label: "Out for delivery", done: doneSteps >= 4 },
      {
        time: status === "delivered" ? `${order.date} 15:30` : "—",
        label: "Delivered",
        done: doneSteps >= 5,
      },
    ],
  };
}

export const deliveryEntities: DeliveryEntity[] = riderEntities.flatMap((rider) => {
  const active = Array.from({ length: rider.activeDeliveries }, (_, i) => {
    const order = orderEntities[(rider.id + i) % orderEntities.length];
    const status: "in_transit" | "out_for_delivery" = i % 2 === 0 ? "in_transit" : "out_for_delivery";
    return buildDeliveryEntity(order, rider, i + 1, status, rider.activeDeliveries);
  });

  const completed = buildDeliveryEntity(
    orderEntities[rider.id % orderEntities.length],
    rider,
    rider.activeDeliveries + 1,
    "delivered",
    rider.activeDeliveries,
  );

  return [...active, completed];
});

// ─── Returns ─────────────────────────────────────────────────────────────────

export const returnEntities: ReturnEntity[] = [
  {
    id: "RET-001", orderId: "ORD-2024-001", customerId: 1, customer: "Marie Dubois",
    reason: "Wrong size", reasonFr: "Mauvaise taille",
    customerComment: "Ordered size 43 but received size 42. Item is unopened in original packaging.",
    customerCommentFr: "Pointure 43 commandée mais pointure 42 reçue. Article non ouvert dans son emballage d'origine.",
    returnType: "refund", status: "pending_inspection", statusFr: "Inspection en attente", createdAt: "2024-06-05",
    productId: 4, product: "Nike Air Max 270", variant: "Size 42", variantFr: "Taille 42", qty: 1,
    image: products[3].image,
    inspection: { condition: "Good", conditionFr: "Bon", photos: 2, notes: "Unopened box — awaiting warehouse receipt", notesFr: "Boîte non ouverte — en attente de réception entrepôt" },
    refund: { amount: 129, method: "Somba&Teka Wallet", methodFr: "Portefeuille Somba&Teka", status: "pending", statusFr: "En attente" },
    timeline: [
      { time: "2024-06-01 20:00", label: "Order Delivered", done: true },
      { time: "2024-06-05 10:15", label: "Return Requested", done: true, detail: "Wrong size", detailFr: "Mauvaise taille", highlight: true },
      { time: "2024-06-05 14:30", label: "Return Approved", done: true },
      { time: "2024-06-06 09:00", label: "Pickup Scheduled", done: true },
      { time: "—", label: "In Transit to Warehouse", done: false },
      { time: "—", label: "Received at Warehouse", done: false },
      { time: "—", label: "Refund Processed", done: false },
    ],
  },
  {
    id: "RET-002", orderId: "ORD-2024-004", customerId: 4, customer: "Ahmed Hassan",
    reason: "Damaged item", reasonFr: "Article endommagé",
    customerComment: "Vacuum motor makes loud noise and box was crushed on arrival.",
    customerCommentFr: "Le moteur de l'aspirateur fait un bruit fort et la boîte était écrasée à l'arrivée.",
    returnType: "refund", status: "inspecting", statusFr: "Inspection en cours", createdAt: "2024-06-04",
    productId: 5, product: "Dyson V15 Vacuum", variant: "Standard", variantFr: "Standard", qty: 1,
    image: products[4].image,
    inspection: { condition: "Damaged", conditionFr: "Endommagé", photos: 4, notes: "Box crushed, motor noise confirmed during inspection", notesFr: "Boîte écrasée, bruit du moteur confirmé lors de l'inspection" },
    refund: { amount: 649, method: "Original Payment", methodFr: "Paiement d'origine", status: "pending", statusFr: "En attente" },
    timeline: [
      { time: "2024-06-02 18:30", label: "Order Delivered", done: true },
      { time: "2024-06-04 11:20", label: "Return Requested", done: true, detail: "Damaged item", detailFr: "Article endommagé", highlight: true },
      { time: "2024-06-04 16:00", label: "Return Approved", done: true },
      { time: "2024-06-05 08:45", label: "Pickup Completed", done: true },
      { time: "2024-06-05 14:20", label: "Received at Warehouse", done: true },
      { time: "2024-06-06 10:00", label: "Inspecting", done: true },
      { time: "—", label: "Refund Processed", done: false },
    ],
  },
  {
    id: "RET-003", orderId: "ORD-2024-003", customerId: 3, customer: "Sophie Martin",
    reason: "Not as described", reasonFr: "Non conforme à la description",
    customerComment: "Colour on the listing was white but the shoes received are grey.",
    customerCommentFr: "La couleur sur l'annonce était blanche mais les chaussures reçues sont grises.",
    returnType: "exchange", status: "refunded", statusFr: "Remboursé", createdAt: "2024-06-02",
    productId: 4, product: "Nike Air Max 270", variant: "Size 40", variantFr: "Taille 40", qty: 1,
    image: products[3].image,
    inspection: { condition: "Good", conditionFr: "Bon", photos: 3, notes: "Item matches customer photos — colour mismatch confirmed", notesFr: "Article conforme aux photos du client — écart de couleur confirmé" },
    refund: { amount: 129, method: "Somba&Teka Wallet", methodFr: "Portefeuille Somba&Teka", status: "completed", statusFr: "Terminé" },
    timeline: [
      { time: "2024-05-28 19:00", label: "Order Delivered", done: true },
      { time: "2024-06-02 09:30", label: "Return Requested", done: true, detail: "Not as described", detailFr: "Non conforme à la description", highlight: true },
      { time: "2024-06-02 13:00", label: "Return Approved", done: true },
      { time: "2024-06-03 10:15", label: "Pickup Completed", done: true },
      { time: "2024-06-03 16:40", label: "Received at Warehouse", done: true },
      { time: "2024-06-04 11:00", label: "Inspection Passed", done: true },
      { time: "2024-06-04 15:30", label: "Refund Processed", done: true },
    ],
  },
];

// ─── Replacements ────────────────────────────────────────────────────────────

export const replacementEntities: ReplacementEntity[] = [
  {
    id: "REP-001",
    orderId: "ORD-2024-002",
    customerId: 2,
    customer: "John Smith",
    sellerId: 5,
    sellerName: "AudioHub",
    sku: "SKU-3",
    status: "allocated",
    statusFr: "Alloué",
    reason: "Defective product — audio failure",
    reasonFr: "Produit défectueux — panne audio",
    customerComment: "Left speaker crackles and cuts out after 10 minutes. Requesting a replacement unit.",
    customerCommentFr: "Le haut-parleur gauche grésille et coupe le son après 10 minutes. Je demande un remplacement.",
    createdAt: "2024-06-03",
    warehouse: "Kinshasa Hub",
    returnedProduct: {
      sku: "SKU-3",
      productId: 3,
      name: "Sony WH-1000XM5 Headphones",
      nameFr: "Casque Sony WH-1000XM5",
      variant: "Black · Wireless",
      variantFr: "Noir · Sans fil",
      image: products[2].image,
      price: 349,
      condition: "Defective",
      conditionFr: "Défectueux",
      inspection: "Audio issue confirmed — left driver intermittent, right channel normal. Packaging intact.",
      inspectionFr: "Problème audio confirmé — driver gauche intermittent, canal droit normal. Emballage intact.",
      inspectionPhotos: 3,
    },
    newProduct: {
      sku: "SKU-3-NEW",
      productId: 3,
      name: "Sony WH-1000XM5 Headphones",
      nameFr: "Casque Sony WH-1000XM5",
      variant: "Black · Wireless",
      variantFr: "Noir · Sans fil",
      image: products[2].image,
      price: 349,
      warehouseLocation: "Kinshasa Hub · Aisle A-12 · Bin 04",
      warehouseLocationFr: "Hub Kinshasa · Allée A-12 · Casier 04",
      allocated: true,
      allocatedAt: "2024-06-06 10:30",
      dispatch: {
        status: "Ready for dispatch",
        statusFr: "Prêt pour expédition",
        window: "Next batch window today 16:00 · Zone A",
        windowFr: "Prochaine vague aujourd'hui 16h00 · Zone A",
        eta: "2024-06-08 (est. upon dispatch)",
        etaFr: "2024-06-08 (est. à l'expédition)",
      },
    },
    timeline: [
      { time: "2024-06-03 09:15", label: "Replacement requested", labelFr: "Remplacement demandé", done: true, detail: "Customer reported audio defect", detailFr: "Client signale un défaut audio" },
      { time: "2024-06-04 11:00", label: "Seller approved", labelFr: "Approuvé par le vendeur", done: true },
      { time: "2024-06-05 14:20", label: "Returned item received", labelFr: "Article retourné reçu", done: true, detail: "Inbound scan at Kinshasa Hub", detailFr: "Scan entrant au Hub Kinshasa" },
      { time: "2024-06-05 16:45", label: "Inspection completed", labelFr: "Inspection terminée", done: true, detail: "Defect confirmed — eligible for replacement", detailFr: "Défaut confirmé — éligible au remplacement" },
      { time: "2024-06-06 10:30", label: "Replacement allocated", labelFr: "Remplacement alloué", done: true, detail: "SKU-3-NEW reserved from A-12-04", detailFr: "SKU-3-NEW réservé depuis A-12-04" },
      { time: "—", label: "Dispatched to customer", labelFr: "Expédié au client", done: false },
      { time: "—", label: "Delivered", labelFr: "Livré", done: false },
    ],
  },
  {
    id: "REP-002",
    orderId: "ORD-2024-006",
    customerId: 3,
    customer: "Pierre Laurent",
    sellerId: 6,
    sellerName: "GameZone",
    sku: "SKU-8",
    status: "pending",
    statusFr: "En attente",
    reason: "Damaged on arrival",
    reasonFr: "Endommagé à la réception",
    customerComment: "Console box was crushed on delivery. Disc drive does not read games.",
    customerCommentFr: "Carton écrasé à la livraison. Le lecteur de disques ne lit plus les jeux.",
    createdAt: "2024-06-05",
    warehouse: "Kinshasa Hub",
    returnedProduct: {
      sku: "SKU-8",
      productId: 8,
      name: "PlayStation 5 Console",
      nameFr: "Console PlayStation 5",
      variant: "Standard · White",
      variantFr: "Standard · Blanc",
      image: products[7].image,
      price: 499,
      condition: "Pending inspection",
      conditionFr: "Inspection en attente",
      inspection: "Awaiting receipt at warehouse — customer scheduled pickup for 2024-06-07.",
      inspectionFr: "En attente de réception à l'entrepôt — enlèvement client prévu le 2024-06-07.",
      inspectionPhotos: 2,
    },
    newProduct: {
      sku: "SKU-8-NEW",
      productId: 8,
      name: "PlayStation 5 Console",
      nameFr: "Console PlayStation 5",
      variant: "Standard · White",
      variantFr: "Standard · Blanc",
      image: products[7].image,
      price: 499,
      warehouseLocation: "Kinshasa Hub · Aisle B-03 · Bin 02",
      warehouseLocationFr: "Hub Kinshasa · Allée B-03 · Casier 02",
      allocated: false,
      dispatch: {
        status: "Pending allocation",
        statusFr: "Allocation en attente",
        window: "Unit reserved once returned item is received and inspected",
        windowFr: "Unité réservée une fois l'article retourné reçu et inspecté",
      },
    },
    timeline: [
      { time: "2024-06-05 08:30", label: "Replacement requested", labelFr: "Remplacement demandé", done: true },
      { time: "2024-06-06 09:00", label: "Seller approved", labelFr: "Approuvé par le vendeur", done: true },
      { time: "—", label: "Returned item received", labelFr: "Article retourné reçu", done: false },
      { time: "—", label: "Inspection completed", labelFr: "Inspection terminée", done: false },
      { time: "—", label: "Replacement allocated", labelFr: "Remplacement alloué", done: false },
      { time: "—", label: "Dispatched to customer", labelFr: "Expédié au client", done: false },
    ],
  },
];

// ─── Exchanges ───────────────────────────────────────────────────────────────

export const exchangeEntities: ExchangeEntity[] = [
  {
    id: "EXC-001",
    orderId: "ORD-2024-003",
    customerId: 3,
    customer: "Sophie Martin",
    sellerId: 2,
    sellerName: "SportStyle",
    reason: "Wrong size",
    reasonFr: "Mauvaise taille",
    customerComment: "Ordered size 44 but size 42 was delivered. Would like the correct size in exchange.",
    customerCommentFr: "Taille 44 commandée mais taille 42 reçue. Je souhaite un échange pour la bonne taille.",
    createdAt: "2024-06-06",
    status: "pending",
    statusFr: "En attente",
    oldProduct: {
      sku: "SKU-4-42",
      productId: 4,
      name: "Nike Air Max 270",
      nameFr: "Nike Air Max 270",
      variant: "Size 42 · White",
      variantFr: "Taille 42 · Blanc",
      image: products[3].image,
      price: 129,
    },
    newProduct: {
      sku: "SKU-4-44",
      productId: 4,
      name: "Nike Air Max 270",
      nameFr: "Nike Air Max 270",
      variant: "Size 44 · White",
      variantFr: "Taille 44 · Blanc",
      image: products[3].image,
      price: 129,
    },
    priceDifference: 0,
    photos: [
      products[3].image,
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=400&h=400&q=80",
      "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=400&h=400&q=80",
    ],
    warehouse: "Kinshasa Hub",
    timeline: [
      { time: "2024-06-06 09:00", label: "Exchange requested", labelFr: "Échange demandé", done: true },
      { time: "2024-06-06 11:30", label: "Seller notified", labelFr: "Vendeur notifié", done: true },
      { time: "—", label: "Old item pickup", labelFr: "Enlèvement article retourné", done: false },
      { time: "—", label: "Warehouse inspection", labelFr: "Inspection entrepôt", done: false },
      { time: "—", label: "New variant dispatched", labelFr: "Nouvelle variante expédiée", done: false },
    ],
  },
  {
    id: "EXC-002",
    orderId: "ORD-2024-001",
    customerId: 1,
    customer: "Marie Dubois",
    sellerId: 3,
    sellerName: "TechZone Store",
    reason: "Prefer different variant",
    reasonFr: "Variante différente souhaitée",
    customerComment: "Need more storage — upgrading from 128GB to 256GB on the same model.",
    customerCommentFr: "Besoin de plus de stockage — passage de 128 Go à 256 Go sur le même modèle.",
    createdAt: "2024-06-04",
    status: "approved",
    statusFr: "Approuvé",
    oldProduct: {
      sku: "SKU-1-128",
      productId: 1,
      name: "Samsung Galaxy S24 Ultra",
      nameFr: "Samsung Galaxy S24 Ultra",
      variant: "128GB · Titanium Black",
      variantFr: "128 Go · Noir Titanium",
      image: products[0].image,
      price: 1199,
    },
    newProduct: {
      sku: "SKU-1-256",
      productId: 1,
      name: "Samsung Galaxy S24 Ultra",
      nameFr: "Samsung Galaxy S24 Ultra",
      variant: "256GB · Titanium Black",
      variantFr: "256 Go · Noir Titanium",
      image: products[0].image,
      price: 1299,
    },
    priceDifference: 100,
    photos: [
      products[0].image,
      "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=400&h=400&q=80",
    ],
    warehouse: "Paris Nord FC",
    timeline: [
      { time: "2024-06-04 10:00", label: "Exchange requested", labelFr: "Échange demandé", done: true },
      { time: "2024-06-04 14:00", label: "Approved by seller", labelFr: "Approuvé par le vendeur", done: true },
      { time: "2024-06-05 09:30", label: "Old item received", labelFr: "Ancien article reçu", done: true },
      { time: "2024-06-05 15:00", label: "New variant allocated", labelFr: "Nouvelle variante allouée", done: true },
      { time: "—", label: "Dispatch new item", labelFr: "Expédition nouvel article", done: false },
    ],
  },
];

// ─── COD reconciliation ──────────────────────────────────────────────────────

export const codEntities: CodReconciliationEntity[] = [
  {
    id: "COD-001", riderId: 1, rider: "Jean-Pierre M.", shift: "Morning", vehicle: "Motorcycle",
    expected: 4520, collected: 4520, difference: 0, status: "approved",
    orders: [
      { orderId: "ORD-2024-001", codAmount: 1199, collected: 1199 },
      { orderId: "ORD-2024-004", codAmount: 649, collected: 649 },
    ],
  },
  {
    id: "COD-002", riderId: 2, rider: "Paul Kabongo", shift: "Afternoon", vehicle: "Van",
    expected: 2340, collected: 2280, difference: -60, status: "investigating",
    orders: [
      { orderId: "ORD-2024-003", codAmount: 129, collected: 129 },
      { orderId: "ORD-2024-006", codAmount: 499, collected: 439 },
    ],
  },
];

// ─── Shift reconciliation ────────────────────────────────────────────────────

export const shiftReconciliationEntities: ShiftReconciliationEntity[] = [
  {
    id: "REC-SHIFT-001",
    shiftDate: "2026-06-08",
    shiftName: "Afternoon",
    shiftNameFr: "Après-midi",
    warehouse: "Kinshasa Hub",
    warehouseFr: "Hub Kinshasa",
    supervisor: "Supervisor A · Marie N.",
    riderId: 2,
    rider: "Paul Kabongo",
    riderPhone: "+243 99 444 5566",
    zone: "Zone B",
    vehicle: "Van",
    expectedCollections: 2340,
    amountReceived: 2280,
    variance: -60,
    ordersCount: 8,
    status: "investigating",
    varianceNotes: "Rider reported customer on ORD-2024-006 paid $439 instead of $499. Shortfall under review.",
    varianceNotesFr: "Le livreur signale que le client ORD-2024-006 a payé 439 $ au lieu de 499 $. Écart en cours d'examen.",
    timeline: [
      { time: "2026-06-08 14:00", label: "Shift started", labelFr: "Shift démarré", done: true },
      { time: "2026-06-08 18:45", label: "Last delivery completed", labelFr: "Dernière livraison terminée", done: true },
      { time: "2026-06-08 19:10", label: "Rider handover at hub", labelFr: "Remise livreur au hub", done: true },
      { time: "2026-06-08 19:25", label: "Cash counted — variance detected", labelFr: "Comptage espèces — écart détecté", done: true },
      { time: "—", label: "Supervisor review", labelFr: "Revue superviseur", done: false },
      { time: "—", label: "Shift approved", labelFr: "Shift approuvé", done: false },
    ],
    orders: [
      { orderId: "ORD-2024-003", customer: "Sophie Martin", expected: 129, collected: 129, status: "collected" },
      { orderId: "ORD-2024-006", customer: "Pierre Laurent", expected: 499, collected: 439, status: "partial" },
      { orderId: "ORD-2024-008", customer: "Ahmed Hassan", expected: 349, collected: 349, status: "collected" },
      { orderId: "ORD-2024-009", customer: "Jean Kambale", expected: 189, collected: 189, status: "collected" },
      { orderId: "ORD-2024-010", customer: "Claire M.", expected: 275, collected: 275, status: "collected" },
      { orderId: "ORD-2024-011", customer: "David O.", expected: 420, collected: 420, status: "collected" },
      { orderId: "ORD-2024-012", customer: "Fatou B.", expected: 229, collected: 229, status: "collected" },
      { orderId: "ORD-2024-013", customer: "Marc T.", expected: 250, collected: 250, status: "collected" },
    ],
  },
  {
    id: "REC-SHIFT-002",
    shiftDate: "2026-06-08",
    shiftName: "Morning",
    shiftNameFr: "Matin",
    warehouse: "Kinshasa Hub",
    warehouseFr: "Hub Kinshasa",
    supervisor: "Supervisor B · Jean D.",
    riderId: 1,
    rider: "Jean-Pierre M.",
    riderPhone: "+243 99 111 2233",
    zone: "Zone A",
    vehicle: "Motorcycle",
    expectedCollections: 4520,
    amountReceived: 4520,
    variance: 0,
    ordersCount: 12,
    status: "approved",
    timeline: [
      { time: "2026-06-08 07:00", label: "Shift started", labelFr: "Shift démarré", done: true },
      { time: "2026-06-08 13:30", label: "Last delivery completed", labelFr: "Dernière livraison terminée", done: true },
      { time: "2026-06-08 13:50", label: "Rider handover at hub", labelFr: "Remise livreur au hub", done: true },
      { time: "2026-06-08 14:05", label: "Cash counted — match confirmed", labelFr: "Comptage espèces — correspondance confirmée", done: true },
      { time: "2026-06-08 14:15", label: "Supervisor review", labelFr: "Revue superviseur", done: true },
      { time: "2026-06-08 14:20", label: "Shift approved", labelFr: "Shift approuvé", done: true },
    ],
    orders: [
      { orderId: "ORD-2024-001", customer: "Marie Dubois", expected: 1199, collected: 1199, status: "collected" },
      { orderId: "ORD-2024-004", customer: "Ahmed Hassan", expected: 649, collected: 649, status: "collected" },
      { orderId: "ORD-2024-014", customer: "Luc P.", expected: 320, collected: 320, status: "collected" },
      { orderId: "ORD-2024-015", customer: "Nadia S.", expected: 410, collected: 410, status: "collected" },
      { orderId: "ORD-2024-016", customer: "Eric W.", expected: 285, collected: 285, status: "collected" },
      { orderId: "ORD-2024-017", customer: "Grace L.", expected: 198, collected: 198, status: "collected" },
      { orderId: "ORD-2024-018", customer: "Hassan M.", expected: 367, collected: 367, status: "collected" },
      { orderId: "ORD-2024-019", customer: "Isabelle R.", expected: 292, collected: 292, status: "collected" },
      { orderId: "ORD-2024-020", customer: "James K.", expected: 175, collected: 175, status: "collected" },
      { orderId: "ORD-2024-021", customer: "Karim A.", expected: 225, collected: 225, status: "collected" },
      { orderId: "ORD-2024-022", customer: "Laura B.", expected: 200, collected: 200, status: "collected" },
      { orderId: "ORD-2024-023", customer: "Michel C.", expected: 200, collected: 200, status: "collected" },
    ],
  },
];

// ─── Exceptions ──────────────────────────────────────────────────────────────

export const exceptionEntities: ExceptionEntity[] = [
  {
    id: "INC-001", parcelId: "PKG-002", orderId: "ORD-2024-006", type: "Damaged Parcel", typeFr: "Colis endommagé",
    severity: "high", severityFr: "Élevée", status: "open", statusFr: "Ouvert", reportedBy: "Receiver Staff", reportedByFr: "Agent de réception", createdDate: "2024-06-05",
    photos: 3, notes: "Corner crushed during inbound", notesFr: "Coin écrasé lors de la réception", assignedStaff: "Supervisor A", assignedStaffFr: "Superviseur A",
    resolution: "Pending investigation", resolutionFr: "Enquête en attente",
  },
  {
    id: "INC-002", parcelId: "PKG-005", orderId: "ORD-2024-004", type: "Missing Item", typeFr: "Article manquant",
    severity: "critical", severityFr: "Critique", status: "investigating", statusFr: "En investigation", reportedBy: "Sorter B", reportedByFr: "Trieur B", createdDate: "2024-06-04",
    photos: 1, notes: "1 of 2 items missing from package", notesFr: "1 article sur 2 manquant dans le colis", assignedStaff: "Ops Manager", assignedStaffFr: "Responsable des opérations",
    resolution: "Seller notified", resolutionFr: "Vendeur notifié",
  },
  {
    id: "INC-003", parcelId: "—", orderId: "ORD-2024-003", type: "Cash Difference", typeFr: "Écart de caisse",
    severity: "medium", severityFr: "Moyenne", status: "resolved", statusFr: "Résolu", reportedBy: "Finance", reportedByFr: "Finance", createdDate: "2024-06-03",
    photos: 0, notes: "Rider short $60 on shift", notesFr: "Livreur en déficit de 60 $ sur le service", assignedStaff: "Finance Team", assignedStaffFr: "Équipe finance",
    resolution: "Adjusted from rider deposit", resolutionFr: "Ajusté depuis le dépôt du livreur",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getInboundParcel(id: string) {
  return inboundParcels.find((p) => p.id === id);
}

export function getAgedParcel(id: string) {
  return agedParcelEntities.find((p) => p.id === id);
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

export function getDeliveriesByRider(riderId: number, activeOnly = true) {
  return deliveryEntities.filter(
    (d) => d.riderId === riderId && (!activeOnly || d.status !== "delivered")
  );
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

export function getCodReconciliation(id: string) {
  return codEntities.find((c) => c.id === id);
}

export function getShiftReconciliation(id?: string) {
  if (id) return shiftReconciliationEntities.find((s) => s.id === id);
  return shiftReconciliationEntities.find((s) => s.status === "investigating") ?? shiftReconciliationEntities[0];
}

export function getException(id: string) {
  return exceptionEntities.find((e) => e.id === id);
}

export { batchEntities, parcelEntities };
