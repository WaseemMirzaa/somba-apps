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
import { customerEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "inactive", label: "Inactive", labelFr: "Inactif" },
];

export default function AdminCustomersPage() {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(customerEntities, filters, {
        searchFields: ["id", "name", "email", "phone", "city"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers")}
        subtitle="List View — Name, Email, Phone, City, Orders, Total Spent, Status"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("customers") },
        ]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Name, email, phone, city…"
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID" },
              {
                key: "name",
                label: t("name"),
                render: (row) => (
                  <Link href={`/admin/customers/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              { key: "email", label: t("email") },
              { key: "phone", label: t("phone") },
              { key: "city", label: "City" },
              { key: "orders", label: "Orders" },
              {
                key: "totalSpent",
                label: "Total Spent",
                render: (row) => formatCurrency(row.totalSpent as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge variant="success">{String(row.status)}</Badge>,
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/customers/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
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
