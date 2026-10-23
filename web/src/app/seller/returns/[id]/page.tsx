"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useSellerData } from "@/lib/seller";
import { caseStatusLabel, caseStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";

export default function SellerReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { getSellerReturn, load } = useSellerData();
  const ret = getSellerReturn(id);

  if (!ret) return <MissingRecord load={load} label="Return not found" labelFr="Retour introuvable" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={`${fr ? "Commande" : "Order"} ${ret.orderId} · ${ret.reason}`}
        backHref="/seller/returns"
        actions={<Badge variant={caseStatusVariant(ret.status)}>{caseStatusLabel(ret.status, fr)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid items={[
            { label: fr ? "N° retour" : "Return ID", value: ret.id },
            { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${ret.orderId}`} className="text-[var(--primary)] hover:underline">{ret.orderId}</Link> },
            { label: t("customer"), value: ret.customer },
            { label: fr ? "Date" : "Date", value: ret.date },
            { label: fr ? "Statut" : "Status", value: caseStatusLabel(ret.status, fr) },
            { label: fr ? "Montant de la commande" : "Order amount", value: ret.amount > 0 ? formatCurrency(ret.amount, locale) : "—" },
            { label: fr ? "Motif" : "Reason", value: ret.reason, full: true },
            ...(ret.resolution ? [{ label: fr ? "Décision" : "Resolution", value: ret.resolution, full: true }] : []),
          ]} />
        </DetailGridSection>
      </DetailGrid>
      <p className="text-xs text-slate-500">
        {fr
          ? "L'inspection et le remboursement sont gérés par l'entrepôt et l'administration. Vous recevez une notification à l'ouverture du retour, à l'arrivée des articles à l'entrepôt et à la décision."
          : "Inspection and refund are handled by the warehouse and the administration. You get a notification when the return is opened, when the goods reach the warehouse and when it is decided."}
      </p>
    </div>
  );
}
