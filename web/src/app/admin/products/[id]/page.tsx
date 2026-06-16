"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getModerationProduct } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Rejeté",
  changes_requested: "Modifications demandées",
};

const CATEGORY_FR: Record<string, string> = {
  Electronics: "Électronique",
  Fashion: "Mode",
  "Home & Living": "Maison & Décoration",
  Beauty: "Beauté",
  Grocery: "Épicerie",
};

// moderationQueue lives in entities.ts (not owned) and has no descriptionFr — map locally.
const DESCRIPTION_FR: Record<string, string> = {
  "Latest flagship smartphone with advanced camera system.": "Dernier smartphone haut de gamme avec système photo avancé.",
  "Premium noise-cancelling wireless earbuds.": "Écouteurs sans fil premium à réduction de bruit.",
  "Elegant summer dresses in various colors.": "Robes d'été élégantes en plusieurs coloris.",
};

export default function AdminProductModerationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const product = getModerationProduct(Number(id));
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "changes_requested">(product?.status ?? "pending");
  const [notes, setNotes] = useState("");

  if (!product) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Produit introuvable" : "Product not found"}</div>;
  }

  function updateStatus(newStatus: "approved" | "rejected" | "changes_requested") {
    setStatus(newStatus);
    toast(
      fr
        ? `Produit ${newStatus === "changes_requested" ? "renvoyé pour modifications" : newStatus === "approved" ? "approuvé" : "rejeté"}`
        : `Product ${newStatus === "changes_requested" ? "sent back for changes" : newStatus}`
    );
    if (newStatus === "approved") router.push("/admin/moderation");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={fr ? `Soumis le ${product.submittedDate} · Statut : ${STATUS_FR[status] ?? status}` : `Submitted ${product.submittedDate} · Status: ${status}`}
        backHref="/admin/products"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: fr ? "Modération des produits" : "Product Moderation", href: "/admin/products" },
          { label: product.name },
        ]}
        actions={
          status === "pending" ? (
            <>
              <button onClick={() => updateStatus("approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">{fr ? "Approuver" : "Approve"}</button>
              <button onClick={() => updateStatus("rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">{fr ? "Rejeter" : "Reject"}</button>
            </>
          ) : (
            <Badge variant={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{fr ? (STATUS_FR[status] ?? status) : status}</Badge>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <DetailSection title={fr ? "Médias" : "Media"}>
            <div className="relative aspect-square overflow-hidden rounded-lg">
              <Image src={product.image} alt={product.name} fill className="object-cover" />
            </div>
          </DetailSection>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <DetailSection title={fr ? "Informations vendeur" : "Seller Information"}>
            <InfoGrid items={[
              { label: fr ? "Vendeur" : "Seller", value: <Link href={`/admin/sellers/${product.sellerId}`} className="text-[var(--primary)] hover:underline">{product.seller}</Link> },
              { label: fr ? "Note de la boutique" : "Store Rating", value: product.sellerRating > 0 ? `⭐ ${product.sellerRating}` : (fr ? "Nouveau vendeur" : "New seller") },
            ]} />
          </DetailSection>

          <DetailSection title={fr ? "Informations produit" : "Product Information"}>
            <InfoGrid items={[
              { label: fr ? "Titre" : "Title", value: product.name, full: true },
              { label: fr ? "Description" : "Description", value: fr ? (DESCRIPTION_FR[product.description] ?? product.description) : product.description, full: true },
              { label: fr ? "Catégorie" : "Category", value: fr ? (CATEGORY_FR[product.category] ?? product.category) : product.category },
              { label: fr ? "Marque" : "Brand", value: product.brand },
            ]} />
          </DetailSection>

          <DetailSection title={fr ? "Tarification" : "Pricing"}>
            <InfoGrid items={[
              { label: fr ? "Prix" : "Price", value: formatCurrency(product.price, locale) },
              { label: fr ? "Remise" : "Discount", value: `${product.discount}%` },
            ]} />
          </DetailSection>

          <DetailSection title={fr ? "Modération" : "Moderation"}>
            <div className="space-y-4">
              <textarea
                className="w-full rounded-lg border border-blue-200 p-3 text-sm"
                placeholder={fr ? "Ajouter des notes de modération..." : "Add moderation notes..."}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => updateStatus("approved")} className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white">{fr ? "Approuver" : "Approve"}</button>
                  <button onClick={() => updateStatus("rejected")} className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white">{fr ? "Rejeter" : "Reject"}</button>
                  <button onClick={() => updateStatus("changes_requested")} className="rounded-lg border border-blue-200 px-6 py-2 text-sm font-medium text-slate-600">{fr ? "Demander des modifications" : "Request Changes"}</button>
                </div>
              )}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
