"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { DataTable } from "@/components/ui/data-table";
import { getBatch } from "@/lib/entities";
import { useToast } from "@/context/toast-context";

export default function WarehouseBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const batch = getBatch(id);
  const [status, setStatus] = useState(batch?.status ?? "ready");
  const [rider, setRider] = useState(batch?.rider ?? "");
  const suggestedRiders = ["Jean Mukendi (nearest, online)", "Patrick Lumumba (Zone B)", "David Tshisekedi (busy)"];

  if (!batch) {
    return <div className="p-8 text-center text-slate-500">Batch not found</div>;
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
            <button onClick={() => { setStatus("dispatched"); toast(`Batch ${batch.id} dispatched`); router.push("/warehouse/deliveries"); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Dispatch</button>
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

        <DetailGridSection title="Rider Assignment (Δ6)">
          <p className="mb-2 text-xs text-indigo-600">Auto-suggested: {suggestedRiders[0]}</p>
          <select className="input-premium mb-3 w-full px-3 py-2 text-sm" value={rider || batch.rider} onChange={(e) => setRider(e.target.value)}>
            {suggestedRiders.map((r) => <option key={r} value={r.split(" ")[0]}>{r}</option>)}
          </select>
          <button onClick={() => { const nearest = suggestedRiders[0].split(" ")[0]; setRider(nearest); toast(`Auto-assigned ${nearest}`); }} className="text-sm text-indigo-600 hover:underline">Auto-assign nearest rider</button>
          <InfoGrid items={[
            { label: "Name", value: rider || batch.rider },
            { label: "Phone", value: batch.riderPhone },
            { label: "Vehicle", value: batch.vehicle },
            { label: "Performance", value: "94%" },
          ]} />
          <div className="mt-4 flex gap-3">
            <Link href={`/warehouse/riders/${batch.riderId}`} className="text-sm text-indigo-600 hover:underline">Open Rider →</Link>
            <a href={`tel:${batch.riderPhone}`} className="text-sm text-slate-500 hover:text-indigo-600">Call Rider</a>
          </div>
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
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-indigo-600 hover:underline">{String(row.parcelId)}</Link>
              )},
              { key: "orderId", label: "Order ID" },
              { key: "customer", label: "Customer" },
              { key: "actions", label: "Action", render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-xs text-indigo-600 hover:underline">Open</Link>
              )},
            ]}
            data={batch.parcels as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={batch.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
