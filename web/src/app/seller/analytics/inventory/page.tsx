"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Package,
  Boxes,
  AlertTriangle,
  RotateCcw,
  TrendingUp,
  Clock,
  DollarSign,
  Truck,
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
  RevenueAreaChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  sellerInventoryKpis,
  sellerStockAging,
  sellerInventoryTurnover,
  sellerReplenishmentAlerts,
  sellerInventoryMovementTrend,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";

function priorityVariant(priority: string): "danger" | "warning" | "success" {
  if (priority === "Critical" || priority === "Critique") return "danger";
  if (priority === "High" || priority === "Élevée") return "warning";
  return "success";
}

export default function SellerInventoryAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = sellerInventoryKpis;

  const soldSpark = sellerInventoryMovementTrend.map((d) => d.sold);
  const receivedSpark = sellerInventoryMovementTrend.map((d) => d.received);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Analytique inventaire" : "Inventory Analytics"}
        subtitle={fr ? "Stock · Rotation · Vieillissement · Réapprovisionnement" : "Stock · Turnover · Aging · Replenishment"}
        backHref="/seller/analytics"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("analytics"), href: "/seller/analytics" },
          { label: fr ? "Inventaire" : "Inventory" },
        ]}
        actions={<AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard
          title={fr ? "Unités totales" : "Total units"}
          value={k.totalUnits.toLocaleString()}
          change={k.unitsChange}
          spark={[2960, 2920, 2880, 2860, 2840]}
          icon={Boxes}
        />
        <AnalyticsKpiCard
          title={fr ? "Disponibles" : "Available"}
          value={k.availableUnits.toLocaleString()}
          change={-1.8}
          spark={[1980, 1960, 1940, 1930, 1920]}
          icon={Package}
        />
        <AnalyticsKpiCard
          title={fr ? "Stock faible" : "Low stock SKUs"}
          value={String(k.lowStockSkus)}
          change={k.lowStockChange}
          positive={false}
          spark={[4, 4, 5, 5, 6]}
          icon={AlertTriangle}
        />
        <AnalyticsKpiCard
          title={fr ? "Rupture de stock" : "Out of stock"}
          value={String(k.outOfStockSkus)}
          change={0}
          positive={false}
          spark={[1, 2, 2, 2, 2]}
          icon={RotateCcw}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de rotation" : "Turnover rate"}
          value={`${k.turnoverRate}x`}
          change={k.turnoverChange}
          spark={[3.4, 3.6, 3.8, 4.0, 4.2]}
          icon={TrendingUp}
        />
        <AnalyticsKpiCard
          title={fr ? "Jours en stock (moy.)" : "Avg. days on hand"}
          value={String(k.avgDaysOnHand)}
          change={k.daysChange}
          spark={[38, 36, 34, 31, 28]}
          icon={Clock}
        />
        <AnalyticsKpiCard
          title={fr ? "Valeur du stock" : "Stock value"}
          value={formatCurrency(k.stockValue, locale)}
          change={k.valueChange}
          spark={[380000, 395000, 405000, 418000, 428600]}
          icon={DollarSign}
        />
        <AnalyticsKpiCard
          title={fr ? "Réservé" : "Reserved"}
          value={k.reservedUnits.toLocaleString()}
          change={3.2}
          spark={[360, 380, 390, 410, 420]}
          icon={Truck}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Mouvements de stock" : "Stock movements"}</h2>
            <p className="text-xs text-slate-500">{period} · {fr ? "Par semaine" : "Weekly"}</p>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={sellerInventoryMovementTrend.map((d) => ({ label: d.label, value: d.sold }))}
              valueKey="value"
              height={200}
              color="var(--primary)"
            />
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
              {sellerInventoryMovementTrend.map((d) => (
                <div key={d.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">{d.label}</p>
                  <p className="mt-1 text-emerald-600">+{d.received} {fr ? "reçus" : "received"}</p>
                  <p className="text-[var(--primary)]">-{d.sold} {fr ? "vendus" : "sold"}</p>
                  <p className="text-amber-600">{d.returned} {fr ? "retours" : "returns"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Vieillissement du stock" : "Stock aging"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Répartition par ancienneté" : "Distribution by age"}</p>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerStockAging.map((b) => ({
                name: fr ? b.bucketFr : b.bucket,
                units: b.units,
              }))}
              valueKey="units"
              labelKey="name"
              formatValue={(v) => `${v} ${fr ? "unités" : "units"}`}
            />
            <div className="mt-4 space-y-2">
              {sellerStockAging.map((b) => (
                <div key={b.bucket} className="flex justify-between text-xs">
                  <span className="text-slate-600">{fr ? b.bucketFr : b.bucket}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(b.value, locale)} · {b.pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Rotation par SKU" : "Turnover by SKU"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Vitesse de vente et jours en stock" : "Sell-through rate and days on hand"}</p>
          </div>
          <NavLinkButton href="/seller/inventory">
            {t("viewAll")}
          </NavLinkButton>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "product",
                label: fr ? "Produit" : "Product",
                render: (row) => (
                  <Link href={`/seller/inventory/${row.sku}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.product)}
                  </Link>
                ),
              },
              { key: "sku", label: "SKU" },
              { key: "sold", label: fr ? "Vendus (30j)" : "Sold (30d)" },
              { key: "onHand", label: fr ? "En stock" : "On hand" },
              {
                key: "turnover",
                label: fr ? "Rotation" : "Turnover",
                render: (row) => `${row.turnover}x`,
              },
              {
                key: "daysOnHand",
                label: fr ? "Jours en stock" : "Days on hand",
                render: (row) => {
                  const days = row.daysOnHand as number;
                  const variant = days > 60 ? "danger" : days > 30 ? "warning" : "success";
                  return <Badge variant={variant}>{days}d</Badge>;
                },
              },
            ]}
            data={sellerInventoryTurnover as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{fr ? "Alertes de réapprovisionnement" : "Replenishment alerts"}</h2>
          <p className="text-xs text-slate-500">{fr ? "SKUs sous le seuil minimum" : "SKUs below minimum threshold"}</p>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "sku", label: "SKU" },
              { key: "product", label: fr ? "Produit" : "Product" },
              {
                key: "onHand",
                label: fr ? "En stock" : "On hand",
                render: (row) => <Badge variant="warning">{String(row.onHand)}</Badge>,
              },
              { key: "threshold", label: fr ? "Seuil" : "Threshold" },
              {
                key: "suggested",
                label: fr ? "Qté suggérée" : "Suggested qty",
                render: (row) => <span className="font-semibold text-[var(--primary)]">{String(row.suggested)}</span>,
              },
              {
                key: "leadDays",
                label: fr ? "Délai (j)" : "Lead (days)",
                render: (row) => `${row.leadDays}d`,
              },
              {
                key: "priority",
                label: fr ? "Priorité" : "Priority",
                render: (row) => (
                  <Badge variant={priorityVariant(String(row.priority))}>
                    {fr ? String(row.priorityFr) : String(row.priority)}
                  </Badge>
                ),
              },
            ]}
            data={sellerReplenishmentAlerts as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <DetailGrid>
        <DetailGridSection title={fr ? "Résumé inventaire" : "Inventory summary"} span={2}>
          <InfoGrid
            columns={4}
            items={[
              { label: "SKUs", value: String(k.totalSkus) },
              { label: fr ? "Unités totales" : "Total units", value: k.totalUnits.toLocaleString() },
              { label: fr ? "Disponibles" : "Available", value: k.availableUnits.toLocaleString() },
              { label: fr ? "Réservées" : "Reserved", value: k.reservedUnits.toLocaleString() },
              { label: fr ? "Stock faible" : "Low stock", value: String(k.lowStockSkus) },
              { label: fr ? "Rupture" : "Out of stock", value: String(k.outOfStockSkus) },
              { label: fr ? "Valeur totale" : "Total value", value: formatCurrency(k.stockValue, locale) },
              { label: fr ? "Rotation moyenne" : "Avg. turnover", value: `${k.turnoverRate}x / ${fr ? "mois" : "month"}` },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Mouvements récents" : "Recent movements"}>
          <div className="space-y-2 text-sm">
            {sellerInventoryMovementTrend.map((d) => (
              <div key={d.label} className="rounded-lg border border-slate-100 p-3">
                <p className="font-medium text-slate-800">{d.label}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">{fr ? "Reçus" : "Received"}</p>
                    <p className="font-bold text-emerald-600">+{d.received}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">{fr ? "Vendus" : "Sold"}</p>
                    <p className="font-bold text-[var(--primary)]">-{d.sold}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">{fr ? "Retours" : "Returns"}</p>
                    <p className="font-bold text-amber-600">{d.returned}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
