"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { getAgedParcel } from "@/lib/warehouse-entities";
import { getOrder } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

// Parcel / order status and priority values originate from the shared (non-owned) entities layer.
const STATUS_FR: Record<string, string> = {
  inbound: "Entrant",
  received: "Reçu",
  sorting: "Tri",
  ready: "Prêt",
  dispatched: "Expédié",
};

const PRIORITY_FR: Record<string, string> = {
  high: "Élevée",
  normal: "Normale",
  medium: "Moyenne",
  low: "Faible",
};

const ORDER_STATUS_FR: Record<string, string> = {
  delivered: "Livré",
  processing: "En cours",
  pending: "En attente",
  cancelled: "Annulé",
  shipped: "Expédié",
  unknown: "Inconnu",
};

const CONDITION_FR: Record<string, string> = {
  Good: "Bon",
  Pending: "En attente",
  Damaged: "Endommagé",
};

// Product variant tokens arrive in English from the shared (non-owned) entities layer.
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

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function localize(map: Record<string, string>, value: string, fr: boolean) {
  return fr ? map[value] ?? formatStatus(value) : formatStatus(value);
}

function statusVariant(status: string): "success" | "warning" | "info" | "danger" {
  if (status === "inbound") return "warning";
  if (status === "received") return "info";
  if (status === "sorting") return "warning";
  return "success";
}

