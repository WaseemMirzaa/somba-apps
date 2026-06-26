/** Warehouse dashboard analytics mock data */

export const warehouseThroughputTrend = [
  { label: "Mon", labelFr: "Lun", revenue: 420, orders: 186 },
  { label: "Tue", labelFr: "Mar", revenue: 512, orders: 224 },
  { label: "Wed", labelFr: "Mer", revenue: 478, orders: 208 },
  { label: "Thu", labelFr: "Jeu", revenue: 590, orders: 262 },
  { label: "Fri", labelFr: "Ven", revenue: 640, orders: 288 },
  { label: "Sat", labelFr: "Sam", revenue: 710, orders: 312 },
  { label: "Sun", labelFr: "Dim", revenue: 384, orders: 168 },
] as const;

export const warehouseExtendedKpis = {
  receivedToday: 342,
  receivedChange: 8.4,
  dispatchedToday: 298,
  dispatchedChange: 12.1,
  onTimeRate: 96.4,
  onTimeChange: 1.2,
  returnRate: 1.8,
  returnChange: -0.4,
  avgProcessHours: 4.2,
  processChange: -0.6,
  activeBatches: 14,
  agedParcels: 6,
} as const;

export const warehouseLaneUtilization = [
  { lane: "Lane A — Express", laneFr: "Lane A — Express", pct: 92, parcels: 142 },
  { lane: "Lane B — Standard", laneFr: "Lane B — Standard", pct: 78, parcels: 218 },
  { lane: "Lane C — Bulk", laneFr: "Lane C — Volumineux", pct: 64, parcels: 96 },
  { lane: "Lane D — Returns", laneFr: "Lane D — Retours", pct: 45, parcels: 38 },
] as const;

export const warehouseRiderPerformance = [
  { name: "Jean M.", deliveries: 28, onTime: 96 },
  { name: "Paul K.", deliveries: 24, onTime: 94 },
  { name: "Marc L.", deliveries: 22, onTime: 98 },
  { name: "David R.", deliveries: 19, onTime: 91 },
] as const;

export const warehouseHealthBreakdown = [
  { label: "Inbound SLA", labelFr: "SLA réception", score: 93 },
  { label: "Sort accuracy", labelFr: "Précision tri", score: 97 },
  { label: "Dispatch speed", labelFr: "Vitesse expédition", score: 91 },
  { label: "Return processing", labelFr: "Traitement retours", score: 94 },
  { label: "Exception resolution", labelFr: "Résolution exceptions", score: 86 },
] as const;

export const warehouseRecentActivity = [
  { time: "5 min ago", timeFr: "Il y a 5 min", text: "Batch BAT-042 dispatched — 48 parcels", textFr: "Lot BAT-042 expédié — 48 colis" },
  { time: "20 min ago", timeFr: "Il y a 20 min", text: "Inbound SHP-881 received — 120 items", textFr: "Réception SHP-881 — 120 articles" },
  { time: "45 min ago", timeFr: "Il y a 45 min", text: "Exception flagged — damaged parcel PRC-229", textFr: "Exception — colis endommagé PRC-229" },
  { time: "1 hr ago", timeFr: "Il y a 1 h", text: "Return RET-002 received at hub — inspection queued", textFr: "Retour RET-002 reçu — inspection en attente" },
  { time: "2 hr ago", timeFr: "Il y a 2 h", text: "Rider Jean M. completed 28 deliveries — 96% on-time", textFr: "Livreur Jean M. — 28 livraisons, 96% à l'heure" },
] as const;

export const warehouseInboundDispatchTrend = [
  { label: "Mon", labelFr: "Lun", inbound: 342, dispatch: 298 },
  { label: "Tue", labelFr: "Mar", inbound: 368, dispatch: 312 },
  { label: "Wed", labelFr: "Mer", inbound: 310, dispatch: 286 },
  { label: "Thu", labelFr: "Jeu", inbound: 402, dispatch: 378 },
  { label: "Fri", labelFr: "Ven", inbound: 448, dispatch: 420 },
  { label: "Sat", labelFr: "Sam", inbound: 284, dispatch: 268 },
  { label: "Sun", labelFr: "Dim", inbound: 198, dispatch: 184 },
] as const;

export const warehouseSlaBreakdown = [
  { sla: "Receive within 4h", slaFr: "Réception < 4h", target: 98, actual: 97.2 },
  { sla: "Sort within 2h", slaFr: "Tri < 2h", target: 96, actual: 96.8 },
  { sla: "Dispatch same day", slaFr: "Expédition jour J", target: 94, actual: 93.4 },
  { sla: "Return inspection 24h", slaFr: "Inspection retour 24h", target: 90, actual: 91.2 },
  { sla: "Exception resolution 48h", slaFr: "Résolution exception 48h", target: 88, actual: 86.0 },
] as const;

export const warehouseExceptionMetrics = {
  openExceptions: 12,
  exceptionsChange: -8.3,
  avgResolutionHours: 14.6,
  resolutionChange: -12.4,
  damagedParcels: 4,
  lostParcels: 2,
  misrouted: 6,
  topCause: "Damaged in transit",
  topCauseFr: "Endommagé en transit",
} as const;

