"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { MockLiveMap } from "@/components/ui/mock-live-map";
import { getOrder } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";
import { mapTimelineEvents, statusLabel, storeNameLabel } from "@/lib/locale-helpers";

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const order = getOrder(id);

  if (!order) return <div className="text-center text-slate-500">{t("notFound")}</div>;

  const groups = order.fulfilmentGroups?.length ? order.fulfilmentGroups : [{
    seller: order.seller,
    parcelId: order.trackingNumber,
    trackingNumber: order.trackingNumber,
    status: order.status,
    rider: order.rider,
    items: order.items,
  }];

  return (
    <div className="space-y-6">
      <PageHeader title={t("liveTracking")} subtitle={id} backHref={`/shop/orders/${id}`} />

      {groups.map((group, i) => (
        <div key={group.parcelId} className="space-y-4">
          <h3 className="font-semibold text-slate-900">
            {groups.length > 1 ? `${t("parcel")} ${i + 1} — ${storeNameLabel(locale, group.seller)}` : t("deliveries")}
          </h3>
          <MockLiveMap rider={group.rider} eta="18 min" label={t("liveMapMock")} />
          <DetailSection title={t("parcelDetail")}>
            <InfoGrid items={[
              { label: t("trackingNumber"), value: group.trackingNumber },
              { label: t("seller"), value: storeNameLabel(locale, group.seller) },
              { label: t("status"), value: statusLabel(locale, group.status) },
              { label: t("rider"), value: group.rider },
            ]} />
          </DetailSection>
        </div>
      ))}

      <DetailSection title={t("timeline")}>
        <ActivityTimeline events={mapTimelineEvents(locale, order.timeline)} />
      </DetailSection>
    </div>
  );
}
