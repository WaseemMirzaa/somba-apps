"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getWalletTransaction } from "@/lib/shared-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const TYPE_LABELS: Record<string, string> = {
  cashback: "Cashback",
  debit: "Payment",
  topup: "Top-up",
  refund: "Refund",
  withdrawal: "Withdrawal",
};

export default function WalletTransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const tx = getWalletTransaction(id);

  if (!tx) return <div className="text-center text-slate-500">Transaction not found</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={tx.id} subtitle={tx.desc} backHref="/shop/wallet" />
      <DetailSection title="Transaction">
        <InfoGrid items={[
          { label: "Type", value: <Badge variant={tx.amount > 0 ? "success" : "danger"}>{TYPE_LABELS[tx.type] ?? tx.type}</Badge> },
          { label: "Amount", value: <span className={tx.amount > 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount, locale)}</span> },
          { label: "Date", value: tx.date },
          { label: "Balance after", value: formatCurrency(tx.balanceAfter, locale) },
          ...(tx.method ? [{ label: "Method", value: tx.method }] : []),
          ...(tx.orderId ? [{ label: "Order", value: <Link href={`/shop/orders/${tx.orderId}`} className="text-blue-600 hover:underline">{tx.orderId}</Link> }] : []),
          ...(tx.returnId ? [{ label: "Return", value: <Link href={`/shop/returns/${tx.returnId}`} className="text-blue-600 hover:underline">{tx.returnId}</Link> }] : []),
        ]} />
      </DetailSection>
    </div>
  );
}
