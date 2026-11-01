"use client";

import { localDay } from "@/lib/dates";
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
import { DISPUTE_CATEGORY_LABEL, DISPUTE_STAGE_BADGE, DISPUTE_STAGE_LABEL, DISPUTE_STATUS_BADGE, DISPUTE_STATUS_LABEL, lab, type DisputeRow } from "@/lib/admin-live";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

export default function AdminReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const returns = (rt.disputes as DisputeRow[])
    .filter((d) => d.type === "return")
    .map((d) => ({ ...d, date: localDay(d.createdAt), stageKey: d.status === "open" ? (d.stage ?? "awaiting_seller") : "closed" }));

  const filtered = useMemo(
    () =>
      applyListFilters(returns, filters, {
        searchFields: ["reference", "orderReference", "customerName", "reason", "category"],
        dateField: "date",
        statusField: "status",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt.disputes, filters],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("returns")}
        subtitle={fr ? "Demandes de retour des clients (en direct)" : "Customer return requests (live)"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("returns") }]}
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Référence, commande, client…" : "Reference, order, customer…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucune demande de retour" : "No return requests"}
            columns={[
              { key: "reference", label: fr ? "Référence" : "Reference", render: (row) => (
                <Link href={`/admin/returns/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
              )},
              { key: "orderReference", label: fr ? "Commande" : "Order", render: (row) => (
                <Link href={`/admin/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">{String(row.orderReference)}</Link>
              )},
              { key: "customerName", label: t("customer") },
              { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => <span className="line-clamp-2 max-w-[16rem] font-medium text-amber-700">{String(row.reason)}</span> },
              { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => <span className="text-slate-600">{row.category ? lab(DISPUTE_CATEGORY_LABEL, String(row.category), fr) : "—"}</span> },
              { key: "stageKey", label: fr ? "Étape" : "Stage", render: (row) => (
                <Badge variant={DISPUTE_STAGE_BADGE[String(row.stageKey)] ?? "default"}>{lab(DISPUTE_STAGE_LABEL, String(row.stageKey), fr)}</Badge>
              )},
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={DISPUTE_STATUS_BADGE[String(row.status)] ?? "default"}>{DISPUTE_STATUS_LABEL[String(row.status)]?.[fr ? "fr" : "en"] ?? String(row.status)}</Badge>
              )},
              { key: "date", label: t("date") },
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/admin/returns/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
