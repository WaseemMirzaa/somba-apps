"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Package,
  Send,
  Layers,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Clock,
  Inbox,
  ArrowUpDown,
  ArrowUpRight,
  Activity,
  Truck,
  Target,
  DollarSign,
  PackageX,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  DualMetricChart,
  HorizontalBarChart,
  GoalProgress,
} from "@/components/charts/dashboard-charts";
import {
  AnalyticsKpiCard,
  AnalyticsPeriodControls,
  EMPTY_ANALYTICS_DATE_RANGE,
} from "@/components/seller/analytics-kpi";
import type { AnalyticsPeriod, AnalyticsDateRange } from "@/components/seller/analytics-kpi";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { warehouseDashboardStats } from "@/lib/warehouse-entities";
import {
  warehouseThroughputTrend,
  warehouseExtendedKpis,
  warehouseInboundDispatchTrend,
  warehouseLaneUtilization,
  warehouseRiderLeaderboard,
  warehouseHealthBreakdown,
  warehouseRecentActivity,
  warehouseGoals,
  warehouseDashboardAlerts,
  warehouseDispatchQueue,
  warehouseReturnMetrics,
  warehouseExceptionMetrics,
} from "@/lib/warehouse-analytics";
import { formatCurrency } from "@/lib/utils";
import { useOpsPath } from "@/lib/ops-path";

const alertPriorityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  Critical: "danger",
  High: "warning",
  Medium: "info",
  Low: "default",
};

const dispatchStatusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  Building: "warning",
  Ready: "info",
  Dispatched: "success",
  Delivered: "success",
};

const alertIcon = {
  exception: AlertTriangle,
  returns: RotateCcw,
  aged: PackageX,
  cod: DollarSign,
} as const;

