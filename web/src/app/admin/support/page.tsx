"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { statusLabel, severityLabel } from "@/lib/locale-helpers";
import { useSupport } from "@/context/support-context";

export default function AdminSupportPage() {
  const { t, locale } = useLocale();
  const { tickets } = useSupport();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("support")}
        subtitle={t("customerSellerSupport")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("support") }]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: t("ticket"), render: (row) => (
                <Link href={`/admin/support/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "subject", label: t("subject") },
              { key: "customer", label: t("customer") },
              { key: "priority", label: t("priority"), render: (row) => (
                <Badge variant={row.priority === "high" ? "danger" : row.priority === "medium" ? "warning" : "default"}>
                  {severityLabel(locale, String(row.priority))}
                </Badge>
              )},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "resolved" ? "success" : "info"}>{statusLabel(locale, String(row.status))}</Badge>
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
