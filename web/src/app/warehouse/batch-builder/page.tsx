"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/toast-context";
import { batchParcels } from "@/lib/warehouse-hubs";
import type { RiderEntity } from "@/lib/warehouse-entities";

export default function WarehouseBatchBuilderPage() {
  const router = useRouter();
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
        title="Batch Builder"
        subtitle="Add parcels to build a route-optimized batch"
        breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: "Batch Builder" }]}
        actions={<Button size="sm" onClick={() => { setBatch((b) => [...b].reverse()); toast("Route optimized"); }}>Optimize Route</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "id", label: "Parcel" },
                { key: "customer", label: "Customer" },
                { key: "zone", label: "Zone" },
                { key: "weight", label: "Weight", render: (row) => `${row.weight}kg` },
                {
                  key: "actions",
                  label: "Action",
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
                <p className="px-5 py-8 text-center text-sm text-slate-400">Add parcels to build batch</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "stop", label: "#" },
                    { key: "id", label: "Parcel" },
                    { key: "zone", label: "Zone" },
                    {
                      key: "actions",
                      label: "Action",
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
              Create Batch & Assign Rider
            </Button>
          )}
        </div>
      </div>

      <AssignRiderModal
        open={showAssignModal}
        title="Assign rider to new batch"
        subtitle={`${batch.length} parcel${batch.length !== 1 ? "s" : ""} in batch`}
        onClose={() => setShowAssignModal(false)}
        onConfirm={(rider: RiderEntity) => {
          toast(`Batch created — ${rider.name} assigned`);
          setShowAssignModal(false);
          router.push("/warehouse/dispatch/BATCH-001");
        }}
      />
    </div>
  );
}
