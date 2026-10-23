/**
 * Settlement statement of one payout (`payouts:statement`): the sale lines it settles, the refund lines
 * clawed back from earlier statements, the totals and the opening / closing balance. Pure (no React, no
 * runtime imports) so the CSV is unit-tested by payout-statement.test.mjs.
 */

export interface StatementLine {
  id: string;
  payoutId: string;
  orderItemId: string;
  orderId: string;
  orderReference: string;
  productName: string;
  variant: string;
  qty: number;
  /** "sale" = delivered line settled here; "refund" = an earlier settled sale clawed back (negative net). */
  kind: "sale" | "refund";
  grossUsd: number;
  /** The commission rate (%) frozen on the order line when it was placed. */
  commissionPct: number;
  commissionUsd: number;
  refundUsd: number;
  netUsd: number;
  deliveredAt: string | null;
}

export interface StatementTotals {
  grossUsd: number;
  commissionUsd: number;
  refundsUsd: number;
  netUsd: number;
  /** Balance carried in: what was available before this statement's new lines. */
  openingBalanceUsd: number;
  /** Balance left once this payout is taken. */
  closingBalanceUsd: number;
  amountUsd: number;
}

export interface StatementPayout {
  id: string;
  reference: string;
  sellerId: string;
  sellerName: string;
  amountUsd: number;
  method: string;
  status: string;
  providerRef?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface PayoutStatementData {
  payout: StatementPayout;
  lines: StatementLine[];
  /** Null for a payout issued before statements existed. */
  totals: StatementTotals | null;
  legacy: boolean;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Free text bound for a spreadsheet: a leading = + - @ would run as a formula, so it is neutralised. */
export function csvText(v: string | null | undefined): string {
  const s = String(v ?? "");
  return FORMULA_START.test(s) ? `'${s}` : s;
}

const usd = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

export function statementFilename(st: Pick<PayoutStatementData, "payout">): string {
  const ref = String(st.payout.reference || st.payout.id).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `somba-statement-${ref}.csv`;
}

/**
 * Rows for `downloadCsv`: a header block (payout, seller, opening balance), one row per line,
 * a totals row, then the payout amount and the closing balance.
 */
export function statementCsvRows(
  st: PayoutStatementData,
  opts: { fr: boolean; day: (v: string | null | undefined) => string; method?: (m: string) => string },
): (string | number)[][] {
  const { fr } = opts;
  const p = st.payout;
  const t = st.totals;
  const rows: (string | number)[][] = [
    [fr ? "Relevé de versement" : "Payout statement", csvText(p.reference)],
    [fr ? "Vendeur" : "Seller", csvText(p.sellerName)],
    [fr ? "Statut" : "Status", csvText(p.status)],
    [fr ? "Date de la demande" : "Requested", opts.day(p.createdAt)],
    [fr ? "Méthode" : "Method", csvText(opts.method ? opts.method(p.method) : p.method)],
    [fr ? "Réf. du virement" : "Transfer reference", csvText(p.providerRef ?? "")],
  ];
  if (!t) {
    rows.push([], [fr ? "Versement émis avant l'existence des relevés : aucune ligne détaillée." : "Issued before statements existed: no line detail."]);
    rows.push([fr ? "Montant du versement (USD)" : "Payout amount (USD)", usd(p.amountUsd)]);
    return rows;
  }
  rows.push([fr ? "Solde d'ouverture (USD)" : "Opening balance (USD)", usd(t.openingBalanceUsd)], []);
  rows.push([
    fr ? "Commande" : "Order",
    fr ? "Produit" : "Product",
    fr ? "Variante" : "Variant",
    fr ? "Qté" : "Qty",
    fr ? "Type" : "Type",
    fr ? "Brut (USD)" : "Gross (USD)",
    fr ? "Commission (%)" : "Commission (%)",
    fr ? "Commission (USD)" : "Commission (USD)",
    fr ? "Remboursement (USD)" : "Refund (USD)",
    fr ? "Net (USD)" : "Net (USD)",
    fr ? "Livrée le" : "Delivered",
  ]);
  for (const l of st.lines) {
    rows.push([
      csvText(l.orderReference),
      csvText(l.productName),
      csvText(l.variant),
      l.qty,
      l.kind === "refund" ? (fr ? "Remboursement" : "Refund") : fr ? "Vente" : "Sale",
      usd(l.grossUsd),
      l.commissionPct,
      usd(l.commissionUsd),
      usd(l.refundUsd),
      usd(l.netUsd),
      opts.day(l.deliveredAt),
    ]);
  }
  rows.push([
    fr ? "Totaux" : "Totals",
    "",
    "",
    st.lines.reduce((s, l) => s + l.qty, 0),
    "",
    usd(t.grossUsd),
    "",
    usd(t.commissionUsd),
    usd(t.refundsUsd),
    usd(t.netUsd),
    "",
  ]);
  rows.push([], [fr ? "Montant du versement (USD)" : "Payout amount (USD)", usd(t.amountUsd)], [fr ? "Solde de clôture (USD)" : "Closing balance (USD)", usd(t.closingBalanceUsd)]);
  return rows;
}
