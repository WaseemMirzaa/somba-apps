"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { StepList } from "@/components/shop/step-list";
import { ContactSeller } from "@/components/shop/contact-seller";
import { useMyOrder, orderStatusLabel, useDeliveryCode } from "@/lib/orders";
import { customerJourney } from "@/lib/order-journey";
import { useHubDirectory } from "@/lib/shop-engage";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useSocketEvent } from "@/lib/shop-live";
import { dayLabel } from "@/lib/delivery-estimate";
import type { RiderLocation } from "@/lib/realtime/types";

function Tracking() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const rt = useRealtime();
  const order = useMyOrder(id);
  const hubs = useHubDirectory();
  const fr = locale === "fr";
  const [seenAt, setSeenAt] = useState<{ orderId: string; at: Date } | null>(null);
  const code = useDeliveryCode(order?.id, order?.status);

  // Remember WHEN the last live position reached this page (the push carries no timestamp).
  useSocketEvent<RiderLocation>("delivery:location", (loc) => {
    if (order && loc.orderId === order.id) setSeenAt({ orderId: loc.orderId, at: new Date() });
  });

  const raw = order ? rt.orders.find((o) => o.id === order.id) : undefined;
  if (!order || !raw) {
    return <div className="text-center text-slate-500">{rt.status === "connected" ? (fr ? "Commande introuvable" : "Order not found") : fr ? "Chargement…" : "Loading…"}</div>;
  }

  const loc = rt.riderLocations[order.id];
  const onTheWay = order.status === "out_for_delivery";
  const lastSeen = seenAt && seenAt.orderId === order.id ? seenAt.at : null;
  const steps = customerJourney(raw, hubs, fr);
  const destHub = raw.destinationHubId ? hubs.get(raw.destinationHubId) : undefined;
  const sellers = [...new Map((raw.items ?? []).filter((i) => i.sellerId).map((i) => [i.sellerId as string, i.sellerName ?? ""])).entries()];

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Suivi de livraison" : "Delivery tracking"} subtitle={`${order.reference} · ${orderStatusLabel(order.status, fr)}`} backHref={`/shop/orders/${order.id}`} />

      {code && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center" data-testid="delivery-code">
          <p className="text-sm font-medium text-emerald-800">{fr ? "Donnez ce code au livreur à la livraison" : "Give this code to the rider on delivery"}</p>
          <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.4em] text-emerald-900">{code}</p>
        </div>
      )}

      <DetailSection title={fr ? "Le trajet de votre colis" : "Your parcel's journey"}>
        <StepList steps={steps} fr={fr} />
        <p className="mt-2 text-xs text-slate-500">
          {fr
            ? "Votre colis passe par l'entrepôt Somba de la zone du vendeur, puis par celui de votre zone."
            : "Your parcel goes through the Somba warehouse of the seller's area, then the one of your area."}
        </p>
        {order.estimatedDeliveryDate && order.status !== "delivered" && order.status !== "cancelled" && (
          <p className="mt-1 text-sm text-slate-700">{fr ? "Livraison estimée :" : "Estimated delivery:"} <strong>{dayLabel(order.estimatedDeliveryDate, fr)}</strong></p>
        )}
      </DetailSection>

      {order.rider && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4" data-testid="rider-card">
          <div>
            <p className="text-sm font-medium text-blue-900">{fr ? "Votre livreur" : "Your rider"}: {order.rider.name}</p>
            {order.rider.phone && <p className="text-xs text-blue-800">{order.rider.phone}</p>}
            {destHub && <p className="text-xs text-blue-800">{fr ? "Depuis" : "From"} {destHub.name}</p>}
          </div>
          {order.rider.phone && (
            <a href={`tel:${order.rider.phone.replace(/[^+\d]/g, "")}`} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
              <Phone className="h-4 w-4" />
              {fr ? `Appeler ${order.rider.name}` : `Call ${order.rider.name}`}
            </a>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-blue-50 to-sky-50 p-6">
        <div className="flex items-start gap-4">
          <MapPin className="mt-1 h-8 w-8 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            {loc ? (
              <>
                <p className="font-medium text-slate-900">{fr ? "Position du livreur en direct" : "Live rider position"}</p>
                <p className="mt-1 font-mono text-sm text-slate-700">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {lastSeen ? `${fr ? "Dernière mise à jour reçue à" : "Last update received at"} ${lastSeen.toLocaleTimeString()}` : fr ? "Dernière position connue (reçue avant l'ouverture de cette page)." : "Last known position (received before this page was opened)."}
                </p>
                <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
                  {fr ? "Voir sur la carte →" : "View on map →"}
                </a>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-900">{fr ? "Position du livreur" : "Rider position"}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {onTheWay ? (fr ? "En attente de la première position du livreur…" : "Waiting for the rider's first position…") : fr ? "La position apparaîtra ici lorsque le livreur sera en route vers chez vous." : "The position will appear here once the rider is on the way to you."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <DetailSection title={fr ? "Colis" : "Parcel"}>
        <InfoGrid items={[
          { label: fr ? "Référence" : "Reference", value: order.reference },
          { label: fr ? "Entrepôt de livraison" : "Delivery warehouse", value: destHub ? `${destHub.name} · ${destHub.city}` : "—" },
          { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
        ]} />
        {sellers.length > 0 && (
          <div className="mt-4 space-y-2">
            {sellers.map(([sid, name]) => (
              <ContactSeller key={sid} sellerId={sid} orderId={order.id} fr={fr} label={fr ? `Écrire à ${name}` : `Message ${name}`} returnTo={`/shop/orders/${order.id}/tracking`} />
            ))}
          </div>
        )}
        <Link href={`/shop/orders/${order.id}/dispute`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "Un problème avec cette commande ?" : "Problem with this order?"}</Link>
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
