"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { useAdminData } from "@/lib/admin";
import { useRealtime } from "@/context/realtime-context";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  DISPUTE_STATUS_BADGE,
  DISPUTE_STATUS_LABEL,
  DISPUTE_TYPE_LABEL,
  orderStatusLabel,
  type DisputeRow,
} from "@/lib/admin-live";

export default function AdminDisputeResolutionPage() {
  const { id } = useParams<{ id: string }>();
  const rt = useRealtime();
  const { getOrder } = useAdminData();
  const { locale } = useLocale();
  const fr = locale === "fr";

  const dispute = (rt.disputes as DisputeRow[]).find((d) => d.id === id || d.reference === id);
  const order = dispute ? getOrder(dispute.orderId) : undefined;

  if (!dispute) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Litige introuvable" : "Dispute not found"}</div>;
  }

  const statusLabel = DISPUTE_STATUS_LABEL[dispute.status]?.[fr ? "fr" : "en"] ?? dispute.status;
  const typeLabel = DISPUTE_TYPE_LABEL[dispute.type]?.[fr ? "fr" : "en"] ?? dispute.type;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dispute.reference}
        subtitle={`${dispute.createdAt.slice(0, 10)} · ${typeLabel} · ${statusLabel} · ${dispute.orderReference}`}
        backHref="/admin/disputes"
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: fr ? "Litiges" : "Disputes", href: "/admin/disputes" },
          { label: dispute.reference },
        ]}
        actions={<Badge variant={DISPUTE_STATUS_BADGE[dispute.status] ?? "default"}>{statusLabel}</Badge>}
      />

      <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">
              {dispute.type === "return" ? (fr ? "Motif du retour" : "Return reason") : fr ? "Motif du litige" : "Dispute reason"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-lg font-bold text-red-950">{dispute.reason}</p>
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations" : "Information"}>
          <InfoGrid items={[
            { label: fr ? "Référence" : "Reference", value: dispute.reference },
            { label: "Type", value: typeLabel },
            { label: fr ? "Ouvert le" : "Opened", value: dispute.createdAt.slice(0, 16).replace("T", " ") },
            { label: fr ? "Statut" : "Status", value: statusLabel },
            ...(dispute.type === "return"
              ? [{ label: fr ? "Marchandise reçue" : "Goods received", value: dispute.receivedAt ? dispute.receivedAt.slice(0, 16).replace("T", " ") : (fr ? "Pas encore" : "Not yet") }]
              : []),
            ...(dispute.resolution ? [{ label: fr ? "Décision" : "Resolution", value: dispute.resolution, full: true }] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande liée" : "Linked order"}>
          <InfoGrid items={[
            { label: fr ? "Commande" : "Order", value: <Link href={`/admin/orders/${dispute.orderId}`} className="text-[var(--primary)] hover:underline">{dispute.orderReference}</Link> },
            ...(order ? [
              { label: fr ? "Date de commande" : "Order date", value: order.date },
              { label: fr ? "Statut de la commande" : "Order status", value: orderStatusLabel(order.status, fr) },
              { label: fr ? "Montant" : "Amount", value: formatCurrency(order.amount, locale) },
              { label: fr ? "Articles" : "Items", value: order.itemsCount },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Client" : "Customer"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: <Link href={`/admin/customers/${dispute.customerId}`} className="text-[var(--primary)] hover:underline">{dispute.customerName}</Link> },
            ...(order ? [
              { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
              { label: fr ? "Ville" : "City", value: order.customerCity },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Décision" : "Decision"} span={3}>
          <DisputeActions dispute={dispute} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
