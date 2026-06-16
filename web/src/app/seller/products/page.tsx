"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { sellerProductList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "live", label: "Live", labelFr: "En ligne" },
  { value: "draft", label: "Draft", labelFr: "Brouillon" },
  { value: "paused", label: "Paused", labelFr: "En pause" },
];

const PRODUCT_STATUS_FR: Record<string, string> = {
  live: "En ligne", draft: "Brouillon", paused: "En pause", out_of_stock: "En rupture de stock", active: "Actif", disabled: "Désactivé",
};

const MODERATION_STATUS_FR: Record<string, string> = {
  approved: "Approuvé", pending: "En attente", rejected: "Rejeté", flagged: "Signalé",
};

export default function SellerProductsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerProductList, filters, {
        searchFields: ["id", "name", "brand", "sku", "category"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title={t("products")}
      subtitle={fr ? "Vue liste — Image, Nom, Marque, SKU, Prix, Stock, Vendus, Vues, Note, Statut, Modération" : "List View — Image, Name, Brand, SKU, Price, Stock, Sold, Views, Rating, Status, Moderation"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("products") }]}
      actions={
        <Link href="/seller/products/create" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          + {t("createProduct")}
        </Link>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "Produit, SKU, marque…" : "Product, SKU, brand…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "image", label: fr ? "Image" : "Image", render: (row) => (
          <div className="relative h-10 w-10 overflow-hidden rounded">
            <Image src={String(row.image)} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )},
        { key: "name", label: fr ? "Produit" : "Product", render: (row) => (
          <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "brand", label: fr ? "Marque" : "Brand" },
        { key: "category", label: fr ? "Catégorie" : "Category" },
        { key: "sku", label: "SKU" },
        { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
        { key: "discountPrice", label: fr ? "Promo" : "Sale", render: (row) => formatCurrency(row.discountPrice as number, locale) },
        { key: "availableStock", label: "Stock" },
        { key: "soldCount", label: fr ? "Vendus" : "Sold" },
        { key: "views", label: fr ? "Vues" : "Views" },
        { key: "rating", label: fr ? "Note" : "Rating", render: (row) => `⭐ ${row.rating}` },
        { key: "status", label: t("status"), render: (row) => <Badge variant={row.status === "live" ? "success" : "warning"}>{fr ? (PRODUCT_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
        { key: "moderationStatus", label: fr ? "Modération" : "Moderation", render: (row) => <Badge>{fr ? (MODERATION_STATUS_FR[String(row.moderationStatus)] ?? String(row.moderationStatus)) : String(row.moderationStatus)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/seller/products/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <Link href="/seller/products/create" className="text-slate-500 hover:underline">{fr ? "Modifier" : "Edit"}</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
