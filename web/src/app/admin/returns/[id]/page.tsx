"use client";

import { localDay, localDateTime } from "@/lib/dates";
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
import { DISPUTE_STATUS_BADGE, DISPUTE_STATUS_LABEL, orderStatusLabel, type DisputeRow } from "@/lib/admin-live";

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const rt = useRealtime();
  const { getOrder } = useAdminData();
  const { locale } = useLocale();
  const fr = locale === "fr";

  const ret = (rt.disputes as DisputeRow[]).find((d) => (d.id === id || d.reference === id) && d.type === "return");
  const order = ret ? getOrder(ret.orderId) : undefined;

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Retour introuvable" : "Return not found"}</div>;
  }
  const statusLabel = DISPUTE_STATUS_LABEL[ret.status]?.[fr ? "fr" : "en"] ?? ret.status;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.reference}
        subtitle={`${localDay(ret.createdAt)} · ${statusLabel} · ${ret.orderReference}`}
        backHref="/admin/returns"
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Retours" : "Returns", href: "/admin/returns" }, { label: ret.reference }]}
        actions={<Badge variant={DISPUTE_STATUS_BADGE[ret.status] ?? "default"}>{statusLabel}</Badge>}
      />

      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{fr ? "Motif du retour" : "Return reason"}</p>
            <p className="mt-1 whitespace-pre-wrap text-lg font-bold text-amber-950">{ret.reason}</p>
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Retour" : "Return"}>
          <InfoGrid items={[
            { label: fr ? "Référence" : "Reference", value: ret.reference },
            { label: fr ? "Demandé le" : "Requested", value: localDateTime(ret.createdAt) },
            { label: fr ? "Statut" : "Status", value: statusLabel },
            { label: fr ? "Reçu à l'entrepôt" : "Received at warehouse", value: ret.receivedAt ? localDateTime(ret.receivedAt) : (fr ? "Pas encore" : "Not yet") },
            ...(ret.resolution ? [{ label: fr ? "Décision" : "Resolution", value: ret.resolution, full: true }] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid items={[
            { label: fr ? "Commande" : "Order", value: <Link href={`/admin/orders/${ret.orderId}`} className="text-[var(--primary)] hover:underline">{ret.orderReference}</Link> },
            ...(order ? [
              { label: fr ? "Statut de la commande" : "Order status", value: orderStatusLabel(order.status, fr) },
              { label: fr ? "Montant" : "Amount", value: formatCurrency(order.amount, locale) },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Client" : "Customer"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: <Link href={`/admin/customers/${ret.customerId}`} className="text-[var(--primary)] hover:underline">{ret.customerName}</Link> },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Actions" : "Actions"} span={3}>
          <DisputeActions dispute={ret} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
