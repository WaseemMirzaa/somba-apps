"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ShoppingCart,
  DollarSign,
  Users,
  AlertTriangle,
  TrendingUp,
  Target,
  BarChart3,
  RotateCcw,
  Activity,
  Shield,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  DualMetricChart,
  RetentionBarChart,
  FunnelChart,
  HorizontalBarChart,
  GoalProgress,
} from "@/components/charts/dashboard-charts";
import { KpiCard } from "@/components/ui/kpi-card";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { orderEntities, sellerEntities } from "@/lib/entities";
import {
  adminRevenueTrend,
  adminExtendedKpis,
  adminSellerGrowth,
  adminCategoryGmv,
  adminOrderFunnel,
  adminFulfillmentHealth,
  adminRecentActivity,
  adminGoals,
} from "@/lib/admin-analytics";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { localizedField } from "@/lib/locale-helpers";

const PERIODS = ["7D", "30D", "90D"] as const;

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  delivered: "success",
  processing: "info",
  pending: "warning",
  cancelled: "danger",
  approved: "success",
};

export default function AdminDashboard() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const k = adminExtendedKpis;

  const revenueSpark = adminRevenueTrend.map((d) => d.revenue);
  const ordersSpark = adminRevenueTrend.map((d) => d.orders);

  const vsLabel = t("vsLastPeriod");

  const quickActions = [
    { href: "/admin/orders", label: t("orders"), sub: `${formatNumber(k.ordersMtd, locale)} MTD`, icon: ShoppingCart, color: "bg-blue-50 text-blue-700" },
    { href: "/admin/sellers", label: t("activeSellers"), sub: `${k.pendingApprovals} ${t("pending").toLowerCase()}`, icon: Users, color: "bg-emerald-50 text-emerald-700" },
    { href: "/admin/payouts", label: t("payouts"), sub: formatCurrency(84200, locale), icon: DollarSign, color: "bg-violet-50 text-violet-700" },
    { href: "/admin/fraud", label: t("fraudReview"), sub: `${k.fraudFlags} ${t("fraudFlags")}`, icon: Shield, color: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("marketplaceDashboard")}
        subtitle={`${t("welcome")}, Admin · GMV ${formatCurrency(k.gmvMtd, locale)} MTD · ${formatNumber(k.activeCustomers, locale)} ${t("customers").toLowerCase()}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/analytics" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("analytics")}
            </Link>
            <Link href="/admin/sellers" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
              {t("approve")} {t("sellers").toLowerCase()}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={t("gmvMtd")} value={formatCurrency(k.gmvMtd, locale)} change={k.gmvChange} spark={revenueSpark} icon={DollarSign} changeSuffix={vsLabel} />
        <KpiCard title={t("ordersMtd")} value={formatNumber(k.ordersMtd, locale)} change={k.ordersChange} spark={ordersSpark} icon={ShoppingCart} changeSuffix={vsLabel} />
        <KpiCard title={t("activeSellers")} value={formatNumber(k.activeSellers, locale)} change={k.sellersChange} spark={adminSellerGrowth.map((d) => d.sellers)} icon={Users} changeSuffix={vsLabel} />
        <KpiCard title={t("activeCustomersKpi")} value={formatNumber(k.activeCustomers, locale)} change={k.customersChange} spark={[42000, 43800, 45100, 46200, 47100, 47800, 48200]} icon={TrendingUp} changeSuffix={vsLabel} />
        <KpiCard title={t("conversionRate")} value={`${k.conversionRate}%`} change={k.conversionChange} spark={[3.2, 3.4, 3.5, 3.6, 3.7, 3.75, 3.8]} icon={BarChart3} changeSuffix={vsLabel} />
        <KpiCard title={t("avgOrderValue")} value={formatCurrency(k.avgOrderValue, locale)} change={k.aovChange} spark={revenueSpark.map((v, i) => v / Math.max(ordersSpark[i], 1))} icon={Target} changeSuffix={vsLabel} />
        <KpiCard title={t("returnRateKpi")} value={`${k.returnRate}%`} change={k.returnChange} positive={false} spark={[2.4, 2.3, 2.2, 2.2, 2.1, 2.1, 2.1]} icon={RotateCcw} changeSuffix={vsLabel} />
        <KpiCard title={t("pendingApprovals")} value={String(k.pendingApprovals)} change={-12} positive={false} spark={[31, 28, 26, 25, 24, 23, 23]} icon={AlertTriangle} changeSuffix={vsLabel} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">{t("gmvAndOrders")}</h2>
              <p className="text-xs text-slate-500">{t("revenueTrend")}</p>
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
            <DualMetricChart data={adminRevenueTrend} height={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("juneGoals")}</h2>
            <p className="text-xs text-slate-500">{t("progressMonthlyTargets")}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress label={t("gmvGoal")} current={adminGoals.gmvCurrent} target={adminGoals.gmvTarget} format={(n) => formatCurrency(n, locale)} />
            <GoalProgress label={t("ordersGoal")} current={adminGoals.ordersCurrent} target={adminGoals.ordersTarget} />
            <GoalProgress label={t("sellersGoal")} current={adminGoals.sellersCurrent} target={adminGoals.sellersTarget} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{t("sellerGrowth")}</h2>
              <p className="text-xs text-slate-500">{t("activeSellersRetention")}</p>
            </div>
            <Badge variant="success">+{k.sellersChange}%</Badge>
          </CardHeader>
          <CardContent>
            <RetentionBarChart
              data={adminSellerGrowth.map((d) => ({
                month: d.month,
                retention: d.retention,
                churn: 100 - d.retention,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("categoryGmv")}</h2>
            <p className="text-xs text-slate-500">{t("mtdBreakdown")}</p>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={adminCategoryGmv.map((c) => ({ name: c.category, revenue: c.gmv }))}
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
            <h2 className="font-semibold text-slate-900">{t("orderFunnel")}</h2>
            <p className="text-xs text-slate-500">{t("funnelVisitsLast30Days")}</p>
          </CardHeader>
          <CardContent>
            <FunnelChart
              stages={adminOrderFunnel.map((f) => ({
                stage: localizedField(locale, f.stage, f.stageFr),
                count: f.count,
                pct: f.pct,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("fulfillmentHealth")}</h2>
            <p className="text-xs text-slate-500">{t("opsScoreBreakdown")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {adminFulfillmentHealth.map((h) => (
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href} className={cn("card-premium flex items-center gap-4 p-4 transition-shadow hover:shadow-md", action.color.split(" ")[0])}>
            <div className={cn("rounded-xl p-3", action.color)}>
              <action.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{action.label}</p>
              <p className="text-xs text-slate-500">{action.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t("recentOrders")}</h2>
              <Link href="/admin/orders" className="text-sm text-blue-600 hover:underline">{t("viewAll")}</Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "id", label: t("idCol"), render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="text-blue-600 hover:underline">{String(row.id)}</Link>
                )},
                { key: "customer", label: t("name") },
                { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "status", label: t("status"), render: (row) => (
                  <Badge variant={statusVariant[row.status as string] ?? "default"}>
                    {t(row.status as Parameters<typeof t>[0]) || String(row.status)}
                  </Badge>
                )},
              ]}
              data={orderEntities.slice(0, 5) as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{t("recentActivity")}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {adminRecentActivity.map((item) => (
              <div key={item.text} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="text-xs text-slate-400">{localizedField(locale, item.time, item.timeFr)}</p>
                <p className="mt-1 text-sm text-slate-700">{localizedField(locale, item.text, item.textFr)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("sellerQueue")}</h2>
            <Link href="/admin/sellers" className="text-sm text-blue-600 hover:underline">{t("viewAll")}</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "storeName", label: t("store"), render: (row) => (
                <Link href={`/admin/sellers/${row.id}`} className="text-blue-600 hover:underline">{String(row.storeName)}</Link>
              )},
              { key: "owner", label: t("name") },
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={statusVariant[row.status as string] ?? "default"}>
                  {t(row.status as Parameters<typeof t>[0]) || String(row.status)}
                </Badge>
              )},
              { key: "action", label: t("action"), render: (row) =>
                row.status === "pending" ? (
                  <div className="flex gap-2">
                    <button onClick={() => toast(`Seller ${row.storeName} approved`)} className="text-xs font-medium text-emerald-600 hover:underline">{t("approve")}</button>
                    <button onClick={() => toast(`Seller ${row.storeName} rejected`)} className="text-xs font-medium text-red-600 hover:underline">{t("reject")}</button>
                  </div>
                ) : (
                  <Link href={`/admin/sellers/${row.id}`} className="text-xs font-medium text-blue-600 hover:underline">{t("view")}</Link>
                ),
              },
            ]}
            data={sellerEntities as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
