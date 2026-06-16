"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { orderEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "processing", label: "Processing", labelFr: "En cours" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
  { value: "cancelled", label: "Cancelled", labelFr: "Annulé" },
];

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  delivered: "success",
  processing: "info",
  pending: "warning",
  cancelled: "danger",
};

export default function AdminOrdersPage() {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(orderEntities, filters, {
        searchFields: ["id", "customer", "seller", "customerId", "sellerId"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

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

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Order ID, customer, seller…"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: "Order ID",
                render: (row) => (
                  <Link href={`/admin/orders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "customer",
                label: "Customer",
                render: (row) => (
                  <Link href={`/admin/customers/${row.customerId}`} className="text-[var(--primary)] hover:underline">
                    {String(row.customer)}
                  </Link>
                ),
              },
              {
                key: "seller",
                label: "Seller",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.sellerId}`} className="text-[var(--primary)] hover:underline">
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
                  <Link href={`/admin/orders/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
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
