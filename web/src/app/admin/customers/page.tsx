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
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useAdminData } from "@/lib/admin";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "inactive", label: "Inactive", labelFr: "Inactif" },
];

const STATUS_FR: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  suspended: "Suspendu",
};

export default function AdminCustomersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { customerEntities } = useAdminData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(customerEntities, filters, {
        searchFields: ["id", "name", "email", "phone", "city"],
        statusField: "status",
      }),
    [customerEntities, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers")}
        subtitle={
          fr
            ? "Vue liste — Nom, E-mail, Téléphone, Ville, Commandes, Total dépensé, Statut"
            : "List View — Name, Email, Phone, City, Orders, Total Spent, Status"
        }
        breadcrumbs={[
          adminBreadcrumb(locale),
          { label: t("customers") },
        ]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Nom, e-mail, téléphone, ville…" : "Name, email, phone, city…"}
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
              { key: "city", label: fr ? "Ville" : "City" },
              { key: "orders", label: fr ? "Commandes" : "Orders" },
              {
                key: "totalSpent",
                label: fr ? "Total dépensé" : "Total Spent",
                render: (row) => formatCurrency(row.totalSpent as number, locale),
              },
              {
                key: "status",
                label: t("status"),
                render: (row) => <Badge variant="success">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>,
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
