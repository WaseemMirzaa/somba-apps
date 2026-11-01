"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ShipmentDetailGrid } from "@/components/seller/shipment-detail-grid";
import { shippingStepLabel, shippingStepVariant, useSellerShipments } from "@/lib/seller-orders";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";


export default function SellerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { get, load } = useSellerShipments();
  const shipment = get(id);

  if (!shipment) return <MissingRecord load={load} label="Shipment not found" labelFr="Expédition introuvable" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.id}
        subtitle={`${shipment.orderId} · ${shippingStepLabel(shipment.status, fr)}`}
        backHref="/seller/shipping"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: fr ? "Expéditions" : "Shipping", href: "/seller/shipping" },
          { label: shipment.id },
        ]}
        actions={
          <Badge variant={shippingStepVariant(shipment.status)}>
            {shippingStepLabel(shipment.status, fr)}
          </Badge>
        }
      />

      <ShipmentDetailGrid shipment={shipment} locale={locale} />
    </div>
  );
}
