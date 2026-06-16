"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ShipmentDetailGrid } from "@/components/seller/shipment-detail-grid";
import { getShipment } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SellerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
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
        subtitle={`${shipment.orderId} · ${fr ? shipment.statusFr : formatStatus(shipment.status)}`}
        backHref="/seller/shipping"
        breadcrumbs={[
          { label: fr ? "Vendeur" : "Seller", href: "/seller" },
          { label: fr ? "Expéditions" : "Shipping", href: "/seller/shipping" },
          { label: shipment.id },
        ]}
        actions={
          <Badge variant={shipment.status === "delivered" ? "success" : "info"}>
            {fr ? shipment.statusFr : formatStatus(shipment.status)}
          </Badge>
        }
      />

      <ShipmentDetailGrid shipment={shipment} locale={locale} />
    </div>
  );
}
