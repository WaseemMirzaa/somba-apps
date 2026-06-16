"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { transactionList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed", labelFr: "Terminé" },
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "refunded", label: "Refunded", labelFr: "Remboursé" },
];

export default function SellerTransactionsPage() {
  const { locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(transactionList, filters, {
        searchFields: ["order", "customer"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title="Transactions"
      subtitle="Order, Customer, Gross, Commission, Net, Status, Date"
      breadcrumbs={[
        { label: "Seller", href: "/seller" },
        { label: "Finance", href: "/seller/finance" },
        { label: "Transactions" },
      ]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Order, customer…"
        />
      }
      columns={[
        { key: "order", label: "Order", render: (row) => (
          <Link href={`/seller/orders/${row.order}`} className="text-[var(--primary)] hover:underline">{String(row.order)}</Link>
        )},
        { key: "customer", label: "Customer" },
        { key: "grossAmount", label: "Gross", render: (row) => formatCurrency(row.grossAmount as number, locale) },
        { key: "commission", label: "Commission", render: (row) => formatCurrency(row.commission as number, locale) },
        { key: "netAmount", label: "Net", render: (row) => formatCurrency(row.netAmount as number, locale) },
        { key: "status", label: "Status", render: (row) => <Badge variant="success">{String(row.status)}</Badge> },
        { key: "date", label: "Date" },
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
