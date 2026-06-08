"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sortingParcels as initialParcels } from "@/lib/warehouse-entities";
import { cn } from "@/lib/utils";

export default function WarehouseSortingPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string | null>(null);
  const [parcels, setParcels] = useState(initialParcels);

  const filtered = filter
    ? parcels.filter((p) => (filter === "Zone" ? true : filter === "Priority" ? p.priority === "high" : p.status !== "on_hold"))
    : parcels;

  return (
    <WarehouseListPage
      title="Sorting Board"
      subtitle="List View — Parcel ID, Order ID, Customer, Zone, Priority, Route"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("sorting") }]}
      filters={
        <div className="flex flex-wrap gap-2">
          {["Zone", "Priority", "Status"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(filter === f ? null : f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-200 text-slate-600 hover:bg-indigo-50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      }
      columns={[
        { key: "id", label: "Parcel ID", render: (row) => (
          <Link href={`/warehouse/parcels/${row.id}`} className="font-medium text-indigo-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order ID" },
        { key: "customer", label: "Customer" },
        { key: "zone", label: "Zone" },
        { key: "priority", label: "Priority", render: (row) => (
          <Badge variant={row.priority === "high" ? "danger" : "info"}>{String(row.priority)}</Badge>
        )},
        { key: "route", label: "Route" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <button onClick={() => toast(`Zone assigned to ${row.id}`)} className="text-indigo-600 hover:underline">Assign Zone</button>
            <button onClick={() => { setParcels((p) => p.map((item) => item.id === row.id ? { ...item, status: "on_hold" } : item)); toast(`${row.id} placed on hold`, "info"); }} className="text-slate-500 hover:underline">Hold</button>
            <Link href={`/warehouse/parcels/${row.id}`} className="text-indigo-600 hover:underline">{t("view")}</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
