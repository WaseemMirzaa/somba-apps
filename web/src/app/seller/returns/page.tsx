"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters, timelineRequestDate } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { sellerReturnList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
  { value: "refunded", label: "Refunded", labelFr: "Remboursé" },
];

export default function SellerReturnsPage() {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerReturnList, filters, {
        searchFields: ["id", "orderId", "customer", "reason"],
        dateField: timelineRequestDate,
        statusField: "status",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title={t("returns")}
      subtitle="List View — Return ID, Order, Customer, Reason, Amount, Status"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("returns") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Return ID, order, customer…"
        />
      }
      columns={[
        { key: "id", label: "Return ID", render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order" },
        { key: "customer", label: "Customer" },
        { key: "reason", label: "Reason" },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
