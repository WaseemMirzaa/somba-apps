"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone } from "lucide-react";
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
              { label: t("zone"), value: rider.zone },
              { label: fr ? "Statut" : "Status", value: fr ? STATUS_FR[rider.status] ?? rider.status : rider.status },
              { label: fr ? "Position" : "Location", value: rider.location },
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
              { key: "zone", label: t("zone") },
              { key: "parcelCount", label: fr ? "Colis" : "Parcels" },
              {
                key: "status",
                label: fr ? "Statut" : "Status",
                render: (row) => <Badge>{fr ? (BATCH_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>,
              },
            ]}
            data={batches as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/warehouse/dispatch/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
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
    </div>
  );
}
