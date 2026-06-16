/** Seller dashboard analytics & chart data */

export const sellerRevenueTrend = [
  { label: "Jun 1", revenue: 3180, orders: 16 },
  { label: "Jun 3", revenue: 3420, orders: 19 },
  { label: "Jun 5", revenue: 2890, orders: 14 },
  { label: "Jun 7", revenue: 4100, orders: 22 },
  { label: "Jun 9", revenue: 3650, orders: 20 },
  { label: "Jun 11", revenue: 4521, orders: 23 },
  { label: "Jun 13", revenue: 3980, orders: 21 },
  { label: "Jun 15", revenue: 4210, orders: 24 },
  { label: "Jun 17", revenue: 3760, orders: 19 },
  { label: "Jun 19", revenue: 4890, orders: 26 },
  { label: "Jun 21", revenue: 4320, orders: 22 },
  { label: "Jun 23", revenue: 5100, orders: 28 },
  { label: "Jun 25", revenue: 4680, orders: 25 },
  { label: "Jun 27", revenue: 5240, orders: 29 },
  { label: "Jun 29", revenue: 4910, orders: 27 },
] as const;

export const sellerRetentionTrend = [
  { month: "Jan", retention: 62, churn: 38 },
  { month: "Feb", retention: 65, churn: 35 },
  { month: "Mar", retention: 68, churn: 32 },
  { month: "Apr", retention: 71, churn: 29 },
  { month: "May", retention: 74, churn: 26 },
  { month: "Jun", retention: 78, churn: 22 },
] as const;

export const sellerCustomerSegments = [
  { id: "new", label: "New customers", labelFr: "Nouveaux clients", value: 342, pct: 28, color: "#1d4ed8" },
  { id: "returning", label: "Returning", labelFr: "Récurrents", value: 891, pct: 52, color: "#059669" },
  { id: "at_risk", label: "At-risk", labelFr: "À risque", value: 156, pct: 13, color: "#d97706" },
  { id: "churned", label: "Churned (30d)", labelFr: "Perdus (30j)", value: 89, pct: 7, color: "#94a3b8" },
] as const;

export const sellerOrderFunnel = [
  { stage: "Product views", stageFr: "Vues produit", count: 48200, pct: 100 },
  { stage: "Add to cart", stageFr: "Ajout panier", count: 12480, pct: 25.9 },
  { stage: "Checkout started", stageFr: "Paiement démarré", count: 6200, pct: 12.9 },
  { stage: "Orders placed", stageFr: "Commandes", count: 3840, pct: 8.0 },
  { stage: "Delivered", stageFr: "Livrées", count: 3512, pct: 7.3 },
] as const;

export const sellerCategoryRevenue = [
  { category: "Smartphones", categoryFr: "Smartphones", revenue: 412000, pct: 46, orders: 892 },
  { category: "Audio", categoryFr: "Audio", revenue: 186000, pct: 21, orders: 1240 },
  { category: "Accessories", categoryFr: "Accessoires", revenue: 142000, pct: 16, orders: 2100 },
  { category: "Wearables", categoryFr: "Objets connectés", revenue: 98000, pct: 11, orders: 680 },
  { category: "Other", categoryFr: "Autre", revenue: 56320, pct: 6, orders: 420 },
] as const;

export const sellerGoals = {
  revenueTarget: 120000,
  revenueCurrent: 89432,
  ordersTarget: 800,
  ordersCurrent: 612,
  retentionTarget: 80,
  retentionCurrent: 78,
  ratingTarget: 4.9,
  ratingCurrent: 4.8,
} as const;

export const sellerExtendedKpis = {
  mtdRevenue: 89432,
  mtdRevenueChange: 12.4,
  mtdOrders: 612,
  mtdOrdersChange: 8.6,
  avgOrderValue: 146.2,
  aovChange: 3.2,
  conversionRate: 3.8,
  conversionChange: 0.4,
  retentionRate: 78,
  retentionChange: 4.1,
  repeatCustomerRate: 52,
  repeatChange: 2.8,
  customerLifetimeValue: 284,
  clvChange: 6.5,
  refundRate: 1.2,
  refundChange: -0.3,
  netEarnings: 78698,
  netChange: 11.2,
} as const;

