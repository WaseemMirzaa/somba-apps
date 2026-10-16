"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ProductImage } from "@/components/seller/product-image";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import {
  PRODUCT_STATUS_OPTIONS,
  errMessage,
  productStatusExplain,
  productStatusLabel,
  productStatusVariant,
} from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

export default function SellerProductsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { sellerProductList, pauseProduct, publishProduct } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerProductList, filters, {
        searchFields: ["id", "name", "sku", "category"],
        statusField: "status",
      }),
    [sellerProductList, filters]
  );

  async function toggle(id: string, to: "draft" | "live") {
    setBusyId(id);
    try {
      if (to === "draft") await pauseProduct(id);
      else await publishProduct(id);
      toast(
        to === "draft"
          ? fr ? "Produit mis en pause : masqué de la boutique" : "Product paused: hidden from the shop"
          : fr ? "Produit remis en ligne" : "Product is live again"
      );
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SellerListPage
      title={t("products")}
      subtitle={fr ? "Vos annonces et leur statut de modération réel" : "Your listings and their real moderation status"}
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
          statusOptions={PRODUCT_STATUS_OPTIONS}
          searchPlaceholder={fr ? "Produit, SKU, catégorie…" : "Product, SKU, category…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "image", label: "Image", render: (row) => (
          <div className="h-10 w-10 overflow-hidden rounded">
            <ProductImage src={String(row.image)} />
          </div>
        )},
        { key: "name", label: fr ? "Produit" : "Product", primary: true, render: (row) => (
          <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => (fr ? String(row.categoryFr ?? row.category) : String(row.category)) },
        { key: "sku", label: "SKU" },
        { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
        { key: "availableStock", label: "Stock" },
        { key: "soldCount", label: fr ? "Vendus" : "Sold" },
        { key: "rating", label: fr ? "Note" : "Rating", render: (row) => (Number(row.rating) > 0 ? `⭐ ${Number(row.rating).toFixed(1)}` : "—") },
        { key: "status", label: t("status"), render: (row) => {
          const status = String(row.status);
          return (
            <div title={productStatusExplain(status, fr) ?? undefined}>
              <Badge variant={productStatusVariant(status)}>{productStatusLabel(status, fr)}</Badge>
            </div>
          );
        }},
        { key: "actions", label: t("action"), render: (row) => {
          const id = String(row.id);
          const status = String(row.status);
          const busy = busyId === id;
          return (
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href={`/seller/products/${id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
              <Link href={`/seller/products/${id}/edit`} className="text-slate-500 hover:underline">{fr ? "Modifier" : "Edit"}</Link>
              {status === "live" && (
                <button type="button" disabled={busy} onClick={() => toggle(id, "draft")} className="text-amber-700 hover:underline disabled:opacity-50">
                  {fr ? "Indisponible" : "Unavailable"}
                </button>
              )}
              {status === "draft" && (
                <button type="button" disabled={busy} onClick={() => toggle(id, "live")} className="text-emerald-700 hover:underline disabled:opacity-50">
                  {fr ? "Remettre en ligne" : "Mark live"}
                </button>
              )}
              {(status === "pending" || status === "rejected") && (
                <span className="text-slate-500">
                  {status === "pending" ? (fr ? "Validation en cours" : "Awaiting moderator") : fr ? "Refusé par la modération" : "Rejected by moderation"}
                </span>
              )}
            </div>
          );
        }},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
