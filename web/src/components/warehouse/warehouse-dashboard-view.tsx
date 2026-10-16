"use client";

import Link from "next/link";
import {
  Send,
  RotateCcw,
  AlertTriangle,
  Inbox,
  ArrowUpDown,
  ArrowUpRight,
  Truck,
  PackageX,
  Bike,
  Layers,
  Banknote,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StatCard } from "@/components/ui/stat-card";
import {
  DualMetricChart,
  HorizontalBarChart,
  GoalProgress,
} from "@/components/charts/dashboard-charts";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { warehouseRoleLevel, canWarehouseAccess } from "@/lib/warehouse-access";
import type { WarehouseStaffRole } from "@/lib/admin-entities";
import {
  warehouseInboundDispatchTrend,
  warehouseLaneUtilization,
  warehouseHealthBreakdown,
  warehouseRecentActivity,
  warehouseGoals,
} from "@/lib/warehouse-analytics";
import { useOpsPath } from "@/lib/ops-path";
import { useWarehouseData } from "@/lib/warehouse";
import { useReturns } from "@/lib/warehouse-returns";
import {
  BATCH_STATUS,
  batchTaskIds,
  pick,
  shortDate,
  useOpsQuery,
  type BatchRow,
  type ExceptionRow,
} from "@/lib/warehouse-live";

function DemoBadge({ fr }: { fr: boolean }) {
  return <Badge variant="warning">{fr ? "Données démo" : "Demo data"}</Badge>;
}

