"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { orderEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function ShopOrdersPage() {
  const { locale, t } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title={t("myOrders")} subtitle={`${t("order")} · ${t("date")} · ${t("status")} · ${t("amount")}`} />

      <DataTable
        columns={[
          { key: "id", label: t("order"), render: (row) => (
            <Link href={`/shop/orders/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
          )},
          { key: "date", label: t("date") },
          { key: "itemsCount", label: t("items") },
          { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
          { key: "paymentMethod", label: t("payment") },
          { key: "status", label: t("status"), render: (row) => (
            <Badge variant="info">{statusLabel(locale, String(row.status))}</Badge>
          )},
          { key: "actions", label: t("actions"), render: (row) => (
            <div className="flex gap-2 text-xs">
              <Link href={`/shop/orders/${row.id}`} className="text-blue-600 hover:underline">{t("view")}</Link>
              {row.status === "delivered" && (
                <Link href={`/shop/orders/${row.id}/return`} className="text-slate-500 hover:text-blue-600">{t("returnLink")}</Link>
              )}
            </div>
          )},
        ]}
        data={orderEntities.slice(0, 4) as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}