export const sellerHealthBreakdown = [
  { label: "Fulfillment speed", score: 94, weight: 25 },
  { label: "Return rate", score: 88, weight: 20 },
  { label: "Customer rating", score: 96, weight: 25 },
  { label: "Stock availability", score: 85, weight: 15 },
  { label: "Response time", score: 91, weight: 15 },
] as const;

export const sellerFulfillmentMetrics = {
  avgDispatchHours: 4.2,
  onTimeDelivery: 96.4,
  returnRate: 1.2,
  cancellationRate: 0.8,
  openShipments: 14,
  avgRating: 4.8,
} as const;

export const sellerRecentActivity = [
  { time: "2 min ago", timeFr: "Il y a 2 min", text: "New order ORD-2024-089 — $189.00", textFr: "Nouvelle commande ORD-2024-089 — 189 $" },
  { time: "18 min ago", timeFr: "Il y a 18 min", text: "Payout PAY-002 approved — $8,500", textFr: "Paiement PAY-002 approuvé — 8 500 $" },
  { time: "1 hr ago", timeFr: "Il y a 1 h", text: "Low stock alert: Galaxy Buds Pro (8 left)", textFr: "Alerte stock : Galaxy Buds Pro (8 restants)" },
  { time: "2 hr ago", timeFr: "Il y a 2 h", text: "Review received — 5★ on Galaxy S24", textFr: "Avis reçu — 5★ sur Galaxy S24" },
  { time: "3 hr ago", timeFr: "Il y a 3 h", text: "Promotion Summer Sale hit 45 orders", textFr: "Promo Summer Sale : 45 commandes" },
] as const;

export const sellerTopProductsChart = [
  { name: "Galaxy S24 Ultra", sold: 342, revenue: 410400 },
  { name: "Galaxy Buds Pro", sold: 218, revenue: 43600 },
  { name: "Galaxy Watch 6", sold: 156, revenue: 46800 },
  { name: "USB-C Hub", sold: 412, revenue: 12360 },
  { name: "Phone Case Pro", sold: 890, revenue: 17800 },
] as const;

// ─── Product Analytics ───────────────────────────────────────────────────────

export const sellerProductKpis = {
  totalProducts: 48,
  activeListings: 42,
  totalViews: 48200,
  viewsChange: 14.2,
  totalOrders: 3840,
  ordersChange: 8.6,
  avgConversion: 4.2,
  conversionChange: 0.6,
  avgRating: 4.7,
  ratingChange: 0.2,
  returnRate: 1.4,
  returnChange: -0.3,
  avgMargin: 22.8,
  marginChange: 1.1,
} as const;

export const sellerProductPerformance = [
  { id: 1, name: "Galaxy S24 Ultra", sku: "SAM-S24U-256", category: "Smartphones", categoryFr: "Smartphones", views: 12400, orders: 342, sold: 342, revenue: 410400, conversion: 2.8, rating: 4.9, returnRate: 0.8, trend: 18.4 },
  { id: 2, name: "Galaxy Buds Pro", sku: "SAM-BUDS-PRO", category: "Audio", categoryFr: "Audio", views: 8900, orders: 218, sold: 218, revenue: 43600, conversion: 2.5, rating: 4.7, returnRate: 1.2, trend: 12.1 },
  { id: 3, name: "Galaxy Watch 6", sku: "SAM-WATCH-6", category: "Wearables", categoryFr: "Objets connectés", views: 6200, orders: 156, sold: 156, revenue: 46800, conversion: 2.5, rating: 4.8, returnRate: 0.9, trend: 9.8 },
  { id: 4, name: "USB-C Hub", sku: "ACC-HUB-7P", category: "Accessories", categoryFr: "Accessoires", views: 5400, orders: 412, sold: 412, revenue: 12360, conversion: 7.6, rating: 4.5, returnRate: 2.1, trend: 22.3 },
  { id: 5, name: "Phone Case Pro", sku: "ACC-CASE-PRO", category: "Accessories", categoryFr: "Accessoires", views: 9800, orders: 890, sold: 890, revenue: 17800, conversion: 9.1, rating: 4.6, returnRate: 1.8, trend: 15.6 },
  { id: 6, name: "Wireless Charger", sku: "ACC-WC-15W", category: "Accessories", categoryFr: "Accessoires", views: 3200, orders: 186, sold: 186, revenue: 9300, conversion: 5.8, rating: 4.4, returnRate: 2.4, trend: 6.2 },
  { id: 7, name: "Galaxy Tab S9", sku: "SAM-TAB-S9", category: "Tablets", categoryFr: "Tablettes", views: 4100, orders: 89, sold: 89, revenue: 62300, conversion: 2.2, rating: 4.8, returnRate: 1.0, trend: 4.1 },
  { id: 8, name: "Screen Protector Kit", sku: "ACC-SP-KIT", category: "Accessories", categoryFr: "Accessoires", views: 7600, orders: 520, sold: 520, revenue: 7800, conversion: 6.8, rating: 4.3, returnRate: 3.2, trend: -2.4 },
] as const;

