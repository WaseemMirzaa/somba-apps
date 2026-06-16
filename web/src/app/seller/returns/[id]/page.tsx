"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getSellerReturn } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const RETURN_STATUS_LABELS: Record<string, { en: string; fr: string }> = {
  pending: { en: "Pending", fr: "En attente" },
  pending_inspection: { en: "Pending inspection", fr: "En attente d'inspection" },
  inspecting: { en: "Inspecting", fr: "Inspection" },
  approved: { en: "Approved", fr: "Approuvé" },
  rejected: { en: "Rejected", fr: "Rejeté" },
  refunded: { en: "Refunded", fr: "Remboursé" },
};

const TIMELINE_LABELS: Record<string, string> = {
  "Order Delivered": "Commande livrée",
  "Return Requested": "Retour demandé",
  "Return Approved": "Retour approuvé",
  "Pickup Scheduled": "Ramassage planifié",
  "Refund Processed": "Remboursement traité",
  "Received at Warehouse": "Reçu à l'entrepôt",
  "Inspecting": "Inspection",
};

function localizeStatus(status: string, fr: boolean) {
  const entry = RETURN_STATUS_LABELS[status];
  if (entry) return fr ? entry.fr : entry.en;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SellerReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ret = getSellerReturn(id);

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Retour introuvable" : "Return not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={ret.id} subtitle={`${fr ? "Commande" : "Order"} ${ret.orderId} · ${fr ? ret.reasonFr : ret.reason}`} backHref="/seller/returns" />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "N° retour" : "Return ID", value: ret.id },
            { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${ret.orderId}`} className="text-[var(--primary)] hover:underline">{ret.orderId}</Link> },
            { label: fr ? "Client" : "Customer", value: ret.customer },
            { label: fr ? "Motif" : "Reason", value: fr ? ret.reasonFr : ret.reason },
            { label: fr ? "Statut" : "Status", value: localizeStatus(ret.status, fr) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produit" : "Product"}>
          <InfoGrid items={[
            { label: fr ? "Produit" : "Product", value: <Link href={`/seller/products/${ret.productId}`} className="text-[var(--primary)] hover:underline">{ret.product}</Link> },
            { label: fr ? "Variante" : "Variant", value: ret.variant },
            { label: fr ? "Quantité" : "Quantity", value: ret.qty },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Remboursement" : "Refund"}>
          <InfoGrid items={[
            { label: fr ? "Montant" : "Amount", value: formatCurrency(ret.refund.amount, locale) },
            { label: fr ? "Méthode" : "Method", value: fr ? ret.refund.methodFr : ret.refund.method },
            { label: fr ? "Statut" : "Status", value: localizeStatus(ret.refund.status, fr) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Inspection" : "Inspection"} span={2}>
          <InfoGrid items={[
            { label: fr ? "Notes entrepôt" : "Warehouse Notes", value: fr ? ret.inspection.warehouseNotesFr : ret.inspection.warehouseNotes },
            { label: fr ? "Photos" : "Photos", value: `${ret.inspection.photos} ${fr ? "jointe(s)" : "attached"}` },
            { label: fr ? "Condition" : "Condition", value: fr ? ret.inspection.conditionFr : ret.inspection.condition },
          ]} />
          <Link href="/warehouse/returns" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "File de retours entrepôt →" : "Warehouse Return Queue →"}</Link>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={ret.timeline.map((event) => ({
            ...event,
            label: fr ? (TIMELINE_LABELS[event.label] ?? event.label) : event.label,
          }))} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
