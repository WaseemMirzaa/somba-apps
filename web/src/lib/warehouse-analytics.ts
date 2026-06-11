/** Warehouse dashboard analytics mock data */

export const warehouseThroughputTrend = [
  { label: "Mon", revenue: 420, orders: 186 },
  { label: "Tue", revenue: 512, orders: 224 },
  { label: "Wed", revenue: 478, orders: 208 },
  { label: "Thu", revenue: 590, orders: 262 },
  { label: "Fri", revenue: 640, orders: 288 },
  { label: "Sat", revenue: 710, orders: 312 },
  { label: "Sun", revenue: 384, orders: 168 },
] as const;

export const warehouseExtendedKpis = {
  receivedToday: 342,
  receivedChange: 8.4,
  dispatchedToday: 298,
  dispatchedChange: 12.1,
  onTimeRate: 96.4,
  onTimeChange: 1.2,
  codCollected: 18420,
  codChange: 9.8,
  returnRate: 1.8,
  returnChange: -0.4,
  avgProcessHours: 4.2,
  processChange: -0.6,
  activeBatches: 14,
  agedParcels: 6,
} as const;

export const warehouseLaneUtilization = [
  { lane: "Lane A — Express", laneFr: "Voie A — Express", pct: 92, parcels: 142 },
  { lane: "Lane B — Standard", laneFr: "Voie B — Standard", pct: 78, parcels: 218 },
  { lane: "Lane C — Bulk", laneFr: "Voie C — Vrac", pct: 64, parcels: 96 },
  { lane: "Lane D — Returns", laneFr: "Voie D — Retours", pct: 45, parcels: 38 },
] as const;

export const warehouseRiderPerformance = [
  { name: "Jean M.", deliveries: 28, onTime: 96 },
  { name: "Paul K.", deliveries: 24, onTime: 94 },
  { name: "Marc L.", deliveries: 22, onTime: 98 },
  { name: "David R.", deliveries: 19, onTime: 91 },
] as const;

export const warehouseHealthBreakdown = [
  { label: "Inbound SLA", labelFr: "SLA entrée", score: 93 },
  { label: "Sort accuracy", labelFr: "Précision tri", score: 97 },
  { label: "Dispatch speed", labelFr: "Vitesse expédition", score: 91 },
  { label: "COD accuracy", labelFr: "Précision COD", score: 98 },
  { label: "Exception resolution", labelFr: "Résolution exceptions", score: 86 },
] as const;

export const warehouseRecentActivity = [
  { time: "5 min ago", timeFr: "Il y a 5 min", text: "Batch BAT-042 dispatched — 48 parcels", textFr: "Lot BAT-042 expédié — 48 colis" },
  { time: "20 min ago", timeFr: "Il y a 20 min", text: "Inbound SHP-881 received — 120 items", textFr: "Réception SHP-881 — 120 articles" },
  { time: "45 min ago", timeFr: "Il y a 45 min", text: "Exception flagged — damaged parcel PRC-229", textFr: "Exception — colis endommagé PRC-229" },
  { time: "1 hr ago", timeFr: "Il y a 1 h", text: "COD reconciliation — $2,840 collected", textFr: "Rapprochement COD — 2 840 $ encaissés" },
] as const;
