"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Bike, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useWarehouseData } from "@/lib/warehouse";
import { errorMessage, isOpsRole, useOpsQuery, type ReconcileRow } from "@/lib/warehouse-live";
import { useOpsBase } from "@/lib/ops-path";
import { formatCurrency } from "@/lib/utils";

/**
 * COD reconciliation: cash each rider should hand over, computed by the server
 * from delivered parcels (`warehouse:reconcile`). The server has no hand-over
 * sign-off yet, so this page is the count sheet, not a ledger.
 */
export default function WarehouseReconcilePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const rt = useRealtime();
  const { riders } = useWarehouseData();
  const recQ = useOpsQuery<ReconcileRow[]>("warehouse:reconcile", { initial: [] as ReconcileRow[], push: ["delivery:updated"] });
  const [codEnabled, setCodEnabled] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (rt.status !== "connected" || !isOpsRole(rt.user?.role)) return;
    let alive = true;
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((s) => {
        if (alive) setCodEnabled(String(s?.codEnabled) === "true");
      })
      .catch((e) => {
        if (alive) setSettingsError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user?.role]);

  const rows = useMemo(
    () =>
      recQ.data
        .map((r) => ({
          ...r,
          name:
            r.riderId === "unassigned"
              ? (fr ? "Sans livreur" : "No rider")
              : riders.find((x) => x.id === r.riderId)?.name ?? `Rider ${r.riderId.slice(0, 6).toUpperCase()}`,
        }))
        .sort((a, b) => b.codUsd - a.codUsd),
    [recQ.data, riders, fr],
  );
  const total = rows.reduce((s, r) => s + r.codUsd, 0);
  const parcels = rows.reduce((s, r) => s + r.parcels, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Rapprochement COD" : "COD Reconciliation"}
        subtitle={fr ? "Espèces collectées par livreur sur les colis livrés" : "Cash collected per rider on delivered parcels"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Rapprochement COD" : "COD reconcile" }]}
        actions={
          codEnabled === null ? undefined : (
            <Badge variant={codEnabled ? "success" : "warning"}>
              {codEnabled
                ? (fr ? "Le paiement à la livraison est activé" : "COD is currently enabled")
                : (fr ? "Le paiement à la livraison est désactivé" : "COD is currently disabled")}
            </Badge>
          )
        }
      />
      {settingsError && <p className="text-xs text-slate-500">{fr ? "Réglage COD indisponible : " : "COD setting unavailable: "}{settingsError}</p>}
      {recQ.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{recQ.error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Total à remettre" : "Total cash due"} value={formatCurrency(total, locale)} icon={Banknote} />
        <StatCard title={fr ? "Colis livrés" : "Delivered parcels"} value={parcels} icon={Package} />
        <StatCard title={fr ? "Livreurs" : "Riders"} value={rows.filter((r) => r.riderId !== "unassigned").length} icon={Bike} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={recQ.loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison terminée." : "No delivered parcels yet.")}
            columns={[
              { key: "name", label: fr ? "Livreur" : "Rider" },
              { key: "parcels", label: fr ? "Colis livrés" : "Delivered parcels" },
              { key: "codUsd", label: fr ? "Espèces à remettre" : "Cash to hand over", render: (row) => (
                <span className="font-semibold">{formatCurrency(Number(row.codUsd), locale)}</span>
              )},
            ]}
            data={rows as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        {fr
          ? "Information : le serveur calcule les montants mais n'enregistre pas encore la remise des espèces."
          : "Note: the server computes these amounts but does not yet record the cash hand-over itself."}
      </p>
    </div>
  );
}
