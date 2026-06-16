"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { batchEntities } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

const STATUS_OPTIONS = [
  { value: "ready", label: "Ready", labelFr: "Prêt" },
  { value: "dispatched", label: "Dispatched", labelFr: "Expédié" },
  { value: "in_transit", label: "In transit", labelFr: "En transit" },
];

export default function WarehouseDispatchPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse");
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(batchEntities, filters, {
        searchFields: ["id", "zone", "rider"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <WarehouseListPage
      title={fr ? "Lots d'expédition" : "Dispatch Batches"}
      subtitle={fr ? "Vue liste — ID lot, Zone, Livreur, Colis, Distance, Statut, Heure d'expédition" : "List View — Batch ID, Zone, Rider, Parcels, Distance, Status, Dispatch Time"}
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("dispatch") }]}
      actions={
        <Link href={ops("/batch-builder")} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          {fr ? "Créer un lot" : "Create Batch"}
        </Link>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID lot, zone, livreur…" : "Batch ID, zone, rider…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID lot" : "Batch ID", render: (row) => (
          <Link href={ops(`/dispatch/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "zone", label: "Zone" },
        { key: "rider", label: fr ? "Livreur" : "Rider", render: (row) => (
          <Link href={ops(`/riders/${row.riderId}`)} className="text-[var(--primary)] hover:underline">{String(row.rider)}</Link>
        )},
        { key: "parcelCount", label: fr ? "Colis" : "Parcels" },
        { key: "distance", label: fr ? "Distance" : "Distance" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "dispatched" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "dispatchTime", label: fr ? "Heure d'expédition" : "Dispatch Time" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={ops(`/dispatch/${row.id}`)} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            {row.status === "ready" && (
              <button onClick={() => toast(fr ? `Lot ${row.id} expédié` : `Batch ${row.id} dispatched`)} className="text-emerald-600">{fr ? "Expédier" : "Dispatch"}</button>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
