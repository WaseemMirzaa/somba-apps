"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { FinancePager } from "@/components/seller/finance-pager";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { localDay } from "@/lib/dates";
import { sellerRequest } from "@/lib/seller-api";
import { TXN_KIND_OPTIONS, saveCsvText, txnKindLabel, txnKindVariant, useTransactions } from "@/lib/seller-finance";
import { errMessage, orderStatusLabel, payoutStatusLabel } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

const PAGE = 25;

/** Sales, refunds and payouts as the server records them (`finance:transactions`), newest first. */
export default function SellerTransactionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const range = useMemo(() => ({ from: filters.fromDate || undefined, to: filters.toDate || undefined }), [filters.fromDate, filters.toDate]);
  const txns = useTransactions({ ...range, limit: PAGE, offset });
  const money = (n: number) => formatCurrency(n, locale);
  const page = txns.data;

  // The server filters by date; kind and the search box narrow the page that is on screen.
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return (page?.items ?? []).filter((r) => (!filters.status || r.kind === filters.status) && (!q || `${r.reference} ${r.description}`.toLowerCase().includes(q)));
  }, [page, filters.search, filters.status]);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await sellerRequest<{ filename: string; csv: string }>("finance:transactions", { ...range, format: "csv" });
      saveCsvText(res.filename, res.csv);
      toast(fr ? "Transactions exportées (CSV)" : "Transactions exported (CSV)");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle={fr ? "Ventes, remboursements et versements, du plus récent au plus ancien" : "Sales, refunds and payouts, newest first"}
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: "Finance", href: "/seller/finance" },
          { label: "Transactions" },
        ]}
        actions={
          <button type="button" onClick={() => void exportCsv()} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50 disabled:opacity-50">
            <Download className="h-4 w-4" />
            {exporting ? (fr ? "Export…" : "Exporting…") : fr ? "Exporter (CSV)" : "Export (CSV)"}
          </button>
        }
      />
      {txns.error && <LoadError message={txns.error} onRetry={txns.reload} />}

      {page && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="txn-totals">
          {[
            { l: fr ? "Ventes (net)" : "Sales (net)", v: money(page.totals.salesUsd) },
            { l: fr ? "Remboursements" : "Refunds", v: money(page.totals.refundsUsd) },
            { l: fr ? "Versements" : "Payouts", v: money(page.totals.payoutsUsd) },
            { l: fr ? "Solde net" : "Net", v: money(page.totals.netUsd) },
          ].map((x) => (
            <div key={x.l} className="rounded-xl border border-[var(--border)] bg-white p-3">
              <p className="text-xs text-slate-500">{x.l}</p>
              <p className="mt-1 break-words text-lg font-bold text-slate-900">{x.v}</p>
            </div>
          ))}
        </div>
      )}

      <ListFilters
        values={filters}
        onChange={(v) => {
          setFilters(v);
          if (v.fromDate !== filters.fromDate || v.toDate !== filters.toDate) setOffset(0);
        }}
        statusOptions={TXN_KIND_OPTIONS}
        searchPlaceholder={fr ? "Référence, détail…" : "Reference, description…"}
      />

      <Card>
        <CardContent className="p-0">
          {txns.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucune transaction pour ce filtre." : "No transactions for this filter."}
              columns={[
                { key: "at", label: t("date"), render: (row) => localDay(row.at as string) },
                { key: "reference", label: fr ? "Référence" : "Reference" },
                { key: "description", label: fr ? "Détail" : "Description" },
                { key: "kind", label: "Type", render: (row) => <Badge variant={txnKindVariant(String(row.kind))}>{txnKindLabel(String(row.kind), fr)}</Badge> },
                { key: "grossUsd", label: fr ? "Brut" : "Gross", render: (row) => (row.kind === "payout" ? "—" : money(row.grossUsd as number)) },
                { key: "commissionUsd", label: "Commission", render: (row) => (row.kind === "payout" ? "—" : money(row.commissionUsd as number)) },
                {
                  key: "amountUsd",
                  label: fr ? "Montant" : "Amount",
                  render: (row) => <strong className={(row.amountUsd as number) < 0 ? "text-red-600" : ""}>{money(row.amountUsd as number)}</strong>,
                },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <span className={row.counts === false ? "text-slate-400 line-through" : "text-slate-600"}>
                      {row.kind === "payout" ? payoutStatusLabel(String(row.status), fr) : orderStatusLabel(String(row.status), fr)}
                    </span>
                  ),
                },
              ]}
              data={rows as unknown as Record<string, unknown>[]}
            />
          )}
          {page && <FinancePager offset={offset} limit={PAGE} total={page.total} onChange={setOffset} busy={txns.refreshing} />}
        </CardContent>
      </Card>
    </div>
  );
}
