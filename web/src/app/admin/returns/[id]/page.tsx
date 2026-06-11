"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getReturn } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { useToast } from "@/context/toast-context";

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const ret = getReturn(id);

  if (!ret) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={ret.orderId}
        backHref="/admin/returns"
        breadcrumbs={[
          { label: t("adminBreadcrumb"), href: "/admin" },
          { label: t("returns"), href: "/admin/returns" },
          { label: ret.id },
        ]}
        actions={<Badge variant="warning">{statusLabel(locale, ret.status)}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title={t("returns")}>
          <InfoGrid items={[
            { label: t("order"), value: <Link href={`/admin/orders/${ret.orderId}`} className="text-blue-600 hover:underline">{ret.orderId}</Link> },
            { label: t("customer"), value: <Link href={`/admin/customers/${ret.customerId}`} className="text-blue-600 hover:underline">{ret.customer}</Link> },
            { label: t("products"), value: ret.product },
            { label: t("reason"), value: ret.reason },
            { label: t("refundLabel"), value: formatCurrency(ret.refund.amount, locale) },
          ]} />
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => toast(t("approved"))}>{t("approve")} {t("refundLabel")}</Button>
            <Link href={`/admin/fulfillment/returns/${ret.id}`} className="rounded-lg border px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">{t("warehousePortal")} →</Link>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
