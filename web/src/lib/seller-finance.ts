"use client";

/**
 * Seller finance, straight from the server (docs/contracts/commerce.md §1): the balance and its rules, per-line earnings
 * with the clearance hold, monthly statements, transactions and commission invoices. Nothing here is computed in the
 * browser from a capped order list any more.
 */

import { useLiveQuery, sellerRequest, type LiveQuery } from "@/lib/seller-api";
import type { BadgeVariant } from "@/lib/seller-labels";

/** Pushes that can change a seller's money figures. */
export const FINANCE_PUSHES = ["payout:created", "payout:updated", "order:updated", "notification:new"];

// ─── Shapes ──────────────────────────────────────────────────────────────────
export interface FinanceSettings {
  currency: "USD";
  commissionPct: number;
  minPayoutUsd: number;
  payoutClearanceHours: number;
}

export interface FinanceBalance {
  earned: number;
  committed: number;
  available: number;
  owedUsd: number;
  commissionPct: number;
  commissionUsd: number;
  minPayoutUsd: number;
  holdHours: number;
  clearingUsd: number;
  nextClearanceAt: string | null;
  inProgressUsd: number;
}

export type EarningState = "in_progress" | "clearing" | "available" | "in_payout" | "paid_out" | "returned";
export const EARNING_STATES: EarningState[] = ["in_progress", "clearing", "available", "in_payout", "paid_out", "returned"];

export interface EarningRow {
  itemId: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  orderedAt: string;
  deliveredAt: string | null;
  productName: string;
  variant: string | null;
  qty: number;
  grossUsd: number;
  couponUsd: number;
  commissionPct: number;
  commissionUsd: number;
  netUsd: number;
  state: EarningState;
  clearanceEndsAt: string | null;
  payout: { id: string; reference: string; status: string } | null;
  paidOutAt: string | null;
}

export interface EarningsTotals {
  inProgressUsd: number;
  clearingUsd: number;
  availableUsd: number;
  inPayoutUsd: number;
  paidOutUsd: number;
  returnedUsd: number;
}

export interface EarningsPage {
  limit: number;
  offset: number;
  total: number;
  holdHours: number;
  items: EarningRow[];
  totals: EarningsTotals;
  balance: FinanceBalance;
}

export interface StatementMonth {
  month: string;
  orders: number;
  units: number;
  grossUsd: number;
  commissionUsd: number;
  refundsUsd: number;
  commissionCreditedUsd: number;
  netUsd: number;
}

export interface StatementLine {
  kind: "sale" | "refund";
  date: string;
  orderReference: string;
  productName: string;
  variant: string | null;
  qty: number;
  grossUsd: number;
  commissionPct: number;
  commissionUsd: number;
  netUsd: number;
}

export interface StatementDetail {
  currency: string;
  month: string;
  store: string | { name?: string } | null;
  totals: StatementMonth & { payoutsRequestedUsd: number; payoutsPaidUsd: number };
  lines: StatementLine[];
  payouts: { id: string; reference: string; amountUsd: number; method: string; status: string; createdAt: string }[];
}

export interface TxnRow {
  id: string;
  at: string;
  kind: "sale" | "refund" | "payout";
  reference: string;
  description: string;
  grossUsd: number;
  commissionUsd: number;
  amountUsd: number;
  status: string;
  counts: boolean;
}

export interface TxnPage {
  total: number;
  limit: number;
  offset: number;
  totals: { salesUsd: number; refundsUsd: number; payoutsUsd: number; netUsd: number };
  items: TxnRow[];
}

