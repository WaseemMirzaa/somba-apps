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
  ArrowUpRight,
  Activity,
  Shield,
  Wallet,
  Scale,
  Package,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import {
  DualMetricChart,
  HorizontalBarChart,
  GoalProgress,
  Sparkline,
} from "@/components/charts/dashboard-charts";
import {
  AnalyticsKpiCard,
  AnalyticsPeriodControls,
  EMPTY_ANALYTICS_DATE_RANGE,
} from "@/components/seller/analytics-kpi";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { orderEntities, sellerEntities } from "@/lib/entities";
import {
  adminRevenueTrend,
  adminExtendedKpis,
  adminSellerGrowth,
  adminCategoryGmv,
  adminTopSellers,
  adminPendingActions,
  adminRecentActivity,
  adminGoals,
  adminDashboardAlerts,
  adminReturnMetrics,
  adminMarketplaceHealth,
} from "@/lib/admin-analytics";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  delivered: "success",
  processing: "info",
  pending: "warning",
  cancelled: "danger",
  approved: "success",
};

const alertPriorityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  Critical: "danger",
  High: "warning",
  Medium: "info",
  Low: "default",
};

const alertIcon = {
  fraud: Shield,
  returns: RotateCcw,
  dispute: Scale,
  payout: Wallet,
} as const;

