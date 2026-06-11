"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useSupport } from "@/context/support-context";

export default function AdminSupportPage() {
  const { t } = useLocale();
  const { tickets } = useSupport();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("support")}
        subtitle="Customer & seller support tickets"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: t("support") }]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Ticket", render: (row) => (
                <Link href={`/admin/support/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "subject", label: "Subject" },
              { key: "customer", label: "Customer" },
              { key: "priority", label: "Priority", render: (row) => (
                <Badge variant={row.priority === "high" ? "danger" : row.priority === "medium" ? "warning" : "default"}>
                  {String(row.priority)}
                </Badge>
              )},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "resolved" ? "success" : "info"}>{String(row.status).replace("_", " ")}</Badge>
              )},
              { key: "date", label: t("date"), render: (row) => String(row.lastUpdate ?? row.createdAt) },
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/admin/support/${row.id}`} className="text-sm text-blue-600 hover:underline">{t("view")}</Link>
              )},
            ]}
            data={tickets as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
