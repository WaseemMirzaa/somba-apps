"use client";

import { mapsLinkTo } from "@/lib/google-maps";
import { useParams } from "next/navigation";
import { Phone, Navigation, Store } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { RiderGpsPanel } from "@/components/warehouse/rider-gps-panel";
import { RIDER_STATUS_LABEL, riderStatusVariant } from "@/components/warehouse/rider-task-card";
import { TaskActions } from "@/components/warehouse/rider-task-actions";
import { useRiderData } from "@/lib/rider";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const VARIANT_TOKENS_FR: Record<string, string> = {
  Default: "Standard",
  Black: "Noir",
  White: "Blanc",
  Blue: "Bleu",
  Silver: "Argent",
  Grey: "Gris",
  Gray: "Gris",
  Red: "Rouge",
  Green: "Vert",
};

const localizeVariant = (variant: string, fr: boolean) =>
  !fr || !variant
    ? variant
    : variant
        .split(" ")
        .map((tok) => VARIANT_TOKENS_FR[tok] ?? tok.replace(/GB$/i, " Go").replace(/TB$/i, " To"))
        .join(" ");

export default function RiderTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getRiderTask, refresh, loading } = useRiderData();
  const task = getRiderTask(id);

  if (!task) {
    return (
      <div className="text-center text-slate-500">
        {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Tâche introuvable" : "Task not found")}
      </div>
    );
  }

  const label = RIDER_STATUS_LABEL[task.status];
  const statusLabel = fr ? label.fr : label.en;
  const done = task.status === "delivered" || task.status === "failed";
  const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  return (
    <div className="space-y-6">
      <PageHeader title={task.orderId} subtitle={statusLabel} backHref="/rider/tasks" />

      <div className="flex flex-wrap gap-2">
        <Badge variant={riderStatusVariant(task.status)}>{statusLabel}</Badge>
        {task.attempts > 1 && <Badge variant="warning">{fr ? `Tentative ${task.attempts} sur 3` : `Attempt ${task.attempts} of 3`}</Badge>}
        {task.codAmount > 0 && <Badge variant="purple">COD {formatCurrency(task.codAmount, locale)}</Badge>}
        <Badge>{task.zone}</Badge>
      </div>

      {task.failureReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>{fr ? "Motif d'échec : " : "Failure reason: "}</strong>
          {task.failureReason}
        </div>
      )}

      {(task.status === "picked_up" || task.status === "in_transit") && <RiderGpsPanel />}

      {!done && (
        <div className="card-premium p-4">
          <TaskActions task={task} onChanged={() => void refresh()} />
        </div>
      )}
      {task.status === "delivered" && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{fr ? "Livraison terminée." : "Delivery completed."}</p>
      )}

      <DetailSection title={fr ? "Collecte" : "Pickup"}>
        <InfoGrid
          items={[
            { label: fr ? "Adresse de collecte" : "Pickup address", value: (
              <span className="inline-flex items-start gap-1.5"><Store className="mt-0.5 h-3.5 w-3.5 shrink-0" />{task.pickupAddress}</span>
            ), full: true },
            { label: fr ? "Vendeur prêt" : "Seller ready", value: task.readyAt ? new Date(task.readyAt).toLocaleString() : (fr ? "Pas encore" : "Not yet") },
            { label: fr ? "Reçu au hub" : "Received at hub", value: task.receivedAt ? new Date(task.receivedAt).toLocaleString() : "—" },
          ]}
        />
        {task.pickupAddress !== "—" && (
          <a href={mapsUrl(task.pickupAddress)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
            <Navigation className="h-3.5 w-3.5" />
            {fr ? "Naviguer vers la collecte" : "Navigate to pickup"}
          </a>
        )}
      </DetailSection>

      <DetailSection title={fr ? "Commande" : "Order"}>
        <InfoGrid
          items={[
            { label: fr ? "N° commande" : "Order ID", value: task.orderId },
            { label: fr ? "Paiement" : "Payment", value: task.paymentType },
            { label: fr ? "Montant" : "Amount", value: task.amount ? formatCurrency(task.amount, locale) : "—" },
            { label: fr ? "Articles" : "Items", value: task.items },
            { label: fr ? "Tentatives" : "Attempts", value: task.attempts },
          ]}
        />
      </DetailSection>

      <DetailSection title={t("customer")}>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: task.customer },
            {
              label: fr ? "Téléphone" : "Phone",
              value: task.phone ? (
                <a href={`tel:${task.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                  <Phone className="h-3.5 w-3.5" />
                  {task.phone}
                </a>
              ) : "—",
            },
            { label: fr ? "Adresse" : "Address", value: task.address, full: true },
            { label: t("zone"), value: task.zone },
          ]}
        />
      </DetailSection>

      <DetailSection title={fr ? "Produits" : "Products"}>
        {task.products.length === 0 ? (
          <p className="text-sm text-slate-500">{fr ? "Aucun détail disponible." : "No item details available."}</p>
        ) : (
          <div className="space-y-3">
            {task.products.map((item, i) => (
              <div key={`${item.sku}-${i}`} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {localizeVariant(item.variant, fr)} · {fr ? "Qté" : "Qty"} {item.qty}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title={fr ? "Suivi" : "Timeline"}>
        <ActivityTimeline events={task.timeline} />
      </DetailSection>

      <div className="grid grid-cols-2 gap-3">
        {task.phone ? (
          <a href={`tel:${task.phone.replace(/\s/g, "")}`} className="contents">
            <Button variant="secondary" className="w-full">
              <Phone className="h-4 w-4" />
              {fr ? "Appeler client" : "Call customer"}
            </Button>
          </a>
        ) : (
          <span />
        )}
        <a href={task.geo ? mapsLinkTo(task.geo) : mapsUrl(task.address)} target="_blank" rel="noopener noreferrer" className="contents">
          <Button variant="secondary" className="w-full">
            <Navigation className="h-4 w-4" />
            {fr ? "Naviguer" : "Navigate"}
          </Button>
        </a>
      </div>
    </div>
  );
}
