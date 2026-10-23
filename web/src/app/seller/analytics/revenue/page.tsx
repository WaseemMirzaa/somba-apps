"use client";

import { useMemo, useState } from "react";
import { DollarSign, Wallet, Percent, RotateCcw, Target, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { HorizontalBarChart } from "@/components/charts/dashboard-charts";
import { RevenueOrdersChart } from "@/components/seller/revenue-chart";
import { AnalyticsPage } from "@/components/seller/analytics-shell";
import { EmptyState } from "@/components/seller/data-state";
import { StatTile } from "@/components/seller/stat-tile";
import { AnalyticsDateRangeFilter, EMPTY_ANALYTICS_DATE_RANGE, type AnalyticsDateRange } from "@/components/seller/analytics-kpi";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { shortDay } from "@/lib/seller-analytics";
import { applyListFilters } from "@/lib/list-filter-utils";
import { EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { downloadCsv, paymentMethodLabel, txnStatusLabel, txnStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

export default function SellerRevenueAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerFinanceStats, sellerOrderList, transactionList, commissionPct } = useSellerData();
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);

  const filteredTransactions = useMemo(
    () => applyListFilters(transactionList, { ...EMPTY_LIST_FILTERS, ...dateRange }, { dateField: "date" }),
    [transactionList, dateRange],
  );

  // Revenue by the method the customer paid with (real orders that count as sales).
  const byMethod = useMemo(() => {
    const m = new Map<string, { method: string; revenue: number; orders: number }>();
    for (const o of sellerOrderList) {
      if (!o.countsAsSale) continue;
      const cur = m.get(o.paymentMethod) ?? { method: o.paymentMethod, revenue: 0, orders: 0 };
      cur.revenue += o.amount;
      cur.orders += 1;
      m.set(o.paymentMethod, cur);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [sellerOrderList]);

  return (
    <AnalyticsPage
      title={fr ? "Analytique revenus" : "Revenue Analytics"}
      subtitle={fr ? "Revenu · Commission · Remboursements · Paiements" : "Revenue · Commission · Refunds · Payments"}
      crumb={fr ? "Revenus" : "Revenue"}
    >
      {(a, { periodLabel }) => {
        // Net of the commission stored on each order line (today's rate only when the server omits it).
        const net = Number((a.revenue - (a.commissionUsd ?? (a.revenue * commissionPct) / 100)).toFixed(2));
        const days = [...a.revenueSeries].reverse();
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatTile title={fr ? "Revenu brut" : "Gross revenue"} value={formatCurrency(a.revenue, locale)} hint={periodLabel} spark={a.revenueSeries.map((d) => d.revenue)} icon={DollarSign} />
              <StatTile
                title={fr ? "Net après commission" : "Net after commission"}
                value={formatCurrency(net, locale)}
                hint={fr ? `Commission au taux de chaque commande (${commissionPct} % pour les nouvelles)` : `Commission at each order's own rate (${commissionPct}% for new orders)`}
                icon={Wallet}
              />
              <StatTile title={fr ? "Panier moyen" : "Avg. order value"} value={a.orders > 0 ? formatCurrency(a.aov, locale) : "—"} hint={fr ? `${a.orders} commandes` : `${a.orders} orders`} icon={Target} />
              <StatTile title={fr ? "Commission payée (total)" : "Commission paid (all time)"} value={formatCurrency(sellerFinanceStats.commissionPaid, locale)} icon={Percent} />
              <StatTile title={fr ? "Annulées / retournées (total)" : "Cancelled / returned (all time)"} value={formatCurrency(sellerFinanceStats.refundAmount, locale)} icon={RotateCcw} />
              <StatTile title={fr ? "Disponible pour versement" : "Available for payout"} value={formatCurrency(sellerFinanceStats.availableBalance, locale)} icon={CreditCard} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-slate-900">{fr ? "Revenu par jour" : "Revenue per day"}</h2>
                  <p className="text-xs text-slate-500">{periodLabel} · {fr ? "jours UTC" : "UTC days"}</p>
                </CardHeader>
                <CardContent>
                  {a.orders === 0 ? (
                    <EmptyState>{fr ? "Aucune commande sur cette période." : "No orders in this period."}</EmptyState>
                  ) : (
                    <RevenueOrdersChart data={a.revenueSeries.map((d) => ({ label: shortDay(d.date, fr), revenue: d.revenue, orders: d.orders }))} height={220} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-slate-900">{fr ? "Revenu par moyen de paiement" : "Revenue by payment method"}</h2>
                  <p className="text-xs text-slate-500">{fr ? "Toutes vos ventes en cours et livrées" : "All your sales, in progress and delivered"}</p>
                </CardHeader>
                <CardContent>
                  {byMethod.length === 0 ? (
                    <EmptyState>{fr ? "Aucune vente pour le moment." : "No sales yet."}</EmptyState>
                  ) : (
                    <HorizontalBarChart
                      items={byMethod.map((m) => ({ name: `${paymentMethodLabel(m.method, fr)} (${m.orders})`, revenue: m.revenue }))}
                      valueKey="revenue"
                      labelKey="name"
                      formatValue={(v) => formatCurrency(v, locale)}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-900">{fr ? "Détail par jour" : "Daily detail"}</h2>
                <button
                  type="button"
                  disabled={a.orders === 0}
                  onClick={() => downloadCsv(`revenue-${a.from}-${a.to}.csv`, [["date", "revenue", "orders", "units"], ...a.revenueSeries.map((d) => [d.date, d.revenue, d.orders, d.units])])}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {fr ? "Exporter en CSV" : "Export CSV"}
                </button>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  emptyMessage={fr ? "Aucune donnée." : "No data."}
                  columns={[
                    { key: "date", label: t("date") },
                    { key: "revenue", label: fr ? "Revenu" : "Revenue", render: (r) => formatCurrency(r.revenue as number, locale) },
                    { key: "orders", label: fr ? "Commandes" : "Orders" },
                    { key: "units", label: fr ? "Unités" : "Units" },
                  ]}
                  data={days.filter((d) => d.orders > 0) as unknown as Record<string, unknown>[]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
                <h2 className="font-semibold text-slate-900">{fr ? "Transactions" : "Transactions"}</h2>
                <AnalyticsDateRangeFilter values={dateRange} onChange={setDateRange} />
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  emptyMessage={fr ? "Aucune transaction." : "No transactions."}
                  columns={[
                    { key: "order", label: fr ? "Commande" : "Order" },
                    { key: "customer", label: t("customer") },
                    { key: "grossAmount", label: fr ? "Brut" : "Gross", render: (r) => formatCurrency(r.grossAmount as number, locale) },
                    { key: "commission", label: "Commission", render: (r) => formatCurrency(r.commission as number, locale) },
                    { key: "netAmount", label: "Net", render: (r) => formatCurrency(r.netAmount as number, locale) },
                    { key: "status", label: t("status"), render: (r) => <Badge variant={txnStatusVariant(String(r.status))}>{txnStatusLabel(String(r.status), fr)}</Badge> },
                    { key: "date", label: t("date") },
                  ]}
                  data={filteredTransactions as unknown as Record<string, unknown>[]}
                />
              </CardContent>
            </Card>
          </>
        );
      }}
    </AnalyticsPage>
  );
}
