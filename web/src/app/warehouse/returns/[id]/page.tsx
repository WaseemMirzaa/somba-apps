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

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={`${fr ? "Commande" : "Order"} ${ret.orderId} · ${ret.reason}`}
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
            { label: fr ? "Motif" : "Reason", value: ret.reason },
            { label: fr ? "Statut" : "Status", value: status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produit" : "Product"}>
          <div className="flex gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
              <Image src={ret.image} alt={ret.product} fill className="object-cover" sizes="80px" />
            </div>
            <InfoGrid items={[
              { label: fr ? "Nom" : "Name", value: <Link href={`/shop/products/${ret.productId}`} className="text-[var(--primary)] hover:underline">{ret.product}</Link> },
              { label: fr ? "Variante" : "Variant", value: ret.variant },
              { label: fr ? "Quantité" : "Quantity", value: ret.qty },
            ]} />
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Remboursement" : "Refund"}>
          <InfoGrid items={[
            { label: fr ? "Montant" : "Amount", value: formatCurrency(ret.refund.amount, locale) },
            { label: fr ? "Méthode" : "Method", value: ret.refund.method },
            { label: fr ? "Statut" : "Status", value: ret.refund.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Inspection" : "Inspection"} span={2}>
          <InfoGrid items={[
            { label: fr ? "État" : "Condition", value: ret.inspection.condition },
            { label: fr ? "Photos" : "Photos", value: `${ret.inspection.photos} ${fr ? "téléversée(s)" : "uploaded"}` },
            { label: fr ? "Notes" : "Notes", value: ret.inspection.notes, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline events={ret.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
