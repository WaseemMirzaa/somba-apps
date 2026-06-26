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
  { category: "Electronics", categoryFr: "Électronique", gmv: 890000, pct: 38 },
  { category: "Fashion", categoryFr: "Mode", gmv: 420000, pct: 18 },
  { category: "Home & Living", categoryFr: "Maison & Décoration", gmv: 310000, pct: 13 },
  { category: "Beauty", categoryFr: "Beauté", gmv: 180000, pct: 8 },
  { category: "Grocery", categoryFr: "Épicerie", gmv: 520000, pct: 22 },
] as const;

export const adminOrderFunnel = [
  { stage: "Site visits", stageFr: "Visites", count: 482000, pct: 100 },
  { stage: "Product views", stageFr: "Vues produit", count: 124000, pct: 25.7 },
  { stage: "Add to cart", stageFr: "Panier", count: 38200, pct: 7.9 },
  { stage: "Orders placed", stageFr: "Commandes", count: 18420, pct: 3.8 },
  { stage: "Delivered", stageFr: "Livrées", count: 17280, pct: 3.6 },
] as const;

export const adminFulfillmentHealth = [
  { label: "On-time dispatch", labelFr: "Expédition à temps", score: 94 },
  { label: "Warehouse capacity", labelFr: "Capacité entrepôt", score: 87 },
  { label: "Rider availability", labelFr: "Disponibilité livreurs", score: 91 },
  { label: "Payment reconciliation", labelFr: "Rapprochement paiements", score: 96 },
  { label: "Return resolution", labelFr: "Résolution des retours", score: 89 },
] as const;

