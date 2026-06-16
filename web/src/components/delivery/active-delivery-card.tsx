"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { formatCurrency } from "@/lib/utils";
import { customerColumnLabel, zoneColumnLabel } from "@/lib/admin-i18n";
import type { DeliveryDetailData } from "@/lib/delivery-detail";
import { cn } from "@/lib/utils";

type ActiveDeliveryCardProps = {
  delivery: DeliveryDetailData;
  locale: "en" | "fr";
  defaultExpanded?: boolean;
  alwaysExpanded?: boolean;
  showDetailLink?: boolean;
  linkClass?: string;
};

// French display labels for delivery status / payment values that arrive in
// English from the data layer (DeliveryDetailData carries the raw enum/string).
// Logic never reads these; they are display-only fallbacks.
const STATUS_FR: Record<string, string> = {
  assigned: "Assigné",
  picked_up: "Collecté",
  in_transit: "En transit",
  delivered: "Livré",
  failed: "Échoué",
  pending: "En attente",
  scheduled: "Planifié",
  arrived: "Arrivé",
};

const PAYMENT_FR: Record<string, string> = {
  "Pay at delivery": "À la livraison",
  Prepaid: "Prépayé",
  Card: "Carte",
  Cash: "Espèces",
  "Mobile money": "Mobile money",
  COD: "Paiement à la livraison",
};

// Product variant strings arrive as free-form English tokens (e.g. "Default",
// "256GB Black"). Translate known tokens; unknown tokens fall back unchanged.
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

const statusLabel = (status: string, fr: boolean) =>
  fr ? STATUS_FR[status] ?? status.replace(/_/g, " ") : status.replace(/_/g, " ");

const paymentLabel = (payment: string, fr: boolean) =>
  fr ? PAYMENT_FR[payment] ?? payment : payment;

export function ActiveDeliveryCard({
  delivery,
  locale,
  defaultExpanded = false,
  alwaysExpanded = false,
  showDetailLink = false,
  linkClass = "text-[var(--primary)]",
}: ActiveDeliveryCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || alwaysExpanded);
  const fr = locale === "fr";
  const productSummary = delivery.products.map((p) => p.name).join(", ");
  const isExpanded = alwaysExpanded || expanded;

  const phoneLinkClass = cn("inline-flex items-center gap-1 hover:underline", linkClass);

  const detailBody = (
    <div className={cn("space-y-4", !alwaysExpanded && "border-t border-[var(--border)] px-4 pb-4 pt-4")}>
      <InfoGrid
        items={[
          { label: fr ? "Commande" : "Order ID", value: delivery.orderId },
          { label: zoneColumnLabel(locale), value: delivery.zone },
          { label: fr ? "Paiement" : "Payment", value: paymentLabel(delivery.paymentType, fr) },
          {
            label: fr ? "Montant à collecter" : "Amount due",
            value: delivery.codAmount
              ? formatCurrency(delivery.codAmount, locale)
              : fr ? "Non applicable" : "N/A",
          },
          ...(delivery.currentStop != null && delivery.totalStops != null
            ? [{
                label: fr ? "Arrêt" : "Stop",
                value: `${delivery.currentStop} / ${delivery.totalStops}`,
              }]
            : []),
        ]}
      />

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {customerColumnLabel(locale)}
        </h4>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: delivery.customer.name },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a href={`tel:${delivery.customer.phone.replace(/\s/g, "")}`} className={phoneLinkClass}>
                  <Phone className="h-3.5 w-3.5" />
                  {delivery.customer.phone}
                </a>
              ),
            },
            { label: fr ? "Adresse" : "Address", value: delivery.customer.address, full: true },
            ...(delivery.customer.id != null
              ? [{ label: "ID", value: delivery.customer.id }]
              : []),
          ]}
        />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {fr ? "Vendeur" : "Seller"}
        </h4>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: delivery.seller.name },
            { label: fr ? "Boutique" : "Store", value: delivery.seller.store },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a href={`tel:${delivery.seller.phone.replace(/\s/g, "")}`} className={phoneLinkClass}>
                  <Phone className="h-3.5 w-3.5" />
                  {delivery.seller.phone}
                </a>
              ),
            },
            ...(delivery.seller.id != null
              ? [{ label: "ID", value: delivery.seller.id }]
              : []),
          ]}
        />
      </div>

      {delivery.products.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {fr ? "Produits" : "Products"}
          </h4>
          <div className="space-y-2">
            {delivery.products.map((item) => (
              <div
                key={item.sku}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="48px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {localizeVariant(item.variant, fr)} · {fr ? "Qté" : "Qty"} {item.qty}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {delivery.timeline.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {fr ? "Suivi" : "Timeline"}
          </h4>
          <ActivityTimeline events={delivery.timeline} />
        </div>
      )}

      {showDetailLink && delivery.detailHref && (
        <p className="text-xs text-slate-400">
          {fr ? "Voir détail complet :" : "Full detail:"}{" "}
          <Link href={delivery.detailHref} className={cn("hover:underline", linkClass)}>
            {delivery.id}
          </Link>
        </p>
      )}
    </div>
  );

  if (alwaysExpanded) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{delivery.orderId}</span>
            <Badge>{statusLabel(delivery.status, fr)}</Badge>
            <Badge variant="primary">ETA {delivery.eta}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{delivery.customer.name}</p>
          <p className="text-xs text-slate-500">{delivery.customer.address}</p>
          {productSummary && (
            <p className="mt-1 text-xs text-slate-400">{productSummary}</p>
          )}
        </div>
        {detailBody}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{delivery.orderId}</span>
            <Badge>{statusLabel(delivery.status, fr)}</Badge>
            <Badge variant="primary">ETA {delivery.eta}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">{delivery.customer.name}</p>
          <p className="text-xs text-slate-500">{delivery.customer.address}</p>
          {!isExpanded && productSummary && (
            <p className="mt-1 truncate text-xs text-slate-400">{productSummary}</p>
          )}
        </div>
        <ChevronDown
          className={cn("mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform", isExpanded && "rotate-180")}
        />
      </button>

      {isExpanded && detailBody}
    </div>
  );
}
