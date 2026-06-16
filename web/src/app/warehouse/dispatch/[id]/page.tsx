"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { DataTable } from "@/components/ui/data-table";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { getBatch } from "@/lib/entities";
import { getRider, type RiderEntity } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";

export default function WarehouseBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const batch = getBatch(id);
  const [status, setStatus] = useState(batch?.status ?? "ready");
  const [assignedRider, setAssignedRider] = useState<RiderEntity | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  if (!batch) {
    return <div className="p-8 text-center text-slate-500">Batch not found</div>;
  }

  const rider = assignedRider ?? getRider(batch.riderId);

  function handleAssignRider(selected: RiderEntity) {
    setAssignedRider(selected);
    setShowAssignModal(false);
    toast(`${selected.name} assigned to ${batch.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.id}
        subtitle={`${batch.zone} · ${batch.parcelCount} parcels · ${batch.status}`}
        backHref="/warehouse/dispatch"
        breadcrumbs={[
          { label: "Warehouse", href: "/warehouse" },
          { label: "Dispatch", href: "/warehouse/dispatch" },
          { label: batch.id },
        ]}
        actions={
          status === "ready" ? (
            <button onClick={() => { setStatus("dispatched"); toast(`Batch ${batch.id} dispatched`); router.push("/warehouse/deliveries"); }} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">Dispatch</button>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title="Batch">
          <InfoGrid items={[
            { label: "Batch ID", value: batch.id },
            { label: "Zone", value: batch.zone },
            { label: "Parcels", value: batch.parcelCount },
            { label: "Status", value: status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Rider Assignment">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="btn-primary rounded-xl px-4 py-2 text-sm font-medium"
            >
              {assignedRider ? "Change rider" : "Assign rider"}
            </button>
            {!assignedRider && (
              <button
                type="button"
                onClick={() => {
                  const nearest = getRider(batch.riderId);
                  if (nearest) {
                    setAssignedRider(nearest);
                    toast(`Auto-assigned ${nearest.name}`);
                  }
                }}
                className="text-sm text-[var(--primary)] hover:underline"
              >
                Auto-assign nearest rider
              </button>
            )}
          </div>
          {rider ? (
            <>
          <InfoGrid items={[
            { label: "Name", value: rider.name },
            { label: "Phone", value: rider.phone },
            { label: "Vehicle", value: rider.vehicle },
            { label: "Zone", value: rider.zone },
            { label: "Performance", value: `${rider.performanceScore}%` },
          ]} />
          <div className="mt-4 flex gap-3">
            <Link href={`/warehouse/riders/${rider.id}`} className="text-sm text-[var(--primary)] hover:underline">Open Rider →</Link>
            <a href={`tel:${rider.phone}`} className="text-sm text-slate-500 hover:text-[var(--primary)]">Call Rider</a>
          </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No rider assigned yet. Search and assign a rider.</p>
          )}
        </DetailGridSection>

        <DetailGridSection title="Route">
          <InfoGrid items={[
            { label: "Stops", value: batch.stops },
            { label: "Distance", value: batch.distance },
            { label: "ETA", value: batch.eta },
          ]} />
          <div className="mt-4 flex h-32 items-center justify-center rounded-lg bg-blue-50 text-sm text-slate-500">
            Map preview (mock)
          </div>
        </DetailGridSection>

        <DetailGridSection title="Parcels in Batch" span={3}>
          <DataTable
            columns={[
              { key: "parcelId", label: "Parcel ID", render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-[var(--primary)] hover:underline">{String(row.parcelId)}</Link>
              )},
              { key: "orderId", label: "Order ID" },
              { key: "customer", label: "Customer" },
              { key: "actions", label: "Action", render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-xs text-[var(--primary)] hover:underline">Open</Link>
              )},
            ]}
            data={batch.parcels as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={batch.timeline} />
        </DetailGridSection>
      </DetailGrid>

      <AssignRiderModal
        open={showAssignModal}
        title="Assign rider to batch"
        subtitle={`${batch.id} · ${batch.zone} · ${batch.parcelCount} parcels`}
        selectedRiderId={assignedRider?.id ?? batch.riderId}
        onClose={() => setShowAssignModal(false)}
        onConfirm={handleAssignRider}
      />
    </div>
  );
}