export const sellerWorstProducts = [
  { id: 9, name: "Legacy Earbuds", sku: "SAM-EAR-OLD", views: 2100, orders: 12, sold: 12, revenue: 960, conversion: 0.6, rating: 3.8, returnRate: 8.2 },
  { id: 10, name: "Basic Phone Stand", sku: "ACC-STAND-B", views: 1800, orders: 18, sold: 18, revenue: 540, conversion: 1.0, rating: 4.0, returnRate: 5.1 },
  { id: 11, name: "Micro USB Cable", sku: "ACC-MUSB-1M", views: 3200, orders: 24, sold: 24, revenue: 480, conversion: 0.8, rating: 3.9, returnRate: 4.6 },
] as const;

export const sellerProductViewTrend = [
  { label: "Week 1", views: 10200, orders: 820 },
  { label: "Week 2", views: 11400, orders: 910 },
  { label: "Week 3", views: 12100, orders: 980 },
  { label: "Week 4", views: 14500, orders: 1130 },
] as const;

export const sellerProductCategoryBreakdown = [
  { category: "Smartphones", categoryFr: "Smartphones", products: 8, revenue: 412000, sold: 892, avgRating: 4.8 },
  { category: "Audio", categoryFr: "Audio", products: 12, revenue: 186000, sold: 1240, avgRating: 4.6 },
  { category: "Accessories", categoryFr: "Accessoires", products: 18, revenue: 142000, sold: 2100, avgRating: 4.4 },
  { category: "Wearables", categoryFr: "Objets connectés", products: 6, revenue: 98000, sold: 680, avgRating: 4.7 },
  { category: "Tablets", categoryFr: "Tablettes", products: 4, revenue: 56320, sold: 420, avgRating: 4.5 },
] as const;

// ─── Revenue Analytics ───────────────────────────────────────────────────────

export const sellerRevenueKpis = {
  grossRevenue: 89432,
  grossChange: 12.4,
  netRevenue: 78698,
  netChange: 11.2,
  commissionPaid: 10734,
  commissionChange: 8.1,
  refunds: 1072,
  refundChange: -4.2,
  avgOrderValue: 146.2,
  aovChange: 3.2,
  payoutPending: 24500,
  payoutChange: 6.8,
  profitMargin: 22.8,
  marginChange: 1.1,
} as const;

export const sellerRevenueByPayment = [
  { method: "Mobile Money", methodFr: "Mobile Money", revenue: 42800, pct: 48, orders: 312 },
  { method: "Card", methodFr: "Carte bancaire", revenue: 26800, pct: 30, orders: 186 },
  { method: "Pay at Delivery", methodFr: "Paiement à la livraison", revenue: 14200, pct: 16, orders: 98 },
  { method: "Wallet", methodFr: "Portefeuille", revenue: 5632, pct: 6, orders: 16 },
] as const;

export const sellerRevenueByChannel = [
  { channel: "Organic search", channelFr: "Recherche organique", revenue: 31200, pct: 35 },
  { channel: "Direct", channelFr: "Direct", revenue: 22400, pct: 25 },
  { channel: "Promotions", channelFr: "Promotions", revenue: 19600, pct: 22 },
  { channel: "Referral", channelFr: "Parrainage", revenue: 11200, pct: 12 },
  { channel: "Social", channelFr: "Réseaux sociaux", revenue: 5032, pct: 6 },
] as const;

export const sellerDailyRevenue = [
  { label: "Mon", gross: 12400, net: 10912, refunds: 320 },
  { label: "Tue", gross: 11800, net: 10384, refunds: 180 },
  { label: "Wed", gross: 13200, net: 11616, refunds: 240 },
  { label: "Thu", gross: 14100, net: 12408, refunds: 420 },
  { label: "Fri", gross: 15600, net: 13728, refunds: 280 },
  { label: "Sat", gross: 11200, net: 9856, refunds: 160 },
  { label: "Sun", gross: 11132, net: 9804, refunds: 472 },
] as const;