export default function WarehouseAgedParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const parcel = getAgedParcel(id);
  const order = parcel ? getOrder(parcel.orderId) : undefined;

  if (!parcel) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Colis introuvable" : "Parcel not found"}
      </div>
    );
  }

  const stuckReason = fr ? parcel.stuckReasonFr : parcel.stuckReason;
  const conditionLabel = fr
    ? CONDITION_FR[parcel.inspectionDetail.condition] ?? parcel.inspectionDetail.condition
    : parcel.inspectionDetail.condition;
  const exceptionsLabel =
    parcel.inspectionDetail.exceptions === "None"
      ? fr
        ? "Aucune"
        : "None"
      : parcel.inspectionDetail.exceptions;
  const timelineEvents = parcel.agedTimeline.map((event) => ({
    time: event.time,
    label: fr ? event.labelFr : event.label,
    detail: event.detail ? (fr ? parcel.stuckReasonFr : event.detail) : undefined,
    done: event.done,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={parcel.id}
        subtitle={`${parcel.orderId} · ${localize(STATUS_FR, parcel.status, fr)} · ${parcel.zone} · ${fr ? "Arrivé" : "Arrived"} ${parcel.arrivalDate} ${parcel.arrival}`}
        backHref="/warehouse/aged"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Colis bloqués" : "Aged Parcels", href: "/warehouse/aged" },
          { label: parcel.id },
        ]}
        actions={
          <>
            <Badge variant={statusVariant(parcel.status)}>{localize(STATUS_FR, parcel.status, fr)}</Badge>
            <Badge variant="warning">
              {fr ? `${parcel.daysStuck} jours bloqué` : `${parcel.daysStuck} days stuck`}
            </Badge>
            {parcel.status === "inbound" && (
              <button
                onClick={() => toast(fr ? "Colis reçu" : "Parcel received")}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium"
              >
                {fr ? "Marquer reçu" : "Mark Received"}
              </button>
            )}
          </>
        }
      />

      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              {fr ? "Colis bloqué — action requise" : "Stuck parcel — action required"}
            </p>
            <p className="mt-1 text-xl font-bold text-amber-950">{stuckReason}</p>
            {!fr && parcel.stuckReasonFr !== parcel.stuckReason && (
              <p className="mt-1 text-sm font-medium text-amber-800/80">{parcel.stuckReasonFr}</p>
            )}
            {fr && parcel.stuckReason !== parcel.stuckReasonFr && (
              <p className="mt-1 text-sm font-medium text-amber-800/80">{parcel.stuckReason}</p>
            )}
            {parcel.linkedExceptionId && (
              <NavLinkButton
                href={`/warehouse/exceptions/${parcel.linkedExceptionId}`}
                className="mt-3"
              >
                {fr ? "Voir l'exception liée" : "View linked exception"} → {parcel.linkedExceptionId}
              </NavLinkButton>
            )}
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations colis" : "Parcel Information"}>
          <InfoGrid
            items={[
              { label: fr ? "ID colis" : "Parcel ID", value: parcel.id },
              { label: fr ? "Code-barres" : "Barcode", value: parcel.barcode },
              {
                label: fr ? "Statut" : "Status",
                value: <Badge variant={statusVariant(parcel.status)}>{localize(STATUS_FR, parcel.status, fr)}</Badge>,
              },
              {
                label: fr ? "Priorité" : "Priority",
                value: localize(PRIORITY_FR, parcel.priority, fr),
              },
              {
                label: fr ? "Jours bloqué" : "Days stuck",
                value: String(parcel.daysStuck),
              },
              { label: fr ? "Poids" : "Weight", value: parcel.weight },
              { label: fr ? "Volume" : "Volume", value: parcel.volume },
              {
                label: fr ? "Heure d'arrivée" : "Arrival time",
                value: `${parcel.arrivalDate} ${parcel.arrival}`,
              },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande liée" : "Linked Order"}>
          <InfoGrid
            items={[
              {
                label: fr ? "N° commande" : "Order ID",
                value: (
                  <Link
                    href={`/admin/orders/${parcel.orderId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {parcel.orderId}
                  </Link>
                ),
              },
              { label: fr ? "Date commande" : "Order date", value: parcel.orderDate },
              {
                label: fr ? "Montant commande" : "Order amount",
                value: formatCurrency(parcel.orderAmount, locale),
              },
              {
                label: fr ? "Statut commande" : "Order status",
                value: localize(ORDER_STATUS_FR, parcel.orderStatus, fr),
              },
              ...(order
                ? [
                    {
                      label: fr ? "Mode de paiement" : "Payment method",
                      value: order.paymentMethod === "COD" ? (fr ? "Paiement à la livraison" : "Pay at delivery") : "Card",
                    },
                  ]
                : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid
            items={[
              {
                label: fr ? "Nom" : "Name",
                value: (
                  <Link
                    href={`/admin/customers/${parcel.customerId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {parcel.customer}
                  </Link>
                ),
              },
              { label: fr ? "Téléphone" : "Phone", value: parcel.customerPhone },
              { label: fr ? "Adresse" : "Address", value: parcel.customerAddress, full: true },
              { label: fr ? "Zone de livraison" : "Delivery zone", value: parcel.zone },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid
            items={[
              {
                label: fr ? "Boutique" : "Store",
                value: (
                  <Link
                    href={`/admin/sellers/${parcel.sellerId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {parcel.storeName}
                  </Link>
                ),
              },
              { label: fr ? "Nom vendeur" : "Seller name", value: parcel.seller },
              { label: fr ? "Téléphone" : "Phone", value: parcel.sellerPhone },
              { label: fr ? "Livreur collecte" : "Pickup rider", value: parcel.pickupRider },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Logistique" : "Logistics"}>
          <InfoGrid
            items={[
              {
                label: fr ? "Entrepôt" : "Warehouse",
                value: fr ? parcel.warehouseFr : parcel.warehouse,
              },
              { label: t("zone"), value: parcel.zone },
              { label: fr ? "Route" : "Route", value: parcel.route },
              { label: fr ? "Livreur" : "Rider", value: parcel.rider },
              { label: fr ? "N° suivi" : "Tracking number", value: parcel.trackingNumber },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Inspection" : "Inspection"}>
          <InfoGrid
            items={[
              { label: fr ? "État" : "Condition", value: conditionLabel },
              {
                label: fr ? "Photos" : "Photos",
                value: `${parcel.inspectionDetail.photos} ${fr ? "téléversée(s)" : "uploaded"}`,
              },
              {
                label: fr ? "Notes dommages" : "Damage notes",
                value: parcel.inspectionDetail.damageNotes || (fr ? "Aucune" : "None"),
                full: true,
              },
              { label: fr ? "Exceptions" : "Exceptions", value: exceptionsLabel },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => toast(fr ? "Colis accepté" : "Parcel accepted")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white"
            >
              {fr ? "Accepter" : "Accept"}
            </button>
            <Link
              href="/warehouse/exceptions"
              className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-700"
            >
              {fr ? "Créer incident" : "Create Incident"}
            </Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits" : "Products"} span={2}>
          <div className="space-y-4">
            {parcel.itemsWithImages.map((item) => (
              <div
                key={item.sku}
                className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                  <Image
                    src={item.image}
                    alt={item.product}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                </div>
                <div className="flex-1">
                  <Link
                    href={`/shop/products/${item.productId}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {item.product}
                  </Link>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {localizeVariant(item.variant, fr)}
                  </p>
                </div>
                <span className="text-sm font-medium">
                  {fr ? "Qté" : "Qty"}: {item.qty}
                </span>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Historique statut" : "Status History"} span={3}>
          <ActivityTimeline events={timelineEvents} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
