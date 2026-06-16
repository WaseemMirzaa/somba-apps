"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerInventoryList } from "@/lib/seller-entities";

export default function SellerInventoryPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerInventoryList, filters, {
        searchFields: ["sku", "product", "category", "location"],
      }),
    [filters]
  );

  function exportCsv() {
    const header = "SKU,Product,Available,Reserved,Sold\n";
    const rows = sellerInventoryList.map((r) => `${r.sku},${r.product},${r.available},${r.reserved},${r.sold}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    a.click();
    toast(fr ? "CSV exporté" : "CSV exported");
  }

  return (
    <SellerListPage
      title={t("inventory")}
      subtitle={
        fr
          ? "Vue liste — SKU, produit, catégorie, disponible, réservé, alloué, vendu, emplacement"
          : "List View — SKU, Product, Category, Available, Reserved, Allocated, Sold, Location"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("inventory") }]}
      actions={
        <div className="flex gap-2">
          <label className="cursor-pointer rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">
            {fr ? "Importer CSV" : "Import CSV"}
            <input type="file" accept=".csv" className="hidden" onChange={() => toast(fr ? "CSV importé (démo)" : "CSV imported (mock)")} />
          </label>
          <button onClick={exportCsv} className="rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Exporter CSV" : "Export CSV"}</button>
        </div>
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
            <div className="relative h-8 w-8 overflow-hidden rounded">
              <Image src={String(row.image)} alt="" fill className="object-cover" sizes="32px" />
            </div>
            <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">{String(row.product)}</Link>
          </div>
        )},
        { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => (fr ? String(row.categoryFr ?? row.category) : String(row.category)) },
        { key: "available", label: fr ? "Disponible" : "Available" },
        { key: "reserved", label: fr ? "Réservé" : "Reserved" },
        { key: "allocated", label: fr ? "Alloué" : "Allocated" },
        { key: "sold", label: fr ? "Vendu" : "Sold" },
        { key: "location", label: fr ? "Emplacement" : "Location" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/seller/inventory/${encodeURIComponent(String(row.sku))}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <button onClick={() => toast(fr ? `Stock ajusté pour ${row.sku}` : `Stock adjusted for ${row.sku}`)} className="text-slate-500">{fr ? "Ajuster" : "Adjust"}</button>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
