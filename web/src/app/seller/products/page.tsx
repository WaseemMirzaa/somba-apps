"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerProductList as initialProducts } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { useApiResource, useApiAction } from "@/lib/use-api";

type SellerProductStatus = "live" | "draft" | "paused" | "out_of_stock" | "unavailable";

type LiveProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  discountPrice?: number;
  stock: number;
  status: "draft" | "pending" | "approved" | "rejected" | "live";
  rating: number;
  sold: number;
  category?: { name: string };
  images: { url: string }[];
  createdAt: string;
};

function mapLiveProduct(p: LiveProduct): Record<string, unknown> {
  const categoryName = p.category?.name ?? "";
  return {
    id: p.id,
    image: p.images?.[0]?.url || initialProducts[0]?.image,
    name: p.name,
    brand: "",
    category: categoryName,
    categoryFr: categoryName,
    sku: p.sku,
    price: p.price,
    discountPrice: p.discountPrice ?? p.price,
    availableStock: p.stock,
    soldCount: p.sold,
    views: 0,
    rating: p.rating,
    status: p.status,
    moderationStatus: p.status,
    createdDate: p.createdAt,
  };
}

const STATUS_OPTIONS = [
  { value: "live", label: "Live", labelFr: "En ligne" },
  { value: "draft", label: "Draft", labelFr: "Brouillon" },
  { value: "paused", label: "Paused", labelFr: "En pause" },
  { value: "unavailable", label: "Unavailable", labelFr: "Indisponible" },
  { value: "out_of_stock", label: "Out of stock", labelFr: "En rupture de stock" },
];

const PRODUCT_STATUS_FR: Record<string, string> = {
  live: "En ligne", draft: "Brouillon", paused: "En pause", unavailable: "Indisponible",
  out_of_stock: "En rupture de stock", active: "Actif", disabled: "Désactivé",
};

function productStatusBadgeVariant(status: string) {
  if (status === "live") return "success";
  if (status === "unavailable" || status === "out_of_stock") return "danger";
  return "warning";
}

function productStatusLabel(status: string, fr: boolean) {
  return fr ? (PRODUCT_STATUS_FR[status] ?? status) : status;
}

const MODERATION_STATUS_FR: Record<string, string> = {
  approved: "Approuvé", pending: "En attente", rejected: "Rejeté", flagged: "Signalé",
};

export default function SellerProductsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [products, setProducts] = useState(initialProducts);
  const { data: liveProducts, live, reload } = useApiResource<LiveProduct[]>("/seller/products", "seller");
  const { busy, run } = useApiAction();

  // Live products (when the API is reachable) upgrade the mock list.
  const source = useMemo(
    () =>
      live && liveProducts
        ? liveProducts.map(mapLiveProduct)
        : (products as unknown as Record<string, unknown>[]),
    [live, liveProducts, products]
  );

  const filtered = useMemo(
    () =>
      applyListFilters(source, filters, {
        searchFields: ["id", "name", "brand", "sku", "category"],
        statusField: "status",
      }),
    [source, filters]
  );

  async function quickAddProduct() {
    const name = window.prompt(fr ? "Nom du produit" : "Product name")?.trim();
    if (!name) return;
    const price = Number(window.prompt(fr ? "Prix" : "Price", "0")) || 0;
    const stock = Number(window.prompt("Stock", "0")) || 0;
    await run("create", async () => {
      try {
        await api.post("/seller/products", { name, price, stock }, "seller");
        toast(fr ? "Brouillon créé" : "Draft created");
        reload();
      } catch (e) {
        toast(e instanceof Error ? e.message : fr ? "Échec de la création" : "Create failed");
      }
    });
  }

  async function submitForReview(id: string) {
    await run(`submit-${id}`, async () => {
      try {
        await api.post(`/seller/products/${id}/submit`, undefined, "seller");
        toast(fr ? "Soumis pour révision" : "Submitted for review");
        reload();
      } catch (e) {
        toast(e instanceof Error ? e.message : fr ? "Échec de l'envoi" : "Submit failed");
      }
    });
  }

  function setProductStatus(id: number, status: SellerProductStatus) {
    setProducts((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    toast(
      status === "unavailable"
        ? (fr ? "Produit marqué indisponible" : "Product marked unavailable")
        : (fr ? "Produit remis en ligne" : "Product marked live")
    );
  }

  return (
    <SellerListPage
      title={t("products")}
      subtitle={fr ? "Vue liste — Image, Nom, Marque, SKU, Prix, Stock, Vendus, Vues, Note, Statut, Modération" : "List View — Image, Name, Brand, SKU, Price, Stock, Sold, Views, Rating, Status, Moderation"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("products") }]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {live && <Badge variant="success">Live API</Badge>}
          {live && (
            <button
              type="button"
              onClick={quickAddProduct}
              disabled={busy === "create"}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "create" ? (fr ? "Création…" : "Creating…") : fr ? "Ajout rapide" : "Quick add"}
            </button>
          )}
          <Link href="/seller/products/create" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            + {t("createProduct")}
          </Link>
        </div>
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
        { key: "name", label: fr ? "Produit" : "Product", primary: true, render: (row) => (
          <Link href={`/seller/products/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "brand", label: fr ? "Marque" : "Brand" },
        { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => (fr ? String(row.categoryFr ?? row.category) : String(row.category)) },
        { key: "sku", label: "SKU" },
        { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
        { key: "discountPrice", label: fr ? "Promo" : "Sale", render: (row) => formatCurrency(row.discountPrice as number, locale) },
        { key: "availableStock", label: "Stock" },
        { key: "soldCount", label: fr ? "Vendus" : "Sold" },
        { key: "views", label: fr ? "Vues" : "Views" },
        { key: "rating", label: fr ? "Note" : "Rating", render: (row) => `⭐ ${row.rating}` },
        { key: "status", label: t("status"), render: (row) => <Badge variant={productStatusBadgeVariant(String(row.status))}>{productStatusLabel(String(row.status), fr)}</Badge> },
        { key: "moderationStatus", label: fr ? "Modération" : "Moderation", render: (row) => <Badge>{fr ? (MODERATION_STATUS_FR[String(row.moderationStatus)] ?? String(row.moderationStatus)) : String(row.moderationStatus)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href={`/seller/products/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <Link href="/seller/products/create" className="text-slate-500 hover:underline">{fr ? "Modifier" : "Edit"}</Link>
            {row.status === "live" && (
              <button type="button" onClick={() => setProductStatus(row.id as number, "unavailable")} className="text-amber-700 hover:underline">
                {fr ? "Indisponible" : "Unavailable"}
              </button>
            )}
            {row.status === "unavailable" && (
              <button type="button" onClick={() => setProductStatus(row.id as number, "live")} className="text-emerald-700 hover:underline">
                {fr ? "Remettre en ligne" : "Mark live"}
              </button>
            )}
            {live && (row.status === "draft" || row.status === "rejected") && (
              <button
                type="button"
                onClick={() => submitForReview(String(row.id))}
                disabled={busy === `submit-${String(row.id)}`}
                className="text-[var(--primary)] hover:underline disabled:opacity-50"
              >
                {fr ? "Soumettre" : "Submit for review"}
              </button>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
