"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters, timelineRequestDate } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useReplacements } from "@/context/replacement-context";
import { replacementStatusLabel, replacementStatusVariant } from "@/lib/replacement-workflow";

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested", labelFr: "Demandé" },
  { value: "inspecting", label: "Inspecting", labelFr: "Inspection" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "allocated", label: "Allocated", labelFr: "Alloué" },
  { value: "dispatched", label: "Dispatched", labelFr: "Expédié" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
  { value: "closed", label: "Closed", labelFr: "Clôturé" },
];

export default function WarehouseReplacementsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { replacements } = useReplacements();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(replacements, filters, {
        searchFields: ["id", "orderId", "sku", "customer"],
        dateField: timelineRequestDate,
        statusField: "status",
      }),
    [replacements, filters]
  );

  return (
    <WarehouseListPage
      title={t("replacements")}
      subtitle={fr ? "Vue liste — ID dossier, ID commande, SKU, Client, Statut" : "List View — Case ID, Order ID, SKU, Customer, Status"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("replacements") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID dossier, commande, SKU, client…" : "Case ID, order, SKU, customer…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID dossier" : "Case ID", render: (row) => (
          <Link href={`/warehouse/replacements/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "ID commande" : "Order ID" },
        { key: "sku", label: "SKU" },
        { key: "customer", label: t("customer") },
        { key: "status", label: t("status"), render: (row) => <Badge variant={replacementStatusVariant(String(row.status))}>{replacementStatusLabel(String(row.status), fr)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/replacements/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
