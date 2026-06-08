"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { riderEntities } from "@/lib/warehouse-entities";

export default function WarehouseRidersPage() {
  const { t } = useLocale();
  const { toast } = useToast();

  return (
    <WarehouseListPage
      title="Rider Assignments"
      subtitle="List View — Rider Name, Zone, Active Deliveries, Location, Performance Score"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("riders") }]}
      columns={[
        { key: "name", label: "Rider Name", render: (row) => (
          <Link href={`/warehouse/riders/${row.id}`} className="font-medium text-indigo-600 hover:underline">{String(row.name)}</Link>
        )},
        { key: "zone", label: "Zone" },
        { key: "activeDeliveries", label: "Active Deliveries" },
        { key: "location", label: "Current Location" },
        { key: "performanceScore", label: "Performance", render: (row) => (
          <span className="font-medium text-emerald-600">{String(row.performanceScore)}%</span>
        )},
        { key: "status", label: t("status"), render: (row) => <Badge variant="success">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/warehouse/riders/${row.id}`} className="text-indigo-600 hover:underline">{t("view")}</Link>
            <button onClick={() => toast(`Batch assigned to ${row.name}`)} className="text-indigo-600 hover:underline">{t("assign")}</button>
          </div>
        )},
      ]}
      data={riderEntities as unknown as Record<string, unknown>[]}
    />
  );
}
