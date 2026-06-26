/** Rider dashboard analytics mock data */

export const riderEarningsTrend = [
  { label: "Mon", labelFr: "Lun", revenue: 68, orders: 12 },
  { label: "Tue", labelFr: "Mar", revenue: 82, orders: 15 },
  { label: "Wed", labelFr: "Mer", revenue: 74, orders: 13 },
  { label: "Thu", labelFr: "Jeu", revenue: 96, orders: 18 },
  { label: "Fri", labelFr: "Ven", revenue: 108, orders: 20 },
  { label: "Sat", labelFr: "Sam", revenue: 124, orders: 22 },
  { label: "Sun", labelFr: "Dim", revenue: 58, orders: 10 },
] as const;

export const riderExtendedKpis = {
  deliveriesToday: 18,
  deliveriesChange: 12.5,
  earningsToday: 96,
  earningsChange: 8.2,
  onTimeRate: 94.4,
  onTimeChange: 2.1,
  avgDeliveryMin: 28,
  avgChange: -3.2,
  rating: 4.9,
  ratingChange: 0.1,
  failedToday: 1,
  incentives: 24,
} as const;

export const riderTaskBreakdown = [
  { type: "Standard delivery", typeFr: "Livraison standard", count: 12, pct: 67 },
  { type: "Returns pickup", typeFr: "Collecte retours", count: 3, pct: 17 },
  { type: "Open-box confirm", typeFr: "Confirmation open-box", count: 5, pct: 28 },
] as const;

export const riderZonePerformance = [
  { zone: "Zone A — Centre", deliveries: 8, avgMin: 22 },
  { zone: "Zone B — Nord", deliveries: 5, avgMin: 31 },
  { zone: "Zone C — Sud", deliveries: 5, avgMin: 28 },
] as const;

export const riderRecentActivity = [
  { time: "8 min ago", timeFr: "Il y a 8 min", text: "Delivered ORD-2024-089", textFr: "Livré ORD-2024-089" },
  { time: "32 min ago", timeFr: "Il y a 32 min", text: "Picked up return RET-014", textFr: "Retour RET-014 collecté" },
  { time: "1 hr ago", timeFr: "Il y a 1 h", text: "Bonus earned — 5 on-time streak", textFr: "Bonus — 5 livraisons à l'heure" },
] as const;
