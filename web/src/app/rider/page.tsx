"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bike, CheckCircle, DollarSign, Clock,
  Activity, Target, Banknote,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  DualMetricChart,
  SegmentDonut,
} from "@/components/charts/dashboard-charts";
import { KpiCard } from "@/components/ui/kpi-card";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";
import { riderProfile, riderTasks } from "@/lib/rider-entities";
import {
  riderEarningsTrend,
  riderExtendedKpis,
  riderTaskBreakdown,
  riderZonePerformance,
  riderRecentActivity,
} from "@/lib/rider-analytics";
import { formatCurrency } from "@/lib/utils";

export default function RiderDashboardPage() {
  const { t, locale } = useLocale();
  const [period] = useState("7D");
  const k = riderExtendedKpis;
  const activeTasks = riderTasks.filter((task) => task.status !== "delivered");
  const completed = riderTasks.filter((task) => task.status === "delivered").length;

  const earningsSpark = riderEarningsTrend.map((d) => d.revenue);
  const deliveriesSpark = riderEarningsTrend.map((d) => d.orders);

  return (
    <div className="space-y-6">
      <PageHeader
        title={riderProfile.name}
        subtitle={`${t("welcome")} · ${riderProfile.zone} · On duty · ⭐ ${k.rating}`}
      />

      <div className="grid grid-cols-2 gap-3">
        <KpiCard compact title={t("activeTasks")} value={String(activeTasks.length)} change={k.deliveriesChange} spark={deliveriesSpark} icon={Bike} iconBgClassName="bg-emerald-50" iconClassName="text-emerald-600" sparkColor="#059669" />
        <KpiCard compact title={t("completedToday")} value={String(completed)} change={k.deliveriesChange} spark={deliveriesSpark} icon={CheckCircle} iconBgClassName="bg-emerald-50" iconClassName="text-emerald-600" sparkColor="#059669" />
        <KpiCard compact title={t("earnings")} value={formatCurrency(k.earningsToday, locale)} change={k.earningsChange} spark={earningsSpark} icon={DollarSign} iconBgClassName="bg-emerald-50" iconClassName="text-emerald-600" sparkColor="#059669" />
        <KpiCard compact title={t("codCollectedKpi")} value={formatCurrency(k.codCollected, locale)} change={k.codChange} spark={[320, 340, 360, 380, 400, 410, 420]} icon={Banknote} iconBgClassName="bg-emerald-50" iconClassName="text-emerald-600" sparkColor="#059669" />
        <KpiCard compact title={t("onTimeRateKpi")} value={`${k.onTimeRate}%`} change={k.onTimeChange} spark={[91, 92, 93, 93.5, 94, 94.2, 94.4]} icon={Target} iconBgClassName="bg-emerald-50" iconClassName="text-emerald-600" sparkColor="#059669" />
        <KpiCard compact title={t("avgDeliveryKpi")} value={`${k.avgDeliveryMin} min`} change={k.avgChange} positive={false} spark={[32, 31, 30, 29, 29, 28, 28]} icon={Clock} iconBgClassName="bg-emerald-50" iconClassName="text-emerald-600" sparkColor="#059669" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Earnings trend</h2>
            <p className="text-xs text-slate-500">{period} · +{k.incentives} incentives today</p>
          </div>
          <Badge variant="success">{formatCurrency(k.earningsToday, locale)} today</Badge>
        </CardHeader>
        <CardContent>
          <DualMetricChart data={riderEarningsTrend} height={180} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Task breakdown</h2>
            <p className="text-xs text-slate-500">Today&apos;s delivery types</p>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={riderTaskBreakdown.map((seg) => ({
                label: localizedField(locale, seg.type, seg.typeFr),
                pct: seg.pct,
                color: seg.type === "Standard delivery" ? "#059669" : seg.type === "COD collection" ? "#2563eb" : seg.type === "Returns pickup" ? "#d97706" : "#7c3aed",
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Recent activity</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {riderRecentActivity.map((item) => (
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
          <h2 className="font-semibold text-slate-900">Zone performance</h2>
          <p className="text-xs text-slate-500">Deliveries & avg time by zone</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {riderZonePerformance.map((zone) => (
              <div key={zone.zone} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-xs font-medium text-slate-600">{zone.zone}</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{zone.deliveries}</p>
                <p className="text-xs text-slate-500">avg {zone.avgMin} min</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold text-slate-900">{t("activeTasks")}</h2>
          <Link href="/rider/tasks" className="text-sm text-emerald-600 hover:underline">{t("viewAll")}</Link>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: t("task"),
                render: (row) => (
                  <Link href={`/rider/tasks/${row.id}`} className="font-medium text-emerald-600 hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "type",
                label: t("type"),
                render: (row) => <Badge variant="primary">{String(row.type)}</Badge>,
              },
              { key: "customer", label: t("customer") },
              { key: "distance", label: t("distance") },
              { key: "eta", label: t("eta") },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge>{String(row.status).replace("_", " ")}</Badge>,
              },
            ]}
            data={activeTasks.slice(0, 5) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
