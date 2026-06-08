"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { orderEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function ShopOrdersPage() {
  const { locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title="My Orders" subtitle="List View — Order Number, Date, Status, Amount, Items" />

      <DataTable
        columns={[
          { key: "id", label: "Order", render: (row) => (
            <Link href={`/shop/orders/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
          )},
          { key: "date", label: "Date" },
          { key: "itemsCount", label: "Items" },
          { key: "amount", label: "Amount", render: (row) => formatCurrency(row.amount as number, locale) },
          { key: "paymentMethod", label: "Payment" },
          { key: "status", label: "Status", render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
          { key: "actions", label: "Actions", render: (row) => (
            <div className="flex gap-2 text-xs">
              <Link href={`/shop/orders/${row.id}`} className="text-blue-600 hover:underline">View</Link>
              {row.status === "delivered" && (
                <Link href={`/shop/orders/${row.id}/return`} className="text-slate-500 hover:text-blue-600">Return</Link>
              )}
            </div>
          )},
        ]}
        data={orderEntities.slice(0, 4) as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}
