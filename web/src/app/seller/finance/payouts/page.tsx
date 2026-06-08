"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { payoutList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPayoutsPage() {
  const { t, locale } = useLocale();

  return (
    <SellerListPage
      title={t("payouts")}
      subtitle="Request ID, Amount, Method, Status, Date"
      breadcrumbs={[
        { label: "Seller", href: "/seller" },
        { label: "Finance", href: "/seller/finance" },
        { label: t("payouts") },
      ]}
      actions={
        <Link href="/seller/finance/payouts/request" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">{t("requestPayout")}</Link>
      }
      columns={[
        { key: "id", label: "Request ID", render: (row) => (
          <Link href={`/seller/finance/payouts/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "method", label: "Method" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "paid" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/finance/payouts/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={payoutList as unknown as Record<string, unknown>[]}
    />
  );
}
