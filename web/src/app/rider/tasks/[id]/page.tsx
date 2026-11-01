"use client";

import { mapsLinkTo } from "@/lib/google-maps";
import { LEG_KIND, pickL, fmtDateTime } from "@/lib/logistics";
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
import { paymentMethodLabel } from "@/lib/seller-labels";
import { variantDisplay } from "@/lib/i18n-fields";
import { useLocale } from "@/context/locale-context";

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
        <Badge variant="primary">{pickL(LEG_KIND[task.kind], fr)}</Badge>
      </div>

      {task.failureReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>{fr ? "Motif d'échec : " : "Failure reason: "}</strong>
          {task.failureReason}
        </div>
      )}

      {task.collectOld && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          {fr ? "Pendant cette livraison, reprenez l'ancien article chez le client et rapportez-le à l'entrepôt." : "On this delivery, collect the old unit from the customer and bring it back to the warehouse."}
        </div>
      )}
      {task.hubBound && task.status !== "delivered" && task.status !== "failed" && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900">
          {fr ? `Ce trajet se termine à l'entrepôt : le personnel de ${task.toName} scanne le colis à l'arrivée.` : `This leg ends at the warehouse: the staff at ${task.toName} scan the parcel in.`}
        </div>
      )}

      {(task.status === "picked_up" || task.status === "in_transit") && <RiderGpsPanel />}

      {!done && (
        <div className="card-premium p-4">
          <TaskActions task={task} onChanged={() => void refresh()} />
        </div>
      )}
      {task.status === "delivered" && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{task.hubBound ? (fr ? "Colis scanné à l'entrepôt : trajet terminé." : "Parcel scanned in at the warehouse: leg done.") : fr ? "Trajet terminé." : "Leg completed."}</p>
      )}

      <DetailSection title={fr ? "Départ" : "From"}>
        <InfoGrid
          items={[
            { label: task.fromName, value: (
              <span className="inline-flex items-start gap-1.5"><Store className="mt-0.5 h-3.5 w-3.5 shrink-0" />{task.pickupAddress}</span>
            ), full: true },
            ...(task.kind === "pickup"
              ? [
                  { label: fr ? "Vendeur prêt" : "Seller ready", value: task.readyAt ? new Date(task.readyAt).toLocaleString() : (fr ? "Pas encore" : "Not yet") },
                  { label: fr ? "Scanné à l'entrepôt" : "Scanned in at the warehouse", value: task.receivedAt ? fmtDateTime(task.receivedAt, fr) : "—" },
                ]
              : []),
          ]}
        />
        {task.pickupAddress !== "—" && (
          <a href={mapsUrl(task.pickupAddress)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
            <Navigation className="h-3.5 w-3.5" />
            {fr ? "Naviguer vers le départ" : "Navigate to the start"}
          </a>
        )}
      </DetailSection>

      <DetailSection title={fr ? "Commande" : "Order"}>
        <InfoGrid
          items={[
            { label: fr ? "N° commande" : "Order ID", value: task.orderId },
            { label: fr ? "Paiement" : "Payment", value: task.paymentMethod ? paymentMethodLabel(task.paymentMethod, fr) : task.paymentType },
            { label: fr ? "Montant" : "Amount", value: task.amount ? formatCurrency(task.amount, locale) : "—" },
            { label: fr ? "Articles" : "Items", value: task.items },
            { label: fr ? "Tentatives" : "Attempts", value: task.attempts },
          ]}
        />
      </DetailSection>

      <DetailSection title={task.hubBound || task.kind === "return_to_seller" ? (fr ? "Destination" : "Destination") : t("customer")}>
        <InfoGrid
          items={[
            { label: fr ? "Destinataire" : "Recipient", value: task.hubBound || task.kind === "return_to_seller" ? task.toName : task.customer },
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
                  <p className="font-medium text-slate-900">{fr ? item.nameFr : item.name}</p>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {variantDisplay(item.variant, fr ? item.variantFr : null, fr)} · {fr ? "Qté" : "Qty"} {item.qty}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title={fr ? "Suivi" : "Timeline"}>
        <ActivityTimeline
          events={[
            { time: fmtDateTime(task.createdAt, fr), label: fr ? "Tâche assignée" : "Task created", done: true },
            { time: fmtDateTime(task.pickedUpAt, fr), label: fr ? "Colis récupéré" : "Picked up", done: !!task.pickedUpAt },
            task.status === "failed"
              ? { time: fmtDateTime(task.updatedAt, fr), label: `${fr ? "Échec" : "Failed"}${task.failureReason ? `: ${task.failureReason}` : ""}`, done: true }
              : { time: fmtDateTime(task.deliveredAt ?? task.receivedAt, fr), label: task.hubBound ? (fr ? "Scanné à l'entrepôt" : "Scanned in at the warehouse") : fr ? "Remis" : "Handed over", done: task.status === "delivered" },
          ]}
        />
      </DetailSection>

      <div className="grid grid-cols-2 gap-3">
        {task.phone ? (
          <a href={`tel:${task.phone.replace(/\s/g, "")}`} className="contents">
            <Button variant="secondary" className="w-full">
              <Phone className="h-4 w-4" />
              {task.hubBound ? (fr ? "Appeler" : "Call") : fr ? "Appeler client" : "Call customer"}
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
