"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getShipment } from "@/lib/seller-entities";

export default function SellerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const shipment = getShipment(id);

  if (!shipment) {
    return <div className="p-8 text-center text-slate-500">Shipment not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.id}
        subtitle={`Order ${shipment.orderId} · ${shipment.status}`}
        backHref="/seller/shipping"
      />

      <DetailGrid>
        <DetailGridSection title="Overview">
          <InfoGrid items={[
            { label: "Shipment ID", value: shipment.id },
            { label: "Order", value: <Link href={`/seller/orders/${shipment.orderId}`} className="text-sky-600 hover:underline">{shipment.orderId}</Link> },
            { label: "Status", value: shipment.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Rider">
          <InfoGrid items={[
            { label: "Name", value: shipment.rider },
            { label: "Phone", value: shipment.riderPhone },
            { label: "Vehicle", value: shipment.vehicle },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Warehouse">
          <InfoGrid items={[
            { label: "Warehouse", value: <Link href={`/warehouse/hubs/${shipment.warehouseId}`} className="text-sky-600 hover:underline">{shipment.warehouse}</Link> },
            { label: "Parcel", value: <Link href={`/warehouse/parcels/${shipment.parcelId}`} className="text-sky-600 hover:underline">{shipment.parcelId}</Link> },
            { label: "Zone", value: shipment.zone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Tracking" span={3}>
          <p className="mb-4 text-sm text-slate-500">Current Status: {shipment.status}</p>
          <ActivityTimeline events={shipment.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
