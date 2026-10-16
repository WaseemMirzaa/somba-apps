"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { useRouter } from "next/navigation";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { STAGE_LABEL, stageVariant, useWarehouseData, type ParcelStage } from "@/lib/warehouse";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

export default function WarehouseBatchBuilderPage() {
  const router = useRouter();
  const ops = useOpsPath();
  const base = useOpsBase();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { parcels, buildBatch } = useWarehouseData();
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Real parcels with no rider yet: scanned in at the hub (received) or still inbound.
  const pool = useMemo(
    () => parcels.filter((p) => p.rawStatus === "unassigned").sort((a, b) => Number(!!b.receivedAt) - Number(!!a.receivedAt)),
    [parcels],
  );
  const available = pool.filter((p) => !batchIds.includes(p.taskId));
  const batchRows = batchIds
    .map((id) => parcels.find((p) => p.taskId === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p, i) => ({ ...p, stop: i + 1 }));

  function sortByZone() {
    setBatchIds((cur) => {
      const byId = new Map(parcels.map((p) => [p.taskId, p]));
      return [...cur].sort((a, b) => {
        const za = byId.get(a)?.zone ?? "";
        const zb = byId.get(b)?.zone ?? "";
        return za.localeCompare(zb) || (byId.get(a)?.orderId ?? "").localeCompare(byId.get(b)?.orderId ?? "");
      });
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Préparation des lots" : "Batch Builder"}
        subtitle={fr ? "Ajoutez des colis sans livreur, triez par zone, puis créez le lot et assignez un livreur" : "Add parcels that have no rider yet, sort by zone, then create the batch and assign a rider"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Préparation des lots" : "Batch Builder" }]}
        actions={
          <Button size="sm" variant="secondary" disabled={batchIds.length < 2} onClick={sortByZone}>
            {fr ? "Trier par zone" : "Sort by zone"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={fr ? "Aucun colis en attente de livreur." : "No parcels waiting for a rider."}
              columns={[
                { key: "id", label: fr ? "Colis" : "Parcel" },
                { key: "customer", label: t("customer") },
                { key: "zone", label: t("zone") },
                { key: "status", label: t("status"), render: (row) => {
                  const s = String(row.status) as ParcelStage;
                  return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
                }},
                {
                  key: "actions",
                  label: fr ? "Action" : "Action",
                  render: (row) => (
                    <Button variant="secondary" size="sm" onClick={() => setBatchIds((b) => [...b, String(row.taskId)])} aria-label={fr ? "Ajouter au lot" : "Add to batch"}>
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
                    { key: "id", label: fr ? "Colis" : "Parcel" },
                    { key: "zone", label: t("zone") },
                    {
                      key: "actions",
                      label: fr ? "Action" : "Action",
                      render: (row) => (
                        <button type="button" onClick={() => setBatchIds((b) => b.filter((x) => x !== row.taskId))} className="text-red-500" aria-label={fr ? "Retirer" : "Remove"}>
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

      <AssignRiderModal
        open={showAssignModal}
        title={fr ? "Assigner un livreur au nouveau lot" : "Assign rider to new batch"}
        subtitle={fr ? `${batchIds.length} colis dans le lot` : `${batchIds.length} parcel${batchIds.length !== 1 ? "s" : ""} in batch`}
        onClose={() => setShowAssignModal(false)}
        onConfirm={async (rider) => {
          const batch = await buildBatch(batchIds, rider.id, rider.name);
          toast(fr ? `Lot ${batch.reference} créé — ${rider.name} assigné` : `Batch ${batch.reference} created — ${rider.name} assigned`);
          setBatchIds([]);
          router.push(ops(`/dispatch/${batch.id}`));
        }}
      />
    </div>
  );
}
