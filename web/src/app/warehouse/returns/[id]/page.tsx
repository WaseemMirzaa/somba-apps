"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getReturn } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

// Return status can be mutated locally (approve/reject), so map the live value.
const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  pending_inspection: "Inspection en attente",
  inspecting: "Inspection en cours",
  approved: "Approuvé",
  rejected: "Rejeté",
  refunded: "Remboursé",
};

export default function WarehouseReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ret = getReturn(id);
  const [status, setStatus] = useState(ret?.status ?? "pending");

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Retour introuvable" : "Return not found"}</div>;
  }

  const reason = fr ? ret.reasonFr : ret.reason;
  const statusLabel = fr ? STATUS_FR[status] ?? status : status.replace("_", " ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={`${fr ? "Commande" : "Order"} ${ret.orderId} · ${reason}`}
        backHref="/warehouse/returns"
        actions={
          status === "pending" ? (
            <>
              <button onClick={() => { setStatus("approved"); toast(fr ? "Retour approuvé" : "Return approved"); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">{fr ? "Approuver" : "Approve"}</button>
              <button onClick={() => { setStatus("rejected"); toast(fr ? "Retour rejeté" : "Return rejected", "error"); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">{fr ? "Rejeter" : "Reject"}</button>
            </>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "ID retour" : "Return ID", value: ret.id },
            { label: fr ? "Commande" : "Order", value: <Link href={`/admin/orders/${ret.orderId}`} className="text-[var(--primary)] hover:underline">{ret.orderId}</Link> },
            { label: fr ? "Client" : "Customer", value: <Link href={`/admin/customers/${ret.customerId}`} className="text-[var(--primary)] hover:underline">{ret.customer}</Link> },
            { label: fr ? "Motif" : "Reason", value: reason },
            { label: fr ? "Statut" : "Status", value: statusLabel },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produit" : "Product"}>
          <div className="flex gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
              <Image src={ret.image} alt={ret.product} fill className="object-cover" sizes="80px" />
            </div>
            <InfoGrid items={[
              { label: fr ? "Nom" : "Name", value: <Link href={`/shop/products/${ret.productId}`} className="text-[var(--primary)] hover:underline">{ret.product}</Link> },
              { label: fr ? "Variante" : "Variant", value: fr ? ret.variantFr : ret.variant },
              { label: fr ? "Quantité" : "Quantity", value: ret.qty },
            ]} />
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Remboursement" : "Refund"}>
          <InfoGrid items={[
            { label: fr ? "Montant" : "Amount", value: formatCurrency(ret.refund.amount, locale) },
            { label: fr ? "Méthode" : "Method", value: fr ? ret.refund.methodFr : ret.refund.method },
            { label: fr ? "Statut" : "Status", value: fr ? ret.refund.statusFr : ret.refund.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Inspection" : "Inspection"} span={2}>
          <InfoGrid items={[
            { label: fr ? "État" : "Condition", value: fr ? ret.inspection.conditionFr : ret.inspection.condition },
            { label: fr ? "Photos" : "Photos", value: `${ret.inspection.photos} ${fr ? "téléversée(s)" : "uploaded"}` },
            { label: fr ? "Notes" : "Notes", value: fr ? ret.inspection.notesFr : ret.inspection.notes, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={ret.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
