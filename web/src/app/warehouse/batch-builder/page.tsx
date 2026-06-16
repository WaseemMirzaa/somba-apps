"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { useRouter } from "next/navigation";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { batchParcels } from "@/lib/warehouse-hubs";
import type { RiderEntity } from "@/lib/warehouse-entities";

export default function WarehouseBatchBuilderPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [batch, setBatch] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const available = batchParcels.filter((p) => !batch.includes(p.id));

  function add(id: string) {
    setBatch([...batch, id]);
  }

  function remove(id: string) {
    setBatch(batch.filter((x) => x !== id));
  }

  const batchRows = batch.map((id, i) => {
    const p = batchParcels.find((x) => x.id === id)!;
    return { ...p, stop: i + 1 };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Préparation des lots" : "Batch Builder"}
        subtitle={fr ? "Ajoutez des colis pour constituer un lot optimisé par itinéraire" : "Add parcels to build a route-optimized batch"}
        breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: fr ? "Préparation des lots" : "Batch Builder" }]}
        actions={<Button size="sm" onClick={() => { setBatch((b) => [...b].reverse()); toast(fr ? "Itinéraire optimisé" : "Route optimized"); }}>{fr ? "Optimiser l'itinéraire" : "Optimize Route"}</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "id", label: fr ? "Colis" : "Parcel" },
                { key: "customer", label: t("customer") },
                { key: "zone", label: t("zone") },
                { key: "weight", label: fr ? "Poids" : "Weight", render: (row) => `${row.weight}kg` },
                {
                  key: "actions",
                  label: fr ? "Action" : "Action",
                  render: (row) => (
                    <Button variant="secondary" size="sm" onClick={() => add(String(row.id))}>
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
              {batch.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400">{fr ? "Ajoutez des colis pour constituer le lot" : "Add parcels to build batch"}</p>
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
                        <button type="button" onClick={() => remove(String(row.id))} className="text-red-500">
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
          {batch.length > 0 && (
            <Button className="w-full" onClick={() => setShowAssignModal(true)}>
              {fr ? "Créer le lot et assigner un livreur" : "Create Batch & Assign Rider"}
            </Button>
          )}
        </div>
      </div>

      <AssignRiderModal
        open={showAssignModal}
        title={fr ? "Assigner un livreur au nouveau lot" : "Assign rider to new batch"}
        subtitle={fr ? `${batch.length} colis dans le lot` : `${batch.length} parcel${batch.length !== 1 ? "s" : ""} in batch`}
        onClose={() => setShowAssignModal(false)}
        onConfirm={(rider: RiderEntity) => {
          toast(fr ? `Lot créé — ${rider.name} assigné` : `Batch created — ${rider.name} assigned`);
          setShowAssignModal(false);
          router.push("/warehouse/dispatch/BATCH-001");
        }}
      />
    </div>
  );
}