export function WarehouseDashboardView({ hubName }: { hubName?: string }) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { persona } = useAuth();
  const { getWarehouse } = useWarehouseAdmin();
  const ops = useOpsPath();
  const s = warehouseDashboardStats;
  const k = warehouseExtendedKpis;
  const [period, setPeriod] = useState<AnalyticsPeriod>("7D");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(EMPTY_ANALYTICS_DATE_RANGE);

  const warehouse = persona.warehouseId ? getWarehouse(persona.warehouseId) : undefined;
  const title = hubName ?? warehouse?.name ?? (fr ? "Opérations fulfillment" : "Fulfillment Operations");

  const inboundSpark = warehouseInboundDispatchTrend.map((d) => d.inbound);
  const dispatchSpark = warehouseInboundDispatchTrend.map((d) => d.dispatch);
  const throughputData = warehouseInboundDispatchTrend.map((d) => ({
    label: d.label,
    revenue: d.inbound,
    orders: d.dispatch,
  }));

  const quickLinks = [
    { path: "/inbound", label: fr ? "File entrante" : "Inbound Queue", countKey: "inboundQueue" as const, icon: Inbox },
    { path: "/sorting", label: fr ? "Table de tri" : "Sorting Board", countKey: "sortingQueue" as const, icon: ArrowUpDown },
    { path: "/dispatch", label: fr ? "File expédition" : "Dispatch Queue", countKey: "dispatchQueue" as const, icon: Send },
    { path: "/returns", label: fr ? "File retours" : "Returns Queue", countKey: "returnQueue" as const, icon: RotateCcw },
    { path: "/exceptions", label: fr ? "Exceptions" : "Exceptions", countKey: null, count: warehouseExceptionMetrics.openExceptions, icon: AlertTriangle },
    { path: "/aged", label: fr ? "Colis vieillis" : "Aged Parcels", countKey: null, count: k.agedParcels, icon: PackageX },
    { path: "/deliveries", label: fr ? "Livraisons" : "Deliveries", countKey: null, count: s.dispatchedToday - s.failedDeliveries, icon: Truck },
    { path: "/analytics", label: t("analytics"), countKey: null, count: null, icon: Target },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={
          fr
            ? `${k.receivedToday} reçus · ${k.dispatchedToday} expédiés · À l'heure ${k.onTimeRate}% · ${warehouseExceptionMetrics.openExceptions} exceptions ouvertes`
            : `${k.receivedToday} received · ${k.dispatchedToday} dispatched · On-time ${k.onTimeRate}% · ${warehouseExceptionMetrics.openExceptions} open exceptions`
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AnalyticsPeriodControls
              period={period}
              onPeriodChange={setPeriod}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <Link href={ops("/dispatch")} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
              {fr ? "Ouvrir expédition" : "Open dispatch"}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsKpiCard title={fr ? "Réception (auj.)" : "Received today"} value={String(k.receivedToday)} change={k.receivedChange} spark={inboundSpark} icon={Package} />
        <AnalyticsKpiCard title={fr ? "Expédition (auj.)" : "Dispatched today"} value={String(k.dispatchedToday)} change={k.dispatchedChange} spark={dispatchSpark} icon={Send} />
        <AnalyticsKpiCard title={fr ? "Livraison à l'heure" : "On-time rate"} value={`${k.onTimeRate}%`} change={k.onTimeChange} spark={[94, 94.5, 95, 95.2, 96, 96.2, 96.4]} icon={Clock} />
        <AnalyticsKpiCard title={fr ? "Paiements collectés" : "Payments collected"} value={formatCurrency(k.codCollected, locale)} change={k.codChange} spark={warehouseThroughputTrend.map((d) => d.revenue * 30)} icon={DollarSign} />
        <AnalyticsKpiCard title={fr ? "Taux de retour" : "Return rate"} value={`${k.returnRate}%`} change={k.returnChange} positive={false} spark={[2.2, 2.1, 2.0, 1.9, 1.9, 1.8, 1.8]} icon={RotateCcw} />
        <AnalyticsKpiCard title={fr ? "Temps traitement moy." : "Avg. process time"} value={`${k.avgProcessHours}h`} change={k.processChange} positive={false} spark={[5.1, 4.8, 4.6, 4.5, 4.4, 4.3, 4.2]} icon={RefreshCw} />
        <AnalyticsKpiCard title={fr ? "Lots actifs" : "Active batches"} value={String(k.activeBatches)} change={8} spark={[10, 11, 12, 12, 13, 14, 14]} icon={Layers} />
        <AnalyticsKpiCard title={fr ? "Colis vieillis" : "Aged parcels"} value={String(k.agedParcels)} change={-14} positive={false} spark={[12, 10, 9, 8, 8, 7, 6]} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
                {fr ? "Débit hebdomadaire" : "Weekly throughput"}
              </h2>
              <p className="text-xs text-slate-500">
                {fr ? "Réception & expédition" : "Inbound & dispatch"} · {period}
              </p>
            </div>
            <Badge variant="info">{s.dispatchedToday - s.failedDeliveries} {fr ? "en transit" : "in transit"}</Badge>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={throughputData} height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Objectifs du jour" : "Today's goals"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Cibles opérationnelles" : "Operational targets"}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <GoalProgress label={fr ? "Objectif expédition" : "Dispatch target"} current={warehouseGoals.dispatchCurrent} target={warehouseGoals.dispatchTarget} />
            <GoalProgress label={fr ? "Objectif réception" : "Inbound target"} current={warehouseGoals.inboundCurrent} target={warehouseGoals.inboundTarget} />
            <GoalProgress label={fr ? "Objectif à l'heure" : "On-time target"} current={warehouseGoals.onTimeCurrent} target={warehouseGoals.onTimeTarget} format={(n) => `${n}%`} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Utilisation des lanes" : "Lane utilization"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Capacité lanes de tri" : "Sort lane capacity today"}</p>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={warehouseLaneUtilization.map((l) => ({ name: l.lane, revenue: l.pct }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Alertes opérationnelles" : "Operational alerts"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Exceptions · Retours · Colis vieillis · Paiements" : "Exceptions · Returns · Aged · Payments"}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouseDashboardAlerts.map((alert) => {
              const Icon = alertIcon[alert.type];
              return (
                <Link
                  key={alert.id}
                  href={ops(alert.href)}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[var(--primary)]" />
              <div>
                <h2 className="font-semibold text-slate-900">{fr ? "File d'expédition" : "Dispatch queue"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Lots en préparation et prêts" : "Batches building & ready"}</p>
              </div>
            </div>
            <Link href={ops("/dispatch")} className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "id",
                  label: "Batch",
                  render: (row) => (
                    <Link href={ops(`/dispatch/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: "parcels", label: fr ? "Colis" : "Parcels" },
                { key: "rider", label: fr ? "Livreur" : "Rider" },
                { key: "zone", label: fr ? "Zone" : "Zone" },
                { key: "eta", label: "ETA" },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => (
                    <Badge variant={dispatchStatusVariant[row.status as string] ?? "default"}>
                      {fr ? row.statusFr : row.status}
                    </Badge>
                  ),
                },
              ]}
              data={warehouseDispatchQueue as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Score ops" : "Ops health score"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Réception aux exceptions" : "Inbound through exceptions"}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouseHealthBreakdown.map((h) => (
              <div key={h.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">{h.label}</span>
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
        {quickLinks.map((link) => (
          <Link
            key={link.path}
            href={ops(link.path)}
            className="group flex items-center gap-3 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm transition-all hover:border-[var(--primary)] hover:shadow-md"
          >
            <div className="rounded-lg bg-indigo-50 p-2">
              <link.icon className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{link.label}</p>
              {(link.countKey ? s[link.countKey] : link.count) != null && (
                <p className="text-xl font-bold text-indigo-700">{link.countKey ? s[link.countKey] : link.count}</p>
              )}
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-[var(--primary)]" />
              <div>
                <h2 className="font-semibold text-slate-900">{fr ? "Performance livreurs" : "Rider performance"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Classement du jour" : "Today's leaderboard"}</p>
              </div>
            </div>
            <Link href={ops("/riders")} className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                {
                  key: "name",
                  label: fr ? "Livreur" : "Rider",
                  render: (row) => (
                    <Link href={ops(`/riders/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.name)}
                    </Link>
                  ),
                },
                { key: "deliveries", label: fr ? "Livraisons" : "Deliveries" },
                { key: "onTime", label: fr ? "À l'heure %" : "On-time %", render: (row) => `${row.onTime}%` },
                { key: "codCollected", label: fr ? "Paiements" : "Payments", render: (row) => formatCurrency(row.codCollected as number, locale) },
                { key: "rating", label: fr ? "Note" : "Rating", render: (row) => `★ ${row.rating}` },
                { key: "exceptions", label: fr ? "Exceptions" : "Exceptions" },
              ]}
              data={warehouseRiderLeaderboard.slice(0, 6) as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-slate-900">{fr ? "Activité récente" : "Recent activity"}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {warehouseRecentActivity.map((item) => (
              <div key={item.text} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="text-xs text-slate-400">{fr ? item.timeFr : item.time}</p>
                <p className="mt-1 text-sm text-slate-700">{fr ? item.textFr : item.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">{fr ? "Livraisons actives" : "Active deliveries"}</h2>
            <Link href={ops("/deliveries")} className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{s.dispatchedToday - s.failedDeliveries}</p>
            <p className="text-sm text-slate-500">{fr ? "En transit maintenant" : "In transit right now"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">{fr ? "Retours en attente" : "Pending returns"}</h2>
            <Link href={ops("/returns")} className="text-sm text-[var(--primary)] hover:underline">{t("viewAll")}</Link>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{warehouseReturnMetrics.pendingReturns}</p>
            <p className="text-sm text-slate-500">
              {warehouseReturnMetrics.processedToday} {fr ? "traités aujourd'hui" : "processed today"} · {warehouseReturnMetrics.restockRate}% {fr ? "remis en stock" : "restocked"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
