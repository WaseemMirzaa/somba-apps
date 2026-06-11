"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { getOrder } from "@/lib/entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function OrderConfirmedPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const order = getOrder(id);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
      <PageHeader title={t("orderConfirmed")} subtitle={id} />
      <DetailSection title={t("summary")}>
        <InfoGrid items={[
          { label: t("orderId"), value: id },
          { label: t("status"), value: statusLabel(locale, order?.status ?? "processing") },
          { label: t("total"), value: <DualCurrency amount={order?.amount ?? 1498} className="font-bold" /> },
          { label: t("estDelivery"), value: "1-3 days" },
        ]} />
      </DetailSection>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/shop/orders/${id}`} className="btn-primary px-6 py-3">{t("viewOrder")}</Link>
        <Link href={`/shop/orders/${id}/tracking`} className="rounded-xl border px-6 py-3 text-sm font-medium">{t("track")}</Link>
      </div>
    </div>
  );
}
