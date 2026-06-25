"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Package,
  Eye,
  ShoppingCart,
  Star,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { AnalyticsKpiCard, AnalyticsPeriodControls, EMPTY_ANALYTICS_DATE_RANGE } from "@/components/seller/analytics-kpi";
import {
  HorizontalBarChart,
  FunnelChart,
  RevenueAreaChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  sellerProductKpis,
  sellerProductPerformance,
  sellerWorstProducts,
  sellerProductViewTrend,
  sellerProductCategoryBreakdown,
  sellerOrderFunnel,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";

export default function SellerProductAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = sellerProductKpis;

  const viewSpark = sellerProductViewTrend.map((d) => d.views);
  const orderSpark = sellerProductViewTrend.map((d) => d.orders);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Analytique produits" : "Product Analytics"}
        subtitle={fr ? "Performance · Conversion · Catégories · Tendances" : "Performance · Conversion · Categories · Trends"}
        backHref="/seller/analytics"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("analytics"), href: "/seller/analytics" },
          { label: fr ? "Produits" : "Products" },
        ]}
        actions={<AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard
          title={fr ? "Produits actifs" : "Active listings"}
          value={String(k.activeListings)}
          change={4.2}
          spark={[38, 39, 40, 41, 42]}
          icon={Package}
        />
        <AnalyticsKpiCard
          title={fr ? "Vues totales" : "Total views"}
          value={k.totalViews.toLocaleString()}
          change={k.viewsChange}
          spark={viewSpark}
          icon={Eye}
        />
        <AnalyticsKpiCard
          title={fr ? "Commandes" : "Orders"}
          value={k.totalOrders.toLocaleString()}
          change={k.ordersChange}
          spark={orderSpark}
          icon={ShoppingCart}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de conversion" : "Conversion rate"}
          value={`${k.avgConversion}%`}
          change={k.conversionChange}
          spark={[3.4, 3.6, 3.8, 4.0, 4.2]}
          icon={BarChart3}
        />
        <AnalyticsKpiCard
          title={fr ? "Note moyenne" : "Avg. rating"}
          value={`${k.avgRating}★`}
          change={k.ratingChange}
          spark={[4.4, 4.5, 4.5, 4.6, 4.7]}
          icon={Star}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de retour" : "Return rate"}
          value={`${k.returnRate}%`}
          change={k.returnChange}
          positive={false}
          spark={[1.8, 1.7, 1.6, 1.5, 1.4]}
          icon={RotateCcw}
        />
        <AnalyticsKpiCard
          title={fr ? "Marge moyenne" : "Avg. margin"}
          value={`${k.avgMargin}%`}
          change={k.marginChange}
          spark={[20.8, 21.2, 21.8, 22.2, 22.8]}
          icon={TrendingUp}
        />
        <AnalyticsKpiCard
          title={fr ? "Total produits" : "Total products"}
          value={String(k.totalProducts)}
          change={2.1}
          spark={[44, 45, 46, 47, 48]}
          icon={Package}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
              {fr ? "Tendance vues & commandes" : "Views & orders trend"}
            </h2>
            <p className="text-xs text-slate-500">{period} · {fr ? "Par semaine" : "Weekly"}</p>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={sellerProductViewTrend.map((d) => ({ label: d.label, value: d.views }))}
              valueKey="value"
              height={220}
              color="var(--primary)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Entonnoir de conversion" : "Conversion funnel"}</h2>
            <p className="text-xs text-slate-500">{fr ? "30 derniers jours" : "Last 30 days"}</p>
          </CardHeader>
          <CardContent>
            <FunnelChart
              stages={sellerOrderFunnel.map((f) => ({
                stage: fr ? f.stageFr : f.stage,
                count: f.count,
                pct: f.pct,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Performance produits" : "Product performance"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Classement par revenu" : "Ranked by revenue"}</p>
          </div>
          <NavLinkButton href="/seller/products">
            {t("viewAll")}
          </NavLinkButton>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "name",
                label: fr ? "Produit" : "Product",
                render: (row) => (
                  <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              { key: "sku", label: "SKU" },
              { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => (fr ? String(row.categoryFr ?? row.category) : String(row.category)) },
              { key: "views", label: fr ? "Vues" : "Views", render: (row) => Number(row.views).toLocaleString() },
              { key: "orders", label: t("orders") },
              {
                key: "revenue",
                label: t("amount"),
                render: (row) => formatCurrency(row.revenue as number, locale),
              },
              {
                key: "conversion",
                label: fr ? "Conv." : "Conv.",
                render: (row) => `${row.conversion}%`,
              },
              {
                key: "rating",
                label: fr ? "Note" : "Rating",
                render: (row) => `★ ${row.rating}`,
              },
              {
                key: "trend",
                label: fr ? "Tendance" : "Trend",
                render: (row) => {
                  const trend = row.trend as number;
                  const up = trend >= 0;
                  return (
                    <span className={`flex items-center gap-0.5 font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(trend)}%
                    </span>
                  );
                },
              },
            ]}
            data={sellerProductPerformance as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Revenu par catégorie" : "Revenue by category"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerProductCategoryBreakdown.map((c) => ({
                name: fr ? c.categoryFr : c.category,
                revenue: c.revenue,
              }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => formatCurrency(v, locale)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Produits sous-performants" : "Underperforming products"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Faible conversion ou retours élevés" : "Low conversion or high returns"}</p>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "name", label: fr ? "Produit" : "Product" },
                { key: "views", label: fr ? "Vues" : "Views" },
                { key: "conversion", label: fr ? "Conv." : "Conv.", render: (row) => `${row.conversion}%` },
                {
                  key: "returnRate",
                  label: fr ? "Retours" : "Returns",
                  render: (row) => <Badge variant="warning">{String(row.returnRate)}%</Badge>,
                },
                {
                  key: "revenue",
                  label: t("amount"),
                  render: (row) => formatCurrency(row.revenue as number, locale),
                },
              ]}
              data={sellerWorstProducts as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Résumé catégories" : "Category summary"} span={2}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sellerProductCategoryBreakdown.map((c) => (
              <div key={c.category} className="rounded-lg border border-slate-100 p-4">
                <p className="text-xs text-slate-500">{fr ? c.categoryFr : c.category}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(c.revenue, locale)}</p>
                <div className="mt-2 flex gap-3 text-xs text-slate-500">
                  <span>{c.products} {fr ? "produits" : "products"}</span>
                  <span>{c.sold.toLocaleString()} {fr ? "vendus" : "sold"}</span>
                  <span>★ {c.avgRating}</span>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Indicateurs clés" : "Key metrics"}>
          <InfoGrid
            items={[
              { label: fr ? "Produits actifs" : "Active listings", value: `${k.activeListings} / ${k.totalProducts}` },
              { label: fr ? "Vues moyennes / produit" : "Avg. views per product", value: Math.round(k.totalViews / k.totalProducts).toLocaleString() },
              { label: fr ? "Commandes moyennes / produit" : "Avg. orders per product", value: Math.round(k.totalOrders / k.activeListings) },
              { label: fr ? "Revenu moyen / produit" : "Avg. revenue per product", value: formatCurrency(89432 / k.activeListings, locale) },
            ]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
