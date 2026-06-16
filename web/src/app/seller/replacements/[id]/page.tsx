"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getReplacement } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const REPLACEMENT_STATUS_LABELS: Record<string, { en: string; fr: string }> = {
  pending: { en: "Pending", fr: "En attente" },
  processing: { en: "Processing", fr: "En cours" },
  allocated: { en: "Allocated", fr: "Alloué" },
  shipped: { en: "Shipped", fr: "Expédié" },
  completed: { en: "Completed", fr: "Terminé" },
};

function formatReplacementStatus(status: string, fr = false) {
  const entry = REPLACEMENT_STATUS_LABELS[status];
  if (entry) return fr ? entry.fr : entry.en;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SellerReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rep = getReplacement(id);

  if (!rep) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Remplacement introuvable" : "Replacement not found"}
      </div>
    );
  }

  const reason = fr ? rep.reasonFr : rep.reason;
  const comment = fr ? rep.customerCommentFr : rep.customerComment;
  const dispatch = rep.newProduct.dispatch;

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.id}
        subtitle={`${rep.createdAt} · ${formatReplacementStatus(rep.status, fr)} · ${rep.orderId}`}
        backHref="/seller/replacements"
        actions={<Badge variant="info">{formatReplacementStatus(rep.status, fr)}</Badge>}
      />

      <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">
              {fr ? "Motif du remplacement" : "Replacement reason"}
            </p>
            <p className="mt-1 text-xl font-bold text-red-950">{reason}</p>
            {comment && (
              <p className="mt-2 text-sm leading-relaxed text-red-900/80">{comment}</p>
            )}
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid
            items={[
              { label: fr ? "ID remplacement" : "Replacement ID", value: rep.id },
              {
                label: fr ? "Commande" : "Order",
                value: (
                  <Link href={`/seller/orders/${rep.orderId}`} className="text-[var(--primary)] hover:underline">
                    {rep.orderId}
                  </Link>
                ),
              },
              { label: fr ? "Client" : "Customer", value: rep.customer },
              { label: fr ? "Statut" : "Status", value: formatReplacementStatus(rep.status, fr) },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produit retourné" : "Returned Product"}>
          <div className="flex gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={rep.returnedProduct.image}
                alt={fr ? rep.returnedProduct.nameFr : rep.returnedProduct.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <InfoGrid
              items={[
                { label: fr ? "Nom" : "Name", value: fr ? rep.returnedProduct.nameFr : rep.returnedProduct.name },
                { label: "SKU", value: rep.returnedProduct.sku },
                { label: fr ? "Variante" : "Variant", value: fr ? rep.returnedProduct.variantFr : rep.returnedProduct.variant },
                {
                  label: fr ? "Condition" : "Condition",
                  value: fr ? rep.returnedProduct.conditionFr : rep.returnedProduct.condition,
                },
                {
                  label: fr ? "Inspection" : "Inspection",
                  value: fr ? rep.returnedProduct.inspectionFr : rep.returnedProduct.inspection,
                  full: true,
                },
              ]}
            />
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Nouveau produit" : "New Product"} span={2}>
          <div className="flex gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={rep.newProduct.image}
                alt={fr ? rep.newProduct.nameFr : rep.newProduct.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <InfoGrid
              items={[
                { label: fr ? "Nom" : "Name", value: fr ? rep.newProduct.nameFr : rep.newProduct.name },
                { label: "SKU", value: rep.newProduct.sku },
                { label: fr ? "Variante" : "Variant", value: fr ? rep.newProduct.variantFr : rep.newProduct.variant },
                {
                  label: fr ? "Prix" : "Price",
                  value: formatCurrency(rep.newProduct.price, locale),
                },
                {
                  label: fr ? "Emplacement" : "Location",
                  value: fr ? rep.newProduct.warehouseLocationFr : rep.newProduct.warehouseLocation,
                  full: true,
                },
                {
                  label: fr ? "Alloué" : "Allocated",
                  value: rep.newProduct.allocated ? (fr ? "Oui" : "Yes") : fr ? "Non" : "No",
                },
                {
                  label: fr ? "Statut expédition" : "Dispatch status",
                  value: fr ? dispatch.statusFr : dispatch.status,
                },
                {
                  label: "ETA",
                  value: fr ? dispatch.etaFr ?? dispatch.eta ?? "—" : dispatch.eta ?? "—",
                },
              ]}
            />
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={rep.timeline.map((event) => ({
              time: event.time,
              label: fr ? event.labelFr : event.label,
              detail: fr ? event.detailFr : event.detail,
              done: event.done,
            }))}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
