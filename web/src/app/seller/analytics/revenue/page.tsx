"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  Banknote,
  Percent,
  RotateCcw,
  Target,
  TrendingUp,
  CreditCard,
  Receipt,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { AnalyticsKpiCard, AnalyticsPeriodControls, EMPTY_ANALYTICS_DATE_RANGE } from "@/components/seller/analytics-kpi";
import { EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import {
  DualMetricChart,
  HorizontalBarChart,
  GoalProgress,
  RevenueAreaChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  sellerRevenueKpis,
  sellerRevenueTrend,
  sellerRevenueByPayment,
  sellerRevenueByChannel,
  sellerDailyRevenue,
  sellerRevenueTransactions,
  sellerCategoryRevenue,
  sellerGoals,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";

export default function SellerRevenueAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = sellerRevenueKpis;

  const filteredTransactions = useMemo(
    () =>
      applyListFilters([...sellerRevenueTransactions], { ...EMPTY_LIST_FILTERS, ...dateRange }, { dateField: "date" }),
    [dateRange]
  );

  const grossSpark = sellerRevenueTrend.map((d) => d.revenue);
  const netSpark = sellerDailyRevenue.map((d) => d.net);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Analytique revenus" : "Revenue Analytics"}
        subtitle={fr ? "Brut · Net · Commissions · Remboursements · Paiements" : "Gross · Net · Commissions · Refunds · Payments"}
        backHref="/seller/analytics"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("analytics"), href: "/seller/analytics" },
          { label: fr ? "Revenus" : "Revenue" },
        ]}
        actions={<AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard
          title={fr ? "Revenu brut (MTD)" : "Gross revenue (MTD)"}
          value={formatCurrency(k.grossRevenue, locale)}
          change={k.grossChange}
          spark={grossSpark}
          icon={DollarSign}
        />
        <AnalyticsKpiCard
          title={fr ? "Revenu net (MTD)" : "Net revenue (MTD)"}
          value={formatCurrency(k.netRevenue, locale)}
          change={k.netChange}
          spark={netSpark}
          icon={Banknote}
        />
        <AnalyticsKpiCard
          title={fr ? "Commissions payées" : "Commission paid"}
          value={formatCurrency(k.commissionPaid, locale)}
          change={k.commissionChange}
          spark={[8200, 8800, 9200, 9800, 10734]}
          icon={Percent}
        />
        <AnalyticsKpiCard
          title={fr ? "Remboursements" : "Refunds"}
          value={formatCurrency(k.refunds, locale)}
          change={k.refundChange}
          positive={false}
          spark={[1420, 1280, 1180, 1120, 1072]}
          icon={RotateCcw}
        />
        <AnalyticsKpiCard
          title={fr ? "Panier moyen" : "Avg. order value"}
          value={formatCurrency(k.avgOrderValue, locale)}
          change={k.aovChange}
          spark={[138, 140, 142, 144, 146.2]}
          icon={Target}
        />
        <AnalyticsKpiCard
          title={fr ? "Versement en attente" : "Pending payout"}
          value={formatCurrency(k.payoutPending, locale)}
          change={k.payoutChange}
          spark={[21000, 22000, 22800, 23600, 24500]}
          icon={CreditCard}
        />
        <AnalyticsKpiCard
          title={fr ? "Marge bénéficiaire" : "Profit margin"}
          value={`${k.profitMargin}%`}
          change={k.marginChange}
          spark={[20.2, 21.0, 21.6, 22.2, 22.8]}
          icon={TrendingUp}
        />
        <AnalyticsKpiCard
          title={fr ? "Transactions" : "Transactions"}
          value="612"
          change={8.6}
          spark={sellerRevenueTrend.map((d) => d.orders)}
          icon={Receipt}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
                {fr ? "Revenus & commandes" : "Revenue & orders"}
              </h2>
              <p className="text-xs text-slate-500">
                {fr ? "Net" : "Net"} {formatCurrency(k.netRevenue, locale)} · +{k.netChange}%
              </p>
            </div>
            <AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />
          </CardHeader>
          <CardContent>
            <DualMetricChart data={sellerRevenueTrend} height={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Objectifs mensuels" : "Monthly goals"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Progression juin" : "June progress"}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress
              label={fr ? "Objectif revenu" : "Revenue goal"}
              current={sellerGoals.revenueCurrent}
              target={sellerGoals.revenueTarget}
              format={(n) => formatCurrency(n, locale)}
            />
            <GoalProgress
              label={fr ? "Objectif commandes" : "Orders goal"}
              current={sellerGoals.ordersCurrent}
              target={sellerGoals.ordersTarget}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Revenu par mode de paiement" : "Revenue by payment method"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerRevenueByPayment.map((p) => ({
                name: fr ? p.methodFr : p.method,
                revenue: p.revenue,
              }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {sellerRevenueByPayment.map((p) => (
                <div key={p.method} className="rounded-lg bg-slate-50 p-3 text-xs">
                  <p className="text-slate-500">{fr ? p.methodFr : p.method}</p>
                  <p className="font-bold text-slate-900">{p.pct}% · {p.orders} {fr ? "cmd." : "orders"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Revenu par canal" : "Revenue by channel"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerRevenueByChannel.map((c) => ({
                name: fr ? c.channelFr : c.channel,
                revenue: c.revenue,
              }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Revenu par catégorie" : "Revenue by category"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerCategoryRevenue.map((c) => ({ name: fr ? c.categoryFr : c.category, revenue: c.revenue }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Revenu net quotidien" : "Daily net revenue"}</h2>
            <p className="text-xs text-slate-500">{fr ? "7 derniers jours" : "Last 7 days"}</p>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={sellerDailyRevenue.map((d) => ({ label: d.label, value: d.net }))}
              valueKey="value"
              height={200}
              color="#059669"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{fr ? "Transactions récentes" : "Recent transactions"}</h2>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID" },
              { key: "date", label: fr ? "Date" : "Date" },
              {
                key: "type",
                label: fr ? "Type" : "Type",
                render: (row) => {
                  const type = String(row.type);
                  const variant = type === "Refund" ? "warning" : type === "Payout" ? "purple" : "success";
                  return <Badge variant={variant}>{fr ? String(row.typeFr) : type}</Badge>;
                },
              },
              { key: "orderId", label: fr ? "Référence" : "Reference" },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => {
                  const amt = row.amount as number;
                  return (
                    <span className={amt < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                      {formatCurrency(amt, locale)}
                    </span>
                  );
                },
              },
              {
                key: "commission",
                label: fr ? "Commission" : "Commission",
                render: (row) => formatCurrency(row.commission as number, locale),
              },
              {
                key: "net",
                label: fr ? "Net" : "Net",
                render: (row) => formatCurrency(row.net as number, locale),
              },
              { key: "method", label: fr ? "Méthode" : "Method", render: (row) => (fr ? String(row.methodFr ?? row.method) : String(row.method)) },
            ]}
            data={filteredTransactions as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <DetailGrid>
        <DetailGridSection title={fr ? "Répartition revenus" : "Revenue breakdown"} span={2}>
          <InfoGrid
            columns={4}
            items={[
              { label: fr ? "Revenu brut" : "Gross revenue", value: formatCurrency(k.grossRevenue, locale) },
              { label: fr ? "Commissions (12%)" : "Commission (12%)", value: formatCurrency(k.commissionPaid, locale) },
              { label: fr ? "Remboursements" : "Refunds", value: formatCurrency(k.refunds, locale) },
              { label: fr ? "Revenu net" : "Net revenue", value: formatCurrency(k.netRevenue, locale) },
              { label: fr ? "Versement en attente" : "Pending payout", value: formatCurrency(k.payoutPending, locale) },
              { label: fr ? "Panier moyen" : "Avg. order value", value: formatCurrency(k.avgOrderValue, locale) },
              { label: fr ? "Marge" : "Margin", value: `${k.profitMargin}%` },
              { label: fr ? "Taux de remboursement" : "Refund rate", value: `${((k.refunds / k.grossRevenue) * 100).toFixed(1)}%` },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Revenu quotidien détaillé" : "Daily revenue detail"}>
          <div className="space-y-2">
            {sellerDailyRevenue.map((d) => (
              <div key={d.label} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
                <span className="font-medium text-slate-700">{d.label}</span>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatCurrency(d.net, locale)}</p>
                  <p className="text-xs text-slate-400">
                    {fr ? "Brut" : "Gross"} {formatCurrency(d.gross, locale)} · {fr ? "Remb." : "Ref."} {formatCurrency(d.refunds, locale)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
