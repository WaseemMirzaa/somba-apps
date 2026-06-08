"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { batchEntities } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

export default function WarehouseDispatchPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : "Warehouse";
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";

  return (
    <WarehouseListPage
      title="Dispatch Batches"
      subtitle="List View — Batch ID, Zone, Rider, Parcels, Distance, Status, Dispatch Time"
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("dispatch") }]}
      actions={
        <Link href={ops("/batch-builder")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
          Create Batch
        </Link>
      }
      columns={[
        { key: "id", label: "Batch ID", render: (row) => (
          <Link href={ops(`/dispatch/${row.id}`)} className="font-medium text-indigo-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "zone", label: "Zone" },
        { key: "rider", label: "Rider", render: (row) => (
          <Link href={ops(`/riders/${row.riderId}`)} className="text-indigo-600 hover:underline">{String(row.rider)}</Link>
        )},
        { key: "parcelCount", label: "Parcels" },
        { key: "distance", label: "Distance" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "dispatched" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "dispatchTime", label: "Dispatch Time" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={ops(`/dispatch/${row.id}`)} className="text-indigo-600 hover:underline">{t("view")}</Link>
            {row.status === "ready" && (
              <button onClick={() => toast(`Batch ${row.id} dispatched`)} className="text-emerald-600">Dispatch</button>
            )}
          </div>
        )},
      ]}
      data={batchEntities as unknown as Record<string, unknown>[]}
    />
  );
}
