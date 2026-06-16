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
  const ret = getReturn(id);
  const order = ret ? getOrder(ret.orderId) : undefined;

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">Return not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={`${ret.createdAt} · ${formatReturnStatus(ret.status)} · ${formatCurrency(ret.refund.amount, locale)}`}
        backHref="/admin/returns"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("returns"), href: "/admin/returns" },
          { label: ret.id },
        ]}
        actions={<Badge variant={returnStatusVariant(ret.status)}>{formatReturnStatus(ret.status)}</Badge>}
      />

      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("returnReason")}</p>
            <p className="mt-1 text-xl font-bold text-amber-950">{ret.reason}</p>
            {ret.customerComment && (
              <p className="mt-2 text-sm leading-relaxed text-amber-900/80">{ret.customerComment}</p>
            )}
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title="Return Request">
          <InfoGrid items={[
            { label: "Return ID", value: ret.id },
            { label: "Requested", value: ret.createdAt },
            { label: "Type", value: ret.returnType.charAt(0).toUpperCase() + ret.returnType.slice(1) },
            { label: "Status", value: formatReturnStatus(ret.status) },
            { label: "Reason", value: <span className="font-semibold text-amber-700">{ret.reason}</span> },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Linked Order">
          <InfoGrid items={[
            { label: "Order ID", value: <Link href={`/admin/orders/${ret.orderId}`} className="text-[var(--primary)] hover:underline">{ret.orderId}</Link> },
            ...(order ? [
              { label: "Order Date", value: order.date },
              { label: "Order Amount", value: formatCurrency(order.amount, locale) },
              { label: "Original Status", value: order.status },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Customer">
          <InfoGrid items={[
            { label: "Name", value: <Link href={`/admin/customers/${ret.customerId}`} className="text-[var(--primary)] hover:underline">{ret.customer}</Link> },
            ...(order ? [
              { label: "Phone", value: order.customerPhone },
              { label: "Address", value: order.customerAddress, full: true },
              { label: "City", value: order.customerCity },
            ] : [{ label: "Customer ID", value: ret.customerId }]),
          ]} />
        </DetailGridSection>

        {order && (
          <DetailGridSection title="Seller">
            <InfoGrid items={[
              { label: "Store", value: <Link href={`/admin/sellers/${order.sellerId}`} className="text-[var(--primary)] hover:underline">{order.seller}</Link> },
              { label: "Seller ID", value: order.sellerId },
            ]} />
          </DetailGridSection>
        )}

        <DetailGridSection title="Refund">
          <InfoGrid items={[
            { label: "Amount", value: formatCurrency(ret.refund.amount, locale) },
            { label: "Method", value: ret.refund.method },
            { label: "Status", value: ret.refund.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Inspection">
          <InfoGrid items={[
            { label: "Condition", value: ret.inspection.condition },
            { label: "Photos", value: `${ret.inspection.photos} uploaded` },
            { label: "Notes", value: ret.inspection.notes, full: true },
          ]} />
          <Link href={`/warehouse/returns/${ret.id}`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
            Warehouse inspection queue →
          </Link>
        </DetailGridSection>

        {order && (
          <DetailGridSection title="Payment">
            <InfoGrid items={[
              { label: "Gateway", value: order.paymentMethod === "COD" ? (locale === "fr" ? "Paiement à la livraison" : "Pay at delivery") : "Stripe" },
              { label: "Transaction ID", value: order.transactionId },
              { label: "Payment Status", value: order.paymentStatus },
              { label: "Order Amount", value: formatCurrency(order.amount, locale) },
            ]} />
          </DetailGridSection>
        )}

        {order && (
          <DetailGridSection title="Logistics">
            <InfoGrid items={[
              { label: "Warehouse", value: <Link href="/warehouse" className="text-[var(--primary)] hover:underline">{order.warehouse}</Link> },
              { label: "Rider", value: order.rider },
              { label: "Tracking Number", value: order.trackingNumber },
            ]} />
          </DetailGridSection>
        )}

        <DetailGridSection title="Returned Product" span={3}>
          <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-lg">
              <Image src={ret.image} alt={ret.product} fill className="object-cover" sizes="64px" />
            </div>
            <div className="flex-1">
              <Link href={`/shop/products/${ret.productId}`} className="font-medium text-[var(--primary)] hover:underline">{ret.product}</Link>
              <p className="text-xs text-slate-500">Variant: {ret.variant}</p>
              <p className="mt-1 text-sm font-medium text-amber-700">Return reason: {ret.reason}</p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatCurrency(ret.refund.amount, locale)}</p>
              <p className="text-xs text-slate-500">Qty: {ret.qty}</p>
            </div>
          </div>
        </DetailGridSection>

        <DetailGridSection title="Return Timeline" span={3}>
          <ActivityTimeline
            events={ret.timeline.map((event) => ({
              time: event.time,
              label: event.label,
              done: event.done,
              detail: event.highlight ? `Reason: ${ret.reason}` : event.detail,
            }))}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
