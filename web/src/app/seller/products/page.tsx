"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { sellerProductList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function SellerProductsPage() {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter === "Stock"
    ? sellerProductList.filter((p) => p.availableStock < 10)
    : filter === "Moderation"
      ? sellerProductList.filter((p) => p.moderationStatus === "pending")
      : filter === "Status"
        ? sellerProductList.filter((p) => p.status === "live")
        : sellerProductList;

  return (
    <SellerListPage
      title={t("products")}
      subtitle="List View — Image, Name, Brand, SKU, Price, Stock, Sold, Views, Rating, Status, Moderation"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("products") }]}
      actions={
        <Link href="/seller/products/create" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">
          + {t("createProduct")}
        </Link>
      }
      filters={
        <div className="flex flex-wrap gap-2">
          {["Category", "Brand", "Status", "Stock", "Moderation", "Date"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(filter === f ? null : f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f ? "border-sky-600 bg-sky-600 text-white" : "border-sky-200 text-slate-600 hover:bg-sky-50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      }
      columns={[
        { key: "image", label: "Image", render: (row) => (
          <div className="relative h-10 w-10 overflow-hidden rounded">
            <Image src={String(row.image)} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )},
        { key: "name", label: "Product", render: (row) => (
          <Link href={`/seller/products/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.name)}</Link>
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
            <Link href={`/seller/products/${row.id}`} className="text-sky-600 hover:underline">{t("view")}</Link>
            <Link href="/seller/products/create" className="text-slate-500 hover:underline">Edit</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
