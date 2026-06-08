"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { inventoryEntities } from "@/lib/warehouse-entities";
import { cn } from "@/lib/utils";

export default function WarehouseInventoryPage() {
  const { t } = useLocale();
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter === "Availability"
    ? inventoryEntities.filter((i) => i.available > 0)
    : filter === "Location"
      ? [...inventoryEntities].sort((a, b) => a.location.localeCompare(b.location))
      : filter === "Category"
        ? [...inventoryEntities].sort((a, b) => a.category.localeCompare(b.category))
        : inventoryEntities;

  return (
    <WarehouseListPage
      title={t("inventory")}
      subtitle="List View — SKU, Product, Category, Available, Reserved, Allocated, Location"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("inventory") }]}
      filters={
        <div className="flex flex-wrap gap-2">
          {["Category", "Location", "Availability"].map((f) => (
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
        { key: "sku", label: "SKU", render: (row) => (
          <Link href={`/warehouse/inventory/${encodeURIComponent(String(row.sku))}`} className="font-medium text-indigo-600 hover:underline">{String(row.sku)}</Link>
        )},
        { key: "product", label: "Product", render: (row) => (
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded">
              <Image src={String(row.image)} alt="" fill className="object-cover" sizes="32px" />
            </div>
            <span>{String(row.product)}</span>
          </div>
        )},
        { key: "category", label: "Category" },
        { key: "available", label: "Available" },
        { key: "reserved", label: "Reserved" },
        { key: "allocated", label: "Allocated" },
        { key: "location", label: "Location" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/inventory/${encodeURIComponent(String(row.sku))}`} className="text-sm text-indigo-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
