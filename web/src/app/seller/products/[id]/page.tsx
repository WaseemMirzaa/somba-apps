"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { getSellerProductFull } from "@/lib/seller-entities";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_FR: Record<string, string> = {
  active: "Actif", disabled: "Désactivé", live: "En ligne", draft: "Brouillon",
  pending: "En attente", processing: "En cours", shipped: "Expédié", ready: "Prêt",
  delivered: "Livré", cancelled: "Annulé", approved: "Approuvé", out_of_stock: "En rupture de stock",
};

export default function SellerProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const product = getSellerProductFull(Number(id));

  if (!product) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Produit introuvable" : "Product not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`SKU: ${product.sku} · ${fr ? (STATUS_FR[product.status] ?? product.status) : product.status}`}
        backHref="/seller/products"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: t("products"), href: "/seller/products" },
          { label: product.name },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/seller/products/create" className="rounded-lg border border-sky-200 px-4 py-2 text-sm">{fr ? "Modifier" : "Edit"}</Link>
            <Badge variant={product.status === "live" ? "success" : "warning"}>{fr ? (STATUS_FR[String(product.status)] ?? String(product.status)) : String(product.status)}</Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="relative aspect-square overflow-hidden rounded-xl lg:col-span-1">
          <Image src={product.image} alt={product.name} fill className="object-cover" />
        </div>

        <DetailGrid className="lg:col-span-3">
          <DetailGridSection title={fr ? "Informations produit" : "Product Information"} span={3}>
            <InfoGrid items={[
              { label: fr ? "ID produit" : "Product ID", value: product.id },
              { label: "SKU", value: product.sku },
              { label: fr ? "Catégorie" : "Category", value: fr ? product.categoryFr : product.category },
              { label: fr ? "Sous-catégorie" : "Subcategory", value: fr ? product.subcategoryFr : product.subcategory },
              { label: fr ? "Marque" : "Brand", value: product.brand },
              { label: fr ? "Créé le" : "Created", value: product.createdDate },
              { label: fr ? "Mis à jour le" : "Updated", value: product.updatedDate },
              { label: fr ? "Description" : "Description", value: product.description, full: true },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Stock" : "Stock"}>
            <InfoGrid columns={3} items={[
              { label: fr ? "Disponible" : "Available", value: product.availableStock },
              { label: fr ? "Réservé" : "Reserved", value: product.reservedStock },
              { label: fr ? "Alloué" : "Allocated", value: product.allocatedStock },
              { label: fr ? "Vendus" : "Sold", value: product.soldCount },
              { label: fr ? "Seuil de stock bas" : "Low Stock Threshold", value: product.lowStockThreshold },
            ]} />
            <div className="mt-4 flex gap-2">
              <Link href={`/seller/inventory/${encodeURIComponent(product.sku)}`} className="btn-primary rounded-lg px-4 py-2 text-sm">{fr ? "Voir l'inventaire" : "View Inventory"}</Link>
            </div>
          </DetailGridSection>

          <DetailGridSection title={fr ? "Tarification" : "Pricing"}>
            <InfoGrid items={[
              { label: "MRP", value: formatCurrency(product.mrp, locale) },
              { label: fr ? "Prix de vente" : "Sale Price", value: formatCurrency(product.price, locale) },
              { label: fr ? "Prix remisé" : "Discount Price", value: formatCurrency(product.discountPrice, locale) },
              { label: fr ? "Commission" : "Commission", value: `${product.commission}%` },
              { label: fr ? "Chiffre d'affaires net" : "Net Revenue", value: formatCurrency(product.netRevenue, locale) },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Analyses" : "Analytics"}>
            <InfoGrid columns={3} items={[
              { label: fr ? "Vues" : "Views", value: formatNumber(product.views, locale) },
              { label: fr ? "Ajouts au panier" : "Add to Cart", value: product.addToCart },
              { label: fr ? "Liste de souhaits" : "Wishlist", value: product.wishlist },
              { label: fr ? "Taux de conversion" : "Conversion Rate", value: `${((product.orders / product.views) * 100).toFixed(1)}%` },
              { label: fr ? "Chiffre d'affaires" : "Revenue", value: formatCurrency(product.revenue, locale) },
              { label: fr ? "Commandes" : "Orders", value: product.orders },
            ]} />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Variantes" : "Variants"} span={3}>
            <DataTable
              columns={[
                { key: "variantName", label: fr ? "Variante" : "Variant" },
                { key: "sku", label: "SKU" },
                { key: "color", label: fr ? "Couleur" : "Color", render: (row) => fr ? (String(row.colorFr ?? row.color)) : String(row.color) },
                { key: "size", label: fr ? "Taille" : "Size" },
                { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
                { key: "stock", label: "Stock" },
                { key: "status", label: t("status"), render: (row) => <Badge>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
              ]}
              data={product.variantsDetailed as unknown as Record<string, unknown>[]}
            />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Commandes" : "Orders"} span={3}>
            <DataTable
              columns={[
                { key: "orderNumber", label: fr ? "Commande" : "Order", render: (row) => (
                  <Link href={`/seller/orders/${row.orderNumber}`} className="text-[var(--primary)] hover:underline">{String(row.orderNumber)}</Link>
                )},
                { key: "customer", label: fr ? "Client" : "Customer" },
                { key: "quantity", label: fr ? "Qté" : "Qty" },
                { key: "amount", label: fr ? "Montant" : "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
                { key: "status", label: t("status"), render: (row) => <Badge>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
                { key: "date", label: t("date") },
              ]}
              data={product.productOrders as unknown as Record<string, unknown>[]}
            />
          </DetailGridSection>

          <DetailGridSection title={fr ? "Avis" : "Reviews"} span={3}>
            {product.productReviews.map((r, i) => (
              <div key={i} className="mb-4 border-b border-[var(--border)] pb-4 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.customer}</span>
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{r.review}</p>
              </div>
            ))}
          </DetailGridSection>
        </DetailGrid>
      </div>
    </div>
  );
}