export default function AdminDashboard() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = adminExtendedKpis;

  const revenueSpark = adminRevenueTrend.map((d) => d.revenue);
  const ordersSpark = adminRevenueTrend.map((d) => d.orders);

  const quickLinks = [
    { href: "/admin/orders", label: t("orders"), sub: `${formatNumber(k.ordersMtd, locale)} MTD`, icon: ShoppingCart },
    { href: "/admin/sellers", label: t("activeSellers"), sub: `${k.pendingApprovals} ${fr ? "en attente" : "pending"}`, icon: Users },
    { href: "/admin/payouts", label: fr ? "Versements" : "Payouts", sub: formatCurrency(84200, locale), icon: Wallet },
    { href: "/admin/fraud", label: fr ? "Fraude" : "Fraud", sub: `${k.fraudFlags} ${fr ? "alertes" : "flags"}`, icon: Shield },
    { href: "/admin/returns", label: fr ? "Retours" : "Returns", sub: `${adminReturnMetrics.returnRate}% ${fr ? "taux" : "rate"}`, icon: RotateCcw },
    { href: "/admin/disputes", label: fr ? "Litiges" : "Disputes", sub: fr ? "5 escaladés" : "5 escalated", icon: Scale },
    { href: "/admin/products", label: fr ? "Produits" : "Products", sub: fr ? "8 en modération" : "8 moderation", icon: Package },
    { href: "/admin/analytics", label: t("analytics"), sub: fr ? "Analyse détaillée" : "Deep dive", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Tableau de bord marketplace" : "Marketplace dashboard"}
        subtitle={
          fr
            ? `GMV ${formatCurrency(k.gmvMtd, locale)} MTD · ${formatNumber(k.activeCustomers, locale)} clients · Score santé ${adminMarketplaceHealth.overallScore}/100`
            : `GMV ${formatCurrency(k.gmvMtd, locale)} MTD · ${formatNumber(k.activeCustomers, locale)} customers · Health score ${adminMarketplaceHealth.overallScore}/100`
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AnalyticsPeriodControls
              period={period}
              onPeriodChange={setPeriod}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <Link href="/admin/sellers" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
              {t("approve")} sellers
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard title={fr ? "GMV (MTD)" : "GMV (MTD)"} value={formatCurrency(k.gmvMtd, locale)} change={k.gmvChange} spark={revenueSpark} icon={DollarSign} />
        <AnalyticsKpiCard title={fr ? "Commandes (MTD)" : "Orders (MTD)"} value={formatNumber(k.ordersMtd, locale)} change={k.ordersChange} spark={ordersSpark} icon={ShoppingCart} />
        <AnalyticsKpiCard title={t("activeSellers")} value={formatNumber(k.activeSellers, locale)} change={k.sellersChange} spark={adminSellerGrowth.map((d) => d.sellers)} icon={Users} />
        <AnalyticsKpiCard title={fr ? "Clients actifs" : "Active customers"} value={formatNumber(k.activeCustomers, locale)} change={k.customersChange} spark={[42000, 43800, 45100, 46200, 47100, 47800, 48200]} icon={TrendingUp} />
        <AnalyticsKpiCard title={fr ? "Taux de conversion" : "Conversion rate"} value={`${k.conversionRate}%`} change={k.conversionChange} spark={[3.2, 3.4, 3.5, 3.6, 3.7, 3.75, 3.8]} icon={BarChart3} />
        <AnalyticsKpiCard title={fr ? "Panier moyen" : "Avg. order value"} value={formatCurrency(k.avgOrderValue, locale)} change={k.aovChange} spark={revenueSpark.map((v, i) => v / Math.max(ordersSpark[i], 1))} icon={Target} />
        <AnalyticsKpiCard title={fr ? "Taux de retour" : "Return rate"} value={`${k.returnRate}%`} change={k.returnChange} positive={false} spark={[2.4, 2.3, 2.2, 2.2, 2.1, 2.1, 2.1]} icon={RotateCcw} />
        <AnalyticsKpiCard title={fr ? "Approbations en attente" : "Pending approvals"} value={String(k.pendingApprovals)} change={-12} positive={false} spark={[31, 28, 26, 25, 24, 23, 23]} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
                {fr ? "GMV & commandes" : "GMV & orders"}
              </h2>
              <p className="text-xs text-slate-500">
                {fr ? "Tendance revenu marketplace" : "Marketplace revenue trend"} · {period}
              </p>
            </div>
            <Badge variant="success">+{k.gmvChange}%</Badge>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={adminRevenueTrend} height={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Objectifs juin" : "June goals"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Progression mensuelle" : "Monthly progress"}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress label={fr ? "Objectif GMV" : "GMV goal"} current={adminGoals.gmvCurrent} target={adminGoals.gmvTarget} format={(n) => formatCurrency(n, locale)} />
            <GoalProgress label={fr ? "Objectif commandes" : "Orders goal"} current={adminGoals.ordersCurrent} target={adminGoals.ordersTarget} />
            <GoalProgress label={fr ? "Objectif vendeurs" : "Sellers goal"} current={adminGoals.sellersCurrent} target={adminGoals.sellersTarget} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "GMV par catégorie" : "GMV by category"}</h2>
            <p className="text-xs text-slate-500">MTD</p>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={adminCategoryGmv.map((c) => ({ name: fr ? c.categoryFr : c.category, revenue: c.gmv }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Alertes opérationnelles" : "Operational alerts"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Fraude · Retours · Litiges · Versements" : "Fraud · Returns · Disputes · Payouts"}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {adminDashboardAlerts.map((alert) => {
              const Icon = alertIcon[alert.type];
              return (
                <Link
                  key={alert.id}
                  href={alert.href}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-[var(--primary-tint)] hover:bg-[var(--primary-light)]"
                >
                  <div className="rounded-lg bg-amber-50 p-2">
                    <Icon className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{fr ? alert.titleFr : alert.title}</p>
                      <Badge variant={alertPriorityVariant[alert.priority] ?? "default"}>
                        {fr ? alert.priorityFr : alert.priority}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{fr ? alert.detailFr : alert.detail}</p>
                    <p className="mt-1 text-xs text-slate-400">{fr ? alert.timeFr : alert.time}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Top vendeurs" : "Top sellers"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Classement GMV MTD" : "Ranked by GMV MTD"}</p>
            </div>
            <NavLinkButton href="/admin/sellers">{t("viewAll")}</NavLinkButton>
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
                { key: "gmv", label: "GMV", render: (row) => formatCurrency(row.gmv as number, locale) },
                { key: "orders", label: t("orders") },
                { key: "rating", label: fr ? "Note" : "Rating", render: (row) => `★ ${row.rating}` },
                { key: "fulfillment", label: fr ? "Expédition" : "Fulfillment", render: (row) => `${row.fulfillment}%` },
                { key: "returns", label: fr ? "Retours" : "Returns", render: (row) => `${row.returns}%` },
              ]}
              data={adminTopSellers.slice(0, 5) as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={`/admin/sellers/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Actions en attente" : "Pending actions"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Priorité et volume" : "Priority and volume"}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {adminPendingActions.map((action) => (
              <div key={action.type} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <span className="text-sm text-slate-700">{fr ? action.typeFr : action.type}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={action.priority === "Critical" ? "danger" : action.priority === "High" ? "warning" : "default"}>
                    {fr ? action.priorityFr : action.priority}
                  </Badge>
                  <span className="font-bold text-slate-900">{action.count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-3 rounded-xl border border-[var(--primary-tint)] p-4 transition-all hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
          >
            <div className="rounded-xl bg-red-50 p-2">
              <link.icon className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{link.label}</p>
              <p className="text-xs text-slate-500">{link.sub}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t("recentOrders")}</h2>
              <NavLinkButton href="/admin/orders">{t("viewAll")}</NavLinkButton>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "id",
                  label: "ID",
                  render: (row) => (
                    <Link href={`/admin/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.id)}</Link>
                  ),
                },
                { key: "customer", label: t("customer") },
                { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <Badge variant={statusVariant[row.status as string] ?? "default"}>
                      {t(row.status as Parameters<typeof t>[0]) || String(row.status)}
                    </Badge>
                  ),
                },
              ]}
              data={orderEntities.slice(0, 5) as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={`/admin/orders/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{fr ? "Activité récente" : "Recent activity"}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {adminRecentActivity.map((item) => (
              <div key={item.text} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="text-xs text-slate-400">{fr ? item.timeFr : item.time}</p>
                <p className="mt-1 text-sm text-slate-700">{fr ? item.textFr : item.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("sellerQueue")}</h2>
            <NavLinkButton href="/admin/sellers">{t("viewAll")}</NavLinkButton>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "storeName",
                label: fr ? "Boutique" : "Store",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.storeName)}</Link>
                ),
              },
              { key: "owner", label: t("name") },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={statusVariant[row.status as string] ?? "default"}>
                    {t(row.status as Parameters<typeof t>[0]) || String(row.status)}
                  </Badge>
                ),
              },
              {
                key: "action",
                label: t("action"),
                render: (row) =>
                  row.status === "pending" ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => toast(fr ? `Vendeur ${row.storeName} approuvé` : `Seller ${row.storeName} approved`)} className="text-xs font-medium text-emerald-600 hover:underline">{t("approve")}</button>
                      <button type="button" onClick={() => toast(fr ? `Vendeur ${row.storeName} rejeté` : `Seller ${row.storeName} rejected`)} className="text-xs font-medium text-red-600 hover:underline">{t("reject")}</button>
                    </div>
                  ) : (
                    <Link href={`/admin/sellers/${row.id}`} className="text-xs font-medium text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
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