export const sellerRevenueTransactions = [
  { id: "TXN-8841", date: "2024-06-29", type: "Sale", typeFr: "Vente", orderId: "ORD-2024-089", amount: 189, commission: 22.68, net: 166.32, method: "Mobile Money", methodFr: "Mobile Money" },
  { id: "TXN-8840", date: "2024-06-29", type: "Sale", typeFr: "Vente", orderId: "ORD-2024-088", amount: 1200, commission: 144, net: 1056, method: "Card", methodFr: "Carte bancaire" },
  { id: "TXN-8839", date: "2024-06-28", type: "Refund", typeFr: "Remboursement", orderId: "ORD-2024-072", amount: -89, commission: 0, net: -89, method: "Mobile Money", methodFr: "Mobile Money" },
  { id: "TXN-8838", date: "2024-06-28", type: "Sale", typeFr: "Vente", orderId: "ORD-2024-087", amount: 45, commission: 5.4, net: 39.6, method: "Wallet", methodFr: "Portefeuille" },
  { id: "TXN-8837", date: "2024-06-27", type: "Payout", typeFr: "Versement", orderId: "PAY-002", amount: -8500, commission: 0, net: -8500, method: "Bank transfer", methodFr: "Virement bancaire" },
  { id: "TXN-8836", date: "2024-06-27", type: "Sale", typeFr: "Vente", orderId: "ORD-2024-086", amount: 320, commission: 38.4, net: 281.6, method: "Pay at delivery", methodFr: "Paiement à la livraison" },
] as const;

// ─── Customer Analytics ──────────────────────────────────────────────────────

export const sellerCustomerKpis = {
  totalCustomers: 1478,
  totalChange: 9.4,
  newCustomers: 342,
  newChange: 14.8,
  returningCustomers: 891,
  returningChange: 6.2,
  repeatRate: 52,
  repeatChange: 2.8,
  avgOrdersPerCustomer: 2.6,
  ordersPerCustomerChange: 0.3,
  clv: 284,
  clvChange: 6.5,
  churnRate: 22,
  churnChange: -4.1,
} as const;

export const sellerTopCustomers = [
  { id: "CUST-1042", name: "Marie Kabongo", orders: 18, spent: 4820, lastOrder: "2024-06-28", segment: "VIP", segmentFr: "VIP" },
  { id: "CUST-0891", name: "Jean Mukendi", orders: 14, spent: 3640, lastOrder: "2024-06-27", segment: "Returning", segmentFr: "Récurrent" },
  { id: "CUST-1203", name: "Grace Mbuyi", orders: 12, spent: 2890, lastOrder: "2024-06-26", segment: "Returning", segmentFr: "Récurrent" },
  { id: "CUST-0756", name: "Patrick Ilunga", orders: 11, spent: 2450, lastOrder: "2024-06-25", segment: "Returning", segmentFr: "Récurrent" },
  { id: "CUST-1334", name: "Sophie Tshilombo", orders: 9, spent: 1980, lastOrder: "2024-06-24", segment: "New", segmentFr: "Nouveau" },
  { id: "CUST-0612", name: "David Kasongo", orders: 8, spent: 1720, lastOrder: "2024-06-22", segment: "At-risk", segmentFr: "À risque" },
] as const;

export const sellerCustomerGeography = [
  { city: "Kinshasa", cityFr: "Kinshasa", customers: 892, pct: 60, revenue: 53659 },
  { city: "Lubumbashi", cityFr: "Lubumbashi", customers: 234, pct: 16, revenue: 14309 },
  { city: "Goma", cityFr: "Goma", customers: 156, pct: 11, revenue: 9820 },
  { city: "Bukavu", cityFr: "Bukavu", customers: 98, pct: 7, revenue: 6240 },
  { city: "Other", cityFr: "Autres", customers: 98, pct: 6, revenue: 5404 },
] as const;

