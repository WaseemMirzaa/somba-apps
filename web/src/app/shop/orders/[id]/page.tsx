"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getOrder } from "@/lib/entities";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
import { useRouter } from "next/navigation";

// Order item variants come from the data layer as free-form English tokens
// (e.g. "Default", "256GB Black"). Translate the known tokens locally.
const VARIANT_TOKENS_FR: Record<string, string> = {
  Default: "Par défaut",
  Black: "Noir",
  White: "Blanc",
  Blue: "Bleu",
  Silver: "Argent",
  Grey: "Gris",
  Gray: "Gris",
  Red: "Rouge",
  Green: "Vert",
};
function localizeVariant(variant: string, fr: boolean) {
  if (!fr || !variant) return variant;
  return variant
    .split(" ")
    .map((tok) => VARIANT_TOKENS_FR[tok] ?? tok.replace(/GB$/i, " Go").replace(/TB$/i, " To"))
    .join(" ");
}

export default function ShopOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { addToCart } = useShop();
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "En attente",
      processing: "En cours",
      shipped: "Expédié",
      delivered: "Livré",
      cancelled: "Annulé",
    };
    return fr ? (map[status] ?? status) : status;
  };

  const paymentStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      paid: "Payé",
      refunded: "Remboursé",
      pending: "En attente",
    };
    return fr ? (map[status] ?? status) : status;
  };

  // formatPaymentMethod is a passthrough; map the "Card" value to French locally.
  const paymentMethodLabel = (method: string) =>
    fr && method === "Card" ? "Carte" : formatPaymentMethod(method, locale);

  function reorder() {
    order?.items.forEach((item) => {
      addToCart({ id: item.productId, name: item.name, nameFr: item.name, price: item.price, image: item.image, seller: order.seller, variant: item.variant });
    });
    toast(fr ? "Articles ajoutés au panier" : "Items added to cart");
    router.push("/shop/cart");
  }
  const order = getOrder(id);

  if (!order) {
    return <div className="text-center text-slate-500">{fr ? "Commande introuvable" : "Order not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${fr ? "Passée le" : "Placed"} ${order.date} · ${cancelled ? statusLabel("cancelled") : statusLabel(order.status)}`}
        backHref="/shop/orders"
        actions={
          order.status === "delivered" ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={reorder} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">{fr ? "Commander à nouveau" : "Reorder"}</button>
              <Link href={`/shop/orders/${id}/return`} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-blue-200">{fr ? "Retour" : "Return"}</Link>
              <Link href={`/shop/products/${order.items[0]?.productId}/reviews`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">{fr ? "Avis" : "Review"}</Link>
            </div>
          ) : order.status !== "cancelled" && !cancelled ? (
            <button onClick={() => { setCancelled(true); toast(fr ? "Commande annulée" : "Order cancelled"); }} className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600">{fr ? "Annuler" : "Cancel"}</button>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid items={[
            { label: fr ? "N° de commande" : "Order ID", value: order.id },
            { label: fr ? "Date" : "Date", value: order.date },
            { label: fr ? "Statut" : "Status", value: cancelled ? statusLabel("cancelled") : statusLabel(order.status) },
            { label: fr ? "Total" : "Total", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Adresse de livraison" : "Delivery Address"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: order.customer },
            { label: fr ? "Téléphone" : "Phone", value: order.customerPhone },
            { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Moyen" : "Method", value: paymentMethodLabel(order.paymentMethod) },
            { label: fr ? "Transaction" : "Transaction", value: order.transactionId },
            { label: fr ? "Statut" : "Status", value: paymentStatusLabel(order.paymentStatus) },
            { label: fr ? "Montant" : "Amount", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits" : "Products"} span={3}>
          {order.items.map((item) => (
            <div key={item.sku} className="mb-4 flex gap-4 last:mb-0">
              <Link href={`/shop/products/${item.productId}`} className="relative h-16 w-16 overflow-hidden rounded-lg">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
              </Link>
              <div className="flex-1">
                <Link href={`/shop/products/${item.productId}`} className="font-medium hover:text-[var(--primary)]">{item.name}</Link>
                <p className="text-xs text-slate-500">{localizeVariant(item.variant, fr)} · SKU: {item.sku}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatCurrency(item.price, locale)}</p>
                <p className="text-xs">{fr ? "Qté" : "Qty"}: {item.qty}</p>
              </div>
            </div>
          ))}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Suivi de commande" : "Order Tracking"} span={2}>
          <p className="mb-4 text-sm text-slate-500">{fr ? "Suivi" : "Tracking"}: {order.trackingNumber} · {fr ? "Livreur" : "Rider"}: {order.rider}</p>
          <Link href={`/shop/orders/${id}/tracking`} className="mb-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "Suivi sur la carte en direct →" : "Live map tracking →"}</Link>
          <ActivityTimeline events={order.timeline} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Support" : "Support"}>
          <p className="text-sm text-slate-500">{fr ? "Besoin d'aide avec cette commande ?" : "Need help with this order?"}</p>
          <Link href={`/shop/support?order=${order.id}`} className="btn-primary mt-3 inline-block px-4 py-2 text-sm">{fr ? "Ouvrir un ticket de support" : "Open Support Ticket"}</Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
