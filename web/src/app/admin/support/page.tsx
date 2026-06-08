"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";

const tickets = [
  { id: "TKT-441", subject: "Order not delivered", customer: "Marie Kabila", priority: "high", status: "open", date: "2024-06-08" },
  { id: "TKT-440", subject: "Refund delay", customer: "Patrick Lumumba", priority: "medium", status: "in_progress", date: "2024-06-07" },
  { id: "TKT-439", subject: "Seller verification", customer: "TechZone Store", priority: "low", status: "resolved", date: "2024-06-06" },
  { id: "TKT-438", subject: "Payment failed", customer: "Sophie Mbuyi", priority: "high", status: "open", date: "2024-06-06" },
];

export default function AdminSupportPage() {
  const { t } = useLocale();

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
                <span className="font-medium text-blue-600">{String(row.id)}</span>
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
              { key: "date", label: t("date") },
            ]}
            data={tickets as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
