"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PickupAreaBanner } from "@/components/seller/pickup-area-banner";
import { SellerListPage } from "@/components/seller/list-page";
import { ProductImage } from "@/components/seller/product-image";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData, useSellerPlan } from "@/lib/seller";
import { assetUrl } from "@/lib/seller-api";
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
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;
  const { plan, used, max, atLimit } = useSellerPlan();

  const filtered = useMemo(
    () =>
      applyListFilters(sellerProductList, filters, {
        searchFields: ["id", "name", "sku", "skuReal", "brandName", "category"],
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
        canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/seller/products/import" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {fr ? "Importer un CSV" : "Import CSV"}
            </Link>
            <Link href="/seller/products/create" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
              + {t("createProduct")}
            </Link>
          </div>
        ) : undefined
      }
      filters={
        <>
          <PickupAreaBanner withLink />
          {max !== null && (
            <div
              data-testid="plan-limit"
              className={`rounded-xl border px-4 py-2.5 text-sm ${atLimit ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}
            >
              {fr
                ? `Annonces utilisées : ${used} sur ${max} (offre ${plan?.nameFr ?? plan?.name ?? ""}).`
                : `Listings used: ${used} of ${max} (${plan?.name ?? ""} plan).`}
              {atLimit && (
                <>
                  {" "}
                  <Link href="/seller/subscribe" className="font-semibold underline">{fr ? "Passer à une offre supérieure" : "Upgrade your plan"}</Link>
                </>
              )}
            </div>
          )}
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={PRODUCT_STATUS_OPTIONS}
          searchPlaceholder={fr ? "Produit, SKU, catégorie…" : "Product, SKU, category…"}
          showDateFilters={false}
        />
        </>
      }
      columns={[
        { key: "image", label: "Image", render: (row) => (
          <div className="h-10 w-10 overflow-hidden rounded">
            <ProductImage src={assetUrl(String(row.image))} />
          </div>
        )},
        { key: "name", label: fr ? "Produit" : "Product", primary: true, render: (row) => (
          <div className="min-w-0">
            <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
            {row.brandName ? <span className="block text-xs text-slate-500">{String(row.brandName)}</span> : null}
          </div>
        )},
        { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => (fr ? String(row.categoryFr ?? row.category) : String(row.category)) },
        { key: "sku", label: "SKU", render: (row) => <span className="font-mono text-xs">{String(row.skuReal ?? "—")}</span> },
        { key: "price", label: fr ? "Prix" : "Price", render: (row) => (
          <span>
            {formatCurrency(row.price as number, locale)}
            {row.priceSource !== "base" && (
              <span className="ml-1.5 block text-xs font-medium text-emerald-700 sm:inline" title={row.campaignName ? String(row.campaignName) : undefined}>
                {formatCurrency(row.effectivePrice as number, locale)}{" "}
                {row.priceSource === "campaign" ? `(-${row.campaignPct}%)` : fr ? "(flash)" : "(flash)"}
              </span>
            )}
          </span>
        )},
        { key: "availableStock", label: "Stock", render: (row) => {
          const stock = Number(row.availableStock);
          const line = Number(row.lowStockThreshold);
          const out = stock <= 0;
          const low = !out && stock <= line;
          return (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span>{stock}</span>
              {out && <Badge variant="danger">{fr ? "Rupture" : "Out of stock"}</Badge>}
              {low && <Badge variant="warning">{fr ? "Stock bas" : "Low stock"}</Badge>}
            </span>
          );
        }},
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
              {canEdit && <Link href={`/seller/products/${id}/edit`} className="text-slate-500 hover:underline">{fr ? "Modifier" : "Edit"}</Link>}
              {canEdit && status === "live" && (
                <button type="button" disabled={busy} onClick={() => toggle(id, "draft")} className="text-amber-700 hover:underline disabled:opacity-50">
                  {fr ? "Indisponible" : "Unavailable"}
                </button>
              )}
              {canEdit && status === "draft" && (
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
