import { products } from "./mock-data";
import { orderEntities, sellerProductDetails } from "./entities";
import { INITIAL_WAREHOUSES } from "./warehouses-admin";

/**
 * Sellers must not see customers' personal info — the platform/riders handle
 * delivery. Sellers may only see a customer's FIRST NAME (no last name) and
 * destination CITY. Use this helper to derive the first name from a full name.
 */
function firstNameOnly(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

// ─── Store & Dashboard ───────────────────────────────────────────────────────

export const sellerStore = {
  name: "TechZone Store",
  owner: "Mike Johnson",
  rating: 4.8,
  healthScore: 92,
  badge: "Gold",
};

export const sellerDashboardStats = {
  todayRevenue: 4521,
  todayOrders: 23,
  pendingOrders: 8,
  productsSold: 156,
  storeRating: 4.8,
  healthScore: 92,
  pendingReturns: 3,
  pendingReplacements: 1,
};

// ─── Products (listing fields) ─────────────────────────────────────────────────

export const sellerProductList = sellerProductDetails.map((p, i) => ({
  ...p,
  brand: "Samsung",
  category: "Electronics",
  categoryFr: "Électronique",
  subcategory: "Smartphones",
  subcategoryFr: "Smartphones",
  discountPrice: Math.round(p.price * 0.9),
  availableStock: p.stock,
  reservedStock: p.reserved,
  soldCount: p.sold,
  views: p.views,
  rating: 4.5 + (i % 5) * 0.1,
  moderationStatus: p.moderation,
  createdDate: "2024-01-20",
  updatedDate: "2024-06-05",
  description: p.description,
  mrp: p.price + 100,
  commission: 12,
  netRevenue: Math.round(p.price * 0.88),
  lowStockThreshold: 10,
  allocatedStock: p.reserved,
  productOrders: orderEntities.filter((o) => o.seller === "TechZone Store").slice(0, 3).map((o) => ({
    orderNumber: o.id,
    customer: o.customer,
    quantity: 1,
    amount: o.amount,
    status: o.status,
    date: o.date,
  })),
  productReviews: [
    { customer: "Marie D.", rating: 5, review: "Excellent product!", reviewFr: "Excellent produit !", images: 1, date: "2024-05-20" },
    { customer: "John S.", rating: 4, review: "Good value.", reviewFr: "Bon rapport qualité-prix.", images: 0, date: "2024-05-15" },
  ],
  variantsDetailed: p.variants.map((v) => ({
    ...v,
    variantName: v.name,
    color: "Black",
    colorFr: "Noir",
    size: "256GB",
    status: v.stock > 0 ? "active" : "disabled",
  })),
}));

// ─── Inventory ─────────────────────────────────────────────────────────────────

export const sellerInventoryList = sellerProductList.map((p) => ({
  sku: p.sku,
  productId: p.id,
  product: p.name,
  category: p.category,
  categoryFr: p.categoryFr,
  available: p.availableStock,
  reserved: p.reservedStock,
  allocated: p.allocatedStock,
  sold: p.soldCount,
  location: "Kinshasa Hub",
  image: p.image,
  warehouse: "Kinshasa Hub",
  supplier: "Samsung Distributor",
  damaged: 0,
  returned: 2,
  movements: [
    { date: "2024-06-05", type: "Received", typeFr: "Reçu", quantity: 50, reference: "PO-001", user: "System" },
    { date: "2024-06-04", type: "Reserved", typeFr: "Réservé", quantity: 5, reference: "ORD-2024-001", user: "System" },
    { date: "2024-06-03", type: "Sold", typeFr: "Vendu", quantity: 3, reference: "ORD-2024-002", user: "System" },
    { date: "2024-06-02", type: "Returned", typeFr: "Retourné", quantity: 1, reference: "RET-001", user: "Warehouse" },
  ],
}));

// ─── Orders ──────────────────────────────────────────────────────────────────

export const sellerOrderList = orderEntities
  .filter((o) => o.seller === "TechZone Store")
  .map((o) => ({
    id: o.id,
    // Privacy: expose first name only — no last name, phone, email, or address.
    customer: firstNameOnly(o.customer),
    customerCity: o.customerCity,
    items: o.itemsCount,
    amount: o.amount,
    paymentMethod: o.paymentMethod,
    orderStatus: o.status,
    shippingStatus: o.status === "delivered" ? "delivered" : o.status === "processing" ? "ready" : "pending",
    date: o.date,
    commission: o.commission,
    netEarnings: o.sellerEarnings,
    transactionId: o.transactionId,
    paymentStatus: o.paymentStatus,
    warehouse: o.warehouse,
    pickupRider: o.rider,
    trackingStatus: o.status,
    trackingNumber: o.trackingNumber,
    pickupEta: "14:00",
    deliveryEta: o.status === "delivered" ? "20:00" : "—",
    items_detail: o.items,
    timeline: [
      { time: `${o.date} 09:00`, label: "Placed", labelFr: "Commandée", done: true },
      { time: `${o.date} 09:30`, label: "Confirmed", labelFr: "Confirmée", done: o.status !== "pending" },
      { time: `${o.date} 11:00`, label: "Packed", labelFr: "Emballée", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 12:00`, label: "Ready for pickup", labelFr: "Prête pour enlèvement", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 14:00`, label: "Picked up", labelFr: "Collectée", detail: "Rider collected from seller", detailFr: "Collectée chez le vendeur", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 16:00`, label: "At warehouse", labelFr: "À l'entrepôt", detail: o.warehouse, done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 18:00`, label: "Dispatched", labelFr: "Expédiée", done: o.status === "delivered" },
      { time: `${o.date} 20:00`, label: "Delivered", labelFr: "Livrée", done: o.status === "delivered" },
    ],
  }));

// ─── Shipping ──────────────────────────────────────────────────────────────────

const SHIPPING_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  ready: "Prêt pour enlèvement",
  picked_up: "Collecté",
  in_transit: "En transit",
  delivered: "Livré",
};

