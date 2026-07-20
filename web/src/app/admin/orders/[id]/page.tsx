"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { useAdminData } from "@/lib/admin";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const ORDER_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  delivered: "Livré",
  cancelled: "Annulé",
};

const PAYMENT_STATUS_FR: Record<string, string> = {
  paid: "Payé",
  refunded: "Remboursé",
  pending: "En attente",
};

const TIMELINE_LABEL_FR: Record<string, string> = {
  Placed: "Passée",
  Paid: "Payée",
  Packed: "Emballée",
  Picked: "Préparée",
  Warehouse: "Entrepôt",
  Dispatched: "Expédiée",
  Delivered: "Livrée",
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getOrder } = useAdminData();
  const order = getOrder(id);

  if (!order) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Commande introuvable" : "Order not found"}</div>;
  }

  const orderStatusLabel = fr ? (ORDER_STATUS_FR[order.status] ?? order.status) : order.status;

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.date} · ${orderStatusLabel} · ${formatCurrency(order.amount, locale)}`}
        backHref="/admin/orders"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("orders"), href: "/admin/orders" },
          { label: order.id },
        ]}
        actions={<Badge variant="info">{orderStatusLabel}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid items={[
            { label: fr ? "ID commande" : "Order ID", value: order.id },
            { label: fr ? "Date" : "Date", value: order.date },
            { label: fr ? "Statut" : "Status", value: orderStatusLabel },
            { label: fr ? "Articles" : "Items", value: order.itemsCount },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: <Link href={`/admin/customers/${order.customerId}`} className="text-[var(--primary)] hover:underline">{order.customer}</Link> },
            { label: fr ? "Téléphone" : "Phone", value: order.customerPhone },
            { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
            { label: fr ? "Ville" : "City", value: order.customerCity },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid items={[
            { label: fr ? "Boutique" : "Store", value: <Link href={`/admin/sellers/${order.sellerId}`} className="text-[var(--primary)] hover:underline">{order.seller}</Link> },
            { label: fr ? "ID vendeur" : "Seller ID", value: order.sellerId },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Passerelle" : "Gateway", value: "Stripe" },
            { label: fr ? "ID transaction" : "Transaction ID", value: order.transactionId },
            { label: fr ? "Statut" : "Status", value: fr ? (PAYMENT_STATUS_FR[order.paymentStatus] ?? order.paymentStatus) : order.paymentStatus },
            { label: fr ? "Montant" : "Amount", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Logistique" : "Logistics"}>
          <InfoGrid items={[
            { label: fr ? "Entrepôt" : "Warehouse", value: <NavLinkButton href="/warehouse">{order.warehouse}</NavLinkButton> },
            { label: fr ? "Livreur" : "Rider", value: order.rider },
            { label: fr ? "Numéro de suivi" : "Tracking Number", value: order.trackingNumber },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Finances" : "Financial"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Montant de la commande" : "Order Amount", value: formatCurrency(order.amount, locale) },
            { label: fr ? "Commission" : "Commission", value: formatCurrency(order.commission, locale) },
            { label: fr ? "Gains du vendeur" : "Seller Earnings", value: formatCurrency(order.sellerEarnings, locale) },
            { label: fr ? "Remboursements" : "Refunds", value: formatCurrency(order.refunds, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Détails du produit" : "Product Details"} span={3}>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.sku} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
                </div>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{item.name}</Link>
                  <p className="text-xs text-slate-500">SKU: {item.sku} · {fr ? "Variante" : "Variant"}: {item.variant}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                  <p className="text-xs text-slate-500">{fr ? "Qté" : "Qty"}: {item.qty}</p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie d'activité" : "Activity Timeline"} span={3}>
          <ActivityTimeline events={fr ? order.timeline.map((e) => ({ ...e, label: TIMELINE_LABEL_FR[e.label] ?? e.label })) : order.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
