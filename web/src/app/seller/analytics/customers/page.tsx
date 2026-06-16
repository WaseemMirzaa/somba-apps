"use client";

import { useState, useMemo } from "react";
import {
  Users,
  UserPlus,
  RefreshCw,
  Heart,
  ShoppingBag,
  TrendingUp,
  MapPin,
  UserX,
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
  RetentionBarChart,
  SegmentDonut,
  HorizontalBarChart,
  FunnelChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  sellerCustomerKpis,
  sellerCustomerSegments,
  sellerRetentionTrend,
  sellerTopCustomers,
  sellerCustomerGeography,
  sellerCustomerCohorts,
  sellerCustomerAcquisition,
  sellerOrderFunnel,
} from "@/lib/seller-analytics";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";

function segmentVariant(segment: string): "success" | "info" | "warning" | "purple" {
  if (segment === "VIP") return "purple";
  if (segment === "Returning" || segment === "Récurrent") return "success";
  if (segment === "At-risk" || segment === "À risque") return "warning";
  return "info";
}

export default function SellerCustomerAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = sellerCustomerKpis;

  const filteredTopCustomers = useMemo(
    () =>
      applyListFilters([...sellerTopCustomers], { ...EMPTY_LIST_FILTERS, ...dateRange }, { dateField: "lastOrder" }),
    [dateRange]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Analytique clients" : "Customer Analytics"}
        subtitle={fr ? "Segments · Rétention · Cohortes · Géographie · Acquisition" : "Segments · Retention · Cohorts · Geography · Acquisition"}
        backHref="/seller/analytics"
        breadcrumbs={[
          { label: "Seller", href: "/seller" },
          { label: t("analytics"), href: "/seller/analytics" },
          { label: fr ? "Clients" : "Customers" },
        ]}
        actions={<AnalyticsPeriodControls period={period} onPeriodChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard
          title={fr ? "Total clients" : "Total customers"}
          value={k.totalCustomers.toLocaleString()}
          change={k.totalChange}
          spark={[1280, 1320, 1380, 1420, 1478]}
          icon={Users}
        />
        <AnalyticsKpiCard
          title={fr ? "Nouveaux clients" : "New customers"}
          value={k.newCustomers.toLocaleString()}
          change={k.newChange}
          spark={[240, 268, 290, 318, 342]}
          icon={UserPlus}
        />
        <AnalyticsKpiCard
          title={fr ? "Clients récurrents" : "Returning customers"}
          value={k.returningCustomers.toLocaleString()}
          change={k.returningChange}
          spark={[780, 810, 840, 868, 891]}
          icon={RefreshCw}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de réachat" : "Repeat rate"}
          value={`${k.repeatRate}%`}
          change={k.repeatChange}
          spark={[44, 46, 48, 50, 52]}
          icon={Heart}
        />
        <AnalyticsKpiCard
          title={fr ? "Cmd. / client" : "Orders / customer"}
          value={String(k.avgOrdersPerCustomer)}
          change={k.ordersPerCustomerChange}
          spark={[2.2, 2.3, 2.4, 2.5, 2.6]}
          icon={ShoppingBag}
        />
        <AnalyticsKpiCard
          title={fr ? "Valeur vie client" : "Customer LTV"}
          value={formatCurrency(k.clv, locale)}
          change={k.clvChange}
          spark={[240, 252, 260, 272, 284]}
          icon={TrendingUp}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de désabonnement" : "Churn rate"}
          value={`${k.churnRate}%`}
          change={k.churnChange}
          positive={false}
          spark={[32, 30, 28, 25, 22]}
          icon={UserX}
        />
        <AnalyticsKpiCard
          title={fr ? "Rétention (60j)" : "Retention (60d)"}
          value="78%"
          change={4.1}
          spark={sellerRetentionTrend.map((d) => d.retention)}
          icon={RefreshCw}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Rétention client" : "Customer retention"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Taux de réachat mensuel" : "Month-over-month repeat rate"}</p>
            </div>
            <Badge variant="success">+4.1%</Badge>
          </CardHeader>
          <CardContent>
            <RetentionBarChart data={sellerRetentionTrend} />
            <div className="mt-4 flex gap-4 rounded-xl bg-slate-50 p-4 text-center text-sm">
              <div className="flex-1">
                <p className="font-bold text-slate-900">{k.totalCustomers.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{fr ? "Total clients" : "Total customers"}</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="font-bold text-emerald-600">{k.returningCustomers.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{fr ? "Récurrents (60j)" : "Returning (60d)"}</p>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex-1">
                <p className="font-bold text-amber-600">156</p>
                <p className="text-xs text-slate-500">{fr ? "À risque" : "At-risk"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Segments clients" : "Customer segments"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Par comportement d'achat" : "By purchase behavior"}</p>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={sellerCustomerSegments.map((seg) => ({
                label: fr ? seg.labelFr : seg.label,
                pct: seg.pct,
                color: seg.color,
              }))}
            />
            <div className="mt-6 grid grid-cols-2 gap-3">
              {sellerCustomerSegments.map((seg) => (
                <div key={seg.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">{fr ? seg.labelFr : seg.label}</p>
                  <p className="text-lg font-bold text-slate-900">{seg.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{seg.pct}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Entonnoir d'achat" : "Purchase funnel"}</h2>
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

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--primary)]" />
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Clients par ville" : "Customers by city"}</h2>
            </div>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerCustomerGeography.map((g) => ({
                name: fr ? g.cityFr : g.city,
                customers: g.customers,
              }))}
              valueKey="customers"
              labelKey="name"
              formatValue={(v) => `${v} ${fr ? "clients" : "customers"}`}
            />
            <div className="mt-4 space-y-2">
              {sellerCustomerGeography.map((g) => (
                <div key={g.city} className="flex justify-between text-xs">
                  <span className="text-slate-600">{fr ? g.cityFr : g.city}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(g.revenue, locale)} · {g.pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{fr ? "Meilleurs clients" : "Top customers"}</h2>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID" },
              { key: "name", label: t("name") },
              { key: "orders", label: t("orders") },
              {
                key: "spent",
                label: fr ? "Dépensé" : "Spent",
                render: (row) => formatCurrency(row.spent as number, locale),
              },
              { key: "lastOrder", label: fr ? "Dernière cmd." : "Last order" },
              {
                key: "segment",
                label: fr ? "Segment" : "Segment",
                render: (row) => (
                  <Badge variant={segmentVariant(String(row.segment))}>
                    {fr ? String(row.segmentFr) : String(row.segment)}
                  </Badge>
                ),
              },
            ]}
            data={filteredTopCustomers as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Analyse de cohortes" : "Cohort analysis"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Rétention % par mois d'inscription" : "Retention % by signup month"}</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4 font-semibold text-slate-500">{fr ? "Cohorte" : "Cohort"}</th>
                  {["M1", "M2", "M3", "M4", "M5", "M6"].map((m) => (
                    <th key={m} className="px-2 py-2 text-center font-semibold text-slate-500">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sellerCustomerCohorts.map((c) => (
                  <tr key={c.cohort} className="border-b border-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-700">{c.cohort}</td>
                    {[c.month1, c.month2, c.month3, c.month4, c.month5, c.month6].map((val, i) => (
                      <td key={i} className="px-2 py-2 text-center">
                        {val > 0 ? (
                          <span
                            className="inline-block rounded px-2 py-1 font-semibold text-white"
                            style={{
                              background: `rgba(220, 38, 38, ${val / 100})`,
                              opacity: val > 0 ? 1 : 0.3,
                            }}
                          >
                            {val}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Sources d'acquisition" : "Acquisition sources"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={sellerCustomerAcquisition.map((a) => ({
                name: fr ? a.sourceFr : a.source,
                customers: a.customers,
              }))}
              valueKey="customers"
              labelKey="name"
            />
            <div className="mt-4 space-y-2">
              {sellerCustomerAcquisition.map((a) => (
                <div key={a.source} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{fr ? a.sourceFr : a.source}</p>
                    <p className="text-xs text-slate-500">{a.customers} {fr ? "clients" : "customers"} · {a.pct}%</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {a.cost > 0 ? `${formatCurrency(a.cost, locale)} CAC` : fr ? "Gratuit" : "Free"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Profil client" : "Customer profile"} span={2}>
          <InfoGrid
            columns={4}
            items={[
              { label: fr ? "Total clients" : "Total customers", value: k.totalCustomers.toLocaleString() },
              { label: fr ? "Nouveaux (30j)" : "New (30d)", value: k.newCustomers.toLocaleString() },
              { label: fr ? "Récurrents" : "Returning", value: k.returningCustomers.toLocaleString() },
              { label: fr ? "Taux de réachat" : "Repeat rate", value: `${k.repeatRate}%` },
              { label: fr ? "Valeur vie client" : "Customer LTV", value: formatCurrency(k.clv, locale) },
              { label: fr ? "Cmd. moyennes / client" : "Avg. orders / customer", value: String(k.avgOrdersPerCustomer) },
              { label: fr ? "Taux de désabonnement" : "Churn rate", value: `${k.churnRate}%` },
              { label: fr ? "Rétention (60j)" : "Retention (60d)", value: "78%" },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Segments détaillés" : "Segment details"}>
          <div className="space-y-3">
            {sellerCustomerSegments.map((seg) => (
              <div key={seg.id} className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: seg.color }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{fr ? seg.labelFr : seg.label}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: seg.color }} />
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900">{seg.value}</span>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
