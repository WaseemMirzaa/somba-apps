"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { EXCHANGE_STATUS, pick, shortDate, statusOptions, useOpsQuery, type ExchangeRow } from "@/lib/warehouse-live";
import { formatCurrency } from "@/lib/utils";

export default function WarehouseExchangesPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useOpsQuery<ExchangeRow[]>("exchanges:list", { initial: [] as ExchangeRow[], push: ["exchange:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () => applyListFilters(q.data, filters, { searchFields: ["reference", "orderReference", "customerName", "fromSku", "toSku"], statusField: "status" }),
    [q.data, filters],
  );

  return (
    <WarehouseListPage
      title={t("exchanges")}
      subtitle={fr ? "Demandes d'échange en direct — ancien article repris, nouvel article livré par un livreur de l'entrepôt" : "Live exchange requests — old item collected, new item delivered by a warehouse rider"}
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("exchanges") }]}
      filters={
        <div className="space-y-3">
          {q.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{q.error}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={statusOptions(EXCHANGE_STATUS)}
            searchPlaceholder={fr ? "Référence, commande, client…" : "Reference, order, customer…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "reference", label: fr ? "ID échange" : "Exchange ID", render: (row) => (
          <Link href={ops(`/exchanges/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
        )},
        { key: "orderReference", label: fr ? "ID commande" : "Order ID" },
        { key: "customerName", label: t("customer") },
        { key: "fromSku", label: fr ? "Ancien SKU" : "Old SKU" },
        { key: "toSku", label: fr ? "Nouveau SKU" : "New SKU" },
        { key: "priceDiffUsd", label: fr ? "Diff. prix" : "Price Diff", render: (row) => formatCurrency(Number(row.priceDiffUsd), locale) },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "dispatched" || row.status === "delivered" ? "success" : row.status === "rejected" ? "danger" : "warning"}>
            {pick(EXCHANGE_STATUS[String(row.status)], fr, String(row.status))}
          </Badge>
        )},
        { key: "createdAt", label: fr ? "Demandé le" : "Requested", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/exchanges/${row.id}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
