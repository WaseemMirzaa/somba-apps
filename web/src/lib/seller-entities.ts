import { products } from "./mock-data";
import { orderEntities, sellerProductDetails } from "./entities";

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
  subcategory: "Smartphones",
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
    { customer: "Marie D.", rating: 5, review: "Excellent product!", images: 1, date: "2024-05-20" },
    { customer: "John S.", rating: 4, review: "Good value.", images: 0, date: "2024-05-15" },
  ],
  variantsDetailed: p.variants.map((v) => ({
    ...v,
    variantName: v.name,
    color: "Black",
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
    { date: "2024-06-05", type: "Received", quantity: 50, reference: "PO-001", user: "System" },
    { date: "2024-06-04", type: "Reserved", quantity: 5, reference: "ORD-2024-001", user: "System" },
    { date: "2024-06-03", type: "Sold", quantity: 3, reference: "ORD-2024-002", user: "System" },
    { date: "2024-06-02", type: "Returned", quantity: 1, reference: "RET-001", user: "Warehouse" },
  ],
}));

// ─── Orders ──────────────────────────────────────────────────────────────────

export const sellerOrderList = orderEntities
  .filter((o) => o.seller === "TechZone Store")
  .map((o) => ({
    id: o.id,
    customer: o.customer,
    customerPhone: o.customerPhone,
    customerCity: o.customerCity,
    customerAddress: o.customerAddress,
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
    pickupEta: "14:00",
    items_detail: o.items,
    timeline: [
      { time: `${o.date} 09:00`, label: "Placed", done: true },
      { time: `${o.date} 09:30`, label: "Confirmed", done: o.status !== "pending" },
      { time: `${o.date} 11:00`, label: "Packed", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 12:00`, label: "Ready", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 14:00`, label: "Picked Up", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 16:00`, label: "Warehouse", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 18:00`, label: "Dispatched", done: o.status === "delivered" },
      { time: `${o.date} 20:00`, label: "Delivered", done: o.status === "delivered" },
    ],
  }));

// ─── Shipping ──────────────────────────────────────────────────────────────────

export const shipmentList = sellerOrderList
  .filter((o) => o.shippingStatus !== "pending")
  .map((o, i) => ({
    id: `SHP-${o.id.replace("ORD-", "")}`,
    orderId: o.id,
    rider: o.pickupRider,
    riderPhone: "+243 99 111 2233",
    vehicle: "Motorcycle",
    warehouse: o.warehouse,
    zone: "Zone A",
    status: o.shippingStatus,
    pickupTime: o.date + " 14:00",
    timeline: o.timeline,
  }));

// ─── Returns ─────────────────────────────────────────────────────────────────

export const sellerReturnList = [
  {
    id: "RET-001", orderId: "ORD-2024-001", customer: "Marie Dubois", reason: "Wrong size",
    amount: 129, status: "pending", productId: 4, product: "Nike Air Max 270", variant: "Size 42", qty: 1,
    inspection: { warehouseNotes: "Good condition", photos: 2, condition: "Unopened" },
    refund: { amount: 129, method: "Wallet", status: "pending" },
    timeline: [
      { time: "2024-06-05", label: "Requested", done: true },
      { time: "2024-06-06", label: "Approved", done: true },
      { time: "—", label: "Refunded", done: false },
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
    startDate: "2024-06-01", endDate: "2024-06-30", status: "active",
    budget: 5000, views: 12400, clicks: 890, orders: 45, revenue: 12450, roi: 2.4,
  },
  {
    id: "PROMO-002", campaign: "Flash Weekend", products: 5, discount: 30,
    startDate: "2024-06-08", endDate: "2024-06-09", status: "scheduled",
    budget: 2000, views: 0, clicks: 0, orders: 0, revenue: 0, roi: 0,
  },
];

// ─── Reviews ─────────────────────────────────────────────────────────────────

export const sellerReviewList = [
  { id: 1, customer: "Marie D.", productId: 1, product: "Samsung Galaxy S24 Ultra", rating: 5, review: "Excellent phone, fast delivery!", date: "2024-05-20" },
  { id: 2, customer: "John S.", productId: 1, product: "Samsung Galaxy S24 Ultra", rating: 4, review: "Good product, packaging could be better.", date: "2024-05-18" },
  { id: 3, customer: "Sophie M.", productId: 2, product: "Galaxy Buds Pro", rating: 5, review: "Amazing sound quality!", date: "2024-05-15" },
];

// ─── Finance ─────────────────────────────────────────────────────────────────

export const sellerFinanceStats = {
  revenue: 894320,
  pendingRevenue: 3200,
  availableBalance: 12450,
  commissionPaid: 45600,
  refundAmount: 890,
};

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
  { id: "PAY-001", amount: 12000, method: "Bank Transfer", status: "paid", date: "2024-05-01", bankAccount: "****4521", approvedBy: "Admin Sarah" },
  { id: "PAY-002", amount: 8500, method: "Bank Transfer", status: "pending", date: "2024-06-06", bankAccount: "****4521", approvedBy: "—" },
];

// ─── Support ─────────────────────────────────────────────────────────────────

export const supportTicketList = [
  { id: "TKT-001", category: "Payout", priority: "high", status: "open", lastUpdate: "2024-06-05", subject: "Payout delay inquiry" },
  { id: "TKT-002", category: "Product", priority: "medium", status: "resolved", lastUpdate: "2024-06-03", subject: "Moderation question" },
  { id: "TKT-003", category: "Orders", priority: "low", status: "open", lastUpdate: "2024-06-06", subject: "Rider pickup delay" },
];

// ─── Settings ────────────────────────────────────────────────────────────────

export const storeSettings = {
  storeName: "TechZone Store",
  description: "Official Samsung distributor — electronics specialist in Kinshasa.",
  businessName: "TechZone Solutions SARL",
  taxId: "CD-123456789",
  phone: "+1 555 123 4567",
  email: "mike@gadgetworld.com",
  teamMembers: [
    { name: "Mike Johnson", role: "Owner", email: "mike@gadgetworld.com", status: "active" },
    { name: "Sarah K.", role: "Manager", email: "sarah@techzone.com", status: "active" },
    { name: "Jean P.", role: "Staff", email: "jean@techzone.com", status: "active" },
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

export function getSupportTicket(id: string) {
  return supportTicketList.find((t) => t.id === id);
}
