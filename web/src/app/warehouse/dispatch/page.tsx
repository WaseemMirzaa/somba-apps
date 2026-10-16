"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";
import { BATCH_STATUS, batchTaskIds, pick, shortDate, statusOptions, useOpsQuery, type BatchRow } from "@/lib/warehouse-live";

export default function WarehouseDispatchPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse");
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo(
    () => batchesQ.data.map((b) => ({ ...b, parcelCount: batchTaskIds(b).length })),
    [batchesQ.data],
  );
  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["reference", "riderName"], statusField: "status" }),
    [rows, filters],
  );

  return (
    <WarehouseListPage
      title={fr ? "Lots d'expédition" : "Dispatch Batches"}
      subtitle={fr ? "Lots créés depuis le constructeur de lots, avec leur livreur" : "Batches created in the batch builder, with their rider"}
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("dispatch") }]}
      actions={
        <Link href={ops("/batch-builder")} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          {fr ? "Créer un lot" : "Create Batch"}
        </Link>
      }
      filters={
        <div className="space-y-3">
          {batchesQ.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{batchesQ.error}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={statusOptions(BATCH_STATUS)}
            searchPlaceholder={fr ? "Référence du lot, livreur…" : "Batch reference, rider…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "reference", label: fr ? "Lot" : "Batch", render: (row) => (
          <Link href={ops(`/dispatch/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
        )},
        { key: "riderName", label: fr ? "Livreur" : "Rider", render: (row) => (
          row.riderId
            ? <Link href={ops(`/riders/${row.riderId}`)} className="text-[var(--primary)] hover:underline">{String(row.riderName ?? row.riderId)}</Link>
            : "—"
        )},
        { key: "parcelCount", label: fr ? "Colis" : "Parcels" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "dispatched" ? "success" : "warning"}>{pick(BATCH_STATUS[String(row.status)], fr, String(row.status))}</Badge>
        )},
        { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/dispatch/${row.id}`)} className="text-xs text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
