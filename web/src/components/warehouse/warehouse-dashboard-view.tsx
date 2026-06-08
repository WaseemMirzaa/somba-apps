"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Package, Send, Layers, RotateCcw, RefreshCw, DollarSign,
  AlertTriangle, Clock, Inbox, ArrowUpDown, ArrowUpRight, ArrowDownRight,
  Activity, Truck,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  DualMetricChart,
  HorizontalBarChart,
  Sparkline,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { warehouseDashboardStats } from "@/lib/warehouse-entities";
import {
  warehouseThroughputTrend,
  warehouseExtendedKpis,
  warehouseLaneUtilization,
  warehouseRiderPerformance,
  warehouseHealthBreakdown,
  warehouseRecentActivity,
} from "@/lib/warehouse-analytics";
import { formatCurrency, cn } from "@/lib/utils";
import { useOpsPath } from "@/lib/ops-path";

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
    <div className="card-premium p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">{value}</p>
          <p className={cn("mt-1 flex items-center gap-0.5 text-xs font-semibold", good ? "text-emerald-600" : "text-red-500")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change)}% vs yesterday
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-xl bg-indigo-50 p-2">
            <Icon className="h-4 w-4 text-indigo-600" />
          </div>
          <Sparkline values={spark} color="#4f46e5" />
        </div>
      </div>
    </div>
  );
}

export function WarehouseDashboardView({ hubName }: { hubName?: string }) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { persona } = useAuth();
  const { getWarehouse } = useWarehouseAdmin();
  const ops = useOpsPath();
  const s = warehouseDashboardStats;
  const k = warehouseExtendedKpis;
  const [period] = useState("7D");

  const warehouse = persona.warehouseId ? getWarehouse(persona.warehouseId) : undefined;
  const title = hubName ?? warehouse?.name ?? "Fulfillment Operations";

  const throughputSpark = warehouseThroughputTrend.map((d) => d.orders);

  const quickLinks = [
    { path: "/inbound", label: "Inbound Queue", countKey: "inboundQueue" as const, icon: Inbox },
    { path: "/sorting", label: "Sorting Board", countKey: "sortingQueue" as const, icon: ArrowUpDown },
    { path: "/dispatch", label: "Dispatch Queue", countKey: "dispatchQueue" as const, icon: Send },
    { path: "/returns", label: "Returns Queue", countKey: "returnQueue" as const, icon: RotateCcw },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={`${t("welcome")} · ${k.receivedToday} received · ${k.dispatchedToday} dispatched today · On-time ${k.onTimeRate}%`}
        actions={
          <Link href={ops("/dispatch")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Open dispatch
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Received today" value={String(k.receivedToday)} change={k.receivedChange} spark={throughputSpark} icon={Package} />
        <KpiCard title="Dispatched today" value={String(k.dispatchedToday)} change={k.dispatchedChange} spark={throughputSpark} icon={Send} />
        <KpiCard title="On-time rate" value={`${k.onTimeRate}%`} change={k.onTimeChange} spark={[94, 94.5, 95, 95.2, 96, 96.2, 96.4]} icon={Clock} />
        <KpiCard title="COD collected" value={formatCurrency(k.codCollected, locale)} change={k.codChange} spark={[15200, 16100, 16800, 17200, 17800, 18100, 18420]} icon={DollarSign} />
        <KpiCard title="Return rate" value={`${k.returnRate}%`} change={k.returnChange} positive={false} spark={[2.2, 2.1, 2.0, 1.9, 1.9, 1.8, 1.8]} icon={RotateCcw} />
        <KpiCard title="Avg process time" value={`${k.avgProcessHours}h`} change={k.processChange} positive={false} spark={[5.1, 4.8, 4.6, 4.5, 4.4, 4.3, 4.2]} icon={RefreshCw} />
        <KpiCard title="Active batches" value={String(k.activeBatches)} change={8} spark={[10, 11, 12, 12, 13, 14, 14]} icon={Layers} />
        <KpiCard title="Aged parcels" value={String(k.agedParcels)} change={-14} positive={false} spark={[12, 10, 9, 8, 8, 7, 6]} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">Weekly throughput</h2>
              <p className="text-xs text-slate-500">Parcels received & dispatched · {period}</p>
            </div>
            <Badge variant="info">{s.dispatchedToday - s.failedDeliveries} in transit</Badge>
          </CardHeader>
          <CardContent>
            <DualMetricChart data={warehouseThroughputTrend} height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Recent activity</h2>
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
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Lane utilization</h2>
            <p className="text-xs text-slate-500">Sort lanes capacity today</p>
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
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Ops health score</h2>
            <p className="text-xs text-slate-500">Inbound through exceptions</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouseHealthBreakdown.map((h) => (
              <div key={h.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">{h.label}</span>
                  <span className="font-bold text-slate-900">{h.score}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${h.score}%` }} />
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
            className="flex items-center justify-between rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <link.icon className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">{link.label}</p>
                <p className="text-2xl font-bold text-indigo-700">{s[link.countKey]}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Top riders today</h2>
          </div>
          <Link href={ops("/deliveries")} className="text-sm text-indigo-600 hover:underline">View deliveries</Link>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "name", label: "Rider" },
              { key: "deliveries", label: "Deliveries" },
              { key: "onTime", label: "On-time %", render: (row) => `${row.onTime}%` },
            ]}
            data={warehouseRiderPerformance as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">Active deliveries</h2>
            <Link href={ops("/deliveries")} className="text-sm text-indigo-600 hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{s.dispatchedToday - s.failedDeliveries}</p>
            <p className="text-sm text-slate-500">In transit right now</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">Open exceptions</h2>
            <Link href={ops("/exceptions")} className="text-sm text-indigo-600 hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">2</p>
            <p className="text-sm text-slate-500">Require investigation</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
