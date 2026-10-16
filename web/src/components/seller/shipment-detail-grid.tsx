"use client";

import Link from "next/link";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import type { ShipmentDetail } from "@/lib/seller";
import { shippingStatusLabel, shippingStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { customerColumnLabel } from "@/lib/admin-i18n";

type ShipmentDetailGridProps = {
  shipment: ShipmentDetail;
  locale: "en" | "fr";
  showOrderLink?: boolean;
  /** full = all sections; embedded = omit order/customer/products/timeline (for order detail page) */
  variant?: "full" | "embedded";
};

/**
 * Shipment view built ONLY from facts the server gave the seller: the live order
 * status, whether a rider is assigned, the moment the seller marked the package
 * ready, and the seller's own pickup address. No invented hubs, riders or phones.
 */
export function ShipmentDetailGrid({
  shipment,
  locale,
  showOrderLink = true,
  variant = "full",
}: ShipmentDetailGridProps) {
  const fr = locale === "fr";
  const embedded = variant === "embedded";
  const status = (
    <Badge variant={shippingStatusVariant(shipment.status)}>{shippingStatusLabel(shipment.status, fr)}</Badge>
  );
  const orderLink = showOrderLink ? (
    <Link href={`/seller/orders/${shipment.orderId}`} className="text-[var(--primary)] hover:underline">
      {shipment.orderId}
    </Link>
  ) : (
    shipment.orderId
  );

  return (
    <DetailGrid>
      <DetailGridSection title={fr ? "Aperçu expédition" : "Shipment Overview"}>
        <InfoGrid
          items={[
            { label: fr ? "N° expédition" : "Shipment ID", value: shipment.id },
            { label: fr ? "Commande" : "Order ID", value: orderLink },
            { label: fr ? "Statut" : "Status", value: status },
            { label: fr ? "Créée le" : "Created", value: shipment.createdDate },
            { label: fr ? "Transporteur" : "Carrier", value: fr ? shipment.carrierFr : shipment.carrier },
            { label: fr ? "N° suivi" : "Tracking Number", value: shipment.trackingNumber },
          ]}
        />
      </DetailGridSection>

      <DetailGridSection title={fr ? "Enlèvement" : "Pickup"}>
        <InfoGrid
          items={[
            { label: fr ? "Livreur" : "Rider", value: shipment.riderAssigned ? (fr ? "Assigné" : "Assigned") : fr ? "Pas encore assigné" : "Not assigned yet" },
            {
              label: fr ? "Colis prêt" : "Package ready",
              value: shipment.readyAt
                ? new Date(shipment.readyAt).toLocaleString(locale)
                : fr ? "Pas encore marqué prêt" : "Not marked ready yet",
            },
            {
              label: fr ? "Adresse de collecte" : "Pickup address",
              value: shipment.pickupAddress || (
                <Link href="/seller/settings" className="text-amber-700 hover:underline">
                  {fr ? "Non renseignée : à ajouter dans les paramètres" : "Not set: add it in Settings"}
                </Link>
              ),
              full: true,
            },
          ]}
        />
      </DetailGridSection>

      {!embedded && (
        <DetailGridSection title={fr ? "Commande & client" : "Order & Customer"}>
          <InfoGrid
            items={[
              { label: fr ? "N° commande" : "Order ID", value: orderLink },
              { label: customerColumnLabel(locale), value: shipment.customer.name },
              { label: fr ? "Ville de destination" : "Destination City", value: shipment.customer.city },
              {
                label: fr ? "Livraison" : "Delivery",
                value: fr ? "Gérée par la logistique Somba&Teka" : "Handled by Somba&Teka logistics",
                full: true,
              },
            ]}
          />
        </DetailGridSection>
      )}

      {!embedded && (
        <DetailGridSection title={fr ? "Produits" : "Products"} span={2}>
          <div className="space-y-2">
            {shipment.products.map((item) => (
              <div
                key={`${item.productId}-${item.variant}`}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <ProductImage src={item.image} alt={item.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/seller/products/${item.productId}`}
                    className="truncate text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {fr ? "Qté" : "Qty"} {item.qty}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-900">{formatCurrency(item.price, locale)}</p>
              </div>
            ))}
          </div>
        </DetailGridSection>
      )}

      {!embedded && (
        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={shipment.timeline.map((event) => ({
              time: event.time,
              label: fr ? event.labelFr : event.label,
              detail: fr ? event.detailFr ?? event.detail : event.detail,
              done: event.done,
            }))}
          />
        </DetailGridSection>
      )}
    </DetailGrid>
  );
}
