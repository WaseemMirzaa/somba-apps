"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getInboundParcel } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

// Parcel status / inspection values originate from the shared (non-owned) entities layer.
const STATUS_FR: Record<string, string> = {
  inbound: "Entrant",
  pending: "En attente",
  received: "Reçu",
  sorting: "Tri",
  ready: "Prêt",
  dispatched: "Expédié",
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

export default function WarehouseParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const parcel = getInboundParcel(id);

  if (!parcel) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Colis introuvable" : "Parcel not found"}</div>;
  }

  const statusLabel = fr ? STATUS_FR[parcel.status] ?? parcel.status : parcel.status;
  const conditionLabel = fr
    ? CONDITION_FR[parcel.inspectionDetail.condition] ?? parcel.inspectionDetail.condition
    : parcel.inspectionDetail.condition;
  const exceptionsLabel =
    parcel.inspectionDetail.exceptions === "None"
      ? fr
        ? "Aucune"
        : "None"
      : parcel.inspectionDetail.exceptions;

  return (
    <div className="space-y-6">
      <PageHeader
        title={parcel.id}
        subtitle={`${fr ? "Commande" : "Order"} ${parcel.orderId} · ${statusLabel} · ${parcel.zone}`}
        backHref="/warehouse/inbound"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: t("inbound"), href: "/warehouse/inbound" },
          { label: parcel.id },
        ]}
        actions={
          parcel.status === "inbound" ? (
            <button onClick={() => toast(fr ? "Colis reçu" : "Parcel received")} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">{t("receive")}</button>
          ) : (
            <Badge variant="info">{statusLabel}</Badge>
          )
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations du colis" : "Parcel Information"}>
          <InfoGrid items={[
            { label: fr ? "ID colis" : "Parcel ID", value: parcel.id },
            { label: fr ? "Code-barres" : "Barcode", value: parcel.barcode },
            { label: fr ? "ID commande" : "Order ID", value: <Link href={`/admin/orders/${parcel.orderId}`} className="text-[var(--primary)] hover:underline">{parcel.orderId}</Link> },
            { label: fr ? "Poids" : "Weight", value: parcel.weight },
            { label: fr ? "Volume" : "Volume", value: parcel.volume },
            { label: fr ? "Statut" : "Status", value: statusLabel },
            { label: fr ? "Heure d'arrivée" : "Arrival Time", value: parcel.arrival },
            { label: fr ? "Zone" : "Zone", value: parcel.zone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid items={[
            { label: fr ? "Nom du vendeur" : "Seller Name", value: parcel.seller },
            { label: fr ? "Nom de la boutique" : "Store Name", value: parcel.storeName },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a
                  href={`tel:${parcel.sellerPhone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {parcel.sellerPhone}
                </a>
              ),
            },
            { label: fr ? "Livreur de ramassage" : "Pickup Rider", value: parcel.pickupRider },
            { label: fr ? "ID vendeur" : "Seller ID", value: parcel.sellerId },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Client" : "Customer"}>
          <InfoGrid items={[
            { label: fr ? "Nom du client" : "Customer Name", value: parcel.customer },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a
                  href={`tel:${parcel.customerPhone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {parcel.customerPhone}
                </a>
              ),
            },
            { label: fr ? "Adresse" : "Address", value: parcel.customerAddress, full: true },
            { label: fr ? "Zone de livraison" : "Delivery Zone", value: parcel.zone },
            { label: fr ? "ID commande" : "Order ID", value: parcel.orderId },
            { label: fr ? "ID client" : "Customer ID", value: parcel.customerId },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Inspection" : "Inspection"}>
          <InfoGrid items={[
            { label: fr ? "État" : "Condition", value: conditionLabel },
            { label: fr ? "Photos" : "Photos", value: `${parcel.inspectionDetail.photos} ${fr ? "téléversées" : "uploaded"}` },
            { label: fr ? "Notes de dommages" : "Damage Notes", value: parcel.inspectionDetail.damageNotes || (fr ? "Aucune" : "None"), full: true },
            { label: t("exceptions"), value: exceptionsLabel },
          ]} />
          <div className="mt-4 flex gap-2">
            <button onClick={() => toast(fr ? "Colis accepté" : "Parcel accepted")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">{fr ? "Accepter" : "Accept"}</button>
            <button onClick={() => toast(fr ? "Colis rejeté" : "Parcel rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">{fr ? "Rejeter" : "Reject"}</button>
            <Link href="/warehouse/exceptions" className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-700">{fr ? "Créer un incident" : "Create Incident"}</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles" : "Items"} span={2}>
          <div className="space-y-4">
            {parcel.itemsWithImages.map((item) => (
              <div key={item.sku} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.product} fill className="object-cover" sizes="56px" />
                </div>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.productId}`} className="font-medium text-[var(--primary)] hover:underline">{item.product}</Link>
                  <p className="text-xs text-slate-500">SKU: {item.sku} · {localizeVariant(item.variant, fr)}</p>
                </div>
                <span className="text-sm font-medium">{fr ? "Qté" : "Qty"}: {item.qty}</span>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={[
            ...parcel.timeline,
            { time: "—", label: fr ? "Expédié" : "Dispatched", done: parcel.status === "dispatched" },
            { time: "—", label: fr ? "Livré" : "Delivered", done: false },
          ]} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