const RIDER_LOCATIONS: Record<string, { en: string; fr: string }> = {
  ready: { en: "En route to seller — Gombe", fr: "En route vers le vendeur — Gombe" },
  picked_up: { en: "In transit to warehouse", fr: "En transit vers l'entrepôt" },
  in_transit: { en: "At Kinshasa Hub — Sorting", fr: "Au Hub Kinshasa — Tri" },
  delivered: { en: "Kinshasa Hub — Receiving dock", fr: "Hub Kinshasa — Quai réception" },
};

export type ShipmentTimelineEvent = {
  time: string;
  label: string;
  labelFr: string;
  detail?: string;
  detailFr?: string;
  done?: boolean;
};

export type ShipmentDetail = {
  id: string;
  orderId: string;
  status: string;
  statusFr: string;
  createdDate: string;
  carrier: string;
  carrierFr: string;
  method: string;
  methodFr: string;
  trackingNumber: string;
  pickupEta: string;
  deliveryEta: string;
  pickupTime: string;
  warehouse: {
    id: string;
    name: string;
    address: string;
    contact: string;
    phone: string;
    zone: string;
  };
  rider: {
    name: string;
    phone: string;
    vehicle: string;
    vehicleFr: string;
    zone: string;
    currentLocation: string;
    currentLocationFr: string;
  };
  customer: {
    // Privacy: first name + destination city only — no phone, address, or last name.
    name: string;
    city: string;
  };
  seller: {
    storeName: string;
    phone: string;
  };
  products: (typeof sellerOrderList)[number]["items_detail"];
  timeline: ShipmentTimelineEvent[];
};