export const sellerCustomerCohorts = [
  { cohort: "Jan 2024", month1: 100, month2: 68, month3: 52, month4: 45, month5: 41, month6: 38 },
  { cohort: "Feb 2024", month1: 100, month2: 72, month3: 58, month4: 48, month5: 44, month6: 0 },
  { cohort: "Mar 2024", month1: 100, month2: 74, month3: 61, month4: 52, month5: 0, month6: 0 },
  { cohort: "Apr 2024", month1: 100, month2: 76, month3: 64, month4: 0, month5: 0, month6: 0 },
  { cohort: "May 2024", month1: 100, month2: 78, month3: 0, month4: 0, month5: 0, month6: 0 },
  { cohort: "Jun 2024", month1: 100, month2: 0, month3: 0, month4: 0, month5: 0, month6: 0 },
] as const;

export const sellerCustomerAcquisition = [
  { source: "Organic", sourceFr: "Organique", customers: 520, pct: 35, cost: 0 },
  { source: "Referral", sourceFr: "Parrainage", customers: 312, pct: 21, cost: 1240 },
  { source: "Promotions", sourceFr: "Promotions", customers: 398, pct: 27, cost: 3980 },
  { source: "Social ads", sourceFr: "Pub sociale", customers: 168, pct: 11, cost: 3360 },
  { source: "Direct", sourceFr: "Direct", customers: 80, pct: 6, cost: 0 },
] as const;

// ─── Inventory Analytics ─────────────────────────────────────────────────────

export const sellerInventoryKpis = {
  totalSkus: 48,
  totalUnits: 2840,
  unitsChange: -2.4,
  availableUnits: 1920,
  reservedUnits: 420,
  lowStockSkus: 6,
  lowStockChange: 1,
  outOfStockSkus: 2,
  turnoverRate: 4.2,
  turnoverChange: 0.6,
  avgDaysOnHand: 28,
  daysChange: -3.2,
  stockValue: 428600,
  valueChange: 5.8,
} as const;

export const sellerStockAging = [
  { bucket: "0–30 days", bucketFr: "0–30 jours", units: 1680, pct: 59, value: 252400 },
  { bucket: "31–60 days", bucketFr: "31–60 jours", units: 720, pct: 25, value: 108200 },
  { bucket: "61–90 days", bucketFr: "61–90 jours", units: 320, pct: 11, value: 48200 },
  { bucket: "90+ days", bucketFr: "90+ jours", units: 120, pct: 5, value: 19800 },
] as const;

export const sellerInventoryTurnover = [
  { sku: "SAM-S24U-256", product: "Galaxy S24 Ultra", sold: 342, onHand: 48, turnover: 7.1, daysOnHand: 5 },
  { sku: "ACC-CASE-PRO", product: "Phone Case Pro", sold: 890, onHand: 120, turnover: 7.4, daysOnHand: 5 },
  { sku: "SAM-BUDS-PRO", product: "Galaxy Buds Pro", sold: 218, onHand: 8, turnover: 27.3, daysOnHand: 1 },
  { sku: "ACC-HUB-7P", product: "USB-C Hub", sold: 412, onHand: 86, turnover: 4.8, daysOnHand: 8 },
  { sku: "SAM-WATCH-6", product: "Galaxy Watch 6", sold: 156, onHand: 32, turnover: 4.9, daysOnHand: 7 },
  { sku: "ACC-MUSB-1M", product: "Micro USB Cable", sold: 24, onHand: 180, turnover: 0.1, daysOnHand: 90 },
] as const;

export const sellerReplenishmentAlerts = [
  { sku: "SAM-BUDS-PRO", product: "Galaxy Buds Pro", onHand: 8, threshold: 15, suggested: 50, leadDays: 3, priority: "Critical", priorityFr: "Critique" },
  { sku: "SAM-S24U-256", product: "Galaxy S24 Ultra", onHand: 48, threshold: 20, suggested: 30, leadDays: 5, priority: "Low", priorityFr: "Faible" },
  { sku: "ACC-WC-15W", product: "Wireless Charger", onHand: 12, threshold: 20, suggested: 40, leadDays: 4, priority: "High", priorityFr: "Élevée" },
  { sku: "SAM-TAB-S9", product: "Galaxy Tab S9", onHand: 6, threshold: 10, suggested: 25, leadDays: 7, priority: "Critical", priorityFr: "Critique" },
] as const;

export const sellerInventoryMovementTrend = [
  { label: "Week 1", received: 120, sold: 186, returned: 12 },
  { label: "Week 2", received: 80, sold: 210, returned: 8 },
  { label: "Week 3", received: 200, sold: 198, returned: 14 },
  { label: "Week 4", received: 60, sold: 224, returned: 6 },
] as const;
