"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getShipment } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel, timelineLabel } from "@/lib/locale-helpers";

export default function SellerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const shipment = getShipment(id);

  if (!shipment) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.id}
        subtitle={`${t("order")} ${shipment.orderId} · ${statusLabel(locale, shipment.status)}`}
        backHref="/seller/shipping"
      />

      <DetailGrid>
        <DetailGridSection title={t("overview")}>
          <InfoGrid items={[
            { label: t("shipmentId"), value: shipment.id },
            { label: t("order"), value: <Link href={`/seller/orders/${shipment.orderId}`} className="text-sky-600 hover:underline">{shipment.orderId}</Link> },
            { label: t("status"), value: statusLabel(locale, shipment.status) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("rider")}>
          <InfoGrid items={[
            { label: t("name"), value: shipment.rider },
            { label: t("phone"), value: shipment.riderPhone },
            { label: t("vehicle"), value: shipment.vehicle },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("roleWarehouse")}>
          <InfoGrid items={[
            { label: t("roleWarehouse"), value: <Link href={`/warehouse/hubs/${shipment.warehouseId}`} className="text-sky-600 hover:underline">{shipment.warehouse}</Link> },
            { label: t("parcel"), value: <Link href={`/warehouse/parcels/${shipment.parcelId}`} className="text-sky-600 hover:underline">{shipment.parcelId}</Link> },
            { label: t("zone"), value: shipment.zone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("liveTracking")} span={3}>
          <p className="mb-4 text-sm text-slate-500">{t("currentStatus")}: {statusLabel(locale, shipment.status)}</p>
          <ActivityTimeline events={shipment.timeline.map((e) => ({ ...e, label: timelineLabel(locale, e.label) }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
