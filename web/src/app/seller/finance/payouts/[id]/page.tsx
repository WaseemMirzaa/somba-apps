"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getPayout } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const payout = getPayout(id);

  if (!payout) {
    return <div className="p-8 text-center text-slate-500">Payout not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={payout.id}
        subtitle={`${formatCurrency(payout.amount, locale)} · ${payout.status}`}
        backHref="/seller/finance/payouts"
        actions={<Badge variant={payout.status === "paid" ? "success" : "warning"}>{payout.status}</Badge>}
      />

      <DetailSection title="Payout Details">
        <InfoGrid items={[
          { label: "Request ID", value: payout.id },
          { label: t("amount"), value: formatCurrency(payout.amount, locale) },
          { label: "Bank Account", value: payout.bankAccount },
          { label: "Method", value: payout.method },
          { label: "Approved By", value: payout.approvedBy },
          { label: t("status"), value: payout.status },
          { label: t("date"), value: payout.date },
        ]} />
      </DetailSection>
    </div>
  );
}
