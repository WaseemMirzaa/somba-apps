"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Package, Send, RotateCcw, AlertTriangle, Clock, Truck, Percent, Banknote, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { StatCard } from "@/components/ui/stat-card";
import { InfoGrid } from "@/components/ui/info-grid";
import { DailyGroupedBars, OpsError } from "@/components/warehouse/ops-state";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { LEG_KIND, LEG_KINDS, LEG_STATUS, pickL } from "@/lib/logistics";
import { isOpenLeg, riderLabel, useDeskQueue, useHubScope } from "@/lib/warehouse";
import { useReturns } from "@/lib/warehouse-returns";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import {
  BATCH_STATUS,
  EXCEPTION_TYPE,
  batchTaskIds,
  formatMinutes,
  pick,
  shortDate,
  useOpsQuery,
  useWarehouseAnalytics,
  type BatchRow,
  type ExceptionRow,
} from "@/lib/warehouse-live";

export default function WarehouseAnalyticsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { hubId } = useHubScope();
  const parcels = useDeskQueue({ status: "all" }).tasks;
  const analyticsQ = useWarehouseAnalytics(hubId);
  const an = analyticsQ.data;
  const excQ = useOpsQuery<ExceptionRow[]>("exceptions:list", { initial: [] as ExceptionRow[], push: ["exception:updated"] });
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const { returns, error: returnsError, reload: reloadReturns } = useReturns();

  // Rider table: computed from the parcels the server returned (delivered / failed per rider).
  const riderRows = useMemo(() => {
    const m = new Map<string, { id: string; name: string; delivered: number; failed: number; open: number }>();
    for (const p of parcels) {
      if (!p.riderId) continue;
      const r = m.get(p.riderId) ?? { id: p.riderId, name: riderLabel(p, fr), delivered: 0, failed: 0, open: 0 };
      if (p.status === "delivered") r.delivered += 1;
      else if (p.status === "failed") r.failed += 1;
      else r.open += 1;
      m.set(p.riderId, r);
    }
    return [...m.values()].sort((a, b) => b.delivered - a.delivered);
  }, [parcels, fr]);

  // Exceptions: real counts, real resolution time (created -> last update of resolved ones).
  const exc = useMemo(() => {
    const list = excQ.data;
    const open = list.filter((e) => e.status !== "resolved");
    const resolved = list.filter((e) => e.status === "resolved");
    const hours = resolved
      .map((e) => (new Date(e.updatedAt).getTime() - new Date(e.createdAt).getTime()) / 3_600_000)
      .filter((h) => Number.isFinite(h) && h >= 0);
    const byType = new Map<string, number>();
    for (const e of list) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      total: list.length,
      open: open.length,
      avgResolutionHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
      topType: top ? top[0] : null,
    };
  }, [excQ.data]);

  const retStats = useMemo(
    () => ({
      total: returns.length,
      awaiting: returns.filter((r) => r.phase === "awaiting_goods").length,
      received: returns.filter((r) => r.phase === "received").length,
      resolved: returns.filter((r) => r.phase === "refunded").length,
      rejected: returns.filter((r) => r.phase === "rejected").length,
    }),
    [returns],
  );

  const recentBatches = batchesQ.data.slice(0, 8).map((b) => ({ ...b, parcels: batchTaskIds(b).length }));
  const num = (n: number) => n.toLocaleString(fr ? "fr-FR" : "en-US");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("analytics")}
        subtitle={
          fr
            ? "Chiffres de votre entrepôt calculés par le serveur à partir des trajets, lots, exceptions et retours réels"
            : "Your warehouse's figures, computed by the server from real legs, batches, exceptions and returns"
        }
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base }, { label: t("analytics") }]}
      />
      <HubScopeBar />

      {analyticsQ.error && <OpsError message={analyticsQ.error} onRetry={() => void analyticsQ.reload()} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={fr ? "Colis au total" : "Total parcels"} value={an ? num(an.totalParcels) : "…"} icon={Package} />
        <StatCard title={fr ? "Sans livreur" : "Unassigned"} value={an ? num(an.unassigned) : "…"} icon={Send} />
        <StatCard title={fr ? "En transit" : "In transit"} value={an ? num(an.inTransit) : "…"} icon={Truck} />
        <StatCard title={fr ? "Livrés" : "Delivered"} value={an ? num(an.delivered) : "…"} icon={Package} />
        <StatCard
          title={fr ? "Ramassage → livraison (30 j)" : "Pickup → delivery (30 d)"}
          value={an ? formatMinutes(an.avgPickupToDeliveryMinutes, fr) : "…"}
          icon={Clock}
        />
        <StatCard
          title={fr ? "Taux d'échec (30 j)" : "Failure rate (30 d)"}
          value={an ? (an.failureRatePct == null ? "—" : `${an.failureRatePct}%`) : "…"}
          icon={Percent}
        />
        <StatCard title={fr ? "Colis ouverts > 24 h" : "Open parcels > 24 h"} value={an ? num(an.agedOver24h) : "…"} icon={AlertTriangle} />
        <StatCard title={fr ? "COD à encaisser" : "COD to collect"} value={an ? formatCurrency(an.codToCollect, locale) : "…"} icon={Banknote} />
      </div>
      {an && (
        <p className="-mt-3 text-xs text-slate-500">
          {fr
            ? `Délai moyen calculé sur ${an.pickupToDeliverySamples} colis livrés ; taux d'échec : ${an.failed30} ${an.failed30 > 1 ? "échecs" : "échec"} pour ${an.delivered30} livraison${an.delivered30 > 1 ? "s" : ""} (colis créés sur 30 jours).`
            : `Average time is over ${an.pickupToDeliverySamples} delivered parcels; failure rate: ${an.failed30} failed vs ${an.delivered30} delivered (parcels created in the last 30 days).`}
        </p>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{fr ? "Activité des 7 derniers jours" : "Last 7 days"}</h2>
          <p className="text-xs text-slate-500">
            {fr ? "Reçus au hub, collectés par un livreur, livrés (jours UTC)" : "Received at the hub, picked up by a rider, delivered (UTC days)"}
          </p>
        </CardHeader>
        <CardContent>
          {an ? (
            <DailyGroupedBars
              height={220}
              days={an.throughput.map((d) => d.date)}
              series={[
                { label: fr ? "Scannés à l'arrivée" : "Scanned in", color: "#94a3b8", values: an.throughput.map((d) => d.received) },
                { label: fr ? "Collectés" : "Picked up", color: "#3b82f6", values: an.throughput.map((d) => d.pickedUp) },
                { label: fr ? "Livrés" : "Delivered", color: "#16a34a", values: an.throughput.map((d) => d.delivered) },
              ]}
            />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{analyticsQ.error ? "—" : fr ? "Chargement…" : "Loading…"}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Trajets ouverts par type" : "Open legs by kind"}</h2>
            <p className="text-xs text-slate-500">{fr ? "Ce qui attend l'entrepôt maintenant" : "What is waiting on the warehouse now"}</p>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun trajet ouvert." : "No open legs."}
              columns={[
                { key: "kind", label: fr ? "Type de trajet" : "Leg type" },
                { key: "open", label: fr ? "Ouverts" : "Open" },
              ]}
              data={LEG_KINDS.map((k) => ({ kind: pickL(LEG_KIND[k], fr), open: an?.byKind?.[k] ?? 0 })).filter((r) => r.open > 0) as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Par entrepôt (30 jours)" : "By warehouse (30 days)"}</h2>
            <p className="text-xs text-slate-500">
              {fr ? "Trajets gérés par chaque entrepôt" : "Legs managed by each warehouse"}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun trajet sur 30 jours." : "No legs in the last 30 days."}
              columns={[
                { key: "hub", label: fr ? "Entrepôt" : "Warehouse" },
                { key: "parcels", label: fr ? "Trajets" : "Legs" },
                { key: "delivered", label: fr ? "Terminés" : "Done" },
                { key: "failed", label: fr ? "Échecs" : "Failed", render: (row) => <Badge variant={Number(row.failed) > 0 ? "warning" : "default"}>{String(row.failed)}</Badge> },
                { key: "batches30", label: fr ? "Lots" : "Batches" },
              ]}
              data={(an?.byHub ?? []) as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{fr ? "Livreurs" : "Riders"}</h2>
            <p className="text-xs text-slate-500">
              {fr ? "Livraisons et échecs sur les colis chargés" : "Deliveries and failures across the loaded parcels"}
            </p>
          </div>
          <NavLinkButton href={ops("/riders")}>{t("viewAll")}</NavLinkButton>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun colis attribué à un livreur." : "No parcel is assigned to a rider yet."}
            columns={[
              { key: "name", label: fr ? "Livreur" : "Rider", render: (row) => <span className="font-medium text-slate-900">{String(row.name)}</span> },
              { key: "delivered", label: fr ? "Livrés" : "Delivered" },
              { key: "open", label: fr ? "En cours" : "In progress" },
              { key: "failed", label: fr ? "Échecs" : "Failed", render: (row) => <Badge variant={Number(row.failed) > 0 ? "warning" : "default"}>{String(row.failed)}</Badge> },
            ]}
            data={riderRows as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold text-slate-900">{fr ? "Lots récents" : "Recent batches"}</h2>
            <NavLinkButton href={ops("/batch-builder")}>{t("viewAll")}</NavLinkButton>
          </CardHeader>
          <CardContent className="p-0">
            {batchesQ.error ? (
              <div className="p-4"><OpsError message={batchesQ.error} onRetry={() => void batchesQ.reload()} /></div>
            ) : (
              <DataTable
                emptyMessage={fr ? "Aucun lot pour l'instant." : "No batches yet."}
                columns={[
                  { key: "reference", label: fr ? "Lot" : "Batch", render: (row) => <span className="font-medium text-slate-900">{String(row.reference)}</span> },
                  { key: "parcels", label: fr ? "Colis" : "Parcels" },
                  { key: "riderName", label: fr ? "Livreur" : "Rider", render: (row) => String(row.riderName ?? "—") },
                  { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
                  { key: "status", label: fr ? "Statut" : "Status", render: (row) => pick(BATCH_STATUS[String(row.status)], fr, String(row.status)) },
                ]}
                data={recentBatches as unknown as Record<string, unknown>[]}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="font-semibold text-slate-900">{fr ? "Exceptions" : "Exceptions"}</h2>
              <NavLinkButton href={ops("/exceptions")}>{t("viewAll")}</NavLinkButton>
            </CardHeader>
            <CardContent>
              {excQ.error ? (
                <OpsError message={excQ.error} onRetry={() => void excQ.reload()} />
              ) : (
                <InfoGrid
                  items={[
                    { label: fr ? "Au total" : "Total", value: exc.total },
                    { label: fr ? "Ouvertes" : "Open", value: exc.open },
                    { label: fr ? "Délai de résolution moy." : "Avg. resolution time", value: exc.avgResolutionHours == null ? "—" : formatMinutes(exc.avgResolutionHours * 60, fr) },
                    { label: fr ? "Type le plus fréquent" : "Most frequent type", value: exc.topType ? pick(EXCEPTION_TYPE[exc.topType], fr, exc.topType) : "—" },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="font-semibold text-slate-900">{fr ? "Retours" : "Returns"}</h2>
              <NavLinkButton href={ops("/returns")}>{t("viewAll")}</NavLinkButton>
            </CardHeader>
            <CardContent>
              {returnsError ? (
                <OpsError message={returnsError} onRetry={() => void reloadReturns()} />
              ) : (
                <InfoGrid
                  items={[
                    { label: fr ? "Demandes" : "Requests", value: retStats.total },
                    { label: fr ? "En attente des articles" : "Awaiting goods", value: retStats.awaiting },
                    { label: fr ? "Articles reçus" : "Goods received", value: retStats.received },
                    { label: fr ? "Résolus" : "Resolved", value: retStats.resolved },
                    { label: fr ? "Rejetés" : "Rejected", value: retStats.rejected },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{fr ? "En direct maintenant" : "Live right now"}</h2>
          <p className="text-xs text-slate-500">{fr ? "Statut actuel de chaque trajet" : "Current status of every leg"}</p>
        </CardHeader>
        <CardContent>
          <InfoGrid
            columns={4}
            items={[
              ...(["unassigned", "assigned", "picked_up", "in_transit", "delivered", "failed"] as const).map((st) => ({
                label: pickL(LEG_STATUS[st], fr),
                value: an?.byStatus?.[st] ?? 0,
              })),
              { label: fr ? "Ouverts > 24 h" : "Open > 24 h", value: an?.agedOver24h ?? 0 },
              { label: fr ? "Ouverts (liste)" : "Open (list)", value: parcels.filter(isOpenLeg).length },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/desk", label: fr ? "Bureau" : "Desk", icon: Package },
          { href: "/batch-builder", label: fr ? "Lots" : "Batches", icon: Send },
          { href: "/returns", label: fr ? "Retours" : "Returns", icon: RotateCcw },
          { href: "/exceptions", label: fr ? "Exceptions" : "Exceptions", icon: AlertTriangle },
        ].map((link) => (
          <Link
            key={link.href}
            href={ops(link.href)}
            className="group flex items-center gap-3 rounded-xl border border-[var(--primary-tint)] p-4 transition-all hover:border-[var(--primary)] hover:bg-[var(--primary-light)]"
          >
            <div className="rounded-xl bg-red-50 p-2">
              <link.icon className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            </div>
            <span className="font-semibold text-slate-900">{link.label}</span>
            <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