export const adminRecentActivity = [
  { time: "3 min ago", timeFr: "Il y a 3 min", text: "New seller application — Fashion Hub", textFr: "Nouvelle candidature vendeur — Fashion Hub" },
  { time: "12 min ago", timeFr: "Il y a 12 min", text: "Fraud flag on ORD-2024-112 — payment review", textFr: "Alerte fraude ORD-2024-112 — revue paiement" },
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

export const adminMarketplaceHealth = {
  overallScore: 91,
  fulfillmentScore: 94,
  sellerQualityScore: 88,
  customerTrustScore: 92,
  paymentHealthScore: 96,
  disputeRate: 0.8,
  avgResolutionHours: 18.4,
} as const;

export const adminCustomerSegments = [
  { id: "active", label: "Active buyers", labelFr: "Acheteurs actifs", value: 28400, pct: 59, color: "#059669" },
  { id: "new", label: "New (30d)", labelFr: "Nouveaux (30j)", value: 8420, pct: 17, color: "#1d4ed8" },
  { id: "returning", label: "Returning", labelFr: "Récurrents", value: 9680, pct: 20, color: "#7c3aed" },
  { id: "churned", label: "Churned (90d)", labelFr: "Perdus (90j)", value: 1700, pct: 4, color: "#94a3b8" },
] as const;

export const adminFulfillmentSlas = [
  { metric: "Dispatch within 24h", metricFr: "Expédition < 24h", target: 95, actual: 94.2, status: "warning" },
  { metric: "Delivery within SLA", metricFr: "Livraison dans SLA", target: 92, actual: 93.8, status: "ok" },
  { metric: "Return processing", metricFr: "Traitement retours", target: 90, actual: 89.1, status: "warning" },
  { metric: "Payment reconciliation", metricFr: "Réconciliation des paiements", target: 98, actual: 96.4, status: "ok" },
  { metric: "Warehouse capacity", metricFr: "Capacité entrepôt", target: 85, actual: 87.0, status: "ok" },
] as const;

export const adminReturnMetrics = {
  totalReturns: 386,
  returnRate: 2.1,
  returnChange: -0.3,
  avgResolutionDays: 4.2,
  refundAmount: 58420,
  exchangeRate: 38,
  topReason: "Wrong item",
  topReasonFr: "Mauvais article",
} as const;

export const adminReturnTrend = [
  { label: "Week 1", returns: 82, resolved: 74 },
  { label: "Week 2", returns: 94, resolved: 88 },
  { label: "Week 3", returns: 108, resolved: 98 },
  { label: "Week 4", returns: 102, resolved: 96 },
] as const;

export const adminTopSellers = [
  { id: "SEL-1042", name: "Tech Galaxy Store", gmv: 428000, orders: 1842, rating: 4.9, fulfillment: 98, returns: 0.8 },
  { id: "SEL-0891", name: "Fashion Hub DRC", gmv: 312000, orders: 1420, rating: 4.7, fulfillment: 96, returns: 1.2 },
  { id: "SEL-1203", name: "Home Essentials", gmv: 248000, orders: 980, rating: 4.8, fulfillment: 97, returns: 1.0 },
  { id: "SEL-0756", name: "Beauty Corner", gmv: 186000, orders: 820, rating: 4.6, fulfillment: 94, returns: 2.4 },
  { id: "SEL-1334", name: "Grocery Plus", gmv: 164000, orders: 2840, rating: 4.5, fulfillment: 92, returns: 1.8 },
  { id: "SEL-0612", name: "Sports Zone", gmv: 142000, orders: 640, rating: 4.7, fulfillment: 95, returns: 1.5 },
] as const;

export const adminRegionalGmv = [
  { region: "Kinshasa", regionFr: "Kinshasa", gmv: 1420000, pct: 50, orders: 9210 },
  { region: "Lubumbashi", regionFr: "Lubumbashi", gmv: 568000, pct: 20, orders: 3680 },
  { region: "Goma", regionFr: "Goma", gmv: 398000, pct: 14, orders: 2580 },
  { region: "Bukavu", regionFr: "Bukavu", gmv: 284000, pct: 10, orders: 1840 },
  { region: "Other", regionFr: "Autres", gmv: 170000, pct: 6, orders: 1110 },
] as const;

export const adminPendingActions = [
  { type: "Seller approval", typeFr: "Approbation vendeur", count: 12, priority: "High", priorityFr: "Élevée" },
  { type: "Product moderation", typeFr: "Modération produit", count: 8, priority: "Medium", priorityFr: "Moyenne" },
  { type: "Dispute escalation", typeFr: "Escalade litige", count: 5, priority: "Critical", priorityFr: "Critique" },
  { type: "Fraud review", typeFr: "Revue fraude", count: 7, priority: "Critical", priorityFr: "Critique" },
  { type: "Payout hold", typeFr: "Versement bloqué", count: 3, priority: "Medium", priorityFr: "Moyenne" },
] as const;

export const adminDashboardAlerts = [
  {
    id: "fraud-112",
    type: "fraud" as const,
    title: "Payment fraud flag — ORD-2024-112",
    titleFr: "Alerte fraude paiement — ORD-2024-112",
    detail: "Unusual repeat address · $420 high-value order",
    detailFr: "Adresse répétée · commande de 420 $",
    href: "/admin/fraud",
    priority: "Critical" as const,
    priorityFr: "Critique",
    time: "12 min ago",
    timeFr: "Il y a 12 min",
  },
  {
    id: "return-spike",
    type: "returns" as const,
    title: "Return spike — Fashion category",
    titleFr: "Pic de retours — Mode",
    detail: "3.2% return rate vs 2.1% avg",
    detailFr: "3,2 % vs moy. 2,1 %",
    href: "/admin/returns",
    priority: "High" as const,
    priorityFr: "Élevée",
    time: "45 min ago",
    timeFr: "Il y a 45 min",
  },
  {
    id: "dispute-esc",
    type: "dispute" as const,
    title: "Dispute escalation — DSP-0089",
    titleFr: "Escalade litige — DSP-0089",
    detail: "Seller vs buyer · 48h SLA breach",
    detailFr: "Vendeur vs acheteur · SLA 48h dépassé",
    href: "/admin/disputes",
    priority: "Critical" as const,
    priorityFr: "Critique",
    time: "1 hr ago",
    timeFr: "Il y a 1 h",
  },
  {
    id: "payout-hold",
    type: "payout" as const,
    title: "Payout hold — 3 sellers",
    titleFr: "Versements bloqués — 3 vendeurs",
    detail: "Compliance review pending",
    detailFr: "Revue conformité en attente",
    href: "/admin/payouts",
    priority: "Medium" as const,
    priorityFr: "Moyenne",
    time: "2 hr ago",
    timeFr: "Il y a 2 h",
  },
] as const;

export const adminPlatformKpis = {
  ...adminExtendedKpis,
  netRevenue: 2412000,
  netChange: 13.1,
  commissionEarned: 428000,
  commissionChange: 11.8,
  activeWarehouses: 8,
  warehousesChange: 0,
  disputeOpen: 14,
  disputeChange: -12.5,
  fulfillmentRate: 94.2,
  fulfillmentChange: 1.8,
  customerSatisfaction: 4.6,
  satisfactionChange: 0.2,
} as const;
