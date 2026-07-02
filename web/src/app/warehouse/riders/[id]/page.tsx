"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Phone, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ActiveDeliveryCard } from "@/components/delivery/active-delivery-card";
import { getRider, getDeliveriesByRider } from "@/lib/warehouse-entities";
import { deliveryEntityToDetail } from "@/lib/delivery-detail";
import { batchEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_FR: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  offline: "Hors ligne",
};

// Batch status values originate from the shared (non-owned) entities layer.
const BATCH_STATUS_FR: Record<string, string> = {
  ready: "Prêt",
  dispatched: "Expédié",
  in_transit: "En transit",
  delivered: "Livré",
};

export default function WarehouseRiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rider = getRider(Number(id));

  if (!rider) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Livreur introuvable" : "Rider not found"}
      </div>
    );
  }

  const batches = batchEntities.filter((b) => b.riderId === rider.id);
  const activeDeliveries = getDeliveriesByRider(rider.id);

  return <RiderDetail rider={rider} fr={fr} tZone={t("zone")} tView={t("view")} locale={locale} batches={batches} activeDeliveries={activeDeliveries} />;
}

// Vehicle & compliance record (editable by the admin / warehouse team).
type Vehicle = {
  model: string;
  type: string;
  plate: string;
  colour: string;
  odometer: string;
  fuel: string;
  lastService: string;
  nextService: string;
  insurance: string;
};

function RiderDetail({
  rider,
  fr,
  tZone,
  tView,
  locale,
  batches,
  activeDeliveries,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rider: any;
  fr: boolean;
  tZone: string;
  tView: string;
  locale: "en" | "fr";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batches: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeDeliveries: any[];
}) {
  const [vehicle, setVehicle] = useState<Vehicle>({
    model: "Yamaha NMAX",
    type: "Scooter · 125cc",
    plate: "KN 4821 A",
    colour: "Matte black",
    odometer: "18,240 km",
    fuel: "Petrol",
    lastService: "12 May 2026",
    nextService: "Due in 640 km",
    insurance: "Valid until Sep 2026",
  });
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title={rider.name}
        subtitle={`${rider.zone} · ${fr ? rider.vehicleFr : rider.vehicle} · ⭐ ${rider.rating}`}
        backHref="/warehouse/riders"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Livreurs" : "Riders", href: "/warehouse/riders" },
          { label: rider.name },
        ]}
        actions={
          <>
            <a
              href={`tel:${rider.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50"
            >
              <Phone className="h-3.5 w-3.5" />
              {fr ? "Appeler livreur" : "Call Rider"}
            </a>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              {fr ? "Modifier le véhicule" : "Edit vehicle"}
            </button>
            <Badge variant="success">{fr ? STATUS_FR[rider.status] ?? rider.status : rider.status}</Badge>
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid
            items={[
              { label: fr ? "Nom" : "Name", value: rider.name },
              {
                label: fr ? "Téléphone" : "Phone",
                value: (
                  <a
                    href={`tel:${rider.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {rider.phone}
                  </a>
                ),
              },
              { label: fr ? "Véhicule" : "Vehicle", value: fr ? rider.vehicleFr : rider.vehicle },
              { label: tZone, value: rider.zone },
              { label: fr ? "Statut" : "Status", value: fr ? STATUS_FR[rider.status] ?? rider.status : rider.status },
              { label: fr ? "Position" : "Location", value: rider.location },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Véhicule et conformité" : "Vehicle & compliance"} span={2}>
          <InfoGrid
            columns={3}
            items={[
              { label: fr ? "Véhicule" : "Vehicle", value: `${vehicle.model} · ${vehicle.type}` },
              { label: fr ? "Plaque" : "Plate", value: vehicle.plate },
              { label: fr ? "Couleur" : "Colour", value: vehicle.colour },
              { label: fr ? "Compteur" : "Odometer", value: vehicle.odometer },
              { label: fr ? "Carburant" : "Fuel", value: vehicle.fuel },
              { label: fr ? "Assurance" : "Insurance", value: vehicle.insurance },
              { label: fr ? "Dernier entretien" : "Last service", value: vehicle.lastService },
              { label: fr ? "Prochain entretien" : "Next service", value: vehicle.nextService },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Performance" : "Performance"}>
          <InfoGrid
            columns={3}
            items={[
              { label: fr ? "Livraisons totales" : "Total Deliveries", value: rider.deliveries },
              { label: fr ? "Échecs" : "Failed Deliveries", value: rider.failedDeliveries },
              { label: fr ? "Note" : "Rating", value: `⭐ ${rider.rating}` },
              { label: fr ? "Score performance" : "Performance Score", value: `${rider.performanceScore}%` },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Revenus" : "Earnings"}>
          <InfoGrid
            columns={3}
            items={[
              { label: fr ? "Journalier" : "Daily", value: formatCurrency(rider.earningsDaily, locale) },
              { label: fr ? "Hebdomadaire" : "Weekly", value: formatCurrency(rider.earningsWeekly, locale) },
              { label: fr ? "Mensuel" : "Monthly", value: formatCurrency(rider.earningsMonthly, locale) },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Lots assignés" : "Assigned Batches"} span={2}>
          <DataTable
            columns={[
              {
                key: "id",
                label: fr ? "Lot" : "Batch",
                render: (row) => (
                  <Link href={`/warehouse/dispatch/${row.id}`} className="text-[var(--primary)] hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              { key: "zone", label: tZone },
              { key: "parcelCount", label: fr ? "Colis" : "Parcels" },
              {
                key: "status",
                label: fr ? "Statut" : "Status",
                render: (row) => <Badge>{fr ? (BATCH_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>,
              },
            ]}
            data={batches as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/warehouse/dispatch/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{tView}</Link>
            )}
          />
        </DetailGridSection>

        <DetailGridSection
          title={fr ? "Livraisons actives" : "Current Deliveries"}
          span={3}
        >
          {activeDeliveries.length === 0 ? (
            <p className="text-sm text-slate-500">
              {fr ? "Aucune livraison active." : "No active deliveries."}
            </p>
          ) : (
            <div className="space-y-3">
              {activeDeliveries.map((delivery) => (
                <ActiveDeliveryCard
                  key={delivery.id}
                  delivery={deliveryEntityToDetail(delivery)}
                  locale={locale}
                  alwaysExpanded
                />
              ))}
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>

      {editing && (
        <VehicleEditModal
          fr={fr}
          value={vehicle}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            setVehicle(v);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function VehicleEditModal({
  fr,
  value,
  onCancel,
  onSave,
}: {
  fr: boolean;
  value: Vehicle;
  onCancel: () => void;
  onSave: (v: Vehicle) => void;
}) {
  const [form, setForm] = useState<Vehicle>(value);
  const field = (key: keyof Vehicle, labelEn: string, labelFr: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{fr ? labelFr : labelEn}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
      />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900">
          {fr ? "Modifier le véhicule" : "Edit vehicle"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {fr
            ? "Ces informations s'affichent dans l'app du livreur."
            : "This information appears in the rider app."}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("model", "Model", "Modèle")}
          {field("type", "Type", "Type")}
          {field("plate", "Plate", "Plaque")}
          {field("colour", "Colour", "Couleur")}
          {field("odometer", "Odometer", "Compteur")}
          {field("fuel", "Fuel", "Carburant")}
          {field("insurance", "Insurance", "Assurance")}
          {field("lastService", "Last service", "Dernier entretien")}
          {field("nextService", "Next service", "Prochain entretien")}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            {fr ? "Annuler" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {fr ? "Enregistrer" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
