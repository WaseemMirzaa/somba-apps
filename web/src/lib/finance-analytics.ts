/** Finance dashboard mock data — trends, breakdowns and aging for the
 *  Finance department. All figures are illustrative (prototype). */

export const financeKpis = {
  grossRevenue: 2840000,
  grossChange: 8.2,
  netRevenue: 2323000,
  netChange: 7.4,
  commissionEarned: 428000,
  commissionChange: 11.8,
  refundsMtd: 89000,
  refundsChange: -4.1,
  pendingPayouts: 340000,
  outstanding: 125000,
  taxWithheld: 64200,
  disputeHold: 38400,
};

/** 8-week series: gross revenue, seller payouts, refunds, net to platform. */
export const financeTrend = [
  { label: "W1", revenue: 286000, payouts: 188000, refunds: 9200, net: 232000 },
  { label: "W2", revenue: 312000, payouts: 205000, refunds: 10400, net: 254000 },
  { label: "W3", revenue: 298000, payouts: 196000, refunds: 8800, net: 243000 },
  { label: "W4", revenue: 341000, payouts: 224000, refunds: 12600, net: 276000 },
  { label: "W5", revenue: 357000, payouts: 235000, refunds: 11900, net: 289000 },
  { label: "W6", revenue: 372000, payouts: 244000, refunds: 13200, net: 301000 },
  { label: "W7", revenue: 389000, payouts: 255000, refunds: 12100, net: 318000 },
  { label: "W8", revenue: 408000, payouts: 268000, refunds: 14000, net: 332000 },
] as const;

/** Revenue vs payouts, shaped for DualMetricChart (revenue bars + payouts line). */
export const revenueVsPayouts = financeTrend.map((d) => ({
  label: d.label,
  revenue: d.revenue,
  orders: d.payouts,
}));

/** Commission earned by category — SegmentDonut. */
export const commissionByCategory = [
  { label: "Electronics", labelFr: "Électronique", pct: 34, color: "#1d4ed8" },
  { label: "Fashion", labelFr: "Mode", pct: 24, color: "#7c3aed" },
  { label: "Home & Living", labelFr: "Maison", pct: 16, color: "#0891b2" },
  { label: "Beauty", labelFr: "Beauté", pct: 12, color: "#db2777" },
  { label: "Grocery", labelFr: "Épicerie", pct: 8, color: "#16a34a" },
  { label: "Other", labelFr: "Autre", pct: 6, color: "#94a3b8" },
] as const;

/** Payment method split (share of collected volume). */
export const paymentMethodSplit = [
  { label: "Card (Stripe)", labelFr: "Carte (Stripe)", pct: 52, color: "#1d4ed8" },
  { label: "Airtel Money", labelFr: "Airtel Money", pct: 21, color: "#dc2626" },
  { label: "Orange Money", labelFr: "Orange Money", pct: 18, color: "#ea580c" },
  { label: "Vodacom M-Pesa", labelFr: "Vodacom M-Pesa", pct: 9, color: "#16a34a" },
] as const;

/** Settlement aging — pending payouts by age cohort. */
export const settlementAging = [
  { bucket: "0–7 days", bucketFr: "0–7 jours", amount: 182000 },
  { bucket: "8–14 days", bucketFr: "8–14 jours", amount: 96000 },
  { bucket: "15–30 days", bucketFr: "15–30 jours", amount: 41000 },
  { bucket: "30+ days", bucketFr: "30+ jours", amount: 21000 },
] as const;

/** Cash-flow breakdown gross → net, shaped for FunnelChart. */
export const cashFlowStages = [
  { stage: "Gross revenue", stageFr: "Chiffre brut", count: 2840000, pct: 100 },
  { stage: "After seller payouts", stageFr: "Après versements", count: 1972000, pct: 69 },
  { stage: "After refunds", stageFr: "Après remboursements", count: 1883000, pct: 66 },
  { stage: "After tax withheld", stageFr: "Après retenue fiscale", count: 1818800, pct: 64 },
  { stage: "Net to platform", stageFr: "Net plateforme", count: 1780400, pct: 63 },
] as const;

/** Top refund reasons (count). */
export const refundReasons = [
  { reason: "Not as described", reasonFr: "Non conforme", count: 142 },
  { reason: "Defective", reasonFr: "Défectueux", count: 98 },
  { reason: "Wrong item", reasonFr: "Mauvais article", count: 64 },
  { reason: "Late delivery", reasonFr: "Livraison tardive", count: 41 },
  { reason: "Changed mind", reasonFr: "Changement d'avis", count: 29 },
] as const;
