"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useWarehouseData } from "@/lib/warehouse";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

const STATUS_OPTIONS = [
  { value: "ok", label: "In stock", labelFr: "En stock" },
  { value: "low", label: "Low", labelFr: "Faible" },
  { value: "out", label: "Out of stock", labelFr: "Rupture" },
];

export default function WarehouseInventoryPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { inventory, inventoryError } = useWarehouseData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () => applyListFilters(inventory, filters, { searchFields: ["sku", "name", "category"], statusField: "status" }),
    [inventory, filters],
  );

  return (
    <WarehouseListPage
      title={t("inventory")}
      subtitle={fr ? "Niveaux de stock en direct par produit. Les vendeurs gèrent leur stock ; cette vue est en lecture seule." : "Live stock levels per product. Sellers manage their stock; this view is read-only."}
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("inventory") }]}
      filters={
        <div className="space-y-3">
          {inventoryError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{inventoryError}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={STATUS_OPTIONS}
            searchPlaceholder={fr ? "SKU, produit, catégorie…" : "SKU, product, category…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "sku", label: "SKU", render: (row) => (
          <Link href={ops(`/inventory/${encodeURIComponent(String(row.sku))}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.sku)}</Link>
        )},
        { key: "name", label: fr ? "Produit" : "Product" },
        { key: "category", label: fr ? "Catégorie" : "Category" },
        { key: "stock", label: fr ? "Stock" : "Stock" },
        { key: "status", label: t("status"), render: (row) => {
          const s = String(row.status);
          return <Badge variant={s === "ok" ? "success" : s === "low" ? "warning" : "danger"}>{(STATUS_OPTIONS.find((o) => o.value === s) ? (fr ? STATUS_OPTIONS.find((o) => o.value === s)!.labelFr : STATUS_OPTIONS.find((o) => o.value === s)!.label) : s)}</Badge>;
        }},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/inventory/${encodeURIComponent(String(row.sku))}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
