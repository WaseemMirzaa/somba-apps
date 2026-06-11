"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getSellerReplacement } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel, timelineLabel } from "@/lib/locale-helpers";

export default function SellerReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const rep = getSellerReplacement(id);

  if (!rep) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={rep.id} subtitle={`${t("order")} ${rep.orderId} · ${statusLabel(locale, rep.status)}`} backHref="/seller/replacements" />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={t("overview")}>
          <InfoGrid items={[
            { label: t("replacementId"), value: rep.id },
            { label: t("order"), value: <Link href={`/seller/orders/${rep.orderId}`} className="text-sky-600 hover:underline">{rep.orderId}</Link> },
            { label: t("customer"), value: rep.customer },
          ]} />
        </DetailSection>

        <DetailSection title={t("returnedProduct")}>
          <InfoGrid items={[
            { label: "SKU", value: rep.returnedProduct.sku },
            { label: t("condition"), value: rep.returnedProduct.condition },
            { label: t("inspection"), value: rep.returnedProduct.inspection },
          ]} />
        </DetailSection>

        <DetailSection title={t("newProduct")}>
          <InfoGrid items={[
            { label: t("replacementSku"), value: rep.newProduct.sku },
            { label: t("allocated"), value: rep.newProduct.allocated ? t("yes") : t("no") },
            { label: t("dispatchStatus"), value: statusLabel(locale, rep.newProduct.dispatchStatus) },
          ]} />
          <Link href="/seller/inventory" className="mt-4 inline-block text-sm text-sky-600 hover:underline">{t("checkInventory")}</Link>
        </DetailSection>

        <DetailSection title={t("timeline")}>
          <ActivityTimeline events={rep.timeline.map((e) => ({ ...e, label: timelineLabel(locale, e.label) }))} />
        </DetailSection>
      </div>
    </div>
  );
}
