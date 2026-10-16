"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ExceptionForm } from "@/components/warehouse/exception-form";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import {
  EXCEPTION_STATUS,
  EXCEPTION_TYPE,
  SEVERITY,
  pick,
  severityVariant,
  shortDate,
  statusOptions,
  useOpsQuery,
  type ExceptionRow,
} from "@/lib/warehouse-live";

export default function WarehouseExceptionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const excQ = useOpsQuery<ExceptionRow[]>("exceptions:list", { initial: [] as ExceptionRow[], push: ["exception:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(
    () =>
      applyListFilters(excQ.data, filters, {
        searchFields: ["reference", "orderReference", "type", "notes", "hub"],
        statusField: "status",
      }),
    [excQ.data, filters],
  );

  return (
    <WarehouseListPage
      title={t("exceptions")}
      subtitle={fr ? "Incidents de colis en direct : dommage, article manquant, adresse…" : "Live parcel incidents: damage, missing item, address issues…"}
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("exceptions") }]}
      actions={
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          {showForm ? (fr ? "Fermer" : "Close") : (fr ? "Nouvelle exception" : "New exception")}
        </button>
      }
      filters={
        <div className="space-y-3">
          {excQ.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{excQ.error}</p>}
          {showForm && (
            <div className="card-premium p-5">
              <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Nouvelle exception" : "New exception"}</h2>
              <ExceptionForm
                onCancel={() => setShowForm(false)}
                onCreated={() => {
                  setShowForm(false);
                  void excQ.reload();
                }}
              />
            </div>
          )}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={statusOptions(EXCEPTION_STATUS)}
            searchPlaceholder={fr ? "Référence, commande, type, notes…" : "Reference, order, type, notes…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "reference", label: fr ? "ID incident" : "Incident ID", render: (row) => (
          <Link href={ops(`/exceptions/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
        )},
        { key: "orderReference", label: fr ? "Commande" : "Order", render: (row) => row.taskId ? (
          <Link href={ops(`/parcels/${row.taskId}`)} className="text-[var(--primary)] hover:underline">{String(row.orderReference ?? (fr ? "Colis" : "Parcel"))}</Link>
        ) : String(row.orderReference ?? "—") },
        { key: "type", label: t("type"), render: (row) => pick(EXCEPTION_TYPE[String(row.type)], fr, String(row.type)) },
        { key: "severity", label: fr ? "Gravité" : "Severity", render: (row) => (
          <Badge variant={severityVariant(String(row.severity))}>{pick(SEVERITY[String(row.severity)], fr, String(row.severity))}</Badge>
        )},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "resolved" ? "success" : row.status === "escalated" ? "danger" : "warning"}>
            {pick(EXCEPTION_STATUS[String(row.status)], fr, String(row.status))}
          </Badge>
        )},
        { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/exceptions/${row.id}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
