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
  { category: "Smartphones", revenue: 412000, pct: 46, orders: 892 },
  { category: "Audio", revenue: 186000, pct: 21, orders: 1240 },
  { category: "Accessories", revenue: 142000, pct: 16, orders: 2100 },
  { category: "Wearables", revenue: 98000, pct: 11, orders: 680 },
  { category: "Other", revenue: 56320, pct: 6, orders: 420 },
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
  { label: "Fulfillment speed", labelFr: "Vitesse fulfillment", score: 94, weight: 25 },
  { label: "Return rate", labelFr: "Taux de retour", score: 88, weight: 20 },
  { label: "Customer rating", labelFr: "Note clients", score: 96, weight: 25 },
  { label: "Stock availability", labelFr: "Disponibilité stock", score: 85, weight: 15 },
  { label: "Response time", labelFr: "Temps de réponse", score: 91, weight: 15 },
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
