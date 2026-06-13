"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { customerEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";

export default function AdminCustomersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers")}
        subtitle={fr ? "Nom, E-mail, Téléphone, Ville, Commandes, Total dépensé, Statut" : "Name, Email, Phone, City, Orders, Total Spent, Status"}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: t("customers") },
        ]}
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
                  <Link href={`/admin/customers/${row.id}`} className="font-medium text-blue-600 hover:underline">
                    {String(row.name)}
                  </Link>
                ),
              },
              { key: "email", label: t("email") },
              { key: "phone", label: t("phone") },
              { key: "city", label: t("city") },
              { key: "orders", label: t("orders") },
              {
                key: "totalSpent",
                label: t("totalSpent"),
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
                  <Link href={`/admin/customers/${row.id}`} className="text-sm text-blue-600 hover:underline">
                    {t("view")}
                  </Link>
                ),
              },
            ]}
            data={customerEntities as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
