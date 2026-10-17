"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import { useSellerData } from "@/lib/seller";
import { ShipmentDetailGrid } from "@/components/seller/shipment-detail-grid";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import {
  errMessage,
  orderStatusLabel,
  orderStatusVariant,
  paymentMethodLabel,
  shippingStatusLabel,
  txnStatusLabel,
} from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { getSellerOrder, getShipmentByOrderId, sellerReady, load } = useSellerData();
  const order = getSellerOrder(id);
  const shipment = order ? getShipmentByOrderId(order.id) : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return <MissingRecord load={load} label="Order not found" labelFr="Commande introuvable" />;

  const canMarkReady = ["confirmed", "processing"].includes(order.orderStatus) && !order.readyAt;

  async function markReady() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await sellerReady(order.orderId);
      toast(fr ? "Colis marqué prêt : le livreur est prévenu" : "Package marked ready: the rider can collect it");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.customer} · ${orderStatusLabel(order.orderStatus, fr)}`}
        backHref="/seller/orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canMarkReady && (
              <button type="button" disabled={busy} onClick={() => void markReady()} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Confirmer colis prêt" : "Package Ready"}
              </button>
            )}
            {order.readyAt && (
              <span className="text-sm text-emerald-600">{fr ? "Marqué prêt pour enlèvement" : "Marked ready for pickup"}</span>
            )}
            <Link href="/seller/support" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">
              {fr ? "Contacter le support à propos de cette commande" : "Contact support about this order"}
            </Link>
          </div>
        }
      />

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <DetailGrid>
        <DetailGridSection title={fr ? "Résumé de la commande" : "Order Summary"}>
          <InfoGrid items={[
            { label: fr ? "Numéro de commande" : "Order Number", value: order.id },
            { label: fr ? "Date de commande" : "Order Date", value: order.date },
            { label: fr ? "Statut de commande" : "Order Status", value: <Badge variant={orderStatusVariant(order.orderStatus)}>{orderStatusLabel(order.orderStatus, fr)}</Badge> },
            { label: fr ? "Expédition" : "Shipping", value: shippingStatusLabel(order.shippingStatus, fr) },
            { label: fr ? "Montant (vos articles)" : "Amount (your items)", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          {/* Privacy: sellers see first name + destination city only. Delivery is
              handled by Somba&Teka logistics — no phone, email, or street address. */}
          <InfoGrid items={[
            { label: fr ? "Prénom" : "First Name", value: order.customer },
            { label: fr ? "Ville de destination" : "Destination City", value: order.customerCity },
          ]} />
          <p className="mt-4 text-xs text-slate-500">
            {fr
              ? "Livraison gérée par la logistique Somba&Teka. Les coordonnées du client sont privées."
              : "Delivery handled by Somba&Teka logistics. Customer contact details are private."}
          </p>
          <div className="mt-3 flex gap-3">
            <NavLinkButton href="/seller/support">{fr ? "Ouvrir le support" : "Open Support"}</NavLinkButton>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Mode de paiement" : "Payment Method", value: paymentMethodLabel(order.paymentMethod, fr) },
            { label: fr ? "Statut" : "Status", value: txnStatusLabel(order.paymentStatus, fr) },
            { label: fr ? "Commission" : "Commission", value: formatCurrency(order.commission, locale) },
            { label: fr ? "Gains nets" : "Net Earnings", value: formatCurrency(order.netEarnings, locale) },
          ]} />
        </DetailGridSection>
      </DetailGrid>

      {shipment ? (
        <ShipmentDetailGrid shipment={shipment} locale={locale} variant="embedded" showOrderLink={false} />
      ) : (
        <DetailGrid>
          <DetailGridSection title={fr ? "Expédition" : "Shipping"} span={3}>
            <p className="text-sm text-slate-600">
              {order.orderStatus === "cancelled" || order.orderStatus === "returned"
                ? (fr ? "Cette commande n'est plus expédiée." : "This order is no longer being shipped.")
                : fr
                  ? "L'expédition démarre dès que la commande est confirmée."
                  : "Shipping starts as soon as the order is confirmed."}
            </p>
          </DetailGridSection>
        </DetailGrid>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Articles" : "Items"} span={3}>
          {order.items_detail.map((item) => (
            <div key={`${item.productId}-${item.variant}`} className="mb-4 flex gap-4 last:mb-0">
              <div className="h-14 w-14 overflow-hidden rounded-lg">
                <ProductImage src={item.image} alt={item.name} />
              </div>
              <div className="flex-1">
                <Link href={`/seller/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{item.name}</Link>
                <p className="text-xs text-slate-500">{item.variant ? `${item.variant} · ` : ""}{item.sku}</p>
              </div>
              <div className="text-right">
                <p>{formatCurrency(item.price, locale)}</p>
                <p className="text-xs">{fr ? "Qté" : "Qty"}: {item.qty}</p>
              </div>
            </div>
          ))}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={order.timeline.map((event) => ({
              time: event.time,
              label: fr ? event.labelFr : event.label,
              detail: fr ? event.detailFr ?? event.detail : event.detail,
              done: event.done,
            }))}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
