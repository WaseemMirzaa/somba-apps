"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisputeChat } from "@/components/disputes/dispute-chat";
import { useDisputes } from "@/context/dispute-context";
import { useToast } from "@/context/toast-context";
import { getOrder } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const REASON_LABELS: Record<string, string> = {
  not_as_described: "Not as described",
  defective: "Defective product",
  wrong_item: "Wrong item received",
  missing_parts: "Missing parts",
  late_delivery: "Late delivery",
};

function formatDisputeStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function disputeStatusVariant(status: string): "success" | "warning" | "info" | "default" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "seller_responded") return "info";
  return "warning";
}

export default function AdminDisputeResolutionPage() {
  const { id } = useParams<{ id: string }>();
  const { getDispute, addMessage, resolveDispute } = useDisputes();
  const { toast } = useToast();
  const { locale } = useLocale();
  const [resolvedAs, setResolvedAs] = useState<"buyer" | "seller" | null>(null);

  const dispute = getDispute(id);
  const order = dispute ? getOrder(dispute.orderId) : undefined;

  if (!dispute) {
    return <div className="p-8 text-center text-slate-500">Dispute not found</div>;
  }

  const reasonLabel = REASON_LABELS[dispute.reason] ?? dispute.reason.replace(/_/g, " ");
  const isClosed = dispute.status === "resolved" || dispute.status === "closed" || resolvedAs !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dispute.id}
        subtitle={`${dispute.createdAt} · ${formatDisputeStatus(dispute.status)} · ${dispute.orderId}`}
        backHref="/admin/disputes"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Disputes", href: "/admin/disputes" },
          { label: dispute.id },
        ]}
        actions={<Badge variant={disputeStatusVariant(dispute.status)}>{formatDisputeStatus(dispute.status)}</Badge>}
      />

      <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Dispute reason</p>
            <p className="mt-1 text-xl font-bold text-red-950">{reasonLabel}</p>
            <p className="mt-2 text-sm leading-relaxed text-red-900/80">{dispute.description}</p>
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title="Dispute Information">
          <InfoGrid items={[
            { label: "Dispute ID", value: dispute.id },
            { label: "Opened", value: dispute.createdAt },
            { label: "Status", value: formatDisputeStatus(dispute.status) },
            { label: "Reason", value: <span className="font-semibold text-red-700">{reasonLabel}</span> },
            { label: "Description", value: dispute.description, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Linked Order">
          <InfoGrid items={[
            { label: "Order ID", value: <Link href={`/admin/orders/${dispute.orderId}`} className="text-[var(--primary)] hover:underline">{dispute.orderId}</Link> },
            ...(order ? [
              { label: "Order Date", value: order.date },
              { label: "Order Status", value: order.status },
              { label: "Order Amount", value: formatCurrency(order.amount, locale) },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Buyer">
          <InfoGrid items={[
            { label: "Name", value: order
              ? <Link href={`/admin/customers/${order.customerId}`} className="text-[var(--primary)] hover:underline">{dispute.buyerName}</Link>
              : dispute.buyerName },
            { label: "Buyer ID", value: dispute.buyerId },
            ...(order ? [
              { label: "Phone", value: order.customerPhone },
              { label: "Address", value: order.customerAddress, full: true },
              { label: "City", value: order.customerCity },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Seller">
          <InfoGrid items={[
            { label: "Store", value: <Link href={`/admin/sellers/${dispute.sellerId}`} className="text-[var(--primary)] hover:underline">{dispute.sellerName}</Link> },
            { label: "Seller ID", value: dispute.sellerId },
            ...(order ? [
              { label: "Seller Earnings", value: formatCurrency(order.sellerEarnings, locale) },
              { label: "Commission", value: formatCurrency(order.commission, locale) },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Disputed Product">
          <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              <Image src={dispute.productImage} alt={dispute.productName} fill className="object-cover" sizes="64px" />
            </div>
            <div className="flex-1">
              <Link href={`/shop/products/${dispute.productId}`} className="font-medium text-[var(--primary)] hover:underline">
                {dispute.productName}
              </Link>
              {dispute.variant && <p className="text-xs text-slate-500">Variant: {dispute.variant}</p>}
              <p className="mt-1 text-sm font-medium text-red-700">Dispute: {reasonLabel}</p>
            </div>
            {order?.items[0] && (
              <div className="text-right">
                <p className="font-medium">{formatCurrency(order.items[0].price, locale)}</p>
                <p className="text-xs text-slate-500">Qty: {order.items[0].qty}</p>
              </div>
            )}
          </div>
        </DetailGridSection>

        <DetailGridSection title="Warehouse & Logistics">
          <InfoGrid items={[
            { label: "Warehouse", value: <Link href="/warehouse" className="text-[var(--primary)] hover:underline">{dispute.warehouse}</Link> },
            { label: "Hub ID", value: dispute.warehouseHub },
            { label: "Ops Contact", value: dispute.warehouseContact },
            ...(order ? [
              { label: "Rider", value: order.rider },
              { label: "Tracking", value: order.trackingNumber },
            ] : []),
          ]} />
        </DetailGridSection>

        {order && (
          <DetailGridSection title="Payment">
            <InfoGrid items={[
              { label: "Gateway", value: order.paymentMethod === "COD" ? (locale === "fr" ? "Paiement à la livraison" : "Pay at delivery") : "Stripe" },
              { label: "Transaction ID", value: order.transactionId },
              { label: "Payment Status", value: order.paymentStatus },
              { label: "Amount", value: formatCurrency(order.amount, locale) },
            ]} />
          </DetailGridSection>
        )}

        <DetailGridSection title="Dispute chat" span={3}>
          <DisputeChat
            messages={dispute.messages}
            disabled={isClosed}
            onSend={(text) => {
              addMessage(id, "admin", text);
              toast("Message sent");
            }}
          />

          <div className="mt-4 flex flex-wrap gap-3">
            {resolvedAs ? (
              <p className="text-sm font-medium text-emerald-600">
                Resolved — favor {resolvedAs === "buyer" ? "buyer" : "seller"}
              </p>
            ) : (
              <>
                <Button
                  className="ml-1"
                  onClick={() => {
                    resolveDispute(id);
                    setResolvedAs("buyer");
                    toast("Dispute resolved — favor buyer");
                  }}
                >
                  Resolve — Favor Buyer
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    resolveDispute(id);
                    setResolvedAs("seller");
                    toast("Dispute resolved — favor seller");
                  }}
                >
                  Resolve — Favor Seller
                </Button>
              </>
            )}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