export function WarehouseDashboardView({ hubName }: { hubName?: string }) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { persona } = useAuth();
  const { getWarehouse } = useWarehouseAdmin();
  const ops = useOpsPath();
  const { stats, parcels, riders } = useWarehouseData();
  const excQ = useOpsQuery<ExceptionRow[]>("exceptions:list", { initial: [] as ExceptionRow[], push: ["exception:updated"] });
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const { returns } = useReturns();

  const warehouse = persona.warehouseId ? getWarehouse(persona.warehouseId) : undefined;
  const title = hubName ?? warehouse?.name ?? (fr ? "Opérations fulfillment" : "Fulfillment Operations");

  // Role-tiered dashboard. Only gate inside the warehouse portal; admins viewing
  // /admin/fulfillment (no warehouseRole) see everything.
  const gated = persona.role === "warehouse";
  const whRole = (persona.warehouseRole ?? "manager") as WarehouseStaffRole;
  const level = gated ? warehouseRoleLevel(whRole) : 3;
  const canSupervise = level >= 2; // supervisor + manager

  const openExceptions = excQ.data.filter((e) => e.status === "open" || e.status === "investigating" || e.status === "escalated");
  const pendingReturns = returns.filter((r) => r.phase === "awaiting_goods").length;
  const activeBatches = batchesQ.data.filter((b) => b.status !== "completed").length;
  const onTheWay = stats.ready + stats.dispatched;

  const throughputData = warehouseInboundDispatchTrend.map((d) => ({
    label: fr ? d.labelFr : d.label,
    revenue: d.inbound,
    orders: d.dispatch,
  }));

  const quickLinks = [
    { path: "/inbound", label: fr ? "File entrante" : "Inbound Queue", count: stats.inbound, icon: Inbox },
    { path: "/sorting", label: fr ? "Table de tri" : "Sorting Board", count: stats.received + stats.sorting, icon: ArrowUpDown },
    { path: "/dispatch", label: fr ? "File expédition" : "Dispatch Queue", count: activeBatches, icon: Send },
    { path: "/returns", label: fr ? "File retours" : "Returns Queue", count: pendingReturns, icon: RotateCcw },
    { path: "/exceptions", label: fr ? "Exceptions" : "Exceptions", count: openExceptions.length, icon: AlertTriangle },
    { path: "/aged", label: fr ? "Colis vieillis" : "Aged Parcels", count: stats.aged24h, icon: PackageX },
    { path: "/deliveries", label: fr ? "Livraisons" : "Deliveries", count: onTheWay, icon: Truck },
    { path: "/reconcile", label: fr ? "Rapprochement COD" : "COD reconcile", count: null as number | null, icon: Banknote },
  ];
  const visibleQuickLinks = quickLinks.filter(
    (link) => !gated || canWarehouseAccess(whRole, `/warehouse${link.path}`),
  );

  // Live attention list: failed deliveries, open incidents, parcels open more than 48 h.
  const alerts = [
    ...parcels
      .filter((p) => p.status === "exception")
      .slice(0, 4)
      .map((p) => ({
        id: `f-${p.taskId}`,
        title: fr ? `Livraison échouée ${p.orderId}` : `Failed delivery ${p.orderId}`,
        detail: p.failureReason ?? (fr ? "Aucun motif indiqué" : "No reason given"),
        href: `/parcels/${p.id}`,
        priority: "danger" as const,
      })),
    ...openExceptions.slice(0, 4).map((e) => ({
      id: `e-${e.id}`,
      title: `${e.reference} · ${e.type.replace(/_/g, " ")}`,
      detail: e.notes.slice(0, 90),
      href: `/exceptions/${e.id}`,
      priority: e.severity === "high" ? ("danger" as const) : ("warning" as const),
    })),
    ...parcels
      .filter((p) => p.status !== "delivered" && p.status !== "exception" && p.ageHours >= 48)
      .slice(0, 4)
      .map((p) => ({
        id: `a-${p.taskId}`,
        title: fr ? `Colis ouvert depuis ${Math.floor(p.ageHours / 24)} j : ${p.orderId}` : `Open for ${Math.floor(p.ageHours / 24)} days: ${p.orderId}`,
        detail: p.id,
        href: `/aged/${p.id}`,
        priority: "warning" as const,
      })),
  ];

  const activeRiders = riders.filter((r) => r.activeTasks > 0);
  const recentBatches = batchesQ.data.slice(0, 5).map((b) => ({ ...b, parcels: batchTaskIds(b).length }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={
          fr
            ? `${stats.total} colis en direct · ${stats.inbound} à recevoir · ${openExceptions.length} incidents ouverts`
            : `${stats.total} live parcels · ${stats.inbound} to receive · ${openExceptions.length} open incidents`
        }
        actions={
          <Link href={ops("/dispatch")} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            {fr ? "Ouvrir expédition" : "Open dispatch"}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={fr ? "À recevoir (entrants)" : "To receive (inbound)"} value={stats.inbound} icon={Inbox} />
        <StatCard title={fr ? "Reçus, sans livreur" : "Received, no rider"} value={stats.received} icon={ArrowUpDown} />
        <StatCard title={fr ? "En livraison" : "Out for delivery"} value={onTheWay} icon={Truck} />
        <StatCard title={fr ? "Livrés" : "Delivered"} value={stats.delivered} icon={Send} />
        <StatCard title={fr ? "Colis ouverts > 24 h" : "Open > 24 h"} value={stats.aged24h} icon={PackageX} />
        <StatCard title={fr ? "Livraisons échouées" : "Failed deliveries"} value={stats.exception} icon={AlertTriangle} />
        <StatCard title={fr ? "Livreurs actifs" : "Active riders"} value={`${stats.activeRiders} / ${stats.riders}`} icon={Bike} />
        <StatCard title={fr ? "Lots actifs" : "Active batches"} value={activeBatches} icon={Layers} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleQuickLinks.map((link) => (
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
              {link.count != null && <p className="text-xl font-bold text-indigo-700">{link.count}</p>}
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {canSupervise && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <h2 className="font-semibold text-slate-900">{fr ? "À traiter" : "Needs attention"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Échecs · Incidents ouverts · Colis anciens" : "Failed · Open incidents · Aged parcels"}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-500">{fr ? "Rien d'urgent." : "Nothing needs attention."}</p>
              ) : (
                alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={ops(alert.href)}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                        <Badge variant={alert.priority}>{alert.priority === "danger" ? (fr ? "Urgent" : "Urgent") : (fr ? "À surveiller" : "Watch")}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[var(--primary)]" />
              <div>
                <h2 className="font-semibold text-slate-900">{fr ? "Derniers lots" : "Recent batches"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Lots créés et leur livreur" : "Created batches and their rider"}</p>
              </div>
            </div>
            <NavLinkButton href={ops("/dispatch")}>{t("viewAll")}</NavLinkButton>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun lot pour l'instant." : "No batches yet."}
              columns={[
                {
                  key: "reference",
                  label: "Batch",
                  render: (row) => (
                    <Link href={ops(`/dispatch/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.reference)}
                    </Link>
                  ),
                },
                { key: "parcels", label: fr ? "Colis" : "Parcels" },
                { key: "riderName", label: fr ? "Livreur" : "Rider", render: (row) => String(row.riderName ?? "—") },
                { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => <Badge variant="success">{pick(BATCH_STATUS[String(row.status)], fr, String(row.status))}</Badge>,
                },
              ]}
              data={recentBatches as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={ops(`/dispatch/${row.id}`)} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>
      </div>

      {canSupervise && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-[var(--primary)]" />
              <div>
                <h2 className="font-semibold text-slate-900">{fr ? "Livreurs en tournée" : "Riders on the road"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Livreurs actifs avec des livraisons ouvertes" : "Active riders with open deliveries"}</p>
              </div>
            </div>
            <NavLinkButton href={ops("/riders")}>{t("viewAll")}</NavLinkButton>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun livreur en tournée." : "No riders on the road."}
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
                { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => String(row.phone ?? "—") },
                { key: "activeTasks", label: fr ? "Livraisons ouvertes" : "Open deliveries" },
              ]}
              data={activeRiders as unknown as Record<string, unknown>[]}
              rowAction={(row) => (
                <Link href={ops(`/riders/${row.id}`)} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
              )}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-slate-900">{fr ? "Exemples d'analyses" : "Sample analytics"}</h2>
        <DemoBadge fr={fr} />
        <span className="text-xs text-slate-500">
          {fr ? "Le serveur ne fournit pas encore ces mesures." : "The server does not provide these measures yet."}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
                {fr ? "Débit hebdomadaire" : "Weekly throughput"}
              </h2>
              <p className="text-xs text-slate-500">{fr ? "Réception & expédition" : "Inbound & dispatch"}</p>
            </div>
            <DemoBadge fr={fr} />
          </CardHeader>
          <CardContent>
            <DualMetricChart data={throughputData} height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Objectifs du jour" : "Today's goals"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Cibles opérationnelles" : "Operational targets"}</p>
            </div>
            <DemoBadge fr={fr} />
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{fr ? "Utilisation des lanes" : "Lane utilization"}</h2>
              <p className="text-xs text-slate-500">{fr ? "Capacité lanes de tri" : "Sort lane capacity today"}</p>
            </div>
            <DemoBadge fr={fr} />
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              items={warehouseLaneUtilization.map((l) => ({ name: fr ? l.laneFr : l.lane, revenue: l.pct }))}
              valueKey="revenue"
              labelKey="name"
              formatValue={(v) => `${v}%`}
            />
          </CardContent>
        </Card>

        {canSupervise && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{fr ? "Score ops" : "Ops health score"}</h2>
                <p className="text-xs text-slate-500">{fr ? "Réception aux exceptions" : "Inbound through exceptions"}</p>
              </div>
              <DemoBadge fr={fr} />
            </CardHeader>
            <CardContent className="space-y-3">
              {warehouseHealthBreakdown.map((h) => (
                <div key={h.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-600">{fr ? h.labelFr : h.label}</span>
                    <span className="font-bold text-slate-900">{h.score}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${h.score}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold text-slate-900">{fr ? "Activité récente" : "Recent activity"}</h2>
          <DemoBadge fr={fr} />
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
  );
}
