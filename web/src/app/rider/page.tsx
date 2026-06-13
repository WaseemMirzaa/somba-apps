"use client";

import Link from "next/link";
import {
  Bike, CheckCircle, Clock,
  ArrowUpRight, ArrowDownRight, Activity, Target,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  SegmentDonut,
  Sparkline,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { riderProfile, riderTasks } from "@/lib/rider-entities";
import {
  riderEarningsTrend,
  riderExtendedKpis,
  riderTaskBreakdown,
  riderZonePerformance,
  riderRecentActivity,
} from "@/lib/rider-analytics";
import { cn } from "@/lib/utils";

function KpiCard({
  title,
  value,
  change,
  positive,
  spark,
  icon: Icon,
}: {
  title: string;
  value: string;
  change: number;
  positive?: boolean;
  spark: number[];
  icon: React.ComponentType<{ className?: string }>;
}) {
  const up = change >= 0;
  const good = positive !== undefined ? (positive ? up : !up) : up;

  return (
    <div className="card-premium p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">{value}</p>
          <p className={cn("mt-1 flex items-center gap-0.5 text-xs font-semibold", good ? "text-emerald-600" : "text-red-500")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}%
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-xl bg-emerald-50 p-2">
            <Icon className="h-4 w-4 text-emerald-600" />
          </div>
          <Sparkline values={spark} color="#059669" />
        </div>
      </div>
    </div>
  );
}

export default function RiderDashboardPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const k = riderExtendedKpis;
  const activeTasks = riderTasks.filter((task) => task.status !== "delivered");
  const completed = riderTasks.filter((task) => task.status === "delivered").length;

  const deliveriesSpark = riderEarningsTrend.map((d) => d.orders);

  return (
    <div className="space-y-6">
      <PageHeader
        title={riderProfile.name}
        subtitle={`${t("welcome")} · ${riderProfile.zone} · On duty · ⭐ ${k.rating}`}
      />

      <div className="grid grid-cols-2 gap-3">
        <KpiCard title={t("activeTasks")} value={String(activeTasks.length)} change={k.deliveriesChange} spark={deliveriesSpark} icon={Bike} />
        <KpiCard title={t("completedToday")} value={String(completed)} change={k.deliveriesChange} spark={deliveriesSpark} icon={CheckCircle} />
        <KpiCard title="On-time rate" value={`${k.onTimeRate}%`} change={k.onTimeChange} spark={[91, 92, 93, 93.5, 94, 94.2, 94.4]} icon={Target} />
        <KpiCard title="Avg delivery" value={`${k.avgDeliveryMin} min`} change={k.avgChange} positive={false} spark={[32, 31, 30, 29, 29, 28, 28]} icon={Clock} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Task breakdown</h2>
            <p className="text-xs text-slate-500">Today&apos;s delivery types</p>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={riderTaskBreakdown.map((seg) => ({
                label: fr ? seg.typeFr : seg.type,
                pct: seg.pct,
                color: seg.type === "Standard delivery" ? "#059669" : seg.type === "Returns pickup" ? "#d97706" : "#7c3aed",
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
                <p className="text-xs text-slate-400">{fr ? item.timeFr : item.time}</p>
                <p className="mt-1 text-sm text-slate-700">{fr ? item.textFr : item.text}</p>
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
          <Link href="/rider/tasks" className="text-sm text-emerald-600 hover:underline">View all</Link>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: "Task",
                render: (row) => (
                  <Link href={`/rider/tasks/${row.id}`} className="font-medium text-emerald-600 hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "type",
                label: "Type",
                render: (row) => <Badge variant="primary">{String(row.type)}</Badge>,
              },
              { key: "customer", label: "Customer" },
              { key: "distance", label: "Distance" },
              { key: "eta", label: "ETA" },
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
