"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { ExceptionForm } from "@/components/warehouse/exception-form";
import { STAGE_LABEL, stageVariant, useWarehouseData } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const rt = useRealtime();
  const { getParcel, riders, parcels } = useWarehouseData();
  const [escalate, setEscalate] = useState(false);
  const delivery = getParcel(id);

  if (!delivery) {
    return (
      <div className="p-8 text-center text-slate-500">
        {parcels.length === 0 ? (fr ? "Chargement…" : "Loading…") : (fr ? "Livraison introuvable" : "Delivery not found")}
      </div>
    );
  }

  const rider = riders.find((r) => r.id === delivery.riderId);
  const live = rt.riderLocations[delivery.orderUuid];
  const lat = live?.lat ?? delivery.lat;
  const lng = live?.lng ?? delivery.lng;
  const stage = STAGE_LABEL[delivery.status];
  const listHref = ops("/deliveries");

  return (
    <div className="space-y-6">
      <PageHeader
        title={delivery.orderId}
        subtitle={`${fr ? stage.fr : stage.en} · ${delivery.id}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Livraisons" : "Deliveries", href: listHref },
          { label: delivery.orderId },
        ]}
        actions={
          <>
            {rider?.phone && (
              <a
                href={`tel:${rider.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50"
              >
                <Phone className="h-3.5 w-3.5" />
                {fr ? "Appeler livreur" : "Call Rider"}
              </a>
            )}
            <button onClick={() => setEscalate((v) => !v)} className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white">
              {fr ? "Signaler un incident" : "Report an incident"}
            </button>
          </>
        }
      />

      {escalate && (
        <div className="card-premium p-5">
          <ExceptionForm
            taskId={delivery.taskId}
            orderReference={delivery.orderId}
            onCancel={() => setEscalate(false)}
            onCreated={() => {
              setEscalate(false);
              toast(fr ? "Incident enregistré — voir Exceptions" : "Incident recorded — see Exceptions", "info");
            }}
          />
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: delivery.customer },
            { label: fr ? "Téléphone" : "Phone", value: delivery.customerPhone ?? "—" },
            { label: fr ? "Adresse" : "Address", value: delivery.customerAddress, full: true },
            { label: t("zone"), value: delivery.zone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livreur" : "Rider"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: delivery.rider },
            { label: fr ? "Téléphone" : "Phone", value: rider?.phone ?? "—" },
            { label: fr ? "Tentatives" : "Attempts", value: delivery.attempts },
            { label: fr ? "Dernier échec" : "Last failure", value: delivery.failureReason ?? "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid items={[
            { label: fr ? "N° commande" : "Order ID", value: delivery.orderId },
            { label: fr ? "Articles" : "Items", value: delivery.itemsCount },
            { label: fr ? "Paiement" : "Payment", value: delivery.paymentLabel },
            { label: fr ? "Statut" : "Status", value: <Badge variant={stageVariant(delivery.status)}>{fr ? stage.fr : stage.en}</Badge> },
            { label: fr ? "Mis à jour" : "Updated", value: shortDate(delivery.updatedAt, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Position du livreur" : "Rider position"} span={3}>
          {lat != null && lng != null ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <MapPin className="h-4 w-4 text-slate-500" />
              <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                {fr ? "Ouvrir dans Google Maps" : "Open in Google Maps"}
              </a>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{fr ? "Aucune position partagée par le livreur pour le moment." : "The rider has not shared a position yet."}</p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={delivery.timeline.map((e) => ({ time: e.time, label: fr ? e.labelFr : e.label, done: e.done }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
