"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { getBatch } from "@/lib/entities";
import { getRider, type RiderEntity } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

// Batch status values originate from the shared (non-owned) entities layer.
const STATUS_FR: Record<string, string> = {
  ready: "Prêt",
  dispatched: "Expédié",
  in_transit: "En transit",
  delivered: "Livré",
};

export default function WarehouseBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const batch = getBatch(id);
  const [status, setStatus] = useState(batch?.status ?? "ready");
  const [assignedRider, setAssignedRider] = useState<RiderEntity | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  if (!batch) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Lot introuvable" : "Batch not found"}</div>;
  }

  const rider = assignedRider ?? getRider(batch.riderId);
  const statusLabel = fr ? STATUS_FR[status] ?? status : status;

  function handleAssignRider(selected: RiderEntity) {
    setAssignedRider(selected);
    setShowAssignModal(false);
    toast(fr ? `${selected.name} assigné à ${batch!.id}` : `${selected.name} assigned to ${batch!.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.id}
        subtitle={`${batch.zone} · ${batch.parcelCount} ${fr ? "colis" : "parcels"} · ${statusLabel}`}
        backHref="/warehouse/dispatch"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Expédition" : "Dispatch", href: "/warehouse/dispatch" },
          { label: batch.id },
        ]}
        actions={
          status === "ready" ? (
            <button onClick={() => { setStatus("dispatched"); toast(fr ? `Lot ${batch.id} expédié` : `Batch ${batch.id} dispatched`); router.push("/warehouse/deliveries"); }} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">{fr ? "Expédier" : "Dispatch"}</button>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Lot" : "Batch"}>
          <InfoGrid items={[
            { label: fr ? "ID lot" : "Batch ID", value: batch.id },
            { label: t("zone"), value: batch.zone },
            { label: fr ? "Colis" : "Parcels", value: batch.parcelCount },
            { label: fr ? "Statut" : "Status", value: statusLabel },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Attribution du livreur" : "Rider Assignment"}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="btn-primary rounded-xl px-4 py-2 text-sm font-medium"
            >
              {assignedRider ? (fr ? "Changer de livreur" : "Change rider") : (fr ? "Assigner un livreur" : "Assign rider")}
            </button>
            {!assignedRider && (
              <button
                type="button"
                onClick={() => {
                  const nearest = getRider(batch.riderId);
                  if (nearest) {
                    setAssignedRider(nearest);
                    toast(fr ? `${nearest.name} assigné automatiquement` : `Auto-assigned ${nearest.name}`);
                  }
                }}
                className="text-sm text-[var(--primary)] hover:underline"
              >
                {fr ? "Assigner automatiquement le livreur le plus proche" : "Auto-assign nearest rider"}
              </button>
            )}
          </div>
          {rider ? (
            <>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: rider.name },
            { label: fr ? "Téléphone" : "Phone", value: rider.phone },
            { label: fr ? "Véhicule" : "Vehicle", value: fr ? rider.vehicleFr : rider.vehicle },
            { label: t("zone"), value: rider.zone },
            { label: fr ? "Performance" : "Performance", value: `${rider.performanceScore}%` },
          ]} />
          <div className="mt-4 flex gap-3">
            <NavLinkButton href={`/warehouse/riders/${rider.id}`}>{fr ? "Ouvrir le livreur →" : "Open Rider →"}</NavLinkButton>
            <a href={`tel:${rider.phone}`} className="text-sm text-slate-500 hover:text-[var(--primary)]">{fr ? "Appeler le livreur" : "Call Rider"}</a>
          </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{fr ? "Aucun livreur assigné pour le moment. Recherchez et assignez un livreur." : "No rider assigned yet. Search and assign a rider."}</p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Itinéraire" : "Route"}>
          <InfoGrid items={[
            { label: fr ? "Arrêts" : "Stops", value: batch.stops },
            { label: fr ? "Distance" : "Distance", value: batch.distance },
            { label: "ETA", value: batch.eta },
          ]} />
          <div className="mt-4 flex h-32 items-center justify-center rounded-lg bg-blue-50 text-sm text-slate-500">
            {fr ? "Aperçu carte (simulation)" : "Map preview (mock)"}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Colis dans le lot" : "Parcels in Batch"} span={3}>
          <DataTable
            columns={[
              { key: "parcelId", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-[var(--primary)] hover:underline">{String(row.parcelId)}</Link>
              )},
              { key: "orderId", label: fr ? "ID commande" : "Order ID" },
              { key: "customer", label: t("customer") },
              { key: "actions", label: fr ? "Action" : "Action", render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-xs text-[var(--primary)] hover:underline">{fr ? "Ouvrir" : "Open"}</Link>
              )},
            ]}
            data={batch.parcels as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={batch.timeline} />
        </DetailGridSection>
      </DetailGrid>

      <AssignRiderModal
        open={showAssignModal}
        title={fr ? "Assigner un livreur au lot" : "Assign rider to batch"}
        subtitle={`${batch.id} · ${batch.zone} · ${batch.parcelCount} ${fr ? "colis" : "parcels"}`}
        selectedRiderId={assignedRider?.id ?? batch.riderId}
        onClose={() => setShowAssignModal(false)}
        onConfirm={handleAssignRider}
      />
    </div>
  );
}
