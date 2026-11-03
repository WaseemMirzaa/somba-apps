"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { OpsError } from "@/components/warehouse/ops-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { useLocale } from "@/context/locale-context";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useOpsPath } from "@/lib/ops-path";
import { useWarehouseData } from "@/lib/warehouse";
import { pickText } from "@/lib/i18n-fields";

const STATUS_OPTIONS = [
  { value: "ok", label: "In stock", labelFr: "En stock" },
  { value: "low", label: "Low", labelFr: "Faible" },
  { value: "out", label: "Out of stock", labelFr: "Rupture" },
];

/**
 * Parcels in custody (the view this page always had): the catalogue products of the parcels inbound, on hand or outbound at
 * this warehouse, next to the seller's own stock. Read-only; the stock ledger tabs are what the warehouse itself holds.
 */
export function CustodyTab() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const { inventory, inventoryError } = useWarehouseData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const filtered = useMemo(
    () => applyListFilters(inventory, filters, { searchFields: ["sku", "name", "nameFr", "category", "categoryFr"], statusField: "status" }),
    [inventory, filters],
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fr ? "Produits des colis en garde dans cet entrepôt, avec le stock du vendeur. Les vendeurs gèrent leur stock ; cette vue est en lecture seule." : "Products of the parcels in this warehouse's custody, next to the seller's own stock. Sellers manage their stock; this view is read-only."}
      </p>
      {inventoryError && <OpsError message={inventoryError} />}
      <ListFilters values={filters} onChange={setFilters} statusOptions={STATUS_OPTIONS} searchPlaceholder={fr ? "SKU, produit, catégorie…" : "SKU, product, category…"} showDateFilters={false} />
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "sku", label: "SKU", render: (row) => <Link href={ops(`/inventory/${encodeURIComponent(String(row.sku))}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.sku)}</Link> },
              { key: "name", label: fr ? "Produit" : "Product", render: (row) => pickText(fr, row.name as string, row.nameFr as string | null) },
              { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => pickText(fr, row.category as string, row.categoryFr as string | null) },
              { key: "stock", label: fr ? "Stock du vendeur" : "Seller stock" },
              {
                key: "status",
                label: fr ? "Statut" : "Status",
                render: (row) => {
                  const s = String(row.status);
                  const o = STATUS_OPTIONS.find((x) => x.value === s);
                  return <Badge variant={s === "ok" ? "success" : s === "low" ? "warning" : "danger"}>{o ? (fr ? o.labelFr : o.label) : s}</Badge>;
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