export interface TaxDocument {
  id: string;
  sellerId: string;
  period: string;
  number: string;
  locale: "en" | "fr";
  orders: number;
  units: number;
  grossUsd: number;
  commissionUsd: number;
  creditedUsd: number;
  netUsd: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxMonth {
  month: string;
  orders: number;
  commissionUsd: number;
  hasSales: boolean;
  documentId: string | null;
  url: string | null;
}

export interface PayoutAccount {
  method: "bank" | "mobile_money" | null;
  account: string | null;
  masked: string | null;
  set: boolean;
}

// ─── Labels (EN / FR) ────────────────────────────────────────────────────────
const STATE: Record<EarningState, { en: string; fr: string; variant: BadgeVariant }> = {
  in_progress: { en: "In progress", fr: "En cours", variant: "info" },
  clearing: { en: "Clearing", fr: "En délai de sécurité", variant: "warning" },
  available: { en: "Available", fr: "Disponible", variant: "success" },
  in_payout: { en: "In a payout", fr: "Dans un versement", variant: "primary" },
  paid_out: { en: "Paid out", fr: "Versé", variant: "success" },
  returned: { en: "Returned", fr: "Retourné", variant: "danger" },
};
export const earningStateLabel = (s: string, fr: boolean) => (STATE[s as EarningState] ? (fr ? STATE[s as EarningState].fr : STATE[s as EarningState].en) : s);
export const earningStateVariant = (s: string): BadgeVariant => STATE[s as EarningState]?.variant ?? "default";
export const EARNING_STATE_OPTIONS = EARNING_STATES.map((value) => ({ value, label: STATE[value].en, labelFr: STATE[value].fr }));

/** One line of help per state, shown under the totals. */
export const earningStateHelp = (s: EarningState, fr: boolean): string =>
  ({
    in_progress: fr ? "Le colis est encore en route : pas encore gagné." : "The parcel is still on its way: not earned yet.",
    clearing: fr ? "Livré, mais encore dans le délai de sécurité : retirable à la date indiquée." : "Delivered, still inside the hold: withdrawable on the date shown.",
    available: fr ? "Livré et libéré : vous pouvez le retirer." : "Delivered and cleared: you can withdraw it.",
    in_payout: fr ? "Sur le relevé d'un versement demandé ou en cours d'envoi." : "On the statement of a payout that is requested or being sent.",
    paid_out: fr ? "Sur le relevé d'un versement payé." : "On the statement of a paid payout.",
    returned: fr ? "La commande a été retournée : la vente est annulée." : "The order was returned: the sale is taken back.",
  })[s];

const TXN_KIND: Record<string, { en: string; fr: string; variant: BadgeVariant }> = {
  sale: { en: "Sale", fr: "Vente", variant: "success" },
  refund: { en: "Refund", fr: "Remboursement", variant: "danger" },
  payout: { en: "Payout", fr: "Versement", variant: "primary" },
};
export const txnKindLabel = (k: string, fr: boolean) => (TXN_KIND[k] ? (fr ? TXN_KIND[k].fr : TXN_KIND[k].en) : k);
export const txnKindVariant = (k: string): BadgeVariant => TXN_KIND[k]?.variant ?? "default";
export const TXN_KIND_OPTIONS = Object.entries(TXN_KIND).map(([value, v]) => ({ value, label: v.en, labelFr: v.fr }));

/** `2026-10` as "October 2026" / "octobre 2026". */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ─── Hooks ───────────────────────────────────────────────────────────────────
export function useFinanceBalance(): LiveQuery<FinanceBalance> {
  return useLiveQuery<FinanceBalance>("payouts:available", {}, { pushes: FINANCE_PUSHES });
}

export function useFinanceSettings(): LiveQuery<FinanceSettings> {
  return useLiveQuery<FinanceSettings>("finance:settings", {}, { pushes: ["notification:new"] });
}

export interface EarningsQuery {
  state?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null));

export function useEarnings(query: EarningsQuery): LiveQuery<EarningsPage> {
  return useLiveQuery<EarningsPage>("finance:earnings", clean({ limit: 25, ...query }), { pushes: FINANCE_PUSHES });
}

export function useTransactions(query: { from?: string; to?: string; limit?: number; offset?: number }): LiveQuery<TxnPage> {
  return useLiveQuery<TxnPage>("finance:transactions", clean({ limit: 25, ...query }), { pushes: FINANCE_PUSHES });
}

export function useStatementMonths(): LiveQuery<{ currency: string; months: StatementMonth[] }> {
  return useLiveQuery("finance:statements", {}, { pushes: FINANCE_PUSHES });
}

export function useStatementMonth(month: string | null): LiveQuery<StatementDetail> {
  return useLiveQuery<StatementDetail>("finance:statements", month ? { month } : null, { pushes: FINANCE_PUSHES });
}

export function useTaxDocuments(year: number): LiveQuery<{ items: TaxDocument[]; months: TaxMonth[] }> {
  return useLiveQuery("finance:taxDocuments", { year }, { pushes: ["notification:new"] });
}

export function usePayoutAccount(): LiveQuery<PayoutAccount> {
  return useLiveQuery<PayoutAccount>("sellers:payoutAccount:get", {}, { pushes: ["seller:updated"] });
}

// ─── Files ───────────────────────────────────────────────────────────────────
/** Save a CSV the server built (already UTF-8 with BOM, CRLF) as a file download. */
export function saveCsvText(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every earnings line matching a filter (pages of 200), for the CSV export. */
export async function fetchAllEarnings(query: EarningsQuery): Promise<EarningRow[]> {
  const out: EarningRow[] = [];
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    const page = await sellerRequest<EarningsPage>("finance:earnings", clean({ ...query, limit: 200, offset }));
    out.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return out;
}

/** Rows of the earnings CSV, in the language of the portal. */
export function earningsCsvRows(rows: EarningRow[], fr: boolean): (string | number)[][] {
  const head = fr
    ? ["Commande", "Produit", "Option", "Qté", "Date de commande", "Date de livraison", "Brut (USD)", "Coupon (USD)", "Taux de commission (%)", "Commission (USD)", "Net (USD)", "État", "Disponible le", "Versement", "Versé le"]
    : ["Order", "Product", "Option", "Qty", "Ordered", "Delivered", "Gross (USD)", "Coupon (USD)", "Commission rate (%)", "Commission (USD)", "Net (USD)", "State", "Clears on", "Payout", "Paid out on"];
  return [
    head,
    ...rows.map((r) => [
      r.orderReference,
      r.productName,
      r.variant ?? "",
      r.qty,
      r.orderedAt.slice(0, 10),
      r.deliveredAt ? r.deliveredAt.slice(0, 10) : "",
      r.grossUsd.toFixed(2),
      r.couponUsd.toFixed(2),
      r.commissionPct,
      r.commissionUsd.toFixed(2),
      r.netUsd.toFixed(2),
      earningStateLabel(r.state, fr),
      r.clearanceEndsAt ? r.clearanceEndsAt.slice(0, 10) : "",
      r.payout?.reference ?? "",
      r.paidOutAt ? r.paidOutAt.slice(0, 10) : "",
    ]),
  ];
}
