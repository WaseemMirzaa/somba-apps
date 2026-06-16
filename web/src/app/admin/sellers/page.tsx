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
import { sellerEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "suspended", label: "Suspended", labelFr: "Suspendu" },
];

export default function AdminSellersPage() {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerEntities, filters, {
        searchFields: ["storeName", "owner", "email", "category", "id"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sellers")}
        subtitle="List View — quick scanning only. Full info on detail page."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("sellers") },
        ]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Store, owner, email…"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "storeName",
                label: "Store",
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.storeName)}
                  </Link>
                ),
              },
              { key: "owner", label: "Owner" },
              { key: "email", label: t("email") },
              { key: "category", label: "Category" },
              {
                key: "orders",
                label: "Orders",
                render: (row) => Number(row.orders).toLocaleString(),
              },
              {
                key: "revenue",
                label: "Revenue",
                render: (row) => formatCurrency(row.revenue as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={row.status === "approved" ? "success" : row.status === "pending" ? "warning" : "danger"}>
                    {String(row.status)}
                  </Badge>
                ),
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/sellers/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
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
