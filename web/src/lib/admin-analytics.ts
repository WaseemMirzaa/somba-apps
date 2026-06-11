/** Admin dashboard analytics mock data */

export const adminRevenueTrend = [
  { label: "Jun 1", revenue: 84200, orders: 312 },
  { label: "Jun 5", revenue: 92100, orders: 348 },
  { label: "Jun 9", revenue: 88400, orders: 329 },
  { label: "Jun 13", revenue: 95800, orders: 371 },
  { label: "Jun 17", revenue: 102400, orders: 402 },
  { label: "Jun 21", revenue: 108200, orders: 428 },
  { label: "Jun 25", revenue: 112800, orders: 451 },
  { label: "Jun 29", revenue: 118400, orders: 476 },
] as const;

export const adminExtendedKpis = {
  gmvMtd: 2840000,
  gmvChange: 14.3,
  ordersMtd: 18420,
  ordersChange: 9.1,
  activeSellers: 1247,
  sellersChange: 6.2,
  activeCustomers: 48200,
  customersChange: 11.4,
  conversionRate: 3.8,
  conversionChange: 0.4,
  pendingApprovals: 23,
  fraudFlags: 7,
  returnRate: 2.1,
  returnChange: -0.3,
  avgOrderValue: 154.2,
  aovChange: 4.8,
} as const;

export const adminSellerGrowth = [
  { month: "Jan", sellers: 980, retention: 88 },
  { month: "Feb", sellers: 1020, retention: 89 },
  { month: "Mar", sellers: 1080, retention: 90 },
  { month: "Apr", sellers: 1140, retention: 91 },
  { month: "May", sellers: 1195, retention: 92 },
  { month: "Jun", sellers: 1247, retention: 93 },
] as const;

export const adminCategoryGmv = [
  { category: "Electronics", gmv: 890000, pct: 38 },
  { category: "Fashion", gmv: 420000, pct: 18 },
  { category: "Home & Living", gmv: 310000, pct: 13 },
  { category: "Beauty", gmv: 180000, pct: 8 },
  { category: "Grocery", gmv: 520000, pct: 22 },
] as const;

export const adminOrderFunnel = [
  { stage: "Site visits", stageFr: "Visites", count: 482000, pct: 100 },
  { stage: "Product views", stageFr: "Vues produit", count: 124000, pct: 25.7 },
  { stage: "Add to cart", stageFr: "Panier", count: 38200, pct: 7.9 },
  { stage: "Orders placed", stageFr: "Commandes", count: 18420, pct: 3.8 },
  { stage: "Delivered", stageFr: "Livrées", count: 17280, pct: 3.6 },
] as const;

export const adminFulfillmentHealth = [
  { label: "On-time dispatch", labelFr: "Expédition à l'heure", score: 94 },
  { label: "Warehouse capacity", labelFr: "Capacité entrepôt", score: 87 },
  { label: "Rider availability", labelFr: "Disponibilité livreurs", score: 91 },
  { label: "COD reconciliation", labelFr: "Réconciliation COD", score: 96 },
  { label: "Return resolution", labelFr: "Résolution retours", score: 89 },
] as const;

export const adminRecentActivity = [
  { time: "3 min ago", timeFr: "Il y a 3 min", text: "New seller application — Fashion Hub", textFr: "Nouvelle candidature vendeur — Fashion Hub" },
  { time: "12 min ago", timeFr: "Il y a 12 min", text: "Fraud flag on ORD-2024-112 — COD review", textFr: "Alerte fraude ORD-2024-112 — revue COD" },
  { time: "28 min ago", timeFr: "Il y a 28 min", text: "Warehouse Kinshasa — 142 parcels dispatched", textFr: "Entrepôt Kinshasa — 142 colis expédiés" },
  { time: "1 hr ago", timeFr: "Il y a 1 h", text: "Flash sale campaign live — 2.4k views", textFr: "Campagne flash sale — 2,4k vues" },
  { time: "2 hr ago", timeFr: "Il y a 2 h", text: "Payout batch PAY-2406 approved — $84,200", textFr: "Lot paiements PAY-2406 — 84 200 $" },
] as const;

export const adminGoals = {
  gmvTarget: 3200000,
  gmvCurrent: 2840000,
  sellersTarget: 1400,
  sellersCurrent: 1247,
  ordersTarget: 20000,
  ordersCurrent: 18420,
} as const;