function warehouseInfo(name: string) {
  const wh = INITIAL_WAREHOUSES.find((w) => w.name === name);
  if (!wh) {
    return {
      id: "—",
      name,
      address: "—",
      contact: "—",
      phone: "—",
      zone: "Zone A",
    };
  }
  return {
    id: wh.id,
    name: wh.name,
    address: `${wh.address}, ${wh.city}, ${wh.country}`,
    contact: wh.managerName,
    phone: "+243 820 100 200",
    zone: wh.zones[0] ?? "Zone A",
  };
}

function buildShipmentDetail(order: (typeof sellerOrderList)[number]): ShipmentDetail {
  const status = order.shippingStatus;
  const riderLoc = RIDER_LOCATIONS[status] ?? RIDER_LOCATIONS.ready;
  const wh = warehouseInfo(order.warehouse);

  return {
    id: `SHP-${order.id.replace("ORD-", "")}`,
    orderId: order.id,
    status,
    statusFr: SHIPPING_STATUS_FR[status] ?? status,
    createdDate: order.date,
    carrier: "Somba & Teka Logistics",
    carrierFr: "Somba & Teka Logistique",
    method: "Hub pickup → last mile",
    methodFr: "Collecte hub → dernier km",
    trackingNumber: order.trackingNumber,
    pickupEta: order.pickupEta,
    deliveryEta: order.deliveryEta,
    pickupTime: `${order.date} ${order.pickupEta}`,
    warehouse: wh,
    rider: {
      name: order.pickupRider,
      phone: "+243 99 111 2233",
      vehicle: "Motorcycle — Honda CB150",
      vehicleFr: "Moto — Honda CB150",
      zone: "Kinshasa — Gombe",
      currentLocation: riderLoc.en,
      currentLocationFr: riderLoc.fr,
    },
    customer: {
      name: order.customer,
      city: order.customerCity,
    },
    seller: {
      storeName: sellerStore.name,
      phone: "+1 555 123 4567",
    },
    products: order.items_detail,
    timeline: order.timeline as ShipmentTimelineEvent[],
  };
}

export const shipmentList: ShipmentDetail[] = sellerOrderList
  .filter((o) => o.shippingStatus !== "pending")
  .map(buildShipmentDetail);

// ─── Returns ─────────────────────────────────────────────────────────────────

export const sellerReturnList = [
  {
    id: "RET-001", orderId: "ORD-2024-001", customer: "Marie Dubois", reason: "Wrong size", reasonFr: "Mauvaise taille",
    amount: 129, status: "pending_inspection", productId: 4, product: "Nike Air Max 270", variant: "Size 42", variantFr: "Taille 42", qty: 1,
    inspection: { warehouseNotes: "Good condition — unopened box", warehouseNotesFr: "Bon état — boîte non ouverte", photos: 2, condition: "Unopened", conditionFr: "Non ouvert" },
    refund: { amount: 129, method: "Somba & Teka Wallet", methodFr: "Portefeuille Somba & Teka", status: "pending" },
    timeline: [
      { time: "2024-06-01 20:00", label: "Order Delivered", done: true },
      { time: "2024-06-05 10:15", label: "Return Requested", done: true },
      { time: "2024-06-05 14:30", label: "Return Approved", done: true },
      { time: "2024-06-06 09:00", label: "Pickup Scheduled", done: true },
      { time: "—", label: "Refund Processed", done: false },
    ],
  },
  {
    id: "RET-002", orderId: "ORD-2024-004", customer: "Ahmed Hassan", reason: "Damaged item", reasonFr: "Article endommagé",
    amount: 649, status: "inspecting", productId: 5, product: "Dyson V15 Vacuum", variant: "Standard", variantFr: "Standard", qty: 1,
    inspection: { warehouseNotes: "Box crushed, motor noise", warehouseNotesFr: "Boîte écrasée, bruit du moteur", photos: 4, condition: "Damaged", conditionFr: "Endommagé" },
    refund: { amount: 649, method: "Original Payment", methodFr: "Paiement d'origine", status: "pending" },
    timeline: [
      { time: "2024-06-02 18:30", label: "Order Delivered", done: true },
      { time: "2024-06-04 11:20", label: "Return Requested", done: true },
      { time: "2024-06-05 14:20", label: "Received at Warehouse", done: true },
      { time: "2024-06-06 10:00", label: "Inspecting", done: true },
      { time: "—", label: "Refund Processed", done: false },
    ],
  },
];

