"use client";

import Image from "next/image";
import Link from "next/link";
import { Phone } from "lucide-react";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import type { ShipmentDetail } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { customerColumnLabel, zoneColumnLabel } from "@/lib/admin-i18n";

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const VARIANT_FR: Record<string, string> = {
  Default: "Standard",
};

type ShipmentDetailGridProps = {
  shipment: ShipmentDetail;
  locale: "en" | "fr";
  showOrderLink?: boolean;
  /** full = all sections; embedded = omit order/customer/products/timeline (for order detail page) */
  variant?: "full" | "embedded";
};

export function ShipmentDetailGrid({
  shipment,
  locale,
  showOrderLink = true,
  variant = "full",
}: ShipmentDetailGridProps) {
  const fr = locale === "fr";
  const phoneLinkClass = "inline-flex items-center gap-1 text-[var(--primary)] hover:underline";
  const embedded = variant === "embedded";

  const sections = (
    <>
      <DetailGridSection title={fr ? "Aperçu expédition" : "Shipment Overview"}>
        <InfoGrid
          items={[
            { label: fr ? "N° expédition" : "Shipment ID", value: shipment.id },
            {
              label: fr ? "Commande" : "Order ID",
              value: showOrderLink ? (
                <Link href={`/seller/orders/${shipment.orderId}`} className="text-[var(--primary)] hover:underline">
                  {shipment.orderId}
                </Link>
              ) : (
                shipment.orderId
              ),
            },
            {
              label: fr ? "Statut" : "Status",
              value: (
                <Badge variant={shipment.status === "delivered" ? "success" : "info"}>
                  {fr ? shipment.statusFr : formatStatus(shipment.status)}
                </Badge>
              ),
            },
            { label: fr ? "Créée le" : "Created", value: shipment.createdDate },
            { label: fr ? "Transporteur" : "Carrier", value: fr ? shipment.carrierFr : shipment.carrier },
            { label: fr ? "Méthode" : "Method", value: fr ? shipment.methodFr : shipment.method },
            { label: fr ? "N° suivi" : "Tracking Number", value: shipment.trackingNumber },
          ]}
        />
      </DetailGridSection>

      <DetailGridSection title={fr ? "Entrepôt" : "Warehouse"}>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: shipment.warehouse.name },
            { label: fr ? "ID hub" : "Hub ID", value: shipment.warehouse.id },
            { label: fr ? "Adresse" : "Address", value: shipment.warehouse.address, full: true },
            { label: fr ? "Contact" : "Contact", value: shipment.warehouse.contact },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a href={`tel:${shipment.warehouse.phone.replace(/\s/g, "")}`} className={phoneLinkClass}>
                  <Phone className="h-3.5 w-3.5" />
                  {shipment.warehouse.phone}
                </a>
              ),
            },
            { label: zoneColumnLabel(locale), value: shipment.warehouse.zone },
          ]}
        />
      </DetailGridSection>

      <DetailGridSection title={fr ? "Livreur collecte" : "Pickup Rider"}>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: shipment.rider.name },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a href={`tel:${shipment.rider.phone.replace(/\s/g, "")}`} className={phoneLinkClass}>
                  <Phone className="h-3.5 w-3.5" />
                  {shipment.rider.phone}
                </a>
              ),
            },
            { label: fr ? "Véhicule" : "Vehicle", value: fr ? shipment.rider.vehicleFr : shipment.rider.vehicle },
            { label: zoneColumnLabel(locale), value: shipment.rider.zone },
            {
              label: fr ? "Position actuelle" : "Current Location",
              value: fr ? shipment.rider.currentLocationFr : shipment.rider.currentLocation,
              full: true,
            },
          ]}
        />
      </DetailGridSection>

      <DetailGridSection title={fr ? "Suivi" : "Tracking"}>
        <InfoGrid
          items={[
            {
              label: fr ? "Statut suivi" : "Tracking Status",
              value: fr ? shipment.statusFr : formatStatus(shipment.status),
            },
            { label: fr ? "N° suivi" : "Tracking Number", value: shipment.trackingNumber },
            { label: fr ? "ETA collecte" : "Pickup ETA", value: shipment.pickupEta },
            { label: fr ? "Heure collecte" : "Pickup Time", value: shipment.pickupTime },
            { label: fr ? "ETA livraison" : "Delivery ETA", value: shipment.deliveryEta },
          ]}
        />
      </DetailGridSection>

      {!embedded && (
        <DetailGridSection title={fr ? "Commande & client" : "Order & Customer"}>
          <InfoGrid
            items={[
              {
                label: fr ? "N° commande" : "Order ID",
                value: showOrderLink ? (
                  <Link href={`/seller/orders/${shipment.orderId}`} className="text-[var(--primary)] hover:underline">
                    {shipment.orderId}
                  </Link>
                ) : (
                  shipment.orderId
                ),
              },
              { label: customerColumnLabel(locale), value: shipment.customer.name },
              { label: fr ? "Ville de destination" : "Destination City", value: shipment.customer.city },
              {
                label: fr ? "Livraison" : "Delivery",
                value: fr ? "Gérée par la logistique Somba" : "Handled by Somba logistics",
                full: true,
              },
            ]}
          />
        </DetailGridSection>
      )}

      <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
        <InfoGrid
          items={[
            { label: fr ? "Boutique" : "Store", value: shipment.seller.storeName },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a href={`tel:${shipment.seller.phone.replace(/\s/g, "")}`} className={phoneLinkClass}>
                  <Phone className="h-3.5 w-3.5" />
                  {shipment.seller.phone}
                </a>
              ),
            },
          ]}
        />
      </DetailGridSection>

      {!embedded && (
        <DetailGridSection title={fr ? "Produits" : "Products"} span={2}>
          <div className="space-y-2">
            {shipment.products.map((item) => (
              <div
                key={item.sku}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="48px" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/seller/products/${item.productId}`}
                    className="truncate text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {fr ? (VARIANT_FR[item.variant] ?? item.variant) : item.variant} · {fr ? "Qté" : "Qty"} {item.qty}
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
    </>
  );

  return <DetailGrid>{sections}</DetailGrid>;
}
