"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AssignParcelButton } from "@/components/warehouse/assign-parcel-button";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { STAGE_LABEL, stageVariant, useWarehouseData, type Parcel, type ParcelStage } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

const STATUS_OPTIONS = [
  { value: "received", label: STAGE_LABEL.received.en, labelFr: STAGE_LABEL.received.fr },
  { value: "sorting", label: STAGE_LABEL.sorting.en, labelFr: STAGE_LABEL.sorting.fr },
];

export default function WarehouseSortingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { parcels } = useWarehouseData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  // Sorting = scanned in at the hub and being matched to a rider.
  const queue = useMemo(
    () => parcels.filter((p) => p.status === "received" || p.status === "sorting"),
    [parcels],
  );
  const filtered = useMemo(
    () =>
      applyListFilters(queue, filters, {
        searchFields: ["id", "orderId", "customer", "zone", "rider"],
        statusField: "status",
      }),
    [queue, filters],
  );

  return (
    <WarehouseListPage
      paged
      title={fr ? "Table de tri" : "Sorting Board"}
      subtitle={
        fr
          ? "Colis reçus au hub qui attendent un livreur, ou déjà attribués"
          : "Parcels scanned in at the hub that are waiting for a rider, or already assigned"
      }
      breadcrumbs={[
        { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
        { label: t("sorting") },
      ]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID colis, commande, client, zone, livreur…" : "Parcel ID, order, customer, zone, rider…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
          <Link href={ops(`/parcels/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "ID commande" : "Order ID" },
        { key: "customer", label: t("customer") },
        { key: "zone", label: t("zone") },
        { key: "receivedAt", label: fr ? "Reçu le" : "Received", render: (row) => shortDate(row.receivedAt ? String(row.receivedAt) : null, locale) },
        { key: "rider", label: fr ? "Livreur" : "Rider" },
        { key: "status", label: t("status"), render: (row) => {
          const s = String(row.status) as ParcelStage;
          return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
        }},
        { key: "actions", label: t("action"), render: (row) => {
          const p = row as unknown as Parcel;
          return (
            <div className="flex gap-3 text-xs">
              <AssignParcelButton
                parcel={p}
                className="text-[var(--primary)] hover:underline"
                label={p.status === "sorting" ? (fr ? "Changer de livreur" : "Change rider") : (fr ? "Assigner un livreur" : "Assign rider")}
              />
              <Link href={ops(`/parcels/${p.id}`)} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            </div>
          );
        }},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
