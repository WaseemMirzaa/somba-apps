"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getDelivery } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

// Delivery status values originate from the shared (non-owned) entities layer.
const STATUS_FR: Record<string, string> = {
  in_transit: "En transit",
  out_for_delivery: "En livraison",
  delivered: "Livré",
};

// Product variant tokens arrive in English from the shared (non-owned) entities
// layer (e.g. "Default", "256GB Black"). Translate known tokens; fall back unchanged.
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

export default function WarehouseDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const delivery = getDelivery(id);

  if (!delivery) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Livraison introuvable" : "Delivery not found"}
      </div>
    );
  }

  const paymentLabel = delivery.paymentType;
  const statusLabel = fr
    ? STATUS_FR[delivery.status] ?? delivery.status.replace("_", " ")
    : delivery.status.replace("_", " ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={delivery.orderId}
        subtitle={`${statusLabel} · ETA ${delivery.eta}`}
        backHref="/warehouse/deliveries"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Livraisons" : "Deliveries", href: "/warehouse/deliveries" },
          { label: delivery.orderId },
        ]}
        actions={
          <>
            <a
              href={`tel:${delivery.riderPhone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50"
            >
              <Phone className="h-3.5 w-3.5" />
              {fr ? "Appeler livreur" : "Call Rider"}
            </a>
            <button
              onClick={() => toast(fr ? "Livraison escaladée" : "Delivery escalated to supervisor", "info")}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white"
            >
              {fr ? "Escalader" : "Escalate"}
            </button>
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title={t("customer")}>
          <InfoGrid
            items={[
              { label: fr ? "Nom" : "Name", value: delivery.customer },
              {
                label: fr ? "Téléphone" : "Phone",
                value: (
                  <a
                    href={`tel:${delivery.customerPhone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {delivery.customerPhone}
                  </a>
                ),
              },
              { label: fr ? "Adresse" : "Address", value: delivery.customerAddress, full: true },
              { label: t("zone"), value: delivery.zone },
              { label: "ID", value: delivery.customerId },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid
            items={[
              { label: fr ? "Nom" : "Name", value: delivery.seller },
              { label: fr ? "Boutique" : "Store", value: delivery.sellerStore },
              {
                label: fr ? "Téléphone" : "Phone",
                value: (
                  <a
                    href={`tel:${delivery.sellerPhone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {delivery.sellerPhone}
                  </a>
                ),
              },
              { label: "ID", value: delivery.sellerId },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livreur" : "Rider"}>
          <InfoGrid
            items={[
              { label: fr ? "Nom" : "Name", value: delivery.rider },
              {
                label: fr ? "Téléphone" : "Phone",
                value: (
                  <a
                    href={`tel:${delivery.riderPhone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {delivery.riderPhone}
                  </a>
                ),
              },
              { label: fr ? "Véhicule" : "Vehicle", value: delivery.vehicle },
              { label: "ID", value: delivery.riderId },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid
            items={[
              { label: fr ? "N° commande" : "Order ID", value: delivery.orderId },
              { label: fr ? "Articles" : "Items", value: delivery.itemsCount },
              { label: fr ? "Paiement" : "Payment", value: paymentLabel },
              { label: fr ? "Statut" : "Status", value: statusLabel },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits" : "Products"} span={2}>
          <div className="space-y-3">
            {delivery.products.map((item) => (
              <div
                key={item.sku}
                className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {localizeVariant(item.variant, fr)} · {fr ? "Qté" : "Qty"} {item.qty}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Suivi en direct" : "Live Tracking"} span={3}>
          <InfoGrid
            items={[
              { label: "ETA", value: delivery.eta },
              {
                label: fr ? "Arrêt actuel" : "Current Stop",
                value: `${delivery.currentStop} ${fr ? "sur" : "of"} ${delivery.totalStops}`,
              },
              { label: fr ? "Statut" : "Status", value: statusLabel },
            ]}
          />
          <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-indigo-50 text-sm text-slate-500">
            {fr ? "Aperçu carte (simulation)" : "Live map preview (mock)"}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={delivery.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