// ─── Replacements ────────────────────────────────────────────────────────────

export const sellerReplacementList = [
  {
    id: "REP-001", orderId: "ORD-2024-002", customer: "John Smith", sku: "SKU-3", status: "allocated",
    returnedProduct: { sku: "SKU-3", condition: "Defective", inspection: "Audio issue" },
    newProduct: { sku: "SKU-3-NEW", allocated: true, dispatchStatus: "ready" },
    timeline: [
      { time: "2024-06-03", label: "Requested", done: true },
      { time: "2024-06-04", label: "Approved", done: true },
      { time: "2024-06-05", label: "Received", done: true },
      { time: "2024-06-06", label: "Allocated", done: true },
      { time: "—", label: "Dispatched", done: false },
    ],
  },
];

// ─── Promotions ──────────────────────────────────────────────────────────────

export const promotionList = [
  {
    id: "PROMO-001", campaign: "Summer Electronics Sale", products: 12, discount: 20,
    startDate: "2024-06-01", endDate: "2024-06-30", status: "active", statusFr: "Actif",
    budget: 5000, views: 12400, clicks: 890, orders: 45, revenue: 12450, roi: 2.4,
  },
  {
    id: "PROMO-002", campaign: "Flash Weekend", products: 5, discount: 30,
    startDate: "2024-06-08", endDate: "2024-06-09", status: "scheduled", statusFr: "Planifié",
    budget: 2000, views: 0, clicks: 0, orders: 0, revenue: 0, roi: 0,
  },
];

// ─── Reviews ─────────────────────────────────────────────────────────────────

export const sellerReviewList = [
  { id: 1, customer: "Marie D.", productId: 1, product: "Samsung Galaxy S24 Ultra", rating: 5, review: "Excellent phone, fast delivery!", reviewFr: "Excellent téléphone, livraison rapide !", date: "2024-05-20" },
  { id: 2, customer: "John S.", productId: 1, product: "Samsung Galaxy S24 Ultra", rating: 4, review: "Good product, packaging could be better.", reviewFr: "Bon produit, l'emballage pourrait être meilleur.", date: "2024-05-18" },
  { id: 3, customer: "Sophie M.", productId: 2, product: "Galaxy Buds Pro", rating: 5, review: "Amazing sound quality!", reviewFr: "Qualité sonore incroyable !", date: "2024-05-15" },
];

// ─── Finance ─────────────────────────────────────────────────────────────────

export const sellerFinanceStats = {
  revenue: 894320,
  pendingRevenue: 3200,
  availableBalance: 12450,
  commissionPaid: 45600,
  refundAmount: 890,
  revenueTrend: "+12.4% MTD",
  pendingTrend: "3 orders clearing",
  balanceTrend: "Ready to withdraw",
  commissionTrend: "12% avg rate",
  refundTrend: "-4.2% vs last month",
};

export const sellerFinanceWallet = {
  availableBalance: 12450,
  pendingClearance: 2250,
  pendingPayout: 8500,
  reservedForRefunds: 320,
  totalBalance: 23520,
  currency: "USD",
  lastUpdated: "2024-06-08 14:32",
};

export const sellerFinanceTaxSummary = {
  businessName: "TechZone Solutions SARL",
  taxId: "CD-123456789",
  ytdGross: 894320,
  ytdNet: 786980,
  ytdCommission: 107340,
  ytdRefunds: 8900,
  lastStatement: "2024-05",
  nextStatement: "2024-07-01",
};

