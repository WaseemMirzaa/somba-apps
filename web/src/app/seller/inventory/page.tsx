"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SellerListPage } from "@/components/seller/list-page";
import { ProductImage } from "@/components/seller/product-image";
import { StockAdjust } from "@/components/seller/stock-adjust";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import { downloadCsv } from "@/lib/seller-labels";

export default function SellerInventoryPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { sellerInventoryList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerInventoryList, filters, {
        searchFields: ["sku", "product", "category"],
      }),
    [sellerInventoryList, filters]
  );

  function exportCsv() {
    downloadCsv("inventory.csv", [
      ["SKU", "Product", "Category", "Available", "In fulfilment", "Sold"],
      ...sellerInventoryList.map((r) => [r.sku, r.product, r.category, r.available, r.reserved, r.sold]),
    ]);
    toast(fr ? "CSV exporté" : "CSV exported");
  }

  return (
    <SellerListPage
      title={t("inventory")}
      subtitle={
        fr
          ? "Stock réel de vos annonces — ajustez la quantité directement"
          : "Live stock of your listings — adjust the quantity right here"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("inventory") }]}
      actions={
        <button onClick={exportCsv} className="rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Exporter CSV" : "Export CSV"}</button>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          searchPlaceholder={fr ? "SKU, produit, catégorie…" : "SKU, product, category…"}
          showDateFilters={false}
          showStatusFilter={false}
        />
      }
      columns={[
        { key: "sku", label: "SKU", render: (row) => (
          <Link href={`/seller/inventory/${encodeURIComponent(String(row.sku))}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.sku)}</Link>
        )},
        { key: "product", label: fr ? "Produit" : "Product", render: (row) => (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 overflow-hidden rounded">
              <ProductImage src={String(row.image)} />
            </div>
            <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">{String(row.product)}</Link>
          </div>
        )},
        { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => (fr ? String(row.categoryFr ?? row.category) : String(row.category)) },
        { key: "available", label: fr ? "Disponible" : "Available" },
        { key: "reserved", label: fr ? "En livraison" : "In fulfilment" },
        { key: "sold", label: fr ? "Vendu" : "Sold" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex flex-wrap items-start gap-3 text-xs">
            <Link href={`/seller/inventory/${encodeURIComponent(String(row.sku))}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <StockAdjust productId={String(row.productId)} current={Number(row.available)} />
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
