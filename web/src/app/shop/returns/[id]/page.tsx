"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { ActivityTimeline } from "@/components/ui/timeline";
import { useReturns } from "@/context/return-context";
import { useLocale } from "@/context/locale-context";
import { localizedField, statusLabel, timelineLabel } from "@/lib/locale-helpers";

export default function ReturnStatusPage() {
  const { id } = useParams<{ id: string }>();
  const { getReturn } = useReturns();
  const { locale, t } = useLocale();
  const ret = getReturn(id);

  if (!ret) return <div className="text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={ret.id} subtitle={ret.orderId} backHref="/shop/returns" />
      <DetailSection title={t("returnStatus")}>
        <InfoGrid items={[
          { label: t("status"), value: statusLabel(locale, ret.status) },
          { label: t("reason"), value: localizedField(locale, ret.reason, ret.reasonFr) },
          { label: t("items"), value: ret.items.join(", "), full: true },
          ...(ret.refundAmount ? [{ label: t("refundLabel2"), value: <DualCurrency amount={ret.refundAmount} /> }] : []),
        ]} />
        <Link href={`/shop/orders/${ret.orderId}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          {t("viewOrderLink")}
        </Link>
      </DetailSection>
      {ret.timeline && ret.timeline.length > 0 && (
        <DetailSection title={t("track")}>
          <ActivityTimeline events={ret.timeline.map((e) => ({ time: e.time, label: timelineLabel(locale, e.label, e.labelFr), done: e.done }))} />
        </DetailSection>
      )}
    </div>
  );
}