export const sellerFinanceRevenueByPeriod = [
  { period: "Today", periodFr: "Aujourd'hui", gross: 4521, net: 3978, commission: 543, orders: 23 },
  { period: "This week", periodFr: "Cette semaine", gross: 28400, net: 24992, commission: 3408, orders: 186 },
  { period: "Last week", periodFr: "Semaine dernière", gross: 26100, net: 22968, commission: 3132, orders: 172 },
  { period: "MTD", periodFr: "Mois en cours", gross: 89432, net: 78698, commission: 10734, orders: 612 },
  { period: "Last month", periodFr: "Mois dernier", gross: 78200, net: 68816, commission: 9384, orders: 548 },
];

export const sellerFinanceRevenueByCategory = [
  { category: "Smartphones", categoryFr: "Smartphones", gross: 412000, net: 362560, commission: 49440, orders: 892, rate: 12 },
  { category: "Audio", categoryFr: "Audio", gross: 186000, net: 163680, commission: 22320, orders: 1240, rate: 12 },
  { category: "Accessories", categoryFr: "Accessoires", gross: 142000, net: 124960, commission: 17040, orders: 2100, rate: 12 },
  { category: "Wearables", categoryFr: "Objets connectés", gross: 98000, net: 86240, commission: 11760, orders: 680, rate: 12 },
  { category: "Other", categoryFr: "Autre", gross: 56320, net: 49562, commission: 6758, orders: 420, rate: 12 },
];

export const sellerCommissionByTier = [
  { tier: "Electronics — Gold", tierFr: "Électronique — Or", category: "Electronics", rate: 10, gross: 412000, commission: 41200, orders: 892 },
  { tier: "Audio — Gold", tierFr: "Audio — Or", category: "Audio", rate: 10, gross: 186000, commission: 18600, orders: 1240 },
  { tier: "Accessories — Standard", tierFr: "Accessoires — Standard", category: "Accessories", rate: 12, gross: 142000, commission: 17040, orders: 2100 },
  { tier: "Wearables — Standard", tierFr: "Objets connectés — Standard", category: "Wearables", rate: 12, gross: 98000, commission: 11760, orders: 680 },
  { tier: "Other — Standard", tierFr: "Autre — Standard", category: "Other", rate: 12, gross: 56320, commission: 6758, orders: 420 },
];

export const sellerFinanceNetCommissionTrend = [
  { label: "Jun 1", net: 2798, commission: 382 },
  { label: "Jun 5", net: 2543, commission: 347 },
  { label: "Jun 9", net: 3212, commission: 438 },
  { label: "Jun 13", net: 3504, commission: 476 },
  { label: "Jun 17", net: 3309, commission: 451 },
  { label: "Jun 21", net: 3802, commission: 518 },
  { label: "Jun 25", net: 4118, commission: 562 },
  { label: "Jun 29", net: 4326, commission: 584 },
];

export const transactionList = sellerOrderList.map((o) => ({
  order: o.id,
  customer: o.customer,
  grossAmount: o.amount,
  commission: o.commission,
  netAmount: o.netEarnings,
  status: o.paymentStatus,
  date: o.date,
}));

export const payoutList = [
  { id: "PAY-005", amount: 6200, method: "Bank Transfer", methodFr: "Virement bancaire", status: "requested", statusFr: "Demandé", date: "2024-06-08", bankAccount: "****4521", approvedBy: "—", itemCount: 4 },
  { id: "PAY-004", amount: 9800, method: "Mobile Money", methodFr: "Mobile Money", status: "paid", statusFr: "Payé", date: "2024-06-01", bankAccount: "+243 99 *** 4521", approvedBy: "Admin Sarah", itemCount: 6 },
  { id: "PAY-003", amount: 11200, method: "Bank Transfer", methodFr: "Virement bancaire", status: "paid", statusFr: "Payé", date: "2024-05-15", bankAccount: "****4521", approvedBy: "Admin Sarah", itemCount: 9 },
  { id: "PAY-002", amount: 8500, method: "Bank Transfer", methodFr: "Virement bancaire", status: "processing", statusFr: "En cours", date: "2024-06-06", bankAccount: "****4521", approvedBy: "—", itemCount: 5 },
  { id: "PAY-001", amount: 12000, method: "Bank Transfer", methodFr: "Virement bancaire", status: "paid", statusFr: "Payé", date: "2024-05-01", bankAccount: "****4521", approvedBy: "Admin Sarah", itemCount: 8 },
];

