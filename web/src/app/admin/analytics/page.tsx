"use client";

import Link from "next/link";
import { useState } from "react";
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Target,
  RotateCcw,
  Shield,
  DollarSign,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import {
  AnalyticsKpiCard,
  AnalyticsPeriodControls,
  EMPTY_ANALYTICS_DATE_RANGE,
} from "@/components/seller/analytics-kpi";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";
import {
  DualMetricChart,
  HorizontalBarChart,
  FunnelChart,
  SegmentDonut,
  GoalProgress,
  RetentionBarChart,
  RevenueAreaChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  adminPlatformKpis,
  adminRevenueTrend,
  adminCategoryGmv,
  adminOrderFunnel,
  adminCustomerSegments,
  adminSellerGrowth,
  adminFulfillmentHealth,
  adminFulfillmentSlas,
  adminReturnMetrics,
  adminReturnTrend,
  adminTopSellers,
  adminRegionalGmv,
  adminMarketplaceHealth,
  adminPendingActions,
  adminRecentActivity,
  adminGoals,
} from "@/lib/admin-analytics";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function AdminAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = adminPlatformKpis;

  const gmvSpark = adminRevenueTrend.map((d) => d.revenue);
  const ordersSpark = adminRevenueTrend.map((d) => d.orders);
  const returnSpark = adminReturnTrend.map((d) => d.returns);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("analytics")}
        subtitle={
          fr
            ? "GMV · Commandes · Vendeurs · Clients · Retours · SLA · Santé marketplace"
            : "GMV · Orders · Sellers · Customers · Returns · SLAs · Marketplace health"
        }
        breadcrumbs={[adminBreadcrumb(locale), { label: t("analytics") }]}
        actions={
          <AnalyticsPeriodControls
            period={period}
            onPeriodChange={setPeriod}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard
          title={fr ? "GMV (MTD)" : "GMV (MTD)"}
          value={formatCurrency(k.gmvMtd, locale)}
          change={k.gmvChange}
          spark={gmvSpark}
          icon={TrendingUp}
        />
        <AnalyticsKpiCard
          title={fr ? "Commandes (MTD)" : "Orders (MTD)"}
          value={formatNumber(k.ordersMtd, locale)}
          change={k.ordersChange}
          spark={ordersSpark}
          icon={ShoppingCart}
        />
        <AnalyticsKpiCard
          title={t("activeSellers")}
          value={formatNumber(k.activeSellers, locale)}
          change={k.sellersChange}
          spark={adminSellerGrowth.map((s) => s.sellers)}
          icon={Users}
        />
        <AnalyticsKpiCard
          title={fr ? "Clients actifs" : "Active customers"}
          value={formatNumber(k.activeCustomers, locale)}
          change={k.customersChange}
          spark={[41200, 42800, 44100, 45800, 46800, 48200]}
          icon={Users}
        />
        <AnalyticsKpiCard
          title={fr ? "Panier moyen" : "Avg. order value"}
          value={formatCurrency(k.avgOrderValue, locale)}
          change={k.aovChange}
          spark={[142, 146, 148, 150, 152, 154]}
          icon={DollarSign}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de retour" : "Return rate"}
          value={`${k.returnRate}%`}
          change={k.returnChange}
          positive={false}
          spark={returnSpark}
          icon={RotateCcw}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de conversion" : "Conversion rate"}
          value={`${k.conversionRate}%`}
          change={k.conversionChange}
          spark={[3.2, 3.4, 3.5, 3.6, 3.7, 3.8]}
          icon={Target}
        />
        <AnalyticsKpiCard
          title={fr ? "Satisfaction client" : "Customer satisfaction"}
          value={`${k.customerSatisfaction}★`}
          change={k.satisfactionChange}
          spark={[4.3, 4.4, 4.4, 4.5, 4.5, 4.6]}
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
                {fr ? "GMV & commandes" : "GMV & orders"}
              </h2>
              <p className="text-xs text-slate-500">
                {fr ? "Revenu net" : "Net revenue"} {formatCurrency(k.netRevenue, locale)} · +{k.netChange}%
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <DualMetricChart
              data={adminRevenueTrend.map((d) => ({ label: d.label, revenue: d.revenue, orders: d.orders }))}
              height={240}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Segments clients" : "Customer segments"}</h2>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={adminCustomerSegments.map((seg) => ({
                label: fr ? seg.labelFr : seg.label,
                pct: seg.pct,
                color: seg.color,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Entonnoir de conversion" : "Conversion funnel"}</h2>
            <p className="text-xs text-slate-500">{period}</p>
          </CardHeader>
          <CardContent>
            <FunnelChart
              stages={adminOrderFunnel.map((f) => ({
                stage: fr ? f.stageFr : f.stage,
                count: f.count,
                pct: f.pct,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Croissance vendeurs" : "Seller growth"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Rétention vendeur par mois" : "Seller retention by month"}</p>
          </CardHeader>
          <CardContent>
            <RetentionBarChart
              data={adminSellerGrowth.map((s) => ({
                month: s.month,
                retention: s.retention,
                churn: 100 - s.retention,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "GMV par catégorie" : "GMV by category"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={adminCategoryGmv.map((c) => ({ name: fr ? c.categoryFr : c.category, gmv: c.gmv }))}
              valueKey="gmv"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "GMV par région" : "GMV by region"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={adminRegionalGmv.map((r) => ({
                name: fr ? r.regionFr : r.region,
                gmv: r.gmv,
              }))}
              valueKey="gmv"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Top vendeurs" : "Top sellers"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Classement par GMV" : "Ranked by GMV"}</p>
          </div>
          <Link href="/admin/sellers" className="text-xs font-medium text-[var(--primary)] hover:underline">
            {t("viewAll")}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "name",
                label: fr ? "Vendeur" : "Seller",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              {
                key: "gmv",
                label: "GMV",
                render: (row) => formatCurrency(row.gmv as number, locale),
              },
              { key: "orders", label: t("orders") },
              {
                key: "rating",
                label: fr ? "Note" : "Rating",
                render: (row) => `★ ${row.rating}`,
              },
              {
                key: "fulfillment",
                label: fr ? "Expédition" : "Fulfillment",
                render: (row) => `${row.fulfillment}%`,
              },
              {
                key: "returns",
                label: fr ? "Retours" : "Returns",
                render: (row) => `${row.returns}%`,
              },
            ]}
            data={adminTopSellers as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Tendance retours" : "Return trend"}</h2>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={adminReturnTrend.map((d) => ({ label: d.label, value: d.returns }))}
              valueKey="value"
              height={180}
              color="var(--primary)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Objectifs plateforme" : "Platform goals"}</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress
              label={fr ? "Objectif GMV" : "GMV target"}
              current={adminGoals.gmvCurrent}
              target={adminGoals.gmvTarget}
              format={(n) => formatCurrency(n, locale)}
            />
            <GoalProgress
              label={fr ? "Objectif commandes" : "Orders target"}
              current={adminGoals.ordersCurrent}
              target={adminGoals.ordersTarget}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Santé marketplace" : "Marketplace health"}</h2>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-center">
              <p className="text-4xl font-bold text-[var(--primary)]">{adminMarketplaceHealth.overallScore}</p>
              <p className="text-xs text-slate-500">{fr ? "Score global / 100" : "Overall score / 100"}</p>
            </div>
            <HorizontalBarChart
              items={adminFulfillmentHealth.map((h) => ({ name: fr ? h.labelFr : h.label, score: h.score }))}
              valueKey="score"
              labelKey="name"
              formatValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "SLA expédition" : "Fulfillment SLAs"} span={2}>
          <DataTable
            columns={[
              {
                key: "metric",
                label: fr ? "Métrique" : "Metric",
                render: (row) => String(fr ? row.metricFr : row.metric),
              },
              { key: "target", label: fr ? "Cible" : "Target", render: (row) => `${row.target}%` },
              { key: "actual", label: fr ? "Réel" : "Actual", render: (row) => `${row.actual}%` },
              {
                key: "status",
                label: fr ? "Statut" : "Status",
                render: (row) => (
                  <Badge variant={row.status === "ok" ? "success" : "warning"}>
                    {row.status === "ok" ? (fr ? "OK" : "OK") : fr ? "Attention" : "Warning"}
                  </Badge>
                ),
              },
            ]}
            data={adminFulfillmentSlas as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Actions en attente" : "Pending actions"}>
          <div className="space-y-3">
            {adminPendingActions.map((a) => (
              <div key={a.type} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
                <span className="text-slate-700">{fr ? a.typeFr : a.type}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={a.priority === "Critical" ? "danger" : a.priority === "High" ? "warning" : "default"}>
                    {fr ? a.priorityFr : a.priority}
                  </Badge>
                  <span className="font-bold text-slate-900">{a.count}</span>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Métriques retours" : "Return metrics"}>
          <InfoGrid
            items={[
              { label: fr ? "Retours totaux" : "Total returns", value: adminReturnMetrics.totalReturns },
              { label: fr ? "Taux de retour" : "Return rate", value: `${adminReturnMetrics.returnRate}%` },
              { label: fr ? "Délai moyen résolution" : "Avg. resolution time", value: `${adminReturnMetrics.avgResolutionDays} ${fr ? "jours" : "days"}` },
              { label: fr ? "Montant remboursé" : "Refund amount", value: formatCurrency(adminReturnMetrics.refundAmount, locale) },
              { label: fr ? "Taux d'échange" : "Exchange rate", value: `${adminReturnMetrics.exchangeRate}%` },
              { label: fr ? "Raison principale" : "Top reason", value: fr ? adminReturnMetrics.topReasonFr : adminReturnMetrics.topReason },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Indicateurs plateforme" : "Platform indicators"}>
          <InfoGrid
            items={[
              { label: fr ? "Commissions perçues" : "Commission earned", value: formatCurrency(k.commissionEarned, locale) },
              { label: fr ? "Entrepôts actifs" : "Active warehouses", value: k.activeWarehouses },
              { label: fr ? "Litiges ouverts" : "Open disputes", value: k.disputeOpen },
              { label: fr ? "Taux d'expédition" : "Fulfillment rate", value: `${k.fulfillmentRate}%` },
              { label: fr ? "Alertes fraude" : "Fraud flags", value: k.fraudFlags },
              { label: fr ? "Approbations en attente" : "Pending approvals", value: k.pendingApprovals },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Activité récente" : "Recent activity"} span={3}>
          <div className="space-y-3">
            {adminRecentActivity.map((a, i) => (
              <div key={i} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0">
                <span className="shrink-0 text-xs text-slate-400">{fr ? a.timeFr : a.time}</span>
                <span className="text-sm text-slate-700">{fr ? a.textFr : a.text}</span>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/admin/sellers", label: fr ? "Vendeurs" : "Sellers", icon: Users },
          { href: "/admin/orders", label: t("orders"), icon: ShoppingCart },
          { href: "/admin/returns", label: fr ? "Retours" : "Returns", icon: RotateCcw },
          { href: "/admin/fraud", label: fr ? "Fraude" : "Fraud", icon: Shield },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-3 rounded-xl border border-[var(--primary-tint)] p-4 transition-all hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
          >
            <div className="rounded-xl bg-red-50 p-2">
              <link.icon className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <span className="font-semibold text-slate-900">{link.label}</span>
            <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
