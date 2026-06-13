"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { returnEntities } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";

export default function AdminReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("returns")}
        subtitle={fr ? "Demandes de retour sur toute la plateforme" : "Platform-wide return requests"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: t("returns") }]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: fr ? "N° retour" : "Return ID", render: (row) => (
                <Link href={`/warehouse/returns/${row.id}`} className="font-medium text-blue-600 hover:underline">
                  {String(row.id)}
                </Link>
              )},
              { key: "orderId", label: t("order"), render: (row) => (
                <Link href={`/admin/orders/${row.orderId}`} className="text-blue-600 hover:underline">{String(row.orderId)}</Link>
              )},
              { key: "customer", label: t("customer") },
              { key: "product", label: t("product") },
              { key: "reason", label: t("reason") },
              { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status).replace("_", " ")}</Badge> },
              { key: "refund", label: t("refund"), render: (row) => {
                const refund = row.refund as { amount: number };
                return formatCurrency(refund.amount, locale);
              }},
            ]}
            data={returnEntities as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
