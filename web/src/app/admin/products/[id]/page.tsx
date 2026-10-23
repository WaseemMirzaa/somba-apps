"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useAdminData } from "@/lib/admin";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { ProductStatusActions } from "@/components/admin/status-actions";
import { Ban } from "lucide-react";

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  live: "En ligne",
  rejected: "Rejeté",
  removed: "Bloqué",
  draft: "Brouillon",
};

const CATEGORY_FR: Record<string, string> = {
  Electronics: "Électronique",
  Fashion: "Mode",
  "Home & Living": "Maison & Décoration",
  Beauty: "Beauté",
  Grocery: "Épicerie",
};


export default function AdminProductModerationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getModerationProduct, loading, error } = useAdminData();
  // Live product: its status follows the server's `product:updated` push.
  const product = getModerationProduct(id);

  if (error) return <SectionError message={error} />;
  if (loading) return <SectionLoading className="min-h-[40vh]" />;
  if (!product) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Produit introuvable" : "Product not found"}</div>;
  }

  const status = product.status;
  const blocked = status === "removed";

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={fr ? `Statut : ${STATUS_FR[status] ?? status}` : `Status: ${status}`}
        backHref="/admin/products"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: fr ? "Modération des produits" : "Product Moderation", href: "/admin/products" },
          { label: product.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === "live" ? "success" : status === "pending" ? "warning" : status === "draft" ? "default" : "danger"}>
              {fr ? (STATUS_FR[status] ?? status) : status}
            </Badge>
            <ProductStatusActions productId={product.id} status={product.rawStatus} name={product.name} size="md" />
          </div>
        }
      />

      {blocked && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Ban className="h-5 w-5 shrink-0" />
          <p>{fr ? "Ce produit est bloqué et retiré de la boutique pour tous les clients." : "This product is blocked and removed from the storefront for every shopper."}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <DetailSection title={fr ? "Médias" : "Media"}>
            <div className="relative aspect-square overflow-hidden rounded-lg">
              <Image src={product.image} alt={product.name} fill className="object-cover" sizes="400px" />
            </div>
          </DetailSection>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <DetailSection title={fr ? "Informations vendeur" : "Seller Information"}>
            <InfoGrid items={[
              { label: fr ? "Vendeur" : "Seller", value: product.sellerId ? <Link href={`/admin/sellers/${product.sellerId}`} className="text-[var(--primary)] hover:underline">{product.seller}</Link> : product.seller },
            ]} />
          </DetailSection>

          <DetailSection title={fr ? "Informations produit" : "Product Information"}>
            <InfoGrid items={[
              { label: fr ? "Titre" : "Title", value: product.name, full: true },
              { label: fr ? "Description" : "Description", value: product.description || "—", full: true },
              { label: fr ? "Catégorie" : "Category", value: fr ? (CATEGORY_FR[product.category] ?? product.category) : product.category },
            ]} />
          </DetailSection>

          <DetailSection title={fr ? "Tarification" : "Pricing"}>
            <InfoGrid items={[
              { label: fr ? "Prix" : "Price", value: formatCurrency(product.price, locale) },
              { label: fr ? "Remise" : "Discount", value: `${product.discount}%` },
            ]} />
          </DetailSection>

        </div>
      </div>
    </div>
  );
}
