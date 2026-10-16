"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { SellerStatusActions } from "@/components/admin/status-actions";
import { useRealtime } from "@/context/realtime-context";
import { orderStatusLabel } from "@/lib/admin-live";
import { useAdminData } from "@/lib/admin";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { Ban } from "lucide-react";

const PRODUCT_STATUS_FR: Record<string, string> = { live: "En ligne", approved: "Approuvé", pending: "En attente", rejected: "Rejeté", removed: "Bloqué", draft: "Brouillon" };
const TIMELINE_LABEL_FR: Record<string, string> = {
  Registered: "Inscrit",
  Created: "Créé",
  Approved: "Approuvé",
  "First Product Added": "Premier produit ajouté",
  "First Order Received": "Première commande reçue",
  "Products Added": "Produits ajoutés",
  "Payout Processed": "Versement traité",
  "First Sale": "Première vente",
};
const TIMELINE_DETAIL_FR: Record<string, string> = {
  "Application submitted": "Candidature soumise",
  "By Admin Sarah": "Par l'admin Sarah",
  "Moderation passed": "Modération validée",
  "45 products": "45 produits",
};

export default function AdminSellerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { getSeller, orderEntities } = useAdminData();
  const seller = getSeller(id);

  if (!seller) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Vendeur introuvable" : "Seller not found"}</div>;
  }

  const suspended = seller.status === "suspended";
  const sellerOrders = orderEntities.filter((o) => o.sellerId === seller.id);
  // This seller's real listings (products are keyed to the store id).
  const sellerProducts = rt.products
    .filter((p) => p.sellerId === seller.id)
    .map((p) => ({ id: p.id, name: p.name, sku: p.id.slice(0, 8).toUpperCase(), stock: p.stock, sold: "—", price: p.price, status: p.status }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={seller.storeName}
        subtitle={`${fr ? "Propriétaire" : "Owner"}: ${seller.owner} · ${seller.city}, ${seller.country}`}
        backHref="/admin/sellers"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("sellers"), href: "/admin/sellers" },
          { label: seller.storeName },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={seller.status === "approved" ? "success" : seller.status === "pending" ? "warning" : "danger"}>{seller.status}</Badge>
            <SellerStatusActions sellerId={seller.id} status={seller.status} name={seller.storeName} size="md" />
          </div>
        }
      />

      {suspended && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Ban className="h-5 w-5 shrink-0" />
          <p>
            {fr
              ? "Ce vendeur est suspendu. Utilisez « Rétablir » pour lui redonner accès."
              : "This seller is suspended. Use “Reinstate” to give access back."}
          </p>
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Entreprise" : "Business"}>
          <InfoGrid items={[
            { label: fr ? "Nom de la boutique" : "Store Name", value: seller.storeName },
            { label: fr ? "Propriétaire" : "Owner", value: seller.owner },
            { label: t("email"), value: seller.email },
            { label: t("phone"), value: seller.phone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Adresse" : "Address"}>
          <InfoGrid items={[
            { label: fr ? "Adresse" : "Address", value: seller.address, full: true },
            { label: fr ? "Ville" : "City", value: seller.city },
            { label: fr ? "Pays" : "Country", value: seller.country },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Performance" : "Performance"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Commandes" : "Orders", value: seller.orders },
            { label: fr ? "Chiffre d'affaires" : "Revenue", value: formatCurrency(seller.revenue, locale) },
            { label: fr ? "Retours" : "Returns", value: seller.returns },
            { label: fr ? "Annulations" : "Cancellations", value: seller.cancellations },
            { label: fr ? "Note" : "Rating", value: seller.rating > 0 ? `⭐ ${seller.rating}` : "—" },
            { label: fr ? "Score de santé" : "Health Score", value: seller.healthScore > 0 ? `${seller.healthScore}%` : "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Finances" : "Finance"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Solde disponible" : "Available Balance", value: formatCurrency(seller.availableBalance, locale) },
            { label: fr ? "Solde en attente" : "Pending Balance", value: formatCurrency(seller.pendingBalance, locale) },
            { label: fr ? "Solde versé" : "Paid Balance", value: formatCurrency(seller.paidBalance, locale) },
            { label: fr ? "Taux de commission" : "Commission Rate", value: `${seller.commission}%` },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Solde et transactions" : "Balance & Transactions"}>
          <InfoGrid items={[
            { label: fr ? "Disponible" : "Available", value: formatCurrency(seller.availableBalance, locale) },
            { label: fr ? "En attente" : "Pending", value: formatCurrency(seller.pendingBalance, locale) },
            { label: fr ? "Total versé" : "Total Paid", value: formatCurrency(seller.paidBalance, locale) },
          ]} />
          <Link href="/admin/payouts" className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline">{fr ? "Voir les versements →" : "View payouts →"}</Link>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Tickets de support" : "Support Tickets"}>
          <Link href="/admin/support" className="text-sm font-medium text-[var(--primary)] hover:underline">{fr ? "Voir le support →" : "Open Support →"}</Link>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits du vendeur" : "Seller Products"} span={3}>
          <DataTable
            emptyMessage={fr ? "Aucun produit pour ce vendeur" : "No products for this seller"}
            columns={[
              { key: "name", label: fr ? "Produit" : "Product", render: (row) => (
                <Link href={`/admin/products/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.name)}</Link>
              )},
              { key: "sku", label: "SKU" },
              { key: "stock", label: fr ? "Stock" : "Stock" },
                            { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge>{fr ? (PRODUCT_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
            ]}
            data={sellerProducts as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/admin/products/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
            )}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commandes du vendeur" : "Seller Orders"} span={3}>
          <DataTable
            columns={[
              { key: "id", label: fr ? "N° de commande" : "Order ID", render: (row) => (
                <Link href={`/admin/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.id)}</Link>
              )},
              { key: "customer", label: t("customer") },
              { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge variant="info">{orderStatusLabel(String(row.status), fr)}</Badge> },
              { key: "date", label: t("date") },
            ]}
            data={sellerOrders as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/admin/orders/${row.id}`} className="text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
            )}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Journal d'audit" : "Audit Log"} span={3}>
          <ActivityTimeline events={seller.timeline.map((e) => ({
            ...e,
            label: fr ? (TIMELINE_LABEL_FR[e.label] ?? e.label) : e.label,
            detail: e.detail ? (fr ? (TIMELINE_DETAIL_FR[e.detail] ?? e.detail) : e.detail) : e.detail,
            done: true,
          }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
