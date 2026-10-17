"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { NoticeBar } from "@/components/admin/notice-bar";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { SUPPORT_STATUS_BADGE, SUPPORT_STATUS_LABEL, useServerList, type SupportTicketRow } from "@/lib/admin-live";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "pending", label: "Awaiting customer", labelFr: "En attente du client" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "closed", label: "Closed", labelFr: "Fermé" },
];

export default function AdminSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { items: tickets, error } = useServerList<SupportTicketRow>("support:list", { pushEvents: ["support:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo(() => tickets.map((tk) => ({ ...tk, date: tk.createdAt.slice(0, 10) })), [tickets]);

  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["reference", "subject", "userName", "category"], dateField: "date", statusField: "status" }),
    [rows, filters],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("support")}
        subtitle={fr ? "Tickets de support (en direct)" : "Support tickets (live)"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("support") }]}
      />
      {error && <NoticeBar tone="warn">{error}</NoticeBar>}

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "N° de ticket, sujet, demandeur…" : "Ticket ID, subject, requester…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun ticket" : "No tickets"}
            columns={[
              { key: "reference", label: t("ticket"), render: (row) => (
                <Link href={`/admin/support/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
              )},
              { key: "subject", label: fr ? "Sujet" : "Subject" },
              { key: "userName", label: fr ? "Demandeur" : "Requester" },
              { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => <span className="capitalize">{String(row.category)}</span> },
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={SUPPORT_STATUS_BADGE[String(row.status)] ?? "default"}>
                  {SUPPORT_STATUS_LABEL[String(row.status)]?.[fr ? "fr" : "en"] ?? String(row.status)}
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
