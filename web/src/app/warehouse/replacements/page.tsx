"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { replacementEntities } from "@/lib/warehouse-entities";

export default function WarehouseReplacementsPage() {
  const { t } = useLocale();

  return (
    <WarehouseListPage
      title={t("replacements")}
      subtitle="List View — Case ID, Order ID, SKU, Customer, Status"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("replacements") }]}
      columns={[
        { key: "id", label: "Case ID", render: (row) => (
          <Link href={`/warehouse/replacements/${row.id}`} className="font-medium text-indigo-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order ID" },
        { key: "sku", label: "SKU" },
        { key: "customer", label: "Customer" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/replacements/${row.id}`} className="text-sm text-indigo-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={replacementEntities as unknown as Record<string, unknown>[]}
    />
  );
}
