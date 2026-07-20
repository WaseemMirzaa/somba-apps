"use client";

import Link from "next/link";
import { useState } from "react";
import {
  TrendingUp,
  ShoppingCart,
  Target,
  Package,
  Users,
  DollarSign,
  Boxes,
  BarChart3,
  ArrowUpRight,
  RotateCcw,
  Heart,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { DetailSection } from "@/components/ui/info-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { AnalyticsKpiCard, AnalyticsPeriodControls, EMPTY_ANALYTICS_DATE_RANGE } from "@/components/seller/analytics-kpi";
import {
  DualMetricChart,
  HorizontalBarChart,
  FunnelChart,
  SegmentDonut,
  GoalProgress,
  RetentionBarChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  sellerExtendedKpis,
  sellerRevenueTrend,
  sellerTopProductsChart,
  sellerCustomerSegments,
  sellerOrderFunnel,
  sellerCategoryRevenue,
  sellerRetentionTrend,
  sellerGoals,
  sellerHealthBreakdown,
  sellerFulfillmentMetrics,
  sellerRecentActivity,
} from "@/lib/seller-analytics";
import { useSellerData } from "@/lib/seller";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";

export default function SellerAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { topSellingProducts } = useSellerData();
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = sellerExtendedKpis;

  const revenueSpark = sellerRevenueTrend.map((d) => d.revenue);
  const ordersSpark = sellerRevenueTrend.map((d) => d.orders);

  const reportLinks = [
    {
      href: "/seller/analytics/products",
      label: fr ? "Analytique produits" : "Product Analytics",
      sub: fr ? "Performance · Conversion · Catégories" : "Performance · Conversion · Categories",
      icon: Package,
    },
    {
      href: "/seller/analytics/revenue",
      label: fr ? "Analytique revenus" : "Revenue Analytics",
      sub: fr ? "Brut · Net · Paiements · Transactions" : "Gross · Net · Payments · Transactions",
      icon: DollarSign,
    },
    {
      href: "/seller/analytics/customers",
      label: fr ? "Analytique clients" : "Customer Analytics",
      sub: fr ? "Segments · Rétention · Cohortes" : "Segments · Retention · Cohorts",
      icon: Users,
    },
    {
      href: "/seller/analytics/inventory",
      label: fr ? "Analytique inventaire" : "Inventory Analytics",
      sub: fr ? "Stock · Rotation · Réapprovisionnement" : "Stock · Turnover · Replenishment",
      icon: Boxes,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("analytics")}
        subtitle={fr ? "Revenus · Commandes · Conversion · Meilleurs vendeurs" : "Revenue Trend · Orders · Conversion · Best/Worst Sellers"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("analytics") }]}
        actions={<AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard
          title={fr ? "Revenu (MTD)" : "Revenue (MTD)"}
          value={formatCurrency(k.mtdRevenue, locale)}
          change={k.mtdRevenueChange}
          spark={revenueSpark}
          icon={TrendingUp}
        />
        <AnalyticsKpiCard
          title={fr ? "Commandes (MTD)" : "Orders (MTD)"}
          value={String(k.mtdOrders)}
          change={k.mtdOrdersChange}
          spark={ordersSpark}
          icon={ShoppingCart}
        />
        <AnalyticsKpiCard
          title={fr ? "Panier moyen" : "Avg. order value"}
          value={formatCurrency(k.avgOrderValue, locale)}
          change={k.aovChange}
          spark={[138, 140, 142, 144, 145, 146]}
          icon={DollarSign}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de conversion" : "Conversion rate"}
          value={`${k.conversionRate}%`}
          change={k.conversionChange}
          spark={[3.2, 3.4, 3.5, 3.6, 3.7, 3.8]}
          icon={Target}
        />
        <AnalyticsKpiCard
          title={fr ? "Rétention client" : "Customer retention"}
          value={`${k.retentionRate}%`}
          change={k.retentionChange}
          spark={sellerRetentionTrend.map((d) => d.retention)}
          icon={BarChart3}
        />
        <AnalyticsKpiCard
          title={fr ? "Clients récurrents" : "Repeat customers"}
          value={`${k.repeatCustomerRate}%`}
          change={k.repeatChange}
          spark={[46, 48, 49, 50, 51, 52]}
          icon={Users}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de retour" : "Return rate"}
          value={`${k.refundRate}%`}
          change={k.refundChange}
          positive={false}
          spark={[1.6, 1.5, 1.4, 1.3, 1.2, 1.2]}
          icon={RotateCcw}
        />
        <AnalyticsKpiCard
          title={fr ? "Gains nets" : "Net earnings"}
          value={formatCurrency(k.netEarnings, locale)}
          change={k.netChange}
          spark={revenueSpark.map((v) => v * 0.88)}
          icon={Heart}
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
                {fr ? "Gains nets" : "Net earnings"} {formatCurrency(k.netEarnings, locale)} · +{k.netChange}%
              </p>
            </div>
            <AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />
          </CardHeader>
          <CardContent>
            <DualMetricChart data={sellerRevenueTrend} height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Segments clients" : "Customer segments"}</h2>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={sellerCustomerSegments.map((seg) => ({
                label: fr ? seg.labelFr : seg.label,
                pct: seg.pct,
                color: seg.color,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Meilleures ventes" : "Best Sellers"}>
          {topSellingProducts.map((p) => (
            <Link key={p.id} href={`/seller/products/${p.id}`} className="mb-2 flex justify-between rounded-lg border border-red-50 p-3 text-sm transition-colors hover:bg-red-50/50">
              <span>{p.name}</span>
              <span className="font-medium text-emerald-600">{p.soldCount} {fr ? "vendus" : "sold"}</span>
            </Link>
          ))}
          <NavLinkButton href="/seller/analytics/products" className="mt-2">
            {fr ? "Voir analytique produits" : "View product analytics"} <ArrowUpRight className="h-3 w-3" />
          </NavLinkButton>
        </DetailSection>

        <DetailSection title={fr ? "Entonnoir de conversion" : "Conversion funnel"}>
          <FunnelChart
            stages={sellerOrderFunnel.map((f) => ({
              stage: fr ? f.stageFr : f.stage,
              count: f.count,
              pct: f.pct,
            }))}
          />
        </DetailSection>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Top produits" : "Top products"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerTopProductsChart.map((p) => ({ name: p.name, sold: p.sold }))}
              valueKey="sold"
              labelKey="name"
              formatValue={(v) => `${v} ${fr ? "vendus" : "sold"}`}
            />
          </CardContent>
        </Card>

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
      </div>

      <DetailSection title={fr ? "Rapports détaillés" : "Detailed Reports"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {reportLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xl border border-[var(--primary-tint)] p-5 transition-all hover:border-[var(--primary)] hover:bg-[var(--primary-light)] hover:shadow-sm"
            >
              <div className="mb-3 inline-flex rounded-xl bg-red-50 p-2.5 transition-transform group-hover:scale-105">
                <link.icon className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <p className="font-semibold text-slate-900">{link.label}</p>
              <p className="mt-1 text-xs text-slate-500">{link.sub}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
                {fr ? "Explorer" : "Explore"} <ArrowUpRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </DetailSection>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Rétention mensuelle" : "Monthly retention"}</h2>
          </CardHeader>
          <CardContent>
            <RetentionBarChart data={sellerRetentionTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Objectifs" : "Goals"}</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress
              label={fr ? "Objectif revenu" : "Revenue target"}
              current={sellerGoals.revenueCurrent}
              target={sellerGoals.revenueTarget}
              format={(n) => formatCurrency(n, locale)}
            />
            <GoalProgress
              label={fr ? "Objectif commandes" : "Orders target"}
              current={sellerGoals.ordersCurrent}
              target={sellerGoals.ordersTarget}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Santé boutique" : "Store health"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerHealthBreakdown.map((h) => ({
                name: fr
                  ? ({
                      "Fulfillment speed": "Vitesse d'expédition",
                      "Return rate": "Taux de retour",
                      "Customer rating": "Note client",
                      "Stock availability": "Disponibilité du stock",
                      "Response time": "Temps de réponse",
                    }[h.label] ?? h.label)
                  : h.label,
                score: h.score,
              }))}
              valueKey="score"
              labelKey="name"
              formatValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Expédition" : "Fulfillment"}>
          <InfoGrid
            items={[
              { label: fr ? "Délai expédition moy." : "Avg. dispatch time", value: `${sellerFulfillmentMetrics.avgDispatchHours}h` },
              { label: fr ? "Livraison à l'heure" : "On-time delivery", value: `${sellerFulfillmentMetrics.onTimeDelivery}%` },
              { label: fr ? "Taux de retour" : "Return rate", value: `${sellerFulfillmentMetrics.returnRate}%` },
              { label: fr ? "Taux d'annulation" : "Cancellation rate", value: `${sellerFulfillmentMetrics.cancellationRate}%` },
              { label: fr ? "Expéditions ouvertes" : "Open shipments", value: sellerFulfillmentMetrics.openShipments },
              { label: fr ? "Note moyenne" : "Avg. rating", value: `★ ${sellerFulfillmentMetrics.avgRating}` },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Indicateurs clés" : "Key metrics"}>
          <InfoGrid
            items={[
              { label: fr ? "Valeur vie client" : "Customer lifetime value", value: formatCurrency(k.customerLifetimeValue, locale) },
              { label: fr ? "Taux récurrent" : "Repeat rate", value: `${k.repeatCustomerRate}%` },
              { label: fr ? "Gains nets (MTD)" : "Net earnings (MTD)", value: formatCurrency(k.netEarnings, locale) },
              { label: fr ? "Objectif rétention" : "Retention target", value: `${sellerGoals.retentionTarget}%` },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Activité récente" : "Recent activity"} span={3}>
          <div className="space-y-3">
            {sellerRecentActivity.map((a, i) => (
              <div key={i} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0">
                <span className="shrink-0 text-xs text-slate-400">{fr ? a.timeFr : a.time}</span>
                <span className="text-sm text-slate-700">{fr ? a.textFr : a.text}</span>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
