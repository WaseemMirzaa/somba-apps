"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { Countdown } from "@/components/seller/countdown";
import { FinancePager } from "@/components/seller/finance-pager";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { localDay } from "@/lib/dates";
import {
  EARNING_STATE_OPTIONS,
  earningsCsvRows,
  earningStateHelp,
  earningStateLabel,
  earningStateVariant,
  fetchAllEarnings,
  useEarnings,
  type EarningRow,
  type EarningState,
  type EarningsQuery,
} from "@/lib/seller-finance";
import { downloadCsv, errMessage } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

const PAGE = 25;

/**
 * Earnings per order line, read from the server (`finance:earnings`): filter by state, date and order / product,
 * page through everything, see when a delivered line clears, and export what the filter shows.
 */
export function FinanceEarnings({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const query: EarningsQuery = useMemo(
    () => ({ state: filters.status, q: filters.search.trim(), from: filters.fromDate, to: filters.toDate }),
    [filters],
  );
  const earnings = useEarnings({ ...query, limit: compact ? 6 : PAGE, offset });
  const page = earnings.data;
  const money = (n: number) => formatCurrency(n, locale);

  function change(next: typeof filters) {
    setFilters(next);
    setOffset(0);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await fetchAllEarnings(query);
      downloadCsv(`somba-earnings-${localDay(new Date())}.csv`, earningsCsvRows(rows, fr));
      toast(fr ? `${rows.length} ligne(s) exportée(s)` : `${rows.length} row(s) exported`);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  const totals = page?.totals;
  const strip: { state: EarningState; value: number }[] = totals
    ? [
        { state: "in_progress", value: totals.inProgressUsd },
        { state: "clearing", value: totals.clearingUsd },
        { state: "available", value: totals.availableUsd },
        { state: "in_payout", value: totals.inPayoutUsd },
        { state: "paid_out", value: totals.paidOutUsd },
        { state: "returned", value: totals.returnedUsd },
      ]
    : [];

  return (
    <div className="space-y-4">
      {earnings.error && <LoadError message={earnings.error} onRetry={earnings.reload} />}

      {!compact && strip.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="earnings-totals">
          {strip.map((s) => (
            <button
              key={s.state}
              type="button"
              title={earningStateHelp(s.state, fr)}
              onClick={() => change({ ...filters, status: filters.status === s.state ? "" : s.state })}
              className={`rounded-xl border p-3 text-left transition-colors ${filters.status === s.state ? "border-[var(--primary)] bg-[var(--primary-light)]" : "border-[var(--border)] bg-white hover:border-slate-300"}`}
            >
              <span className="block text-xs font-medium text-slate-500">{earningStateLabel(s.state, fr)}</span>
              <span className="mt-1 block break-words text-lg font-bold text-slate-900">{money(s.value)}</span>
            </button>
          ))}
        </div>
      )}

      {!compact && (
        <ListFilters
          values={filters}
          onChange={change}
          statusOptions={EARNING_STATE_OPTIONS}
          searchPlaceholder={fr ? "N° de commande, produit…" : "Order number, product…"}
        />
      )}

      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {filters.status ? earningStateHelp(filters.status as EarningState, fr) : fr ? "Les dates filtrent la date de commande." : "Dates filter the order date."}
          </p>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || !page || page.total === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-1.5 text-sm hover:bg-sky-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? (fr ? "Export…" : "Exporting…") : fr ? "Exporter (CSV)" : "Export (CSV)"}
          </button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {earnings.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucune ligne de gain pour ce filtre." : "No earnings match this filter."}
              columns={[
                {
                  key: "orderReference",
                  label: fr ? "Commande" : "Order",
                  render: (row) => (
                    <Link href={`/seller/orders/${row.orderReference}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.orderReference)}
                    </Link>
                  ),
                },
                {
                  key: "productName",
                  label: fr ? "Produit" : "Product",
                  render: (row) => (
                    <span>
                      {String(row.productName)}
                      {row.variant && row.variant !== "Default" ? <span className="text-slate-500"> · {String(row.variant)}</span> : null}
                      <span className="text-slate-500"> × {String(row.qty)}</span>
                    </span>
                  ),
                },
                { key: "grossUsd", label: fr ? "Brut" : "Gross", render: (row) => money(row.grossUsd as number) },
                {
                  key: "commissionUsd",
                  label: "Commission",
                  render: (row) => (
                    <span>
                      {money(row.commissionUsd as number)} <span className="text-xs text-slate-500">({String(row.commissionPct)} %)</span>
                    </span>
                  ),
                },
                { key: "netUsd", label: "Net", render: (row) => <strong>{money(row.netUsd as number)}</strong> },
                {
                  key: "state",
                  label: fr ? "État" : "State",
                  render: (row) => {
                    const r = row as unknown as EarningRow;
                    return (
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={earningStateVariant(r.state)}>{earningStateLabel(r.state, fr)}</Badge>
                        {r.state === "clearing" && <Countdown until={r.clearanceEndsAt} />}
                        {r.state === "paid_out" && r.paidOutAt && <span className="text-xs text-slate-500">{localDay(r.paidOutAt)}</span>}
                      </div>
                    );
                  },
                },
                {
                  key: "payout",
                  label: fr ? "Versement" : "Payout",
                  render: (row) => {
                    const p = (row as unknown as EarningRow).payout;
                    return p ? (
                      <Link href={`/seller/finance/payouts/${p.reference}`} className="text-[var(--primary)] hover:underline">
                        {p.reference}
                      </Link>
                    ) : (
                      "—"
                    );
                  },
                },
                { key: "orderedAt", label: fr ? "Commandée le" : "Ordered", render: (row) => localDay(row.orderedAt as string) },
              ]}
              data={(page?.items ?? []) as unknown as Record<string, unknown>[]}
            />
          )}
          {!compact && page && <FinancePager offset={offset} limit={PAGE} total={page.total} onChange={setOffset} busy={earnings.refreshing} />}
        </CardContent>
      </Card>
    </div>
  );
}
