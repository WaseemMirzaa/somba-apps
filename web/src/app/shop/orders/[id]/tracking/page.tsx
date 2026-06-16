"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getOrder } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";
import { MapPin } from "lucide-react";

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const order = getOrder(id);
  const fr = locale === "fr";

  if (!order) return <div className="text-center text-slate-500">Order not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Suivi en direct" : "Live Tracking"} subtitle={id} backHref={`/shop/orders/${id}`} />
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-sky-50">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="mx-auto h-12 w-12 text-[var(--primary)]" />
            <p className="mt-2 text-sm font-medium">{fr ? "Carte en direct (mock)" : "Live map (mock)"}</p>
            <p className="text-xs text-slate-500">{order.rider} · ETA 18 min</p>
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/90 p-3 text-sm shadow">
          <p className="font-medium">{order.rider}</p>
          <p className="text-slate-500">{order.customerPhone}</p>
        </div>
      </div>
      <DetailSection title={fr ? "Chronologie" : "Timeline"}>
        <ActivityTimeline events={order.timeline} />
      </DetailSection>
      <DetailSection title={fr ? "Colis" : "Parcels"}>
        <InfoGrid items={[
          { label: "Tracking", value: order.trackingNumber },
          { label: fr ? "Entrepôt" : "Warehouse", value: order.warehouse },
          { label: fr ? "Livreur" : "Rider", value: order.rider },
        ]} />
      </DetailSection>
    </div>
  );
}
