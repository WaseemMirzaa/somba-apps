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
import { getRefund } from "@/lib/shared-entities";
import { useToast } from "@/context/toast-context";

export default function AdminRefundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const refund = getRefund(id);
  const [status, setStatus] = useState(refund?.status ?? "pending");

  if (!refund) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={refund.id}
        subtitle={t("refundAuthorisation")}
        backHref="/admin/refunds"
        actions={<Badge variant={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{statusLabel(locale, status)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={t("refundDetail")}>
          <InfoGrid items={[
            { label: t("order"), value: <Link href={`/admin/orders/${refund.orderId}`} className="text-blue-600 hover:underline">{refund.orderId}</Link> },
            { label: t("customer"), value: refund.customerName ?? "—" },
            { label: t("method"), value: refund.method },
            { label: t("reason"), value: refund.reason, full: true },
            { label: t("amount"), value: <DualCurrency amount={refund.amount} /> },
          ]} />
          {status === "pending" && (
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
