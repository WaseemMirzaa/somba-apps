"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import { TranslationsPanel } from "@/components/seller/translations-panel";
import { EngageReviews } from "@/components/seller/engage-reviews";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { assetUrl } from "@/lib/seller-api";
import { weightLabel } from "@/lib/seller-products";
import {
  errMessage,
  orderStatusLabel,
  productStatusExplain,
  productStatusLabel,
  productStatusVariant,
} from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { getSellerProductFull, getRawProduct, pauseProduct, publishProduct, deleteProduct, productsLoaded, load } = useSellerData();
  const product = getSellerProductFull(id);
  // The server row as served (both languages, where each comes from) for the translations panel.
  const raw = getRawProduct(id);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;

  if (!product) {
    if (load.error) return <LoadError message={load.error} onRetry={load.retry} />;
    if (!productsLoaded) return <SectionLoader />;
    return <EmptyState>{fr ? "Produit introuvable" : "Product not found"}</EmptyState>;
  }

  const status = product.status;
  const explain = productStatusExplain(status, fr);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!product) return;
    setBusy(true);
    try {
      await deleteProduct(product.id);
      toast(fr ? "Produit supprimé" : "Product deleted");
      router.push("/seller/products");
    } catch (e) {
      toast(errMessage(e), "error");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`SKU: ${product.skuReal ?? "—"} · ${productStatusLabel(status, fr)}`}
        backHref="/seller/products"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("products"), href: "/seller/products" },
          { label: product.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && <Link href={`/seller/products/${product.id}/edit`} className="rounded-lg border border-sky-200 px-4 py-2 text-sm">{fr ? "Modifier" : "Edit"}</Link>}
            {canEdit && status === "live" && (
              <button type="button" disabled={busy} onClick={() => run(() => pauseProduct(product.id), fr ? "Produit mis en pause : masqué de la boutique" : "Product paused: hidden from the shop")} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {fr ? "Marquer indisponible" : "Mark unavailable"}
              </button>
            )}
            {canEdit && status === "draft" && (
              <button type="button" disabled={busy} onClick={() => run(() => publishProduct(product.id), fr ? "Produit remis en ligne" : "Product is live again")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {fr ? "Remettre en ligne" : "Mark live"}
              </button>
            )}
            {!canEdit ? null : !confirmDelete ? (
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-50">
                {fr ? "Supprimer" : "Delete"}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700">
                {fr ? "Supprimer définitivement ce produit ?" : "Delete this product?"}
                <button type="button" disabled={busy} onClick={() => void doDelete()} className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? "…" : fr ? "Oui, supprimer" : "Yes, delete"}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="text-xs underline">
                  {fr ? "Annuler" : "Cancel"}
                </button>
              </span>
            )}
            <Badge variant={productStatusVariant(status)}>{productStatusLabel(status, fr)}</Badge>
          </div>
        }
      />

      {explain && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${status === "rejected" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {explain}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-2 lg:col-span-1" data-testid="product-gallery">
          <div className="aspect-square overflow-hidden rounded-xl">
            <ProductImage src={assetUrl(product.images[Math.min(activePhoto, Math.max(0, product.images.length - 1))] ?? product.image)} alt={product.name} />
          </div>
          {product.images.length > 1 && (
            <ul className="flex flex-wrap gap-2" aria-label={fr ? "Photos du produit" : "Product photos"}>
              {product.images.map((u, i) => (
                <li key={u + i}>
                  <button
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    aria-label={fr ? `Voir la photo ${i + 1}${i === 0 ? " (couverture)" : ""}` : `View photo ${i + 1}${i === 0 ? " (cover)" : ""}`}
                    aria-current={i === activePhoto}
                    className={`block h-12 w-12 overflow-hidden rounded-lg border-2 ${i === activePhoto ? "border-[var(--primary)]" : "border-transparent"}`}
                  >
                    <ProductImage src={assetUrl(u)} alt="" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DetailGrid className="lg:col-span-3">
          <DetailGridSection title={fr ? "Informations produit" : "Product Information"} span={3}>
            <InfoGrid items={[
              { label: fr ? "ID produit" : "Product ID", value: product.id },
              { label: "SKU", value: product.skuReal ?? "—" },
              { label: fr ? "Marque" : "Brand", value: product.brandName || "—" },
              { label: fr ? "Poids" : "Weight", value: weightLabel(product.weightGrams, fr) },
              { label: fr ? "Catégorie" : "Category", value: fr ? product.categoryFr : product.category },
              { label: fr ? "Description" : "Description", value: product.description || "—", full: true },
            ]} />
          </DetailGridSection>

          {raw && (
            <DetailGridSection title={fr ? "Traductions" : "Translations"} span={3}>
              <TranslationsPanel product={raw} />
            </DetailGridSection>
          )}

          <DetailGridSection title={fr ? "Stock" : "Stock"}>
            <InfoGrid columns={3} items={[
              { label: fr ? "Disponible" : "Available", value: product.availableStock },
              { label: fr ? "En cours de livraison" : "In fulfilment", value: product.reservedStock },
              { label: fr ? "Vendus" : "Sold", value: product.soldCount },
              { label: fr ? "Seuil de stock bas" : "Low Stock Threshold", value: product.lowStockThreshold },
            ]} />
            {product.variantStock && Object.keys(product.variantStock).length > 0 && (
              <div className="mt-3 text-sm" data-testid="variant-stock">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Stock par option" : "Stock per option"}</p>
                <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                  {Object.entries(product.variantStock).map(([label, n]) => (
                    <li key={label} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 truncate">{label}</span>
                      <span className={n <= 0 ? "font-semibold text-red-600" : n <= product.lowStockThreshold ? "font-semibold text-amber-700" : "font-medium"}>{n}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500">
                  {fr
                    ? `Stock commun (options sans compteur) : ${Math.max(0, product.availableStock - Object.values(product.variantStock).reduce((t, n) => t + n, 0))}`
                    : `Shared pool (options without their own count): ${Math.max(0, product.availableStock - Object.values(product.variantStock).reduce((t, n) => t + n, 0))}`}
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Link href={`/seller/inventory/${encodeURIComponent(product.sku)}`} className="btn-primary rounded-lg px-4 py-2 text-sm">{fr ? "Voir l'inventaire" : "View Inventory"}</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title={fr ? "Tarification" : "Pricing"}>
            <InfoGrid items={[
              { label: fr ? "Prix catalogue" : "List price", value: formatCurrency(product.price, locale) },
              { label: fr ? "Prix barré" : "Compare-at", value: product.originalPrice ? formatCurrency(product.originalPrice, locale) : "—" },
              ...(product.priceSource !== "base"
                ? [{
                    label: fr ? "Prix payé par les clients" : "Price shoppers pay now",
                    value: (
                      <span className="text-emerald-700">
                        {formatCurrency(product.effectivePrice, locale)}{" "}
                        <span className="text-xs font-normal">
                          {product.priceSource === "campaign"
                            ? `(${fr ? "campagne" : "campaign"} ${product.campaignName ?? ""} -${product.campaignPct}%)`
                            : `(${fr ? "vente flash" : "flash sale"})`}
                        </span>
                      </span>
                    ),
                    full: true,
                  }]
                : []),
              { label: fr ? "Commission" : "Commission", value: `${product.commission}%` },
              { label: fr ? "Revenu net par vente" : "Net per sale", value: formatCurrency(product.netRevenue, locale) },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Ventes" : "Sales"}>
            <InfoGrid columns={3} items={[
              { label: fr ? "Commandes" : "Orders", value: product.orders },
              { label: fr ? "Chiffre d'affaires" : "Revenue", value: formatCurrency(product.revenue, locale) },
              { label: fr ? "Note" : "Rating", value: product.rating > 0 ? `⭐ ${product.rating.toFixed(1)} (${product.reviewsCount})` : "—" },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Commandes" : "Orders"} span={3}>
            <DataTable
              columns={[
                { key: "orderNumber", label: fr ? "Commande" : "Order", render: (row) => (
                  <Link href={`/seller/orders/${row.orderNumber}`} className="text-[var(--primary)] hover:underline">{String(row.orderNumber)}</Link>
                )},
                { key: "customer", label: t("customer") },
                { key: "quantity", label: fr ? "Qté" : "Qty" },
                { key: "amount", label: fr ? "Montant" : "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "status", label: t("status"), render: (row) => <Badge>{orderStatusLabel(String(row.status), fr)}</Badge> },
                { key: "date", label: t("date") },
              ]}
              data={product.productOrders as unknown as Record<string, unknown>[]}
            />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Avis" : "Reviews"} span={3}>
            <Suspense fallback={null}>
              <EngageReviews productId={product.id} />
            </Suspense>
          </DetailGridSection>
        </DetailGrid>
      </div>
    </div>
  );
}
