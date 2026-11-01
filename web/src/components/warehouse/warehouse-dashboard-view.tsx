"use client";

import Link from "next/link";
import {
  Send,
  RotateCcw,
  AlertTriangle,
  Inbox,
  ArrowUpRight,
  Truck,
  PackageX,
  Bike,
  Layers,
  Banknote,
  Clock,
  Percent,
  Boxes,
  Warehouse,
  ScanLine,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StatCard } from "@/components/ui/stat-card";
import { DailyGroupedBars, OpsError } from "@/components/warehouse/ops-state";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { canWarehouseAccess } from "@/lib/warehouse-access";
import { useOpsPath } from "@/lib/ops-path";
import { LEG_KIND_SHORT, pickL, type LegKind } from "@/lib/logistics";
import { isOpenLeg, legAgeHours, parcelCode, useDeskQueue, useHubScope, useWarehouseData } from "@/lib/warehouse";
import { useReturns } from "@/lib/warehouse-returns";
import {
  BATCH_STATUS,
  EXCEPTION_TYPE,
  batchTaskIds,
  pick,
  shortDate,
  formatMinutes,
  useOpsQuery,
  useWarehouseAnalytics,
  type BatchRow,
  type ExceptionRow,
} from "@/lib/warehouse-live";

export function WarehouseDashboardView({ hubName }: { hubName?: string }) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const { hubId, isAdmin, tier, canAssign } = useHubScope();
  const queue = useDeskQueue({ status: "all" });
  const { riders } = useWarehouseData();
  const excQ = useOpsQuery<ExceptionRow[]>("exceptions:list", { initial: [] as ExceptionRow[], push: ["exception:updated"] });
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const { returns } = useReturns();
  const analyticsQ = useWarehouseAnalytics(hubId);
  const an = analyticsQ.data;

  const title = hubName ?? (fr ? "Opérations de l'entrepôt" : "Warehouse operations");
  const gatedTier = isAdmin ? "manager" : (tier ?? "operator");

  const legs = queue.tasks;
  const open = legs.filter(isOpenLeg);
  const toScan = open.filter((x) => x.desk.scanIn).length;
  const toAssign = open.filter((x) => x.desk.assign && !x.riderId).length;
  const failed = legs.filter((x) => x.status === "failed");
  const byKind = (k: LegKind) => open.filter((x) => x.kind === k).length;
  const openExceptions = excQ.data.filter((e) => e.status === "open" || e.status === "investigating" || e.status === "escalated");
  const pendingReturns = returns.filter((r) => r.phase === "awaiting_goods" || r.phase === "received").length;
  const activeBatches = batchesQ.data.filter((b) => b.status !== "completed").length;
  const aged24 = open.filter((x) => legAgeHours(x) >= 24).length;
  const canSupervise = canAssign || isAdmin;

  const quickLinks = [
    { path: "/desk", label: fr ? "Bureau (scan et assignation)" : "Hub desk (scan & assign)", count: toScan + toAssign, icon: ScanLine },
    { path: "/custody", label: fr ? "Colis en garde" : "Parcels in custody", count: null as number | null, icon: Boxes },
    { path: "/returns", label: fr ? "File retours" : "Returns Queue", count: pendingReturns, icon: RotateCcw },
    { path: "/exceptions", label: fr ? "Exceptions" : "Exceptions", count: openExceptions.length, icon: AlertTriangle },
    { path: "/aged", label: fr ? "Colis vieillis" : "Aged Parcels", count: aged24, icon: PackageX },
    { path: "/batch-builder", label: fr ? "Préparation des lots" : "Batch builder", count: activeBatches, icon: Send },
    { path: "/riders", label: fr ? "Livreurs" : "Riders", count: riders.length, icon: Bike },
    { path: "/reconcile", label: fr ? "Rapprochement COD" : "COD reconcile", count: null as number | null, icon: Banknote },
  ];
  const visibleQuickLinks = quickLinks.filter((link) => isAdmin || canWarehouseAccess(gatedTier, `/warehouse${link.path}`));

  const alerts = [
    ...failed.slice(0, 4).map((p) => ({
      id: `f-${p.id}`,
      title: fr ? `Trajet échoué ${p.orderReference}` : `Failed leg ${p.orderReference}`,
      detail: p.failureReason ?? (fr ? "Aucun motif indiqué" : "No reason given"),
      href: `/tasks/${p.id}`,
      priority: "danger" as const,
    })),
    ...openExceptions.slice(0, 4).map((e) => ({
      id: `e-${e.id}`,
      title: `${e.reference} · ${pick(EXCEPTION_TYPE[e.type], fr, e.type.replace(/_/g, " "))}`,
      detail: e.notes.slice(0, 90),
      href: `/exceptions/${e.id}`,
      priority: e.severity === "high" ? ("danger" as const) : ("warning" as const),
    })),
    ...open
      .filter((p) => legAgeHours(p) >= 48)
      .slice(0, 4)
      .map((p) => ({
        id: `a-${p.id}`,
        title: fr ? `Ouvert depuis ${Math.floor(legAgeHours(p) / 24)} j : ${p.orderReference}` : `Open for ${Math.floor(legAgeHours(p) / 24)} days: ${p.orderReference}`,
        detail: parcelCode(p),
        href: `/tasks/${p.id}`,
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
            ? `${open.length} trajets en cours · ${toScan} à scanner · ${toAssign} sans livreur · ${openExceptions.length} incidents ouverts`
            : `${open.length} open legs · ${toScan} to scan · ${toAssign} without a rider · ${openExceptions.length} open incidents`
        }
        actions={
          <Link href={ops("/desk")} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            {fr ? "Ouvrir le bureau" : "Open the desk"}
          </Link>
        }
      />
      <HubScopeBar />
      {queue.error && <OpsError message={queue.error} onRetry={() => void queue.reload()} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={fr ? "À scanner à l'arrivée" : "To scan in"} value={toScan} icon={Inbox} />
        <StatCard title={fr ? "Sans livreur" : "Waiting for a rider"} value={toAssign} icon={Bike} />
        <StatCard title={pickL(LEG_KIND_SHORT.pickup, fr)} value={byKind("pickup")} icon={Warehouse} />
        <StatCard title={pickL(LEG_KIND_SHORT.transfer, fr)} value={byKind("transfer") + byKind("return_transfer")} icon={Truck} />
        <StatCard title={pickL(LEG_KIND_SHORT.delivery, fr)} value={byKind("delivery") + byKind("replacement_delivery")} icon={Truck} />
        <StatCard title={fr ? "Retours en cours" : "Returns in progress"} value={byKind("return_pickup") + byKind("return_to_seller")} icon={RotateCcw} />
        <StatCard title={fr ? "Ouverts > 24 h" : "Open > 24 h"} value={aged24} icon={PackageX} />
        <StatCard title={fr ? "Trajets échoués" : "Failed legs"} value={failed.length} icon={AlertTriangle} />
        <StatCard title={fr ? "Livreurs actifs" : "Active riders"} value={`${riders.filter((r) => r.activeTasks > 0).length} / ${riders.length}`} icon={Bike} />
        <StatCard title={fr ? "Lots actifs" : "Active batches"} value={activeBatches} icon={Layers} />
        <StatCard
          title={fr ? "Délai ramassage → livraison (30 j)" : "Pickup → delivery time (30 d)"}
          value={an ? formatMinutes(an.avgPickupToDeliveryMinutes, fr) : "…"}
          icon={Clock}
        />
        <StatCard
          title={fr ? "Taux d'échec (30 j)" : "Failure rate (30 d)"}
          value={an ? (an.failureRatePct == null ? "—" : `${an.failureRatePct}%`) : "…"}
          icon={Percent}
        />
        <StatCard
          title={fr ? "COD à encaisser" : "COD to collect"}
          value={an ? formatCurrency(an.codToCollect, locale) : "…"}
          icon={Banknote}
        />
      </div>
      {analyticsQ.error && <OpsError message={analyticsQ.error} onRetry={() => void analyticsQ.reload()} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleQuickLinks.map((link) => (
          <Link
            key={link.path}
            href={ops(link.path)}
            className="group flex items-center gap-3 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm transition-all hover:border-[var(--primary)] hover:shadow-md"
          >
            <div className="shrink-0 rounded-lg bg-indigo-50 p-2">
              <link.icon className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium text-slate-900">{link.label}</p>
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
            <NavLinkButton href={ops("/batch-builder")}>{t("viewAll")}</NavLinkButton>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun lot pour l'instant." : "No batches yet."}
              columns={[
                {
                  key: "reference",
                  label: fr ? "Lot" : "Batch",
                  render: (row) => (
                    <span className="font-medium text-slate-900">{String(row.reference)}</span>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] font-bold text-slate-900">
              {fr ? "Activité des 7 derniers jours" : "Last 7 days"}
            </h2>
            <p className="text-xs text-slate-500">
              {fr ? "Colis reçus au hub, collectés par un livreur et livrés, par jour (UTC)" : "Parcels received at the hub, picked up by a rider and delivered, per day (UTC)"}
            </p>
          </div>
          <NavLinkButton href={ops("/analytics")}>{fr ? "Analyses" : "Analytics"}</NavLinkButton>
        </CardHeader>
        <CardContent>
          {!an ? (
            <p className="py-6 text-center text-sm text-slate-500">{analyticsQ.error ? "—" : fr ? "Chargement…" : "Loading…"}</p>
          ) : (
            <DailyGroupedBars
              days={an.throughput.map((d) => d.date)}
              series={[
                { label: fr ? "Reçus" : "Received", color: "#94a3b8", values: an.throughput.map((d) => d.received) },
                { label: fr ? "Collectés" : "Picked up", color: "#3b82f6", values: an.throughput.map((d) => d.pickedUp) },
                { label: fr ? "Livrés" : "Delivered", color: "#16a34a", values: an.throughput.map((d) => d.delivered) },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
