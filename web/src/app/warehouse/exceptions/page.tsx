"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { exceptionEntities } from "@/lib/warehouse-entities";

const severityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  low: "default",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export default function WarehouseExceptionsPage() {
  const { t } = useLocale();

  return (
    <WarehouseListPage
      title={t("exceptions")}
      subtitle="List View — Incident ID, Parcel, Type, Severity, Status"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("exceptions") }]}
      columns={[
        { key: "id", label: "Incident ID", render: (row) => (
          <Link href={`/warehouse/exceptions/${row.id}`} className="font-medium text-indigo-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "parcelId", label: "Parcel", render: (row) => row.parcelId !== "—" ? (
          <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-indigo-600 hover:underline">{String(row.parcelId)}</Link>
        ) : "—" },
        { key: "type", label: "Type" },
        { key: "severity", label: "Severity", render: (row) => (
          <Badge variant={severityVariant[row.severity as string] ?? "default"}>{String(row.severity)}</Badge>
        )},
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/exceptions/${row.id}`} className="text-sm text-indigo-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={exceptionEntities as unknown as Record<string, unknown>[]}
    />
  );
}
