"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useWarehouseData } from "@/lib/warehouse";

export default function WarehouseInventoryPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { inventoryEntities } = useWarehouseData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(inventoryEntities, filters, {
        searchFields: ["sku", "product", "category", "location"],
      }),
    [inventoryEntities, filters]
  );

  return (
    <WarehouseListPage
      title={t("inventory")}
      subtitle={fr ? "Vue liste — SKU, Produit, Catégorie, Disponible, Réservé, Alloué, Emplacement" : "List View — SKU, Product, Category, Available, Reserved, Allocated, Location"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("inventory") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          searchPlaceholder={fr ? "SKU, produit, catégorie, emplacement…" : "SKU, product, category, location…"}
          showDateFilters={false}
          showStatusFilter={false}
        />
      }
      columns={[
        { key: "sku", label: "SKU", render: (row) => (
          <Link href={`/warehouse/inventory/${encodeURIComponent(String(row.sku))}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.sku)}</Link>
        )},
        { key: "product", label: fr ? "Produit" : "Product", render: (row) => (
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded">
              <Image src={String(row.image)} alt="" fill className="object-cover" sizes="32px" />
            </div>
            <span>{String(row.product)}</span>
          </div>
        )},
        { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => String(fr ? (row.categoryFr ?? row.category) : row.category) },
        { key: "available", label: fr ? "Disponible" : "Available" },
        { key: "reserved", label: fr ? "Réservé" : "Reserved" },
        { key: "allocated", label: fr ? "Alloué" : "Allocated" },
        { key: "location", label: fr ? "Emplacement" : "Location" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/inventory/${encodeURIComponent(String(row.sku))}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
