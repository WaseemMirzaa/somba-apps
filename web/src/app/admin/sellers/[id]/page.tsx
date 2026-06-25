"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { getSeller, orderEntities, sellerProductDetails } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useModeration } from "@/context/moderation-context";
import { Ban, ShieldCheck } from "lucide-react";

const PRODUCT_STATUS_FR: Record<string, string> = { live: "En ligne", out_of_stock: "Rupture de stock", unavailable: "Indisponible", draft: "Brouillon" };
const ORDER_STATUS_FR: Record<string, string> = { delivered: "Livrée", processing: "En traitement", cancelled: "Annulée", pending: "En attente", shipped: "Expédiée" };
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
  const { toast } = useToast();
  const { isSellerBlocked, blockSeller, unblockSeller } = useModeration();
  const seller = getSeller(Number(id));

  if (!seller) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Vendeur introuvable" : "Seller not found"}</div>;
  }

  const blocked = isSellerBlocked(seller.id);

  function toggleBlock() {
    if (!seller) return;
    if (blocked) {
      unblockSeller(seller.id);
      toast(fr ? `${seller.storeName} débloqué` : `${seller.storeName} unblocked`);
    } else {
      blockSeller(seller.id);
      toast(fr ? `${seller.storeName} bloqué — boutique et produits masqués` : `${seller.storeName} blocked — store & products hidden`, "info");
    }
  }

  const sellerOrders = orderEntities.filter((o) => o.sellerId === seller.id);
  const sellerProducts = sellerProductDetails;

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
            {seller.status === "pending" ? (
              <>
                <button onClick={() => toast(fr ? "Vendeur approuvé" : "Seller approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">{t("approve")}</button>
                <button onClick={() => toast(fr ? "Vendeur rejeté" : "Seller rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">{t("reject")}</button>
              </>
            ) : (
              <Badge variant={blocked ? "danger" : "success"}>{blocked ? (fr ? "Bloqué" : "Blocked") : t("approved")}</Badge>
            )}
            <button
              onClick={toggleBlock}
              className={
                blocked
                  ? "flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  : "flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              }
            >
              {blocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              {blocked ? (fr ? "Débloquer le vendeur" : "Unblock seller") : (fr ? "Bloquer le vendeur" : "Block seller")}
            </button>
          </div>
        }
      />

      {blocked && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Ban className="h-5 w-5 shrink-0" />
          <p>
            {fr
              ? "Ce vendeur est bloqué. Sa boutique et tous ses produits sont masqués aux clients et il ne peut pas accéder à son portail."
              : "This seller is blocked. Their storefront and all their products are hidden from customers, and they cannot access their portal."}
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
          <NavLinkButton href="/admin/finance" className="mt-3">{fr ? "Voir toutes les transactions →" : "View all transactions →"}</NavLinkButton>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Tickets de support" : "Support Tickets"}>
          <p className="text-sm text-slate-500">{fr ? "Aucun ticket ouvert pour ce vendeur." : "No open tickets for this seller."}</p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits du vendeur" : "Seller Products"} span={3}>
          <DataTable
            columns={[
              { key: "name", label: fr ? "Produit" : "Product", render: (row) => (
                <Link href={`/admin/products/${row.id}`} className="text-[var(--primary)] hover:underline">{String(row.name)}</Link>
              )},
              { key: "sku", label: "SKU" },
              { key: "stock", label: fr ? "Stock" : "Stock" },
              { key: "sold", label: fr ? "Vendus" : "Sold" },
              { key: "price", label: fr ? "Prix" : "Price", render: (row) => formatCurrency(row.price as number, locale) },
              { key: "status", label: t("status"), render: (row) => <Badge>{fr ? (PRODUCT_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
            ]}
            data={(sellerProducts.length ? sellerProducts : [{ id: 0, name: fr ? "Aucun produit" : "No products", sku: "-", stock: 0, sold: 0, price: 0, status: "-" }]) as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/admin/products/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
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
              { key: "status", label: t("status"), render: (row) => <Badge variant="info">{fr ? (ORDER_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
              { key: "date", label: t("date") },
            ]}
            data={sellerOrders as unknown as Record<string, unknown>[]}
            rowAction={(row) => (
              <Link href={`/admin/orders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
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
