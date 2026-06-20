"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useSupport } from "@/context/support-context";
import { SUPPORT_PRIORITY_LABELS, SUPPORT_STATUS_LABELS } from "@/lib/support-tickets";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "in_progress", label: "In progress", labelFr: "En cours" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
];

export default function AdminSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { tickets } = useSupport();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo(
    () =>
      tickets.map((tk) => ({
        id: tk.id,
        subject: tk.subject,
        subjectFr: tk.subjectFr,
        party: tk.party,
        audience: tk.audience,
        priority: tk.priority,
        status: tk.status,
        date: tk.date,
      })),
    [tickets]
  );

  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["id", "subject", "party"], dateField: "date", statusField: "status" }),
    [rows, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("support")}
        subtitle={fr ? "Tickets de support clients et vendeurs" : "Customer & seller support tickets"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("support") }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "N° de ticket, sujet, demandeur…" : "Ticket ID, subject, requester…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: t("ticket"), render: (row) => (
                <Link href={`/admin/support/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
              )},
              { key: "subject", label: fr ? "Sujet" : "Subject", render: (row) => <span>{fr ? String(row.subjectFr ?? row.subject) : String(row.subject)}</span> },
              { key: "party", label: fr ? "Demandeur" : "Requester" },
              { key: "audience", label: fr ? "Portail" : "Portal", render: (row) => <span className="capitalize">{String(row.audience)}</span> },
              { key: "priority", label: fr ? "Priorité" : "Priority", render: (row) => (
                <Badge variant={row.priority === "high" ? "danger" : row.priority === "medium" ? "warning" : "default"}>
                  {fr ? SUPPORT_PRIORITY_LABELS[String(row.priority)].fr : SUPPORT_PRIORITY_LABELS[String(row.priority)].en}
                </Badge>
              )},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "resolved" ? "success" : row.status === "in_progress" ? "info" : "warning"}>
                  {fr ? SUPPORT_STATUS_LABELS[row.status as "open"].fr : SUPPORT_STATUS_LABELS[row.status as "open"].en}
                </Badge>
              )},
              { key: "date", label: t("date") },
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/admin/support/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Ouvrir" : "Open"}</Link>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
