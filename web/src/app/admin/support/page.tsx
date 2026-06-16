"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";

const tickets = [
  { id: "TKT-441", subject: "Order not delivered", customer: "Marie Kabila", priority: "high", status: "open", date: "2024-06-08" },
  { id: "TKT-440", subject: "Refund delay", customer: "Patrick Lumumba", priority: "medium", status: "in_progress", date: "2024-06-07" },
  { id: "TKT-439", subject: "Seller verification", customer: "TechZone Store", priority: "low", status: "resolved", date: "2024-06-06" },
  { id: "TKT-438", subject: "Payment failed", customer: "Sophie Mbuyi", priority: "high", status: "open", date: "2024-06-06" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "in_progress", label: "In progress", labelFr: "En cours" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
];

const PRIORITY_FR: Record<string, string> = { high: "Élevée", medium: "Moyenne", low: "Faible" };
const TICKET_STATUS_FR: Record<string, string> = { open: "Ouvert", in_progress: "En cours", resolved: "Résolu" };

export default function AdminSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(tickets, filters, {
        searchFields: ["id", "subject", "customer"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("support")}
        subtitle={fr ? "Tickets de support clients et vendeurs" : "Customer & seller support tickets"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: t("support") }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "N° de ticket, sujet, client…" : "Ticket ID, subject, customer…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Ticket", render: (row) => (
                <span className="font-medium text-[var(--primary)]">{String(row.id)}</span>
              )},
              { key: "subject", label: fr ? "Sujet" : "Subject" },
              { key: "customer", label: fr ? "Client" : "Customer" },
              { key: "priority", label: fr ? "Priorité" : "Priority", render: (row) => (
                <Badge variant={row.priority === "high" ? "danger" : row.priority === "medium" ? "warning" : "default"}>
                  {fr ? (PRIORITY_FR[String(row.priority)] ?? String(row.priority)) : String(row.priority)}
                </Badge>
              )},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "resolved" ? "success" : "info"}>{fr ? (TICKET_STATUS_FR[String(row.status)] ?? String(row.status).replace("_", " ")) : String(row.status).replace("_", " ")}</Badge>
              )},
              { key: "date", label: t("date") },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
