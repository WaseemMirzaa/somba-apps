"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getAdminFinanceTransaction } from "@/lib/admin-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function AdminFinanceTransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const txn = getAdminFinanceTransaction(id);

  if (!txn) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={txn.id}
        subtitle={txn.type}
        backHref="/admin/finance"
        breadcrumbs={[
          { label: t("adminBreadcrumb"), href: "/admin" },
          { label: t("finance"), href: "/admin/finance" },
          { label: txn.id },
        ]}
        actions={<Badge variant={txn.status === "completed" ? "success" : "warning"}>{statusLabel(locale, txn.status)}</Badge>}
      />
      <DetailSection title={t("transaction")}>
        <InfoGrid items={[
          { label: t("type"), value: txn.type },
          { label: t("amount"), value: <span className={txn.amount < 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>{formatCurrency(Math.abs(txn.amount), locale)}</span> },
          { label: t("reference"), value: txn.reference },
          { label: t("date"), value: txn.date },
          ...(txn.orderId ? [{ label: t("order"), value: <Link href={`/admin/orders/${txn.orderId}`} className="text-blue-600 hover:underline">{txn.orderId}</Link> }] : []),
          ...(txn.payoutId ? [{ label: t("payouts"), value: <Link href={`/admin/payouts/${txn.payoutId}`} className="text-blue-600 hover:underline">{txn.payoutId}</Link> }] : []),
          ...("orderId" in txn && txn.type === "Refund" ? [{ label: t("refundLabel"), value: <Link href="/admin/refunds/REF-002" className="text-blue-600 hover:underline">REF-002</Link> }] : []),
          ...(txn.codId ? [{ label: t("cod"), value: <Link href={`/admin/fulfillment/cod/${txn.codId}`} className="text-blue-600 hover:underline">{txn.codId}</Link> }] : []),
        ]} />
      </DetailSection>
    </div>
  );
}
