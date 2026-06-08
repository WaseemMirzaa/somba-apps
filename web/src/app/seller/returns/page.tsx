"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { sellerReturnList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";

export default function SellerReturnsPage() {
  const { t, locale } = useLocale();

  return (
    <SellerListPage
      title={t("returns")}
      subtitle="List View — Return ID, Order, Customer, Reason, Amount, Status"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("returns") }]}
      columns={[
        { key: "id", label: "Return ID", render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "reason", label: "Reason" },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={sellerReturnList as unknown as Record<string, unknown>[]}
    />
  );
}
