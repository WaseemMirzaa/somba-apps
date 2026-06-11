"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { getFlashSale } from "@/lib/admin-entities";

export default function AdminFlashSaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const sale = getFlashSale(id);

  if (!sale) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.name}
        subtitle={`${sale.start} → ${sale.end}`}
        backHref="/admin/flash-sales"
        actions={<Badge variant={sale.status === "active" ? "success" : "warning"}>{statusLabel(locale, sale.status)}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title={t("flashSaleDetail")}>
          <InfoGrid items={[
            { label: t("discountPct"), value: `${sale.discount}%` },
            { label: t("products"), value: sale.products },
            { label: t("startDate"), value: sale.start },
            { label: t("endDate"), value: sale.end },
          ]} />
          <Link href="/shop/deals" className="mt-4 inline-block text-sm text-blue-600 hover:underline">{t("storefront")} →</Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
