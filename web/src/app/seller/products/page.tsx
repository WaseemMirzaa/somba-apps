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

export default function SellerProductsPage() {
  const { t, locale } = useLocale();
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
      subtitle="List View — Image, Name, Brand, SKU, Price, Stock, Sold, Views, Rating, Status, Moderation"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("products") }]}
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
          searchPlaceholder="Product, SKU, brand…"
          showDateFilters={false}
        />
      }
      columns={[
        { key: "image", label: "Image", render: (row) => (
          <div className="relative h-10 w-10 overflow-hidden rounded">
            <Image src={String(row.image)} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )},
        { key: "name", label: "Product", render: (row) => (
          <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "brand", label: "Brand" },
        { key: "category", label: "Category" },
        { key: "sku", label: "SKU" },
        { key: "price", label: "Price", render: (row) => formatCurrency(row.price as number, locale) },
        { key: "discountPrice", label: "Sale", render: (row) => formatCurrency(row.discountPrice as number, locale) },
        { key: "availableStock", label: "Stock" },
        { key: "soldCount", label: "Sold" },
        { key: "views", label: "Views" },
        { key: "rating", label: "Rating", render: (row) => `⭐ ${row.rating}` },
        { key: "status", label: t("status"), render: (row) => <Badge variant={row.status === "live" ? "success" : "warning"}>{String(row.status)}</Badge> },
        { key: "moderationStatus", label: "Moderation", render: (row) => <Badge>{String(row.moderationStatus)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/seller/products/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <Link href="/seller/products/create" className="text-slate-500 hover:underline">Edit</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
