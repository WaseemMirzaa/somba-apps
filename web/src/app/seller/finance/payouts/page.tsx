"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { payoutList } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested", labelFr: "Demandé" },
  { value: "processing", label: "Processing", labelFr: "En cours" },
  { value: "paid", label: "Paid", labelFr: "Payé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

export default function SellerPayoutsPage() {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(payoutList, filters, {
        searchFields: ["id", "method"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title={t("payouts")}
      subtitle="Request ID, Amount, Method, Status, Date"
      breadcrumbs={[
        { label: "Seller", href: "/seller" },
        { label: "Finance", href: "/seller/finance" },
        { label: t("payouts") },
      ]}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/seller/finance/payouts/pending"
            className="rounded-lg border border-[var(--primary-tint)] px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary-light)]"
          >
            {locale === "fr" ? "Voir les éléments en attente" : "View breakdown"}
          </Link>
          <Link href="/seller/finance/payouts/request" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">{t("requestPayout")}</Link>
        </div>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Request ID, method…"
        />
      }
      columns={[
        { key: "id", label: "Request ID", render: (row) => (
          <Link href={`/seller/finance/payouts/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "method", label: "Method" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "paid" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "date", label: t("date") },
        { key: "items", label: locale === "fr" ? "Articles" : "Items", render: (row) => String(row.itemCount ?? "—") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex flex-col gap-1">
            <Link href={`/seller/finance/payouts/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
              {locale === "fr" ? "Voir détail" : "View breakdown"}
            </Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
