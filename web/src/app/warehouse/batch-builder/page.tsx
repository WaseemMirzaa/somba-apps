"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { OpsError } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { LEG_KIND, endpointName, pickL } from "@/lib/logistics";
import { parcelCode, useDeskQueue, useHubScope, useWarehouseData } from "@/lib/warehouse";
import { BATCH_STATUS, batchTaskIds, pick, shortDate, useOpsQuery, type BatchRow } from "@/lib/warehouse-live";
import { useOpsBase } from "@/lib/ops-path";

/** Group several legs that start here under one rider (`warehouse:buildBatch`, supervisors and managers). */
export default function WarehouseBatchBuilderPage() {
  const base = useOpsBase();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { canAssign } = useHubScope();
  const { buildBatch } = useWarehouseData();
  const q = useDeskQueue({ status: "unassigned" });
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Legs with no rider yet that this warehouse may assign.
  const pool = useMemo(() => q.tasks.filter((x) => x.desk.assign && !x.riderId), [q.tasks]);
  const available = pool.filter((p) => !batchIds.includes(p.id));
  const batchRows = batchIds
    .map((id) => pool.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p, i) => ({ ...p, stop: i + 1 }));

  function sortByDestination() {
    setBatchIds((cur) => {
      const byId = new Map(pool.map((p) => [p.id, p]));
      const key = (id: string) => `${byId.get(id)?.to?.city ?? ""}|${byId.get(id)?.to?.address ?? ""}`;
      return [...cur].sort((a, b) => key(a).localeCompare(key(b)));
    });
  }

  const crumbs = [{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Préparation des lots" : "Batch Builder" }];

  const colKind = { key: "kind", label: fr ? "Type" : "Type", render: (row: Record<string, unknown>) => <Badge variant="primary">{pickL(LEG_KIND[row.kind as keyof typeof LEG_KIND], fr)}</Badge> };
  const colRoute = { key: "route", label: fr ? "Trajet" : "Route", render: (row: Record<string, unknown>) => `${endpointName(row.from as never, fr)} → ${endpointName(row.to as never, fr)}` };

  if (!canAssign) {
    return (
      <div className="space-y-6">
        <PageHeader title={fr ? "Préparation des lots" : "Batch Builder"} breadcrumbs={crumbs} />
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {fr ? "Seuls les superviseurs et les responsables assignent des livreurs et créent des lots." : "Only supervisors and managers assign riders and build batches."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Préparation des lots" : "Batch Builder"}
        subtitle={fr ? "Ajoutez des colis sans livreur, regroupez-les par destination, puis créez le lot et assignez un livreur" : "Add parcels that have no rider yet, group them by destination, then create the batch and assign a rider"}
        breadcrumbs={crumbs}
        actions={
          <Button size="sm" variant="secondary" disabled={batchIds.length < 2} onClick={sortByDestination}>
            {fr ? "Regrouper par destination" : "Group by destination"}
          </Button>
        }
      />
      <HubScopeBar />
      {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun colis en attente de livreur." : "No parcels waiting for a rider."}
              columns={[
                { key: "orderReference", label: fr ? "Commande" : "Order", render: (row) => `${String(row.orderReference)} · ${parcelCode(row as never)}` },
                colKind,
                colRoute,
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => (
                    <Button variant="secondary" size="sm" onClick={() => setBatchIds((b) => [...b, String(row.id)])} aria-label={fr ? "Ajouter au lot" : "Add to batch"}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]}
              data={available as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {batchRows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400">{fr ? "Ajoutez des colis pour constituer le lot" : "Add parcels to build the batch"}</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "stop", label: "#" },
                    { key: "orderReference", label: fr ? "Commande" : "Order" },
                    colRoute,
                    {
                      key: "actions",
                      label: t("action"),
                      render: (row) => (
                        <button type="button" onClick={() => setBatchIds((b) => b.filter((x) => x !== row.id))} className="text-red-500" aria-label={fr ? "Retirer" : "Remove"}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ),
                    },
                  ]}
                  data={batchRows as unknown as Record<string, unknown>[]}
                />
              )}
            </CardContent>
          </Card>
          {batchIds.length > 0 && (
            <Button className="w-full" onClick={() => setShowAssignModal(true)}>
              {fr ? "Créer le lot et assigner un livreur" : "Create Batch & Assign Rider"}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun lot pour l'instant." : "No batches yet."}
            columns={[
              { key: "reference", label: fr ? "Lot" : "Batch" },
              { key: "count", label: fr ? "Colis" : "Parcels" },
              { key: "riderName", label: fr ? "Livreur" : "Rider", render: (row) => String(row.riderName ?? "—") },
              { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
              { key: "status", label: t("status"), render: (row) => <Badge variant="success">{pick(BATCH_STATUS[String(row.status)], fr, String(row.status))}</Badge> },
            ]}
            data={batchesQ.data.map((b) => ({ ...b, count: batchTaskIds(b).length })) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <AssignRiderModal
        open={showAssignModal}
        title={fr ? "Assigner un livreur au nouveau lot" : "Assign rider to new batch"}
        subtitle={fr ? `${batchIds.length} colis dans le lot` : `${batchIds.length} parcel${batchIds.length !== 1 ? "s" : ""} in batch`}
        onClose={() => setShowAssignModal(false)}
        onConfirm={async (rider) => {
          const batch = await buildBatch(batchIds, rider.id, rider.name);
          toast(fr ? `Lot ${batch.reference} créé — ${rider.name} assigné` : `Batch ${batch.reference} created — ${rider.name} assigned`);
          setBatchIds([]);
          void q.reload();
          void batchesQ.reload();
        }}
      />
    </div>
  );
}
