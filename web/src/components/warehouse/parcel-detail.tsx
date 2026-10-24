"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { AssignParcelButton } from "@/components/warehouse/assign-parcel-button";
import { ExceptionForm } from "@/components/warehouse/exception-form";
import { useReceiveParcel } from "@/components/warehouse/use-receive";
import { STAGE_LABEL, riderName, stageVariant, useWarehouseData } from "@/lib/warehouse";
import { EXCEPTION_STATUS, EXCEPTION_TYPE, pick, shortDate, useOpsQuery, type ExceptionRow } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/seller-labels";
import { variantDisplay } from "@/lib/i18n-fields";

/**
 * Live parcel detail, shared by /parcels/:id and /aged/:id.
 * Actions are real: Receive (`warehouse:receive`), Assign rider
 * (`delivery:assign`), Report incident (`exceptions:create`).
 */
export function ParcelDetail({ variant }: { variant: "parcel" | "aged" }) {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const isAdmin = base.startsWith("/admin");
  const { getParcel, parcels } = useWarehouseData();
  const { receive, busyId } = useReceiveParcel();
  const parcel = getParcel(id);
  const [showIncident, setShowIncident] = useState(false);
  const exceptionsQ = useOpsQuery<ExceptionRow[]>("exceptions:list", {
    initial: [] as ExceptionRow[],
    push: ["exception:updated"],
  });

  if (!parcel) {
    return (
      <div className="p-8 text-center text-slate-500">
        {parcels.length === 0
          ? (fr ? "Chargement…" : "Loading…")
          : (fr ? "Colis introuvable" : "Parcel not found")}
      </div>
    );
  }

  const listHref = ops(variant === "aged" ? "/aged" : "/inbound");
  const listLabel = variant === "aged" ? (fr ? "Colis bloqués" : "Aged Parcels") : t("inbound");
  const stage = STAGE_LABEL[parcel.status];
  const stageLabel = fr ? stage.fr : stage.en;
  const linked = exceptionsQ.data.filter((e) => e.taskId === parcel.taskId);
  const canAssign = parcel.status === "inbound" || parcel.status === "received" || parcel.status === "sorting";
  const ageDays = Math.floor(parcel.ageHours / 24);
  const orderCell = isAdmin ? (
    <Link href={`/admin/orders/${parcel.orderUuid}`} className="text-[var(--primary)] hover:underline">{parcel.orderId}</Link>
  ) : (
    parcel.orderId
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={parcel.id}
        subtitle={`${fr ? "Commande" : "Order"} ${parcel.orderId} · ${stageLabel}`}
        backHref={listHref}
        breadcrumbs={[
          { label: isAdmin ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: isAdmin ? "/admin/fulfillment" : "/warehouse" },
          { label: listLabel, href: listHref },
          { label: parcel.id },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stageVariant(parcel.status)}>{stageLabel}</Badge>
            {variant === "aged" && (
              <Badge variant="warning">
                {fr ? `${ageDays} j / ${Math.round(parcel.ageHours)} h ouvert` : `${ageDays}d / ${Math.round(parcel.ageHours)}h open`}
              </Badge>
            )}
            {parcel.status === "inbound" && (
              <button
                disabled={busyId === parcel.taskId}
                onClick={() => void receive(parcel)}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {busyId === parcel.taskId ? "…" : t("receive")}
              </button>
            )}
            {canAssign && <AssignParcelButton parcel={parcel} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50" />}
          </div>
        }
      />

      {parcel.failureReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{fr ? "Dernière tentative échouée : " : "Last delivery attempt failed: "}</strong>
          {parcel.failureReason}
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations du colis" : "Parcel Information"}>
          <InfoGrid items={[
            { label: fr ? "ID colis" : "Parcel ID", value: parcel.id },
            { label: fr ? "Code-barres" : "Barcode", value: parcel.barcode },
            { label: fr ? "ID commande" : "Order ID", value: orderCell },
            { label: fr ? "Statut" : "Status", value: stageLabel },
            { label: fr ? "Créé le" : "Created", value: shortDate(parcel.createdAt, locale) },
            { label: fr ? "Reçu au hub" : "Received at hub", value: shortDate(parcel.receivedAt, locale) },
            { label: fr ? "Vendeur prêt" : "Seller ready", value: parcel.readyAt ? shortDate(parcel.readyAt, locale) : (fr ? "Pas encore" : "Not yet") },
            { label: fr ? "Tentatives" : "Attempts", value: parcel.attempts },
            { label: t("zone"), value: parcel.zone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Collecte (vendeur)" : "Pickup (seller)"}>
          <InfoGrid items={[
            { label: fr ? "Vendeur" : "Seller", value: parcel.seller },
            { label: fr ? "Adresse de collecte" : "Pickup address", value: parcel.pickupAddress, full: true },
            { label: fr ? "Livreur" : "Rider", value: riderName(parcel.rider, fr) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom du client" : "Customer Name", value: parcel.customer },
            {
              label: fr ? "Téléphone" : "Phone",
              value: parcel.customerPhone ? (
                <a href={`tel:${parcel.customerPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
                  <Phone className="h-3.5 w-3.5" />
                  {parcel.customerPhone}
                </a>
              ) : "—",
            },
            { label: fr ? "Adresse de livraison" : "Delivery address", value: parcel.customerAddress, full: true },
            { label: fr ? "Paiement" : "Payment", value: parcel.paymentMethod ? paymentMethodLabel(parcel.paymentMethod, fr) : parcel.paymentLabel },
            ...(parcel.codAmountUsd > 0 ? [{ label: fr ? "COD à encaisser" : "COD to collect", value: formatCurrency(parcel.codAmountUsd, locale) }] : []),
          ]} />
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
              taskId={parcel.taskId}
              orderReference={parcel.orderId}
              onCancel={() => setShowIncident(false)}
              onCreated={() => {
                setShowIncident(false);
                void exceptionsQ.reload();
              }}
            />
          ) : (
            <button
              onClick={() => setShowIncident(true)}
              className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
            >
              {fr ? "Signaler un incident" : "Report an incident"}
            </button>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles" : "Items"} span={2}>
          {parcel.items.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucun article disponible." : "No item details available."}</p>
          ) : (
            <div className="space-y-4">
              {parcel.items.map((item, i) => (
                <div key={`${item.productId}-${i}`} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{fr ? item.nameFr : item.name}</p>
                    <p className="text-xs text-slate-500">SKU: {item.sku} · {variantDisplay(item.variant, fr ? item.variantFr : null, fr)}</p>
                  </div>
                  <span className="text-sm font-medium">{fr ? "Qté" : "Qty"}: {item.qty}</span>
                </div>
              ))}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={parcel.timeline.map((e) => ({ time: e.time, label: fr ? e.labelFr : e.label, done: e.done }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
