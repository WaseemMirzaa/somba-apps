"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { sellerReplacementList } from "@/lib/seller-entities";

export default function SellerReplacementsPage() {
  const { t } = useLocale();

  return (
    <SellerListPage
      title={t("replacements")}
      subtitle="List View — Replacement ID, Order, Customer, SKU, Status"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("replacements") }]}
      columns={[
        { key: "id", label: "Case ID", render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "sku", label: "SKU" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={sellerReplacementList as unknown as Record<string, unknown>[]}
    />
  );
}
