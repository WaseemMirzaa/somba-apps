"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getAdminFinanceTransaction } from "@/lib/admin-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function AdminFinanceTransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const txn = getAdminFinanceTransaction(id);

  if (!txn) return <div className="p-8 text-center text-slate-500">Transaction not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={txn.id} subtitle={txn.type} backHref="/admin/finance" actions={<Badge variant={txn.status === "completed" ? "success" : "warning"}>{txn.status}</Badge>} />
      <DetailSection title="Transaction">
        <InfoGrid items={[
          { label: "Type", value: txn.type },
          { label: "Amount", value: <span className={txn.amount < 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>{formatCurrency(Math.abs(txn.amount), locale)}</span> },
          { label: "Reference", value: txn.reference },
          { label: "Date", value: txn.date },
          ...(txn.orderId ? [{ label: "Order", value: <Link href={`/admin/orders/${txn.orderId}`} className="text-blue-600 hover:underline">{txn.orderId}</Link> }] : []),
          ...(txn.payoutId ? [{ label: "Payout", value: <Link href={`/admin/payouts/${txn.payoutId}`} className="text-blue-600 hover:underline">{txn.payoutId}</Link> }] : []),
          ...("orderId" in txn && txn.type === "Refund" ? [{ label: "Refund", value: <Link href="/admin/refunds/REF-002" className="text-blue-600 hover:underline">REF-002</Link> }] : []),
          ...(txn.codId ? [{ label: "COD", value: <Link href={`/admin/fulfillment/cod/${txn.codId}`} className="text-blue-600 hover:underline">{txn.codId}</Link> }] : []),
        ]} />
      </DetailSection>
    </div>
  );
}
