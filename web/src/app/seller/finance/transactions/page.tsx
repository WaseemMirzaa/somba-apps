"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useSellerData } from "@/lib/seller";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed", labelFr: "Terminé" },
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "refunded", label: "Refunded", labelFr: "Remboursé" },
];

const STATUS_FR: Record<string, string> = {
  paid: "Payé",
  completed: "Terminé",
  pending: "En attente",
  refunded: "Remboursé",
  failed: "Échoué",
};

export default function SellerTransactionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { transactionList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(transactionList, filters, {
        searchFields: ["order", "customer"],
        dateField: "date",
        statusField: "status",
      }),
    [transactionList, filters]
  );

  return (
    <SellerListPage
      title={fr ? "Transactions" : "Transactions"}
      subtitle={fr ? "Commande, Client, Brut, Commission, Net, Statut, Date" : "Order, Customer, Gross, Commission, Net, Status, Date"}
      breadcrumbs={[
        { label: fr ? "Vendeur" : "Seller", href: "/seller" },
        { label: fr ? "Finance" : "Finance", href: "/seller/finance" },
        { label: fr ? "Transactions" : "Transactions" },
      ]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "Commande, client…" : "Order, customer…"}
        />
      }
      columns={[
        { key: "order", label: fr ? "Commande" : "Order", render: (row) => (
          <Link href={`/seller/orders/${row.order}`} className="text-[var(--primary)] hover:underline">{String(row.order)}</Link>
        )},
        { key: "customer", label: t("customer") },
        { key: "grossAmount", label: fr ? "Brut" : "Gross", render: (row) => formatCurrency(row.grossAmount as number, locale) },
        { key: "commission", label: fr ? "Commission" : "Commission", render: (row) => formatCurrency(row.commission as number, locale) },
        { key: "netAmount", label: fr ? "Net" : "Net", render: (row) => formatCurrency(row.netAmount as number, locale) },
        { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant="success">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
        { key: "date", label: fr ? "Date" : "Date" },
      ]}
      rowAction={(row) => (
        <Link href={`/seller/orders/${row.order}`} className="text-sm text-[var(--nav-accent)] hover:underline">{t("view")}</Link>
      )}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
