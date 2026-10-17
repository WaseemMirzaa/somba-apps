"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useSellerData } from "@/lib/seller";
import { caseStatusLabel, caseStatusVariant } from "@/lib/seller-labels";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";

export default function SellerDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { sellerDisputeList, load } = useSellerData();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const dispute = sellerDisputeList.find((d) => d.id === id || d.disputeId === id);

  if (!dispute) return <MissingRecord load={load} label="Dispute not found" labelFr="Litige introuvable" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dispute.id}
        subtitle={dispute.orderId}
        backHref="/seller/disputes"
        actions={<Badge variant={caseStatusVariant(dispute.status)}>{caseStatusLabel(dispute.status, fr)}</Badge>}
      />
      <DetailSection title={fr ? "Détails" : "Details"}>
        <InfoGrid items={[
          { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${dispute.orderId}`} className="text-[var(--primary)] hover:underline">{dispute.orderId}</Link> },
          { label: fr ? "Client" : "Customer", value: dispute.customer },
          { label: "Date", value: dispute.date },
          { label: fr ? "Motif" : "Reason", value: dispute.reason, full: true },
          ...(dispute.resolution ? [{ label: fr ? "Décision" : "Resolution", value: dispute.resolution, full: true }] : []),
        ]} />
        <p className="mt-4 text-xs text-slate-500">
          {fr ? "Le serveur ne permet pas encore au vendeur de répondre à un litige : écrivez au support." : "The server does not let sellers reply to a dispute yet: write to support."}
        </p>
        <Link href="/seller/support" className="mt-2 inline-block text-sm text-[var(--primary)] hover:underline">
          {fr ? "Contacter le support" : "Contact support"}
        </Link>
      </DetailSection>
    </div>
  );
}
