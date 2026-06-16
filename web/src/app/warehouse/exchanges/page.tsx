"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { exchangeEntities } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "shipped", label: "Shipped", labelFr: "Expédié" },
  { value: "completed", label: "Completed", labelFr: "Terminé" },
];

export default function WarehouseExchangesPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(exchangeEntities, filters, {
        searchFields: ["id", "orderId", "customer"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <WarehouseListPage
      title={t("exchanges")}
      subtitle={fr ? "Demandes d'échange — ancienne variante retournée, nouvelle variante expédiée" : "Exchange requests — old variant returned, new variant dispatched"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("exchanges") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID échange, commande, client…" : "Exchange ID, order, customer…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID échange" : "Exchange ID", render: (row) => (
          <Link href={`/warehouse/exchanges/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "ID commande" : "Order ID" },
        { key: "customer", label: t("customer") },
        { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => {
          const exc = row as { reason?: string; reasonFr?: string };
          return <span className="font-medium text-red-700">{fr ? exc.reasonFr : exc.reason}</span>;
        }},
        { key: "oldSku", label: fr ? "Ancien SKU" : "Old SKU", render: (row) => {
          const exc = row as { oldProduct?: { sku: string } };
          return exc.oldProduct?.sku ?? "—";
        }},
        { key: "newSku", label: fr ? "Nouveau SKU" : "New SKU", render: (row) => {
          const exc = row as { newProduct?: { sku: string } };
          return exc.newProduct?.sku ?? "—";
        }},
        { key: "priceDifference", label: fr ? "Diff. prix" : "Price Diff", render: (row) => formatCurrency(row.priceDifference as number, locale) },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(fr ? row.statusFr : row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/warehouse/exchanges/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