export const warehouseExceptionLog = [
  { id: "EXC-229", type: "Damaged", typeFr: "Endommagé", parcel: "PRC-229", age: "2h", status: "Open", statusFr: "Ouvert", priority: "High", priorityFr: "Élevée" },
  { id: "EXC-228", type: "Misrouted", typeFr: "Mauvaise route", parcel: "PRC-218", age: "6h", status: "In progress", statusFr: "En cours", priority: "Medium", priorityFr: "Moyenne" },
  { id: "EXC-227", type: "Lost scan", typeFr: "Scan perdu", parcel: "PRC-204", age: "12h", status: "Open", statusFr: "Ouvert", priority: "Critical", priorityFr: "Critique" },
  { id: "EXC-226", type: "Weight mismatch", typeFr: "Poids incorrect", parcel: "PRC-198", age: "1d", status: "Resolved", statusFr: "Résolu", priority: "Low", priorityFr: "Faible" },
] as const;

export const warehouseReturnMetrics = {
  pendingReturns: 38,
  returnsChange: 4.2,
  processedToday: 24,
  avgInspectionHours: 6.8,
  restockRate: 72,
  disposeRate: 18,
  returnToSellerRate: 10,
} as const;

export const warehouseReturnTrend = [
  { label: "Week 1", labelFr: "Semaine 1", received: 82, processed: 78 },
  { label: "Week 2", labelFr: "Semaine 2", received: 94, processed: 88 },
  { label: "Week 3", labelFr: "Semaine 3", received: 88, processed: 84 },
  { label: "Week 4", labelFr: "Semaine 4", received: 102, processed: 96 },
] as const;

export const warehouseTopBatches = [
  { id: "BAT-042", parcels: 48, rider: "Jean M.", status: "Dispatched", statusFr: "Expédié", onTime: 96 },
  { id: "BAT-041", parcels: 52, rider: "Paul K.", status: "Dispatched", statusFr: "Expédié", onTime: 94 },
  { id: "BAT-040", parcels: 38, rider: "Marc L.", status: "In transit", statusFr: "En transit", onTime: 98 },
  { id: "BAT-039", parcels: 44, rider: "David R.", status: "Building", statusFr: "En préparation", onTime: 0 },
  { id: "BAT-038", parcels: 36, rider: "Jean M.", status: "Delivered", statusFr: "Livré", onTime: 97 },
] as const;

export const warehouseRiderLeaderboard = [
  { id: "RDR-001", name: "Jean M.", deliveries: 28, onTime: 96, rating: 4.9, exceptions: 1 },
  { id: "RDR-002", name: "Paul K.", deliveries: 24, onTime: 94, rating: 4.8, exceptions: 2 },
  { id: "RDR-003", name: "Marc L.", deliveries: 22, onTime: 98, rating: 4.9, exceptions: 0 },
  { id: "RDR-004", name: "David R.", deliveries: 19, onTime: 91, rating: 4.6, exceptions: 3 },
  { id: "RDR-005", name: "Eric T.", deliveries: 18, onTime: 93, rating: 4.7, exceptions: 1 },
  { id: "RDR-006", name: "Fabrice N.", deliveries: 16, onTime: 95, rating: 4.8, exceptions: 0 },
] as const;

export const warehouseInboundByHour = [
  { hour: "06:00", parcels: 12 },
  { hour: "08:00", parcels: 48 },
  { hour: "10:00", parcels: 82 },
  { hour: "12:00", parcels: 64 },
  { hour: "14:00", parcels: 56 },
  { hour: "16:00", parcels: 42 },
  { hour: "18:00", parcels: 28 },
] as const;

export const warehouseDashboardAlerts = [
  {
    id: "exc-227",
    type: "exception" as const,
    title: "Lost scan — PRC-204",
    titleFr: "Scan perdu — PRC-204",
    detail: "12h unresolved · Critical",
    detailFr: "12h sans résolution · Critique",
    href: "/exceptions/EXC-227",
    priority: "Critical" as const,
    priorityFr: "Critique",
    time: "12 min ago",
    timeFr: "Il y a 12 min",
  },
  {
    id: "ret-spike",
    type: "returns" as const,
    title: "Return queue backlog — 38 pending",
    titleFr: "File retours — 38 en attente",
    detail: "Inspection SLA at risk",
    detailFr: "SLA inspection à risque",
    href: "/returns",
    priority: "High" as const,
    priorityFr: "Élevée",
    time: "30 min ago",
    timeFr: "Il y a 30 min",
  },
  {
    id: "aged-parcels",
    type: "aged" as const,
    title: "6 aged parcels — Lane C",
    titleFr: "6 colis vieillis — Lane C",
    detail: ">72h in sort lane",
    detailFr: ">72h en lane de tri",
    href: "/aged",
    priority: "Medium" as const,
    priorityFr: "Moyenne",
    time: "1 hr ago",
    timeFr: "Il y a 1 h",
  },
] as const;

export const warehouseDispatchQueue = [
  { id: "BAT-039", parcels: 44, rider: "David R.", zone: "Gombe", eta: "14:30", status: "Building", statusFr: "En préparation", priority: "High", priorityFr: "Élevée" },
  { id: "BAT-040", parcels: 38, rider: "Marc L.", zone: "Limete", eta: "15:00", status: "Ready", statusFr: "Prêt", priority: "Medium", priorityFr: "Moyenne" },
  { id: "BAT-041", parcels: 52, rider: "Paul K.", zone: "Ngaliema", eta: "15:30", status: "Ready", statusFr: "Prêt", priority: "Medium", priorityFr: "Moyenne" },
  { id: "BAT-042", parcels: 48, rider: "Jean M.", zone: "Masina", eta: "16:00", status: "Dispatched", statusFr: "Expédié", priority: "Low", priorityFr: "Faible" },
] as const;

export const warehouseGoals = {
  dispatchTarget: 320,
  dispatchCurrent: 298,
  inboundTarget: 360,
  inboundCurrent: 342,
  onTimeTarget: 95,
  onTimeCurrent: 96.4,
} as const;
