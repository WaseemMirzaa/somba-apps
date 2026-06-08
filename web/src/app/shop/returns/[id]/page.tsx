"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { getReturn } from "@/lib/shared-entities";
import { useLocale } from "@/context/locale-context";

const STATUS_LABELS: Record<string, { en: string; fr: string }> = {
  requested: { en: "Requested", fr: "Demandé" },
  approved: { en: "Approved — pickup scheduled", fr: "Approuvé — enlèvement planifié" },
  in_transit: { en: "In transit", fr: "En transit" },
  received: { en: "Received at warehouse", fr: "Reçu à l'entrepôt" },
  refunded: { en: "Refunded", fr: "Remboursé" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};

export default function ReturnStatusPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const ret = getReturn(id);
  const fr = locale === "fr";

  if (!ret) return <div className="text-center text-slate-500">Return not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={ret.id} subtitle={ret.orderId} backHref="/shop/orders" />
      <DetailSection title={fr ? "Statut du retour" : "Return Status"}>
        <InfoGrid items={[
          { label: fr ? "Statut" : "Status", value: fr ? STATUS_LABELS[ret.status]?.fr : STATUS_LABELS[ret.status]?.en },
          { label: fr ? "Raison" : "Reason", value: ret.reason },
          { label: fr ? "Articles" : "Items", value: ret.items.join(", "), full: true },
          ...(ret.refundAmount ? [{ label: fr ? "Remboursement" : "Refund", value: <DualCurrency amount={ret.refundAmount} /> }] : []),
        ]} />
        <Link href={`/shop/orders/${ret.orderId}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          {fr ? "Voir commande →" : "View order →"}
        </Link>
      </DetailSection>
    </div>
  );
}
