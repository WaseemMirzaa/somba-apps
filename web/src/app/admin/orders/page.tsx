"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { orderEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  delivered: "success",
  processing: "info",
  pending: "warning",
  cancelled: "danger",
};

export default function AdminOrdersPage() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("all");

  const filtered = tab === "all"
    ? orderEntities
    : orderEntities.filter((o) => o.status === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("orders")}
        subtitle="List View — Order ID, Customer, Seller, Amount, Payment, Status, Date"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("orders") },
        ]}
      />

      <div className="flex gap-2 overflow-x-auto">
        {["all", "pending", "processing", "delivered", "cancelled"].map((tabId) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium",
              tab === tabId ? "bg-blue-600 text-white" : "border border-blue-200 text-slate-600 hover:bg-blue-50"
            )}
          >
            {tabId === "all" ? "All" : t(tabId as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: "Order ID",
                render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="font-medium text-blue-600 hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "customer",
                label: "Customer",
                render: (row) => (
                  <Link href={`/admin/customers/${row.customerId}`} className="text-blue-600 hover:underline">
                    {String(row.customer)}
                  </Link>
                ),
              },
              {
                key: "seller",
                label: "Seller",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.sellerId}`} className="text-blue-600 hover:underline">
                    {String(row.seller)}
                  </Link>
                ),
              },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => formatCurrency(row.amount as number, locale),
              },
              { key: "paymentMethod", label: "Payment" },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={statusVariant[row.status as string] ?? "default"}>
                    {t(row.status as Parameters<typeof t>[0])}
                  </Badge>
                ),
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="text-sm text-blue-600 hover:underline">
                    {t("view")}
                  </Link>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
