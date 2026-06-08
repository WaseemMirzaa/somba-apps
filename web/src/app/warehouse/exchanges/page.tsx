"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { exchangeEntities } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";

export default function WarehouseExchangesPage() {
  const { t, locale } = useLocale();

  return (
    <WarehouseListPage
      title={t("exchanges")}
      subtitle="Exchange requests — old variant returned, new variant dispatched"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("exchanges") }]}
      columns={[
        { key: "id", label: "Exchange ID", render: (row) => (
          <Link href={`/warehouse/exchanges/${row.id}`} className="font-medium text-indigo-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order ID" },
        { key: "customer", label: "Customer" },
        { key: "oldSku", label: "Old SKU" },
        { key: "newSku", label: "New SKU" },
        { key: "priceDifference", label: "Price Diff", render: (row) => formatCurrency(row.priceDifference as number, locale) },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/exchanges/${row.id}`} className="text-sm text-indigo-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={exchangeEntities as unknown as Record<string, unknown>[]}
    />
  );
}
