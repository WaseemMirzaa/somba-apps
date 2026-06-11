"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { MockLiveMap } from "@/components/ui/mock-live-map";
import { getOrder } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const order = getOrder(id);
  const fr = locale === "fr";

  if (!order) return <div className="text-center text-slate-500">Order not found</div>;

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
      <PageHeader title={fr ? "Suivi en direct" : "Live Tracking"} subtitle={id} backHref={`/shop/orders/${id}`} />

      {groups.map((group, i) => (
        <div key={group.parcelId} className="space-y-4">
          <h3 className="font-semibold text-slate-900">
            {groups.length > 1 ? `${fr ? "Colis" : "Parcel"} ${i + 1} — ${group.seller}` : (fr ? "Livraison" : "Delivery")}
          </h3>
          <MockLiveMap rider={group.rider} eta="18 min" label={fr ? "Carte en direct (mock)" : "Live map (mock)"} />
          <DetailSection title={fr ? "Détails colis" : "Parcel Details"}>
            <InfoGrid items={[
              { label: "Tracking", value: group.trackingNumber },
              { label: fr ? "Vendeur" : "Seller", value: group.seller },
              { label: fr ? "Statut" : "Status", value: group.status },
              { label: fr ? "Livreur" : "Rider", value: group.rider },
            ]} />
          </DetailSection>
        </div>
      ))}

      <DetailSection title={fr ? "Chronologie" : "Timeline"}>
        <ActivityTimeline events={order.timeline} />
      </DetailSection>
    </div>
  );
}
