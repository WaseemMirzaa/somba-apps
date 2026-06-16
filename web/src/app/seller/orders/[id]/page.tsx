"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getSellerOrder, getShipmentByOrderId } from "@/lib/seller-entities";
import { ShipmentDetailGrid } from "@/components/seller/shipment-detail-grid";
import { formatCurrency, formatPaymentMethod } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

const UNAVAILABLE_REASONS = [
  { id: "out_of_stock", label: "Out of stock", labelFr: "Rupture de stock" },
  { id: "damaged", label: "Damaged", labelFr: "Endommagé" },
  { id: "discontinued", label: "Discontinued", labelFr: "Discontinué" },
];

const ORDER_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  processing: "En cours",
  ready: "Prêt",
  picked: "Collecté",
  delivered: "Livré",
  cancelled: "Annulé",
};

const PAYMENT_STATUS_FR: Record<string, string> = {
  paid: "Payé",
  pending: "En attente",
  refunded: "Remboursé",
  failed: "Échoué",
};

function localizeOrderStatus(status: string, fr: boolean) {
  return fr ? ORDER_STATUS_FR[status] ?? status : status;
}
function localizePaymentStatus(status: string, fr: boolean) {
  return fr ? PAYMENT_STATUS_FR[status] ?? status : status;
}

export default function SellerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const order = getSellerOrder(id);
  const shipment = order ? getShipmentByOrderId(order.id) : undefined;
  const [ready, setReady] = useState(false);
  const [flaggedSku, setFlaggedSku] = useState<string | null>(null);
  const [unavailReason, setUnavailReason] = useState(UNAVAILABLE_REASONS[0].id);
  const [showFlagModal, setShowFlagModal] = useState(false);

  if (!order) {
    return (
      <div className="p-8 text-center text-slate-500">
        {locale === "fr" ? "Commande introuvable" : "Order not found"}
      </div>
    );
  }

  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.customer} · ${localizeOrderStatus(order.orderStatus, fr)}`}
        backHref="/seller/orders"
        actions={
          !ready && order.shippingStatus !== "ready" ? (
            <div className="flex gap-2">
              <button onClick={() => { setReady(true); toast(locale === "fr" ? "Prêt pour enlèvement" : "Marked ready for pickup"); }} className="btn-primary rounded-lg px-4 py-2 text-sm">
                {locale === "fr" ? "Confirmer prêt" : "Package Ready"}
              </button>
              <button onClick={() => setShowFlagModal(true)} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">
                {locale === "fr" ? "Indisponible" : "Flag Unavailable"}
              </button>
            </div>
          ) : ready ? (
            <span className="text-sm text-emerald-600">{locale === "fr" ? "Prêt pour enlèvement" : "Ready for pickup"}</span>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Résumé de la commande" : "Order Summary"}>
          <InfoGrid items={[
            { label: fr ? "Numéro de commande" : "Order Number", value: order.id },
            { label: fr ? "Date de commande" : "Order Date", value: order.date },
            { label: fr ? "Statut de commande" : "Order Status", value: localizeOrderStatus(order.orderStatus, fr) },
            { label: fr ? "Montant total" : "Total Amount", value: formatCurrency(order.amount, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Client" : "Customer"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: order.customer },
            { label: fr ? "Téléphone" : "Phone", value: order.customerPhone },
            { label: fr ? "Ville" : "City", value: order.customerCity },
            { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
          ]} />
          <div className="mt-4 flex gap-3">
            <a href={`tel:${order.customerPhone}`} className="text-sm text-[var(--primary)]">{fr ? "Appeler le client" : "Call Customer"}</a>
            <Link href="/seller/support" className="text-sm text-slate-500">{fr ? "Ouvrir le support" : "Open Support"}</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Mode de paiement" : "Payment Method", value: formatPaymentMethod(order.paymentMethod, locale) },
            { label: fr ? "ID transaction" : "Transaction ID", value: order.transactionId },
            { label: fr ? "Statut" : "Status", value: localizePaymentStatus(order.paymentStatus, fr) },
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
            <InfoGrid
              items={[
                { label: fr ? "Entrepôt" : "Warehouse", value: order.warehouse },
                { label: fr ? "Livreur collecte" : "Pickup Rider", value: order.pickupRider ?? "—" },
                { label: fr ? "Statut suivi" : "Tracking Status", value: localizeOrderStatus(order.trackingStatus, fr) },
                { label: fr ? "ETA collecte" : "Pickup ETA", value: order.pickupEta },
                { label: fr ? "N° suivi" : "Tracking Number", value: order.trackingNumber ?? "—" },
              ]}
            />
          </DetailGridSection>
        </DetailGrid>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Articles" : "Items"} span={3}>
          {order.items_detail.map((item) => (
            <div key={item.sku} className={`mb-4 flex gap-4 last:mb-0 ${flaggedSku === item.sku ? "rounded-lg border border-amber-200 bg-amber-50 p-2" : ""}`}>
              <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="56px" />
              </div>
              <div className="flex-1">
                <Link href={`/seller/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{item.name}</Link>
                <p className="text-xs text-slate-500">{item.variant} · {item.sku}</p>
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

      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-premium w-full max-w-md p-6">
            <h3 className="font-semibold">{locale === "fr" ? "Article indisponible" : "Flag Item Unavailable"}</h3>
            <select className="input-premium mt-3 w-full px-3 py-2 text-sm" value={order.items_detail[0]?.sku} onChange={(e) => setFlaggedSku(e.target.value)}>
              {order.items_detail.map((item) => (
                <option key={item.sku} value={item.sku}>{item.name}</option>
              ))}
            </select>
            <select className="input-premium mt-2 w-full px-3 py-2 text-sm" value={unavailReason} onChange={(e) => setUnavailReason(e.target.value)}>
              {UNAVAILABLE_REASONS.map((r) => (
                <option key={r.id} value={r.id}>{locale === "fr" ? r.labelFr : r.label}</option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowFlagModal(false)} className="flex-1 rounded-xl border py-2 text-sm">{fr ? "Annuler" : "Cancel"}</button>
              <button onClick={() => { setFlaggedSku(order.items_detail[0]?.sku ?? null); setShowFlagModal(false); toast(locale === "fr" ? "Article signalé — remboursement partiel" : "Item flagged — partial refund triggered"); }} className="flex-1 rounded-xl bg-amber-600 py-2 text-sm text-white">{fr ? "Confirmer" : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
