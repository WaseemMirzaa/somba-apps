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
import { getOrder } from "@/lib/entities";
import { getReturn } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const RETURN_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  pending_inspection: "Inspection en attente",
  inspecting: "Inspection en cours",
  approved: "Approuvé",
  rejected: "Rejeté",
  refunded: "Remboursé",
};

const REFUND_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  completed: "Terminé",
  processing: "En cours",
  refunded: "Remboursé",
};

const ORDER_STATUS_FR: Record<string, string> = {
  pending: "En attente",
  processing: "En traitement",
  delivered: "Livré",
  cancelled: "Annulé",
  shipped: "Expédié",
};

const PAYMENT_STATUS_FR: Record<string, string> = {
  paid: "Payé",
  refunded: "Remboursé",
  pending: "En attente",
};

const CONDITION_FR: Record<string, string> = {
  Good: "Bon",
  Damaged: "Endommagé",
  Defective: "Défectueux",
};

const RETURN_TYPE_FR: Record<string, string> = {
  refund: "Remboursement",
  replacement: "Remplacement",
  exchange: "Échange",
};

const TIMELINE_LABEL_FR: Record<string, string> = {
  "Order Delivered": "Commande livrée",
  "Return Requested": "Retour demandé",
  "Return Approved": "Retour approuvé",
  "Pickup Scheduled": "Enlèvement planifié",
  "Pickup Completed": "Enlèvement effectué",
  "In Transit to Warehouse": "En transit vers l'entrepôt",
  "Received at Warehouse": "Reçu à l'entrepôt",
  "Inspecting": "Inspection en cours",
  "Inspection Passed": "Inspection réussie",
  "Refund Processed": "Remboursement traité",
};

function formatReturnStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function returnStatusVariant(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "refunded" || status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status.includes("inspect")) return "info";
  return "warning";
}

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ret = getReturn(id);
  const order = ret ? getOrder(ret.orderId) : undefined;

  const returnStatusLabel = (status: string) =>
    fr ? (RETURN_STATUS_FR[status] ?? formatReturnStatus(status)) : formatReturnStatus(status);

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Retour introuvable" : "Return not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={`${ret.createdAt} · ${returnStatusLabel(ret.status)} · ${formatCurrency(ret.refund.amount, locale)}`}
        backHref="/admin/returns"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("returns"), href: "/admin/returns" },
          { label: ret.id },
        ]}
        actions={<Badge variant={returnStatusVariant(ret.status)}>{returnStatusLabel(ret.status)}</Badge>}
      />

      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("returnReason")}</p>
            <p className="mt-1 text-xl font-bold text-amber-950">{fr ? ret.reasonFr : ret.reason}</p>
            {ret.customerComment && (
              <p className="mt-2 text-sm leading-relaxed text-amber-900/80">{fr ? (ret.customerCommentFr ?? ret.customerComment) : ret.customerComment}</p>
            )}
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Demande de retour" : "Return Request"}>
          <InfoGrid items={[
            { label: fr ? "ID retour" : "Return ID", value: ret.id },
            { label: fr ? "Demandé le" : "Requested", value: ret.createdAt },
            { label: "Type", value: fr ? (RETURN_TYPE_FR[ret.returnType] ?? ret.returnType) : ret.returnType.charAt(0).toUpperCase() + ret.returnType.slice(1) },
            { label: fr ? "Statut" : "Status", value: returnStatusLabel(ret.status) },
            { label: fr ? "Motif" : "Reason", value: <span className="font-semibold text-amber-700">{fr ? ret.reasonFr : ret.reason}</span> },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande liée" : "Linked Order"}>
          <InfoGrid items={[
            { label: fr ? "ID commande" : "Order ID", value: <Link href={`/admin/orders/${ret.orderId}`} className="text-[var(--primary)] hover:underline">{ret.orderId}</Link> },
            ...(order ? [
              { label: fr ? "Date de commande" : "Order Date", value: order.date },
              { label: fr ? "Montant de la commande" : "Order Amount", value: formatCurrency(order.amount, locale) },
              { label: fr ? "Statut initial" : "Original Status", value: fr ? (ORDER_STATUS_FR[order.status] ?? order.status) : order.status },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Client" : "Customer"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: <Link href={`/admin/customers/${ret.customerId}`} className="text-[var(--primary)] hover:underline">{ret.customer}</Link> },
            ...(order ? [
              { label: fr ? "Téléphone" : "Phone", value: order.customerPhone },
              { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
              { label: fr ? "Ville" : "City", value: order.customerCity },
            ] : [{ label: fr ? "ID client" : "Customer ID", value: ret.customerId }]),
          ]} />
        </DetailGridSection>

        {order && (
          <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
            <InfoGrid items={[
              { label: fr ? "Boutique" : "Store", value: <Link href={`/admin/sellers/${order.sellerId}`} className="text-[var(--primary)] hover:underline">{order.seller}</Link> },
              { label: fr ? "ID vendeur" : "Seller ID", value: order.sellerId },
            ]} />
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Remboursement" : "Refund"}>
          <InfoGrid items={[
            { label: fr ? "Montant" : "Amount", value: formatCurrency(ret.refund.amount, locale) },
            { label: fr ? "Méthode" : "Method", value: fr ? (ret.refund.methodFr ?? ret.refund.method) : ret.refund.method },
            { label: fr ? "Statut" : "Status", value: fr ? (ret.refund.statusFr ?? REFUND_STATUS_FR[ret.refund.status] ?? ret.refund.status) : ret.refund.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Inspection">
          <InfoGrid items={[
            { label: fr ? "État" : "Condition", value: fr ? (ret.inspection.conditionFr ?? CONDITION_FR[ret.inspection.condition] ?? ret.inspection.condition) : ret.inspection.condition },
            { label: "Photos", value: fr ? `${ret.inspection.photos} téléversée(s)` : `${ret.inspection.photos} uploaded` },
            { label: "Notes", value: fr ? (ret.inspection.notesFr ?? ret.inspection.notes) : ret.inspection.notes, full: true },
          ]} />
          <Link href={`/warehouse/returns/${ret.id}`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
            {fr ? "File d'inspection de l'entrepôt →" : "Warehouse inspection queue →"}
          </Link>
        </DetailGridSection>

        {order && (
          <DetailGridSection title={fr ? "Paiement" : "Payment"}>
            <InfoGrid items={[
              { label: fr ? "Passerelle" : "Gateway", value: order.paymentMethod === "COD" ? (locale === "fr" ? "Paiement à la livraison" : "Pay at delivery") : "Stripe" },
              { label: fr ? "ID de transaction" : "Transaction ID", value: order.transactionId },
              { label: fr ? "Statut du paiement" : "Payment Status", value: fr ? (PAYMENT_STATUS_FR[order.paymentStatus] ?? order.paymentStatus) : order.paymentStatus },
              { label: fr ? "Montant de la commande" : "Order Amount", value: formatCurrency(order.amount, locale) },
            ]} />
          </DetailGridSection>
        )}

        {order && (
          <DetailGridSection title={fr ? "Logistique" : "Logistics"}>
            <InfoGrid items={[
              { label: fr ? "Entrepôt" : "Warehouse", value: <Link href="/warehouse" className="text-[var(--primary)] hover:underline">{order.warehouse}</Link> },
              { label: fr ? "Livreur" : "Rider", value: order.rider },
              { label: fr ? "Numéro de suivi" : "Tracking Number", value: order.trackingNumber },
            ]} />
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Produit retourné" : "Returned Product"} span={3}>
          <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-lg">
              <Image src={ret.image} alt={ret.product} fill className="object-cover" sizes="64px" />
            </div>
            <div className="flex-1">
              <Link href={`/shop/products/${ret.productId}`} className="font-medium text-[var(--primary)] hover:underline">{ret.product}</Link>
              <p className="text-xs text-slate-500">{fr ? "Variante" : "Variant"}: {fr ? (ret.variantFr ?? ret.variant) : ret.variant}</p>
              <p className="mt-1 text-sm font-medium text-amber-700">{fr ? "Motif du retour" : "Return reason"}: {fr ? ret.reasonFr : ret.reason}</p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatCurrency(ret.refund.amount, locale)}</p>
              <p className="text-xs text-slate-500">{fr ? "Qté" : "Qty"}: {ret.qty}</p>
            </div>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie du retour" : "Return Timeline"} span={3}>
          <ActivityTimeline
            events={ret.timeline.map((event) => ({
              time: event.time,
              label: fr ? (TIMELINE_LABEL_FR[event.label] ?? event.label) : event.label,
              done: event.done,
              detail: event.highlight
                ? `${fr ? "Motif" : "Reason"}: ${fr ? ret.reasonFr : ret.reason}`
                : (fr ? (event.detailFr ?? event.detail) : event.detail),
            }))}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
