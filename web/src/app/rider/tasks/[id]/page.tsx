"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Phone, Navigation, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getRiderTask } from "@/lib/rider-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

// Display labels for task enums / payment strings (logic uses raw values).
const TYPE_FR: Record<string, string> = {
  delivery: "Livraison",
  pickup: "Collecte",
  return: "Retour",
};

const STATUS_FR: Record<string, string> = {
  assigned: "Assigné",
  picked_up: "Collecté",
  in_transit: "En transit",
  delivered: "Livré",
  failed: "Échoué",
};

const PAYMENT_FR: Record<string, string> = {
  Prepaid: "Prépayé",
  Card: "Carte",
};

// Product variant tokens arrive in English (e.g. "Default", "256GB Black").
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
  const task = getRiderTask(id);
  const [delivered, setDelivered] = useState(task?.status === "delivered");

  if (!task) {
    return (
      <div className="text-center text-slate-500">
        {fr ? "Tâche introuvable" : "Task not found"}
      </div>
    );
  }

  const status = delivered ? "delivered" : task.status;
  const typeLabel = fr ? TYPE_FR[task.type] ?? task.type : task.type;
  const statusLabel = fr ? STATUS_FR[status] ?? status.replace("_", " ") : status.replace("_", " ");
  const paymentLabel = fr ? PAYMENT_FR[task.paymentType] ?? task.paymentType : task.paymentType;

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.id}
        subtitle={`${typeLabel} · ${statusLabel}`}
        backHref="/rider/tasks"
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="primary">{typeLabel}</Badge>
        <Badge variant={delivered ? "success" : "warning"}>ETA {task.eta}</Badge>
        <Badge>{task.distance}</Badge>
        <Badge>{task.zone}</Badge>
      </div>

      <DetailSection title={fr ? "Commande" : "Order"}>
        <InfoGrid
          items={[
            { label: fr ? "N° commande" : "Order ID", value: task.orderId },
            { label: fr ? "Paiement" : "Payment", value: paymentLabel },
            {
              label: fr ? "Montant" : "Amount",
              value: task.amount ? formatCurrency(task.amount, locale) : "—",
            },
            { label: fr ? "Articles" : "Items", value: task.items },
            { label: fr ? "Statut" : "Status", value: statusLabel },
          ]}
        />
      </DetailSection>

      <DetailSection title={t("customer")}>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: task.customer },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a
                  href={`tel:${task.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {task.phone}
                </a>
              ),
            },
            { label: fr ? "Adresse" : "Address", value: task.address, full: true },
            { label: t("zone"), value: task.zone },
          ]}
        />
      </DetailSection>

      <DetailSection title={fr ? "Vendeur" : "Seller"}>
        <InfoGrid
          items={[
            { label: fr ? "Nom" : "Name", value: task.sellerName },
            { label: fr ? "Boutique" : "Store", value: task.sellerStore },
            {
              label: fr ? "Téléphone" : "Phone",
              value: (
                <a
                  href={`tel:${task.sellerPhone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {task.sellerPhone}
                </a>
              ),
            },
          ]}
        />
      </DetailSection>

      <DetailSection title={fr ? "Produits" : "Products"}>
        <div className="space-y-3">
          {task.products.map((item) => (
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
      </DetailSection>

      {task.notes && (
        <div className="card-premium p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {fr ? "Notes" : "Notes"}
          </p>
          <p className="mt-1 text-sm text-slate-700">{fr ? (task.notesFr ?? task.notes) : task.notes}</p>
        </div>
      )}

      <DetailSection title={fr ? "Suivi" : "Timeline"}>
        <ActivityTimeline events={task.timeline} />
      </DetailSection>

      <div className="grid grid-cols-2 gap-3">
        <a href={`tel:${task.phone.replace(/\s/g, "")}`} className="contents">
          <Button variant="secondary" className="w-full">
            <Phone className="h-4 w-4" />
            {fr ? "Appeler client" : "Call customer"}
          </Button>
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="contents"
        >
          <Button variant="secondary" className="w-full">
            <Navigation className="h-4 w-4" />
            {fr ? "Naviguer" : "Navigate"}
          </Button>
        </a>
      </div>

      {!delivered && (
        <div className="flex flex-col gap-2">
          <Link
            href={`/rider/tasks/${id}/pod`}
            className="btn-primary flex w-full items-center justify-center gap-2 py-3"
          >
            <CheckCircle className="h-4 w-4" />
            {fr ? "Preuve de livraison" : "Proof of Delivery"}
          </Link>
          <Link
            href={`/rider/tasks/${id}/fail`}
            className="rounded-xl border border-red-200 py-2 text-center text-sm text-red-600"
          >
            {fr ? "Échec livraison" : "Failed Delivery"}
          </Link>
        </div>
      )}
    </div>
  );
}
