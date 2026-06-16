"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters, timelineRequestDate } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { sellerReplacementList } from "@/lib/seller-entities";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "processing", label: "Processing", labelFr: "En cours" },
  { value: "shipped", label: "Shipped", labelFr: "Expédié" },
  { value: "completed", label: "Completed", labelFr: "Terminé" },
];

export default function SellerReplacementsPage() {
  const { t } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerReplacementList, filters, {
        searchFields: ["id", "orderId", "customer", "sku"],
        dateField: timelineRequestDate,
        statusField: "status",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title={t("replacements")}
      subtitle="List View — Replacement ID, Order, Customer, SKU, Status"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("replacements") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Case ID, order, customer, SKU…"
        />
      }
      columns={[
        { key: "id", label: "Case ID", render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "sku", label: "SKU" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
