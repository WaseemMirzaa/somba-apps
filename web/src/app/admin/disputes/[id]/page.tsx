"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useDisputes } from "@/context/dispute-context";
import { useToast } from "@/context/toast-context";

export default function AdminDisputeResolutionPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const { getDispute, resolveDispute } = useDisputes();
  const { toast } = useToast();
  const dispute = getDispute(id);

  if (!dispute) return <div>{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("disputeDetail")} subtitle={dispute.id} backHref="/admin/disputes" />
      <DetailSection title={t("details")}>
        <InfoGrid items={[
          { label: t("order"), value: <Link href={`/admin/orders/${dispute.orderId}`} className="text-blue-600 hover:underline">{dispute.orderId}</Link> },
          { label: t("customer"), value: dispute.buyerName },
          { label: t("seller"), value: <Link href={`/admin/sellers/${dispute.sellerId}`} className="text-blue-600 hover:underline">{dispute.sellerName}</Link> },
          { label: t("reason"), value: dispute.reason },
        ]} />
        <p className="mt-4 text-sm">{dispute.description}</p>
        {dispute.messages.map((m, i) => (
          <p key={i} className="mt-2 text-sm text-slate-600"><strong>{m.from}:</strong> {m.text}</p>
        ))}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => { resolveDispute(id); toast(t("resolved")); }}>{t("approve")}</Button>
          <Button variant="secondary" onClick={() => toast(t("resolved"))}>{t("reject")}</Button>
          <Link href={`/admin/refunds`} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("refundAuthorisation")} →</Link>
        </div>
      </DetailSection>
    </div>
  );
}
