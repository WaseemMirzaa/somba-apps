"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ShipmentDetailGrid } from "@/components/seller/shipment-detail-grid";
import { useSellerData } from "@/lib/seller";
import { shippingStatusLabel, shippingStatusVariant } from "@/lib/seller-labels";
import { useLocale } from "@/context/locale-context";


export default function SellerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getShipment } = useSellerData();
  const shipment = getShipment(id);

  if (!shipment) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Expédition introuvable" : "Shipment not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.id}
        subtitle={`${shipment.orderId} · ${shippingStatusLabel(shipment.status, fr)}`}
        backHref="/seller/shipping"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: fr ? "Expéditions" : "Shipping", href: "/seller/shipping" },
          { label: shipment.id },
        ]}
        actions={
          <Badge variant={shippingStatusVariant(shipment.status)}>
            {shippingStatusLabel(shipment.status, fr)}
          </Badge>
        }
      />

      <ShipmentDetailGrid shipment={shipment} locale={locale} />
    </div>
  );
}
