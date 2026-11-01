"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { REPLACEMENT_STATUS, pick, shortDate, statusOptions, useOpsQuery, type ReplacementRow } from "@/lib/warehouse-live";

export default function WarehouseReplacementsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useOpsQuery<ReplacementRow[]>("replacements:list", { initial: [] as ReplacementRow[], push: ["replacement:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () => applyListFilters(q.data, filters, { searchFields: ["reference", "orderReference", "sku", "productName", "customerName"], statusField: "status" }),
    [q.data, filters],
  );

  return (
    <WarehouseListPage
      title={t("replacements")}
      subtitle={fr ? "Remplacements en direct — approuvés, livrés par un livreur de l'entrepôt (l'ancienne unité revient lors du même trajet)" : "Live replacements — approved, delivered by a warehouse rider (the old unit comes back on the same trip)"}
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("replacements") }]}
      filters={
        <div className="space-y-3">
          {q.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{q.error}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={statusOptions(REPLACEMENT_STATUS)}
            searchPlaceholder={fr ? "Référence, commande, SKU, client…" : "Reference, order, SKU, customer…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "reference", label: fr ? "ID dossier" : "Case ID", render: (row) => (
          <Link href={ops(`/replacements/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
        )},
        { key: "orderReference", label: fr ? "ID commande" : "Order ID" },
        { key: "sku", label: "SKU" },
        { key: "productName", label: fr ? "Produit" : "Product" },
        { key: "customerName", label: t("customer") },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "dispatched" || row.status === "delivered" ? "success" : row.status === "rejected" ? "danger" : "warning"}>
            {pick(REPLACEMENT_STATUS[String(row.status)], fr, String(row.status))}
          </Badge>
        )},
        { key: "createdAt", label: fr ? "Demandé le" : "Requested", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/replacements/${row.id}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
