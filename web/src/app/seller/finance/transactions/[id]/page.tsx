"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getTransaction } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerTransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const txn = getTransaction(id);

  if (!txn) return <div className="p-8 text-center text-slate-500">Transaction not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={txn.id} subtitle={txn.order} backHref="/seller/finance/transactions" />
      <DetailSection title="Transaction">
        <InfoGrid items={[
          { label: "Order", value: <Link href={`/seller/orders/${txn.order}`} className="text-sky-600 hover:underline">{txn.order}</Link> },
          { label: "Customer", value: txn.customer },
          { label: "Gross", value: formatCurrency(txn.grossAmount, locale) },
          { label: "Commission", value: formatCurrency(txn.commission, locale) },
          { label: "Net", value: formatCurrency(txn.netAmount, locale) },
          { label: "Status", value: <Badge variant="success">{txn.status}</Badge> },
          { label: "Date", value: txn.date },
        ]} />
      </DetailSection>
    </div>
  );
}
