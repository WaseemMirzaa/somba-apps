"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { exceptionEntities } from "@/lib/warehouse-entities";

const severityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  low: "default",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "investigating", label: "Investigating", labelFr: "En investigation" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
];

export default function WarehouseExceptionsPage() {
  const { t } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(exceptionEntities, filters, {
        searchFields: ["id", "parcelId", "type"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <WarehouseListPage
      title={t("exceptions")}
      subtitle="List View — Incident ID, Parcel, Type, Severity, Status"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("exceptions") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Incident ID, parcel, type…"
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: "Incident ID", render: (row) => (
          <Link href={`/warehouse/exceptions/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "parcelId", label: "Parcel", render: (row) => row.parcelId !== "—" ? (
          <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-[var(--primary)] hover:underline">{String(row.parcelId)}</Link>
        ) : "—" },
        { key: "type", label: "Type" },
        { key: "severity", label: "Severity", render: (row) => (
          <Badge variant={severityVariant[row.severity as string] ?? "default"}>{String(row.severity)}</Badge>
        )},
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/exceptions/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