export type SellerPayoutItemStatus =
  | "awaiting_delivery"
  | "pending_clearance"
  | "ready_for_payout"
  | "paid_out";

export type SellerPayoutPendingItem = {
  id: string;
  orderId: string;
  productId: number;
  listingName: string;
  deliveryDate: string | null;
  orderAmount: number;
  commission: number;
  netEarnings: number;
  status: SellerPayoutItemStatus;
  payoutId?: string;
  clearanceEndsAt?: string;
};

export const sellerPayoutSummary = {
  totalPending: 8450,
  availableForPayout: 6200,
  nextPayoutDate: "2024-06-10",
  commissionDeducted: 1890,
  clearanceHours: 48,
};

export const sellerPayoutPendingItems: SellerPayoutPendingItem[] = [
  {
    id: "POI-001",
    orderId: "ORD-2024-001",
    productId: 1,
    listingName: "Samsung Galaxy S24 Ultra",
    deliveryDate: "2024-06-01",
    orderAmount: 1199,
    commission: 144,
    netEarnings: 1055,
    status: "paid_out",
    payoutId: "PAY-001",
  },
  {
    id: "POI-002",
    orderId: "ORD-2024-007",
    productId: 2,
    listingName: "Galaxy Buds Pro",
    deliveryDate: "2024-05-28",
    orderAmount: 349,
    commission: 42,
    netEarnings: 307,
    status: "paid_out",
    payoutId: "PAY-001",
  },
  {
    id: "POI-003",
    orderId: "ORD-2024-012",
    productId: 3,
    listingName: "Galaxy Watch 6 Classic",
    deliveryDate: "2024-05-25",
    orderAmount: 649,
    commission: 78,
    netEarnings: 571,
    status: "paid_out",
    payoutId: "PAY-001",
  },
  {
    id: "POI-004",
    orderId: "ORD-2024-018",
    productId: 1,
    listingName: "Samsung Galaxy S24 Ultra",
    deliveryDate: "2024-06-04",
    orderAmount: 1199,
    commission: 144,
    netEarnings: 1055,
    status: "ready_for_payout",
    payoutId: "PAY-002",
  },
  {
    id: "POI-005",
    orderId: "ORD-2024-019",
    productId: 4,
    listingName: "Galaxy Tab S9",
    deliveryDate: "2024-06-05",
    orderAmount: 899,
    commission: 108,
    netEarnings: 791,
    status: "ready_for_payout",
    payoutId: "PAY-002",
  },
  {
    id: "POI-006",
    orderId: "ORD-2024-021",
    productId: 2,
    listingName: "Galaxy Buds Pro",
    deliveryDate: "2024-06-06",
    orderAmount: 349,
    commission: 42,
    netEarnings: 307,
    status: "pending_clearance",
    clearanceEndsAt: "2024-06-08",
  },
  {
    id: "POI-007",
    orderId: "ORD-2024-022",
    productId: 5,
    listingName: "Samsung 55\" QLED TV",
    deliveryDate: "2024-06-06",
    orderAmount: 1299,
    commission: 156,
    netEarnings: 1143,
    status: "pending_clearance",
    clearanceEndsAt: "2024-06-08",
  },
  {
    id: "POI-008",
    orderId: "ORD-2024-024",
    productId: 3,
    listingName: "Galaxy Watch 6 Classic",
    deliveryDate: null,
    orderAmount: 649,
    commission: 78,
    netEarnings: 571,
    status: "awaiting_delivery",
  },
  {
    id: "POI-009",
    orderId: "ORD-2024-025",
    productId: 1,
    listingName: "Samsung Galaxy S24 Ultra",
    deliveryDate: null,
    orderAmount: 1199,
    commission: 144,
    netEarnings: 1055,
    status: "awaiting_delivery",
  },
  {
    id: "POI-010",
    orderId: "ORD-2024-015",
    productId: 4,
    listingName: "Galaxy Tab S9",
    deliveryDate: "2024-05-30",
    orderAmount: 899,
    commission: 108,
    netEarnings: 791,
    status: "paid_out",
    payoutId: "PAY-001",
  },
];

