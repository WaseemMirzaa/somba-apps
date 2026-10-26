"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Navigation, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { ExceptionForm } from "@/components/warehouse/exception-form";
import { LegActions } from "@/components/warehouse/leg-actions";
import { LegBadges, LegRoute } from "@/components/warehouse/leg-card";
import { OpsLoading } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { LEG_KIND, LEG_STATUS, endpointName, fmtDateTime, legItemsText, legStatusVariant, mapsLink, pickL, isHubBound } from "@/lib/logistics";
import { addressText, findLeg, isOpenLeg, legAgeHours, parcelCode, riderLabel, useDeskQueue } from "@/lib/warehouse";
import { EXCEPTION_STATUS, EXCEPTION_TYPE, pick, useOpsQuery, type ExceptionRow } from "@/lib/warehouse-live";
import { formatCurrency } from "@/lib/utils";

/** One leg of a journey: where from, where to, who carries it, its history, the other legs of the same order. */
export default function WarehouseLegDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const isAdmin = base.startsWith("/admin");
  const q = useDeskQueue({ status: "all" });
  const [showIncident, setShowIncident] = useState(false);
  const exceptionsQ = useOpsQuery<ExceptionRow[]>("exceptions:list", { initial: [] as ExceptionRow[], push: ["exception:updated"] });

  const key = decodeURIComponent(id);
  const task = findLeg(q.tasks, key);

  if (!task) {
    return q.loading ? (
      <OpsLoading />
    ) : (
      <div className="space-y-3 p-8 text-center text-slate-500">
        <p>{q.error ?? (fr ? "Colis introuvable pour votre entrepôt." : "Parcel not found for your warehouse.")}</p>
        <Link href={ops("/desk")} className="text-[var(--primary)] hover:underline">
          {fr ? "Retour au bureau" : "Back to the desk"}
        </Link>
      </div>
    );
  }

  const journey = q.tasks
    .filter((t) => t.orderId === task.orderId && t.id !== task.id)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const linked = exceptionsQ.data.filter((e) => e.taskId === task.id);
  const link = mapsLink(task.from, task.to);
  const age = legAgeHours(task);
  const kindLabel = pickL(LEG_KIND[task.kind], fr);
  const statusLabel = pickL(LEG_STATUS[task.status], fr);
  const hubBound = isHubBound(task.kind);

  return (
    <div className="space-y-6">
      <PageHeader
        title={parcelCode(task)}
        subtitle={`${fr ? "Commande" : "Order"} ${task.orderReference} · ${kindLabel} · ${statusLabel}`}
        backHref={ops("/desk")}
        breadcrumbs={[
          { label: isAdmin ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: isAdmin ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Bureau" : "Desk", href: ops("/desk") },
          { label: parcelCode(task) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LegBadges task={task} />
            <LegActions task={task} onChanged={() => void q.reload()} />
          </div>
        }
      />

      {task.failureReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{fr ? "Dernière tentative échouée : " : "Last attempt failed: "}</strong>
          {task.failureReason}
        </div>
      )}
      {task.collectOld && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          {fr ? "Le livreur reprend l'ancien article chez le client pendant cette livraison." : "The rider collects the old unit from the customer on this trip."}
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Trajet" : "Leg"} span={2}>
          <div className="mb-4">
            <LegRoute task={task} />
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="ml-4 inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline">
                <Navigation className="h-3.5 w-3.5" />
                {fr ? "Itinéraire" : "Route"}
              </a>
            )}
          </div>
          <InfoGrid
            items={[
              { label: fr ? "Colis" : "Parcel", value: parcelCode(task) },
              {
                label: fr ? "Commande" : "Order",
                value: isAdmin ? (
                  <Link href={`/admin/orders/${task.orderId}`} className="text-[var(--primary)] hover:underline">{task.orderReference}</Link>
                ) : (
                  task.orderReference
                ),
              },
              { label: fr ? "Type de trajet" : "Leg type", value: kindLabel },
              { label: fr ? "Statut" : "Status", value: <Badge variant={legStatusVariant(task.status)}>{statusLabel}</Badge> },
              { label: fr ? "Livreur" : "Rider", value: riderLabel(task, fr) },
              { label: fr ? "Vendeur" : "Seller", value: task.sellerName ?? "—" },
              { label: fr ? "Départ" : "From", value: `${endpointName(task.from, fr)}${task.from?.address ? ` — ${task.from.address}` : ""}`, full: true },
              { label: fr ? "Arrivée" : "To", value: `${endpointName(task.to, fr)}${task.to?.address ? ` — ${task.to.address}` : ""}`, full: true },
              ...(task.to?.type === "customer" && task.to.phone
                ? [{
                    label: fr ? "Téléphone client" : "Customer phone",
                    value: (
                      <a href={`tel:${task.to.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
                        <Phone className="h-3.5 w-3.5" />
                        {task.to.phone}
                      </a>
                    ),
                  }]
                : []),
              { label: fr ? "Adresse enregistrée" : "Recorded address", value: addressText(task.address), full: true },
              ...(task.codAmountUsd > 0 ? [{ label: fr ? "COD à encaisser" : "COD to collect", value: formatCurrency(task.codAmountUsd, locale) }] : []),
              { label: fr ? "Tentatives" : "Attempts", value: task.attempts },
              { label: fr ? "Âge" : "Age", value: isOpenLeg(task) ? (age < 48 ? `${Math.round(age)} h` : `${Math.floor(age / 24)} ${fr ? "j" : "d"}`) : "—" },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Incidents" : "Incidents"}>
          {linked.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucun incident pour ce colis." : "No incidents for this parcel."}</p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm">
              {linked.map((e) => (
                <li key={e.id}>
                  <Link href={ops(`/exceptions/${e.id}`)} className="text-[var(--primary)] hover:underline">{e.reference}</Link>{" "}
                  <span className="text-slate-500">· {pick(EXCEPTION_TYPE[e.type], fr, e.type.replace(/_/g, " "))} · {pick(EXCEPTION_STATUS[e.status], fr, e.status)}</span>
                </li>
              ))}
            </ul>
          )}
          {showIncident ? (
            <ExceptionForm
              taskId={task.id}
              orderReference={task.orderReference}
              onCancel={() => setShowIncident(false)}
              onCreated={() => {
                setShowIncident(false);
                void exceptionsQ.reload();
              }}
            />
          ) : (
            <button onClick={() => setShowIncident(true)} className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50">
              {fr ? "Signaler un incident" : "Report an incident"}
            </button>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles transportés" : "Items carried"} span={2}>
          {task.items.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucun article indiqué." : "No item details."}</p>
          ) : (
            <div className="space-y-3">
              {task.items.map((item, i) => (
                <div key={`${item.productId ?? item.name}-${i}`} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{fr && item.nameFr ? item.nameFr : item.name}</p>
                    {item.variant && <p className="text-xs text-slate-500">{item.variant}</p>}
                  </div>
                  <span className="text-sm font-medium">{fr ? "Qté" : "Qty"}: {item.qty}</span>
                </div>
              ))}
              <p className="text-xs text-slate-400">{legItemsText(task.items, fr)}</p>
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"}>
          <ActivityTimeline
            events={[
              { time: fmtDateTime(task.createdAt, fr), label: fr ? "Trajet créé" : "Leg created", done: true },
              { time: fmtDateTime(task.readyAt, fr), label: fr ? "Vendeur : colis prêt" : "Seller marked ready", done: !!task.readyAt },
              { time: task.riderId ? fmtDateTime(task.updatedAt, fr) : "—", label: fr ? "Livreur assigné" : "Rider assigned", done: !!task.riderId },
              { time: fmtDateTime(task.pickedUpAt, fr), label: fr ? "Parti avec le livreur" : "Picked up by the rider", done: !!task.pickedUpAt },
              hubBound
                ? { time: fmtDateTime(task.receivedAt, fr), label: fr ? "Scanné à l'arrivée" : "Scanned in at the warehouse", done: !!task.receivedAt }
                : { time: fmtDateTime(task.deliveredAt, fr), label: task.status === "failed" ? (fr ? "Échec" : "Failed") : fr ? "Remis" : "Handed over", done: task.status === "delivered" || task.status === "failed" },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Les autres trajets de cette commande" : "Other legs of this order"} span={3}>
          {journey.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucun autre trajet visible pour votre entrepôt." : "No other leg visible to your warehouse."}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {journey.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="space-y-1">
                    <Link href={ops(`/tasks/${t.id}`)} className="text-sm font-medium text-[var(--primary)] hover:underline">
                      {parcelCode(t)} · {pickL(LEG_KIND[t.kind], fr)}
                    </Link>
                    <div><LegRoute task={t} /></div>
                  </div>
                  <Badge variant={legStatusVariant(t.status)}>{pickL(LEG_STATUS[t.status], fr)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
