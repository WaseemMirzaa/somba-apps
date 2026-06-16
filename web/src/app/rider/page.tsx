"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bike, CheckCircle, DollarSign, Clock,
  ArrowUpRight, ArrowDownRight, Activity, Target, Banknote,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ActiveDeliveryCard } from "@/components/delivery/active-delivery-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  DualMetricChart,
  SegmentDonut,
  Sparkline,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { riderProfile, getActiveRiderTasks, riderTasks } from "@/lib/rider-entities";
import { riderTaskToDeliveryDetail } from "@/lib/delivery-detail";
import {
  riderEarningsTrend,
  riderExtendedKpis,
  riderTaskBreakdown,
  riderZonePerformance,
  riderRecentActivity,
} from "@/lib/rider-analytics";
import { formatCurrency, cn } from "@/lib/utils";

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
  const [period] = useState("7D");
  const k = riderExtendedKpis;
  const activeTasks = getActiveRiderTasks();
  const completed = riderTasks.filter((task) => task.status === "delivered").length;

  const earningsSpark = riderEarningsTrend.map((d) => d.revenue);
  const deliveriesSpark = riderEarningsTrend.map((d) => d.orders);

  return (
    <div className="space-y-6">
      <PageHeader
        title={riderProfile.name}
        subtitle={`${t("welcome")} · ${riderProfile.zone} · ${fr ? "En service" : "On duty"} · ⭐ ${k.rating}`}
      />

      <div className="grid grid-cols-2 gap-3">
        <KpiCard title={t("activeTasks")} value={String(activeTasks.length)} change={k.deliveriesChange} spark={deliveriesSpark} icon={Bike} />
        <KpiCard title={t("completedToday")} value={String(completed)} change={k.deliveriesChange} spark={deliveriesSpark} icon={CheckCircle} />
        <KpiCard title={t("earnings")} value={formatCurrency(k.earningsToday, locale)} change={k.earningsChange} spark={earningsSpark} icon={DollarSign} />
        <KpiCard title={fr ? "Paiements collectés" : "Payments collected"} value={formatCurrency(k.codCollected, locale)} change={k.codChange} spark={[320, 340, 360, 380, 400, 410, 420]} icon={Banknote} />
        <KpiCard title={fr ? "Taux de ponctualité" : "On-time rate"} value={`${k.onTimeRate}%`} change={k.onTimeChange} spark={[91, 92, 93, 93.5, 94, 94.2, 94.4]} icon={Target} />
        <KpiCard title={fr ? "Livraison moyenne" : "Avg delivery"} value={`${k.avgDeliveryMin} min`} change={k.avgChange} positive={false} spark={[32, 31, 30, 29, 29, 28, 28]} icon={Clock} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Tendance des gains" : "Earnings trend"}</h2>
            <p className="text-xs text-slate-500">{period} · +{k.incentives} {fr ? "primes aujourd'hui" : "incentives today"}</p>
          </div>
          <Badge variant="success">{formatCurrency(k.earningsToday, locale)} {fr ? "aujourd'hui" : "today"}</Badge>
        </CardHeader>
        <CardContent>
          <DualMetricChart data={riderEarningsTrend} height={180} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Répartition des tâches" : "Task breakdown"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Types de livraison du jour" : "Today's delivery types"}</p>
          </CardHeader>
          <CardContent>
            <SegmentDonut
              segments={riderTaskBreakdown.map((seg) => ({
                label: fr ? seg.typeFr : seg.type,
                pct: seg.pct,
                color: seg.type === "Standard delivery" ? "#059669" : seg.type === "Payment collection" ? "#2563eb" : seg.type === "Returns pickup" ? "#d97706" : "#7c3aed",
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">{fr ? "Activité récente" : "Recent activity"}</h2>
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
          <h2 className="font-semibold text-slate-900">{fr ? "Performance par zone" : "Zone performance"}</h2>
          <p className="text-xs text-slate-500">{fr ? "Livraisons et temps moyen par zone" : "Deliveries & avg time by zone"}</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {riderZonePerformance.map((zone) => (
              <div key={zone.zone} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-xs font-medium text-slate-600">{zone.zone}</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{zone.deliveries}</p>
                <p className="text-xs text-slate-500">{fr ? "moy." : "avg"} {zone.avgMin} min</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              {fr ? "Livraisons actives" : "Current Deliveries"}
            </h2>
            <p className="text-xs text-slate-500">
              {activeTasks.length} {fr ? "en cours" : "active"}
            </p>
          </div>
          <Link href="/rider/tasks" className="text-sm text-emerald-600 hover:underline">
            {fr ? "Toutes les tâches" : "All tasks"}
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeTasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              {fr ? "Aucune livraison active." : "No active deliveries."}
            </p>
          ) : (
            activeTasks.map((task) => (
              <ActiveDeliveryCard
                key={task.id}
                delivery={riderTaskToDeliveryDetail(task)}
                locale={locale}
                alwaysExpanded
                linkClass="text-emerald-600"
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