// ─── Support ─────────────────────────────────────────────────────────────────

export const supportTicketList = [
  { id: "TKT-001", category: "Payout", categoryFr: "Versement", priority: "high", status: "open", statusFr: "Ouvert", lastUpdate: "2024-06-05", subject: "Payout delay inquiry", subjectFr: "Demande de retard de versement" },
  { id: "TKT-002", category: "Product", categoryFr: "Produit", priority: "medium", status: "resolved", statusFr: "Résolu", lastUpdate: "2024-06-03", subject: "Moderation question", subjectFr: "Question de modération" },
  { id: "TKT-003", category: "Orders", categoryFr: "Commandes", priority: "low", status: "open", statusFr: "Ouvert", lastUpdate: "2024-06-06", subject: "Rider pickup delay", subjectFr: "Retard d'enlèvement du livreur" },
];

// ─── Settings ────────────────────────────────────────────────────────────────

export const storeSettings = {
  storeName: "TechZone Store",
  description: "Official Samsung distributor — electronics specialist in Kinshasa.",
  descriptionFr: "Distributeur officiel Samsung — spécialiste de l'électronique à Kinshasa.",
  businessName: "TechZone Solutions SARL",
  taxId: "CD-123456789",
  phone: "+1 555 123 4567",
  email: "mike@gadgetworld.com",
  teamMembers: [
    { name: "Mike Johnson", role: "Owner", roleFr: "Propriétaire", email: "mike@gadgetworld.com", status: "active" },
    { name: "Sarah K.", role: "Manager", roleFr: "Gérant", email: "sarah@techzone.com", status: "active" },
    { name: "Jean P.", role: "Staff", roleFr: "Personnel", email: "jean@techzone.com", status: "active" },
  ],
};

export const lowStockProducts = sellerProductList.filter((p) => p.availableStock < 10);

export const topSellingProducts = [...sellerProductList].sort((a, b) => b.soldCount - a.soldCount).slice(0, 3);

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getSellerProductFull(id: number) {
  return sellerProductList.find((p) => p.id === id);
}

export function getSellerInventory(sku: string) {
  return sellerInventoryList.find((i) => i.sku === sku);
}

export function getSellerOrder(id: string) {
  return sellerOrderList.find((o) => o.id === id);
}

export function getShipment(id: string) {
  return shipmentList.find((s) => s.id === id);
}

export function getShipmentByOrderId(orderId: string) {
  return shipmentList.find((s) => s.orderId === orderId);
}

export function getSellerReturn(id: string) {
  return sellerReturnList.find((r) => r.id === id);
}

export function getSellerReplacement(id: string) {
  return sellerReplacementList.find((r) => r.id === id);
}

export function getPromotion(id: string) {
  return promotionList.find((p) => p.id === id);
}

export function getPayout(id: string) {
  return payoutList.find((p) => p.id === id);
}

export function getSellerPayoutItems() {
  return sellerPayoutPendingItems;
}

export function getPayoutItemsByPayoutId(payoutId: string) {
  return sellerPayoutPendingItems.filter((i) => i.payoutId === payoutId);
}

export function getPendingPayoutItems() {
  return sellerPayoutPendingItems.filter((i) => i.status !== "paid_out");
}

export function getPaidOutPayoutItems() {
  return sellerPayoutPendingItems.filter((i) => i.status === "paid_out");
}

export function getSupportTicket(id: string) {
  return supportTicketList.find((t) => t.id === id);
}
