"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrder, orderStatusLabel } from "@/lib/orders";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useSocketEvent } from "@/lib/shop-live";
import type { RiderLocation } from "@/lib/realtime/types";
import { MapPin } from "lucide-react";

function Tracking() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const rt = useRealtime();
  const order = useMyOrder(id);
  const fr = locale === "fr";
  const [seenAt, setSeenAt] = useState<{ orderId: string; at: Date } | null>(null);

  // Remember WHEN the last live position reached this page (the push carries no timestamp).
  useSocketEvent<RiderLocation>("delivery:location", (loc) => {
    if (order && loc.orderId === order.id) setSeenAt({ orderId: loc.orderId, at: new Date() });
  });

  if (!order) {
    return <div className="text-center text-slate-500">{rt.status === "connected" ? (fr ? "Commande introuvable" : "Order not found") : (fr ? "Chargement…" : "Loading…")}</div>;
  }

  const loc = rt.riderLocations[order.id];
  const onTheWay = order.status === "shipped" || order.status === "out_for_delivery";
  const lastSeen = seenAt && seenAt.orderId === order.id ? seenAt.at : null;

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Suivi de livraison" : "Delivery tracking"} subtitle={`${order.reference} · ${orderStatusLabel(order.status, fr)}`} backHref={`/shop/orders/${order.id}`} />

      <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-blue-50 to-sky-50 p-6">
        <div className="flex items-start gap-4">
          <MapPin className="mt-1 h-8 w-8 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            {loc ? (
              <>
                <p className="font-medium text-slate-900">{fr ? "Position du livreur en direct" : "Live rider position"}</p>
                <p className="mt-1 font-mono text-sm text-slate-700">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {lastSeen
                    ? `${fr ? "Dernière mise à jour reçue à" : "Last update received at"} ${lastSeen.toLocaleTimeString()}`
                    : fr ? "Dernière position connue (reçue avant l'ouverture de cette page)." : "Last known position (received before this page was opened)."}
                </p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
                >
                  {fr ? "Voir sur la carte →" : "View on map →"}
                </a>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-900">{fr ? "Position du livreur" : "Rider position"}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {onTheWay
                    ? (fr ? "En attente de la première position du livreur…" : "Waiting for the rider's first position…")
                    : (fr ? "La position apparaîtra ici lorsque votre colis sera en route." : "The position will appear here once your parcel is on its way.")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <DetailSection title={fr ? "Chronologie" : "Timeline"}>
        <ActivityTimeline events={order.timeline} />
      </DetailSection>
      <DetailSection title={fr ? "Colis" : "Parcel"}>
        <InfoGrid items={[
          { label: fr ? "Suivi" : "Tracking", value: order.trackingNumber },
          { label: fr ? "Livreur" : "Rider", value: order.rider },
          { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
        ]} />
      </DetailSection>
    </div>
  );
}

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}/tracking`}>
      <Tracking />
    </RequireSignIn>
  );
}
