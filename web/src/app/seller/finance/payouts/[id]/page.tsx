"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPayout } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const payout = getPayout(id);
  const [status, setStatus] = useState<"paid" | "pending" | "rejected">(payout?.status ?? "pending");

  if (!payout) {
    return <div className="p-8 text-center text-slate-500">Payout not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={payout.id}
        subtitle={`${formatCurrency(payout.amount, locale)} · ${status}`}
        backHref="/seller/finance/payouts"
        actions={<Badge variant={status === "paid" ? "success" : status === "rejected" ? "danger" : "warning"}>{status}</Badge>}
      />

      <DetailSection title="Payout Details">
        <InfoGrid items={[
          { label: "Request ID", value: payout.id },
          { label: t("amount"), value: formatCurrency(payout.amount, locale) },
          { label: "Bank Account", value: payout.bankAccount },
          { label: "Method", value: payout.method },
          { label: "Approved By", value: payout.approvedBy },
          { label: t("date"), value: payout.date },
        ]} />
        {status === "rejected" && payout.rejectionReason && (
          <p className="mt-4 text-sm text-red-600">Rejection reason: {payout.rejectionReason}</p>
        )}
      </DetailSection>

      <DetailSection title="Linked Transactions">
        <div className="space-y-2">
          {payout.linkedTransactions.map((txnId) => (
            <Link key={txnId} href={`/seller/finance/transactions/${txnId}`} className="block text-sm text-sky-600 hover:underline">{txnId}</Link>
          ))}
        </div>
      </DetailSection>

      {status === "pending" && (
        <Button variant="secondary" onClick={() => { setStatus("rejected"); toast("Payout request cancelled"); }}>Cancel Request</Button>
      )}
    </div>
  );
}
