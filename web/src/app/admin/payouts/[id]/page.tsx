"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { getAdminPayout } from "@/lib/shared-entities";
import { useToast } from "@/context/toast-context";

export default function AdminPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const payout = getAdminPayout(id);
  const [status, setStatus] = useState(payout?.status ?? "requested");

  if (!payout) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={payout.id}
        subtitle={t("payoutDetail")}
        backHref="/admin/payouts"
        actions={<Badge variant={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{statusLabel(locale, status)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={t("payoutDetail")}>
          <InfoGrid items={[
            { label: t("seller"), value: <Link href={`/admin/sellers/${payout.sellerId}`} className="text-blue-600 hover:underline">{payout.seller}</Link> },
            { label: t("amount"), value: <DualCurrency amount={payout.amount} /> },
            { label: t("bankAccount"), value: payout.bankAccount ?? "—" },
            { label: t("requested"), value: payout.requestedAt },
          ]} />
          {status === "requested" && (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => { setStatus("approved"); toast(t("approved")); }}>{t("approve")}</Button>
              <Button variant="secondary" onClick={() => { setStatus("rejected"); toast(t("rejected")); }}>{t("reject")}</Button>
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
