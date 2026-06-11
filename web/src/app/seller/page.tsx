"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DollarSign,
  ShoppingCart,
  Star,
  Package,
  RotateCcw,
  TrendingUp,
  Users,
  Target,
  RefreshCw,
  Wallet,
  Truck,
  ArrowUpRight,
  Activity,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  DualMetricChart,
  RetentionBarChart,
  SegmentDonut,
  FunnelChart,
  HorizontalBarChart,
  GoalProgress,
} from "@/components/charts/dashboard-charts";
import { KpiCard } from "@/components/ui/kpi-card";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";
import {
  sellerStore,
  sellerDashboardStats,
  sellerOrderList,
  lowStockProducts,
  promotionList,
  sellerFinanceStats,
} from "@/lib/seller-entities";
import {
  sellerRevenueTrend,
  sellerRetentionTrend,
  sellerCustomerSegments,
  sellerOrderFunnel,
  sellerCategoryRevenue,
  sellerGoals,
  sellerExtendedKpis,
  sellerHealthBreakdown,
  sellerFulfillmentMetrics,
  sellerRecentActivity,
  sellerTopProductsChart,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const PERIODS = ["7D", "30D", "90D"] as const;

export default function SellerDashboard() {
  const { t, locale } = useLocale();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const k = sellerExtendedKpis;
  const s = sellerDashboardStats;

  const revenueSpark = sellerRevenueTrend.map((d) => d.revenue);
  const ordersSpark = sellerRevenueTrend.map((d) => d.orders);

  const vsLabel = t("vsLastPeriod");

  const quickActions = [
    { href: "/seller/orders", label: t("orders"), sub: `${s.pendingOrders} ${t("pending").toLowerCase()}`, icon: ShoppingCart, color: "bg-blue-50 text-blue-700" },
    { href: "/seller/products/create", label: t("createProduct"), sub: t("addListing"), icon: Package, color: "bg-emerald-50 text-emerald-700" },
    { href: "/seller/finance/payouts/request", label: t("requestPayout"), sub: formatCurrency(sellerFinanceStats.availableBalance, locale), icon: Wallet, color: "bg-violet-50 text-violet-700" },
    { href: "/seller/promotions/create", label: t("newPromotion"), sub: t("boostSales"), icon: TrendingUp, color: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={sellerStore.name}
        subtitle={`${t("welcome")}, ${sellerStore.owner} · ${sellerStore.badge} ${t("sellerBadge")} · ⭐ ${sellerStore.rating} · ${t("healthScoreLabel")} ${sellerStore.healthScore}%`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/seller/analytics" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("analytics")}
            </Link>
            <Link href="/seller/products/create" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
              {t("createProduct")}
            </Link>
          </div>
        }
      />

      {/* KPI grid with sparklines */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={t("revenueMtd")} value={formatCurrency(k.mtdRevenue, locale)} change={k.mtdRevenueChange} spark={revenueSpark} icon={DollarSign} changeSuffix={vsLabel} />
        <KpiCard title={t("ordersMtd")} value={String(k.mtdOrders)} change={k.mtdOrdersChange} spark={ordersSpark} icon={ShoppingCart} changeSuffix={vsLabel} />
        <KpiCard title={t("avgOrderValue")} value={formatCurrency(k.avgOrderValue, locale)} change={k.aovChange} spark={revenueSpark.map((v, i) => v / Math.max(ordersSpark[i], 1))} icon={Target} changeSuffix={vsLabel} />
        <KpiCard title={t("conversionRate")} value={`${k.conversionRate}%`} change={k.conversionChange} spark={[2.8, 3.0, 3.1, 3.2, 3.4, 3.5, 3.8]} icon={BarChart3} changeSuffix={vsLabel} />
        <KpiCard title={t("customerRetention")} value={`${k.retentionRate}%`} change={k.retentionChange} spark={sellerRetentionTrend.map((d) => d.retention)} icon={RefreshCw} changeSuffix={vsLabel} />
        <KpiCard title={t("repeatCustomers")} value={`${k.repeatCustomerRate}%`} change={k.repeatChange} spark={[44, 46, 48, 49, 50, 51, 52]} icon={Users} changeSuffix={vsLabel} />
        <KpiCard title={t("customerLtv")} value={formatCurrency(k.customerLifetimeValue, locale)} change={k.clvChange} spark={[240, 252, 260, 268, 275, 280, 284]} icon={TrendingUp} changeSuffix={vsLabel} />
        <KpiCard title={t("refundRateKpi")} value={`${k.refundRate}%`} change={k.refundChange} positive={false} spark={[1.8, 1.6, 1.5, 1.4, 1.3, 1.2, 1.2]} icon={RotateCcw} changeSuffix={vsLabel} />
      </div>

      {/* Main charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{t("revenueAndOrders")}</h2>
              <p className="text-xs text-slate-500">{t("netEarnings")} {formatCurrency(k.netEarnings, locale)} · +{k.netChange}%</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                    period === p ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={sellerRevenueTrend} height={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("monthlyGoals")}</h2>
            <p className="text-xs text-slate-500">{t("progressJuneTargets")}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress
              label={t("revenueGoal")}
              current={sellerGoals.revenueCurrent}
              target={sellerGoals.revenueTarget}
              format={(n) => formatCurrency(n, locale)}
            />
            <GoalProgress label={t("ordersGoal")} current={sellerGoals.ordersCurrent} target={sellerGoals.ordersTarget} />
            <GoalProgress
              label={t("retentionGoal")}
              current={sellerGoals.retentionCurrent}
              target={sellerGoals.retentionTarget}
              unit="%"
            />
          </CardContent>
        </Card>
      </div>

      {/* Retention + customer segments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{t("customerRetention")}</h2>
              <p className="text-xs text-slate-500">{t("repeatPurchaseRate")}</p>
            </div>
            <Badge variant="success">+{k.retentionChange}%</Badge>
          </CardHeader>
          <CardContent>
            <RetentionBarChart data={sellerRetentionTrend} />
            <div className="mt-4 flex gap-4 rounded-xl bg-slate-50 p-4 text-center text-sm">
              <div className="flex-1">
                <p className="font-bold text-slate-900">1,478</p>
                <p className="text-xs text-slate-500">{t("totalCustomers")}</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="font-bold text-emerald-600">891</p>
                <p className="text-xs text-slate-500">{t("returning60d")}</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="font-bold text-amber-600">156</p>
                <p className="text-xs text-slate-500">{t("atRisk")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("customerSegments")}</h2>
            <p className="text-xs text-slate-500">{t("purchaseBehaviorBreakdown")}</p>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={sellerCustomerSegments.map((seg) => ({
                label: localizedField(locale, seg.label, seg.labelFr),
                pct: seg.pct,
                color: seg.color,
              }))}
            />
            <div className="mt-6 grid grid-cols-2 gap-3">
              {sellerCustomerSegments.map((seg) => (
                <div key={seg.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">{localizedField(locale, seg.label, seg.labelFr)}</p>
                  <p className="text-lg font-bold text-slate-900">{seg.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel + category revenue */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("conversionFunnel")}</h2>
            <p className="text-xs text-slate-500">{t("funnelViewsLast30Days")}</p>
          </CardHeader>
          <CardContent>
            <FunnelChart
              stages={sellerOrderFunnel.map((f) => ({
                stage: localizedField(locale, f.stage, f.stageFr),
                count: f.count,
                pct: f.pct,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("revenueByCategory")}</h2>
            <p className="text-xs text-slate-500">{t("mtdBreakdown")}</p>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerCategoryRevenue.map((c) => ({ name: c.category, revenue: c.revenue }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Health + fulfillment + quick actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("storeHealthScore")}</h2>
            <p className="text-3xl font-bold text-[var(--primary)]">{s.healthScore}%</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {sellerHealthBreakdown.map((h) => (
              <div key={h.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">{localizedField(locale, h.label, h.labelFr)}</span>
                  <span className="font-bold text-slate-900">{h.score}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${h.score}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("fulfillmentMetrics")}</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: t("onTimeDelivery"), value: `${sellerFulfillmentMetrics.onTimeDelivery}%` },
                { label: t("avgDispatch"), value: `${sellerFulfillmentMetrics.avgDispatchHours}h` },
                { label: t("returnRateKpi"), value: `${sellerFulfillmentMetrics.returnRate}%` },
                { label: t("cancellation"), value: `${sellerFulfillmentMetrics.cancellationRate}%` },
                { label: t("openShipments"), value: String(sellerFulfillmentMetrics.openShipments) },
                { label: t("avgRating"), value: `⭐ ${sellerFulfillmentMetrics.avgRating}` },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{m.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{m.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("quickActions")}</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
              >
                <div className={cn("rounded-lg p-2", a.color)}>
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{a.label}</p>
                  <p className="text-xs text-slate-500">{a.sub}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Products chart + activity + orders */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("topProducts")}</h2>
            <Link href="/seller/analytics/products" className="text-xs text-[var(--primary)] hover:underline">{t("details")}</Link>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerTopProductsChart.map((p) => ({ name: p.name, sold: p.sold }))}
              valueKey="sold"
              labelKey="name"
              formatValue={(v) => `${v} ${t("unitsSold")}`}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{t("liveActivity")}</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {sellerRecentActivity.map((a, i) => (
                <li key={i} className="flex gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <div>
                    <p className="text-sm text-slate-800">{localizedField(locale, a.text, a.textFr)}</p>
                    <p className="text-xs text-slate-400">{localizedField(locale, a.time, a.timeFr)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("lowStock")}</h2>
            <Link href="/seller/inventory" className="text-xs text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "name",
                  label: t("products"),
                  render: (row) => (
                    <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.name)}
                    </Link>
                  ),
                },
                { key: "sku", label: t("sku") },
                {
                  key: "availableStock",
                  label: t("stock"),
                  render: (row) => <Badge variant="warning">{String(row.availableStock)} {t("stockLeft")}</Badge>,
                },
              ]}
              data={lowStockProducts as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: orders, promotions, finance snapshot */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("recentOrders")}</h2>
            <Link href="/seller/orders" className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "id",
                  label: t("order"),
                  render: (row) => (
                    <Link href={`/seller/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: "customer", label: t("name") },
                { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "orderStatus", label: t("status"), render: (row) => <Badge variant="info">{String(row.orderStatus)}</Badge> },
              ]}
              data={sellerOrderList.slice(0, 5) as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t("activePromotions")}</h2>
              <Link href="/seller/promotions" className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  {
                    key: "campaign",
                    label: t("campaign"),
                    render: (row) => (
                      <Link href={`/seller/promotions/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                        {String(row.campaign)}
                      </Link>
                    ),
                  },
                  { key: "discount", label: t("discountPct"), render: (row) => `${row.discount}%` },
                  { key: "orders", label: t("orders") },
                  { key: "revenue", label: t("revenue"), render: (row) => formatCurrency(row.revenue as number, locale) },
                  { key: "roi", label: t("roi"), render: (row) => <Badge variant="success">{String(row.roi)}x</Badge> },
                  { key: "status", label: t("status"), render: (row) => <Badge variant="success">{String(row.status)}</Badge> },
                ]}
                data={promotionList.filter((p) => p.status === "active") as unknown as Record<string, unknown>[]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Truck className="h-4 w-4 text-[var(--primary)]" />
              <h2 className="font-semibold text-slate-900">{t("financeSnapshot")}</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-xl bg-blue-50 p-4">
                  <p className="truncate text-xs text-slate-500">{t("availableBalance")}</p>
                  <p className="money-value text-lg font-bold text-[var(--primary)] sm:text-xl">{formatCurrency(sellerFinanceStats.availableBalance, locale)}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-slate-50 p-4">
                  <p className="truncate text-xs text-slate-500">{t("pendingRevenue")}</p>
                  <p className="money-value text-lg font-bold text-slate-900 sm:text-xl">{formatCurrency(sellerFinanceStats.pendingRevenue, locale)}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-slate-50 p-4">
                  <p className="truncate text-xs text-slate-500">{t("commissionPaid")}</p>
                  <p className="money-value text-base font-bold text-slate-900 sm:text-lg">{formatCurrency(sellerFinanceStats.commissionPaid, locale)}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-slate-50 p-4">
                  <p className="truncate text-xs text-slate-500">{t("refundsMtd")}</p>
                  <p className="money-value text-base font-bold text-amber-600 sm:text-lg">{formatCurrency(sellerFinanceStats.refundAmount, locale)}</p>
                </div>
              </div>
              <Link href="/seller/finance" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline">
                {t("finance")} <ArrowUpRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
