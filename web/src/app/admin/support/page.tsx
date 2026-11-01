"use client";

import { supportCategoryLabel } from "@/lib/i18n-fields";
import { localDay } from "@/lib/dates";
import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { ROLE_BADGE, ROLE_LABEL, SUPPORT_STATUS_BADGE, SUPPORT_STATUS_LABEL, lab, useServerList, type SupportTicketRow } from "@/lib/admin-live";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "pending", label: "Awaiting customer", labelFr: "En attente du client" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "closed", label: "Closed", labelFr: "Fermé" },
];

export default function AdminSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { items: tickets, error, reload, loading } = useServerList<SupportTicketRow>("support:list", { pushEvents: ["support:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [mine, setMine] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");

  const rows = useMemo(
    () =>
      [...tickets]
        .sort((a, b) => (b.staffUnread ?? 0) - (a.staffUnread ?? 0) || b.updatedAt.localeCompare(a.updatedAt))
        .map((tk) => ({ ...tk, date: localDay(tk.createdAt), assignee: tk.assigneeName ?? "" })),
    [tickets],
  );

  const filtered = useMemo(
    () =>
      applyListFilters(
        rows.filter((r) => (!mine || r.assigneeId === rt.user?.id) && (roleFilter === "all" || (r.role ?? "customer") === roleFilter)),
        filters,
        { searchFields: ["reference", "subject", "userName", "category", "assignee"], dateField: "date", statusField: "status" },
      ),
    [rows, filters, mine, roleFilter, rt.user?.id],
  );
  const unread = tickets.reduce((n, tk) => n + (tk.staffUnread ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("support")}
        subtitle={fr ? `Tickets de support en direct · ${unread} message(s) non lu(s)` : `Live support tickets · ${unread} unread message(s)`}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("support") }]}
      />
      {error && <SectionError message={error} onRetry={reload} />}
      {loading && !error && <SectionLoading />}

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "N° de ticket, sujet, demandeur, agent…" : "Ticket ID, subject, requester, agent…"}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {fr ? "Qui me sont assignés" : "Assigned to me"}
        </label>
        <select className="input-premium px-3 py-1.5 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label={fr ? "Demandeur" : "Requester"}>
          <option value="all">{fr ? "Tous les demandeurs" : "All requesters"}</option>
          <option value="customer">{fr ? "Clients" : "Customers"}</option>
          <option value="seller">{fr ? "Vendeurs" : "Sellers"}</option>
          <option value="rider">{fr ? "Livreurs" : "Riders"}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun ticket" : "No tickets"}
            columns={[
              { key: "reference", label: t("ticket"), render: (row) => (
                <span className="flex items-center gap-2">
                  <Link href={`/admin/support/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
                  {Number(row.staffUnread) > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white" title={fr ? "Messages non lus" : "Unread messages"}>{String(row.staffUnread)}</span>}
                </span>
              )},
              { key: "subject", label: fr ? "Sujet" : "Subject" },
              { key: "userName", label: fr ? "Demandeur" : "Requester", render: (row) => (
                <span className="flex flex-wrap items-center gap-1.5">{String(row.userName)}<Badge variant={ROLE_BADGE[String(row.role ?? "customer")] ?? "default"}>{lab(ROLE_LABEL, String(row.role ?? "customer"), fr)}</Badge></span>
              )},
              { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => <span>{supportCategoryLabel(String(row.category), fr)}</span> },
              { key: "assignee", label: fr ? "Agent" : "Agent", render: (row) => (row.assignee ? <span className="text-slate-700">{String(row.assignee)}</span> : <span className="text-slate-400">{fr ? "Non assigné" : "Unassigned"}</span>) },
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
