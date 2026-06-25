"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Package,
  Send,
  RotateCcw,
  AlertTriangle,
  Clock,
  Truck,
  Target,
  DollarSign,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
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
  GoalProgress,
  RevenueAreaChart,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import {
  warehouseExtendedKpis,
  warehouseThroughputTrend,
  warehouseInboundDispatchTrend,
  warehouseLaneUtilization,
  warehouseHealthBreakdown,
  warehouseSlaBreakdown,
  warehouseExceptionMetrics,
  warehouseExceptionLog,
  warehouseReturnMetrics,
  warehouseReturnTrend,
  warehouseRiderLeaderboard,
  warehouseTopBatches,
  warehouseInboundByHour,
  warehouseRecentActivity,
  warehouseGoals,
} from "@/lib/warehouse-analytics";
import { formatCurrency } from "@/lib/utils";

export default function WarehouseAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);
  const k = warehouseExtendedKpis;

  const inboundSpark = warehouseInboundDispatchTrend.map((d) => d.inbound);
  const dispatchSpark = warehouseInboundDispatchTrend.map((d) => d.dispatch);

  const throughputData = warehouseInboundDispatchTrend.map((d) => ({
    label: fr ? d.labelFr : d.label,
    revenue: d.inbound,
    orders: d.dispatch,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("analytics")}
        subtitle={
          fr
            ? "Réception · Expédition · Débit · Lanes · Livreurs · Retours · Exceptions · SLA"
            : "Inbound · Dispatch · Throughput · Lanes · Riders · Returns · Exceptions · SLAs"
        }
        breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("analytics") }]}
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
          title={fr ? "Réception (auj.)" : "Inbound (today)"}
          value={String(k.receivedToday)}
          change={k.receivedChange}
          spark={inboundSpark}
          icon={Package}
        />
        <AnalyticsKpiCard
          title={fr ? "Expédition (auj.)" : "Dispatch (today)"}
          value={String(k.dispatchedToday)}
          change={k.dispatchedChange}
          spark={dispatchSpark}
          icon={Send}
        />
        <AnalyticsKpiCard
          title={fr ? "Livraison à l'heure" : "On-time delivery"}
          value={`${k.onTimeRate}%`}
          change={k.onTimeChange}
          spark={[93.8, 94.2, 94.8, 95.6, 96.0, 96.4]}
          icon={Target}
        />
        <AnalyticsKpiCard
          title={fr ? "Paiements collectés" : "Payments collected"}
          value={formatCurrency(k.codCollected, locale)}
          change={k.codChange}
          spark={warehouseThroughputTrend.map((d) => d.revenue * 30)}
          icon={DollarSign}
        />
        <AnalyticsKpiCard
          title={fr ? "Taux de retour" : "Return rate"}
          value={`${k.returnRate}%`}
          change={k.returnChange}
          positive={false}
          spark={warehouseReturnTrend.map((d) => d.received)}
          icon={RotateCcw}
        />
        <AnalyticsKpiCard
          title={fr ? "Temps traitement moy." : "Avg. process time"}
          value={`${k.avgProcessHours}h`}
          change={k.processChange}
          positive={false}
          spark={[5.2, 4.8, 4.6, 4.4, 4.3, 4.2]}
          icon={Clock}
        />
        <AnalyticsKpiCard
          title={fr ? "Lots actifs" : "Active batches"}
          value={String(k.activeBatches)}
          change={2.4}
          spark={[10, 11, 12, 13, 14, 14]}
          icon={Truck}
        />
        <AnalyticsKpiCard
          title={fr ? "Colis vieillis" : "Aged parcels"}
          value={String(k.agedParcels)}
          change={-14.3}
          positive={false}
          spark={[12, 10, 9, 8, 7, 6]}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
              {fr ? "Réception vs expédition" : "Inbound vs dispatch"}
            </h2>
            <p className="text-xs text-slate-500">{period} · {fr ? "Volume quotidien" : "Daily volume"}</p>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={throughputData} height={240} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Utilisation des lanes" : "Lane utilization"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={warehouseLaneUtilization.map((l) => ({ name: fr ? l.laneFr : l.lane, pct: l.pct }))}
              valueKey="pct"
              labelKey="name"
              formatValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Réception par heure" : "Inbound by hour"}</h2>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={warehouseInboundByHour.map((d) => ({ label: d.hour, value: d.parcels }))}
              valueKey="value"
              height={200}
              color="var(--primary)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Tendance retours" : "Return trend"}</h2>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={warehouseReturnTrend.map((d) => ({ label: fr ? d.labelFr : d.label, value: d.received }))}
              valueKey="value"
              height={200}
              color="#d97706"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Performance livreurs" : "Rider performance"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Classement par livraisons" : "Ranked by deliveries"}</p>
          </div>
          <NavLinkButton href="/warehouse/riders">
            {t("viewAll")}
          </NavLinkButton>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "name",
                label: fr ? "Livreur" : "Rider",
                render: (row) => (
                  <Link href={`/warehouse/riders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              { key: "deliveries", label: fr ? "Livraisons" : "Deliveries" },
              {
                key: "onTime",
                label: fr ? "À l'heure" : "On-time",
                render: (row) => `${row.onTime}%`,
              },
              {
                key: "codCollected",
                label: fr ? "Paiements" : "Payments",
                render: (row) => formatCurrency(row.codCollected as number, locale),
              },
              {
                key: "rating",
                label: fr ? "Note" : "Rating",
                render: (row) => `★ ${row.rating}`,
              },
              {
                key: "exceptions",
                label: fr ? "Exceptions" : "Exceptions",
                render: (row) => (
                  <Badge variant={Number(row.exceptions) > 2 ? "warning" : "default"}>
                    {String(row.exceptions)}
                  </Badge>
                ),
              },
            ]}
            data={warehouseRiderLeaderboard as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/warehouse/riders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            )}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Lots récents" : "Recent batches"}</h2>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "id",
                  label: fr ? "Lot" : "Batch",
                  render: (row) => (
                    <Link href={`/warehouse/dispatch/${String(row.id).replace("BAT-", "")}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: "parcels", label: fr ? "Colis" : "Parcels" },
                { key: "rider", label: fr ? "Livreur" : "Rider" },
                {
                  key: "status",
                  label: fr ? "Statut" : "Status",
                  render: (row) => String(fr ? row.statusFr : row.status),
                },
                {
                  key: "onTime",
                  label: fr ? "À l'heure" : "On-time",
                  render: (row) => (Number(row.onTime) > 0 ? `${row.onTime}%` : "—"),
                },
                {
                  key: "cod",
                  label: fr ? "Paiements" : "Payments",
                  render: (row) => formatCurrency(row.cod as number, locale),
                },
              ]}
              data={warehouseTopBatches as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={`/warehouse/dispatch/${String(row.id).replace("BAT-", "")}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Journal exceptions" : "Exception log"}</h2>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "id", label: "ID" },
                {
                  key: "type",
                  label: fr ? "Type" : "Type",
                  render: (row) => String(fr ? row.typeFr : row.type),
                },
                { key: "parcel", label: fr ? "Colis" : "Parcel" },
                { key: "age", label: fr ? "Âge" : "Age" },
                {
                  key: "status",
                  label: fr ? "Statut" : "Status",
                  render: (row) => (
                    <Badge variant={row.status === "Resolved" || row.statusFr === "Résolu" ? "success" : "warning"}>
                      {String(fr ? row.statusFr : row.status)}
                    </Badge>
                  ),
                },
                {
                  key: "priority",
                  label: fr ? "Priorité" : "Priority",
                  render: (row) => (
                    <Badge variant={row.priority === "Critical" ? "danger" : row.priority === "High" ? "warning" : "default"}>
                      {String(fr ? row.priorityFr : row.priority)}
                    </Badge>
                  ),
                },
              ]}
              data={warehouseExceptionLog as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Objectifs opérationnels" : "Operational goals"}</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress
              label={fr ? "Objectif expédition" : "Dispatch target"}
              current={warehouseGoals.dispatchCurrent}
              target={warehouseGoals.dispatchTarget}
            />
            <GoalProgress
              label={fr ? "Objectif réception" : "Inbound target"}
              current={warehouseGoals.inboundCurrent}
              target={warehouseGoals.inboundTarget}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Santé entrepôt" : "Warehouse health"}</h2>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={warehouseHealthBreakdown.map((h) => ({ name: fr ? h.labelFr : h.label, score: h.score }))}
              valueKey="score"
              labelKey="name"
              formatValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Débit hebdomadaire" : "Weekly throughput"}</h2>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={warehouseThroughputTrend.map((d) => ({ label: fr ? d.labelFr : d.label, value: d.orders }))}
              valueKey="value"
              height={180}
              color="var(--primary)"
            />
          </CardContent>
        </Card>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "SLA opérationnels" : "Operational SLAs"} span={2}>
          <DataTable
            columns={[
              {
                key: "sla",
                label: "SLA",
                render: (row) => String(fr ? row.slaFr : row.sla),
              },
              { key: "target", label: fr ? "Cible" : "Target", render: (row) => `${row.target}%` },
              { key: "actual", label: fr ? "Réel" : "Actual", render: (row) => `${row.actual}%` },
              {
                key: "delta",
                label: "Δ",
                render: (row) => {
                  const delta = (row.actual as number) - (row.target as number);
                  return (
                    <span className={delta >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  );
                },
              },
            ]}
            data={warehouseSlaBreakdown as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Métriques exceptions" : "Exception metrics"}>
          <InfoGrid
            items={[
              { label: fr ? "Exceptions ouvertes" : "Open exceptions", value: warehouseExceptionMetrics.openExceptions },
              { label: fr ? "Délai résolution moy." : "Avg. resolution time", value: `${warehouseExceptionMetrics.avgResolutionHours}h` },
              { label: fr ? "Colis endommagés" : "Damaged parcels", value: warehouseExceptionMetrics.damagedParcels },
              { label: fr ? "Colis perdus" : "Lost parcels", value: warehouseExceptionMetrics.lostParcels },
              { label: fr ? "Mauvaise route" : "Misrouted", value: warehouseExceptionMetrics.misrouted },
              { label: fr ? "Cause principale" : "Top cause", value: fr ? warehouseExceptionMetrics.topCauseFr : warehouseExceptionMetrics.topCause },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Métriques retours" : "Return metrics"}>
          <InfoGrid
            items={[
              { label: fr ? "Retours en attente" : "Pending returns", value: warehouseReturnMetrics.pendingReturns },
              { label: fr ? "Traités aujourd'hui" : "Processed today", value: warehouseReturnMetrics.processedToday },
              { label: fr ? "Inspection moy." : "Avg. inspection", value: `${warehouseReturnMetrics.avgInspectionHours}h` },
              { label: fr ? "Taux remise en stock" : "Restock rate", value: `${warehouseReturnMetrics.restockRate}%` },
              { label: fr ? "Taux mise au rebut" : "Dispose rate", value: `${warehouseReturnMetrics.disposeRate}%` },
              { label: fr ? "Retour vendeur" : "Return to seller", value: `${warehouseReturnMetrics.returnToSellerRate}%` },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Activité récente" : "Recent activity"} span={3}>
          <div className="space-y-3">
            {warehouseRecentActivity.map((a, i) => (
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
          { href: "/warehouse/inbound", label: fr ? "Réception" : "Inbound", icon: Package },
          { href: "/warehouse/dispatch", label: fr ? "Expédition" : "Dispatch", icon: Send },
          { href: "/warehouse/returns", label: fr ? "Retours" : "Returns", icon: RotateCcw },
          { href: "/warehouse/exceptions", label: fr ? "Exceptions" : "Exceptions", icon: AlertTriangle },
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
