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
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { DISPUTE_STATUS_BADGE, DISPUTE_STATUS_LABEL, DISPUTE_TYPE_LABEL, type DisputeRow } from "@/lib/admin-live";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

export default function AdminDisputesPage() {
  const rt = useRealtime();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const disputes = (rt.disputes as DisputeRow[]).map((d) => ({ ...d, date: d.createdAt.slice(0, 10) }));

  const openCount = disputes.filter((d) => d.status === "open").length;

  const filtered = useMemo(
    () =>
      applyListFilters(disputes, filters, {
        searchFields: ["reference", "customerName", "orderReference", "reason", "type"],
        dateField: "date",
        statusField: "status",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt.disputes, filters],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "File des litiges" : "Disputes Queue"}
        subtitle={fr ? `${openCount} dossier${openCount === 1 ? "" : "s"} ouvert${openCount === 1 ? "" : "s"} (litiges et retours, en direct)` : `${openCount} open case${openCount === 1 ? "" : "s"} (disputes and returns, live)`}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Litiges" : "Disputes" }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Référence, client, commande, motif…" : "Reference, customer, order, reason…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun litige" : "No disputes"}
            columns={[
              {
                key: "reference",
                label: fr ? "Référence" : "Reference",
                render: (row) => (
                  <Link href={`/admin/disputes/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
                    {String(row.reference)}
                  </Link>
                ),
              },
              {
                key: "type",
                label: "Type",
                render: (row) => <Badge variant={row.type === "return" ? "purple" : "primary"}>{DISPUTE_TYPE_LABEL[String(row.type)]?.[fr ? "fr" : "en"] ?? String(row.type)}</Badge>,
              },
              {
                key: "orderReference",
                label: fr ? "Commande" : "Order",
                render: (row) => (
                  <Link href={`/admin/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">
                    {String(row.orderReference)}
                  </Link>
                ),
              },
              { key: "customerName", label: fr ? "Client" : "Customer" },
              { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => <span className="line-clamp-2 max-w-[16rem] text-slate-600">{String(row.reason)}</span> },
              {
                key: "status",
                label: t("status"),
                render: (row) => (
                  <Badge variant={DISPUTE_STATUS_BADGE[String(row.status)] ?? "default"}>
                    {DISPUTE_STATUS_LABEL[String(row.status)]?.[fr ? "fr" : "en"] ?? String(row.status)}
                  </Badge>
                ),
              },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/admin/disputes/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
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
