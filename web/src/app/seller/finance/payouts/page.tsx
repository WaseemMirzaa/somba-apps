"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useSellerData } from "@/lib/seller";
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
  const fr = locale === "fr";
  const { payoutList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(payoutList, filters, {
        searchFields: ["id", "method"],
        dateField: "date",
        statusField: "status",
      }),
    [payoutList, filters]
  );

  return (
    <SellerListPage
      title={t("payouts")}
      subtitle={fr ? "Référence, Montant, Méthode, Statut, Date" : "Request ID, Amount, Method, Status, Date"}
      breadcrumbs={[
        { label: fr ? "Vendeur" : "Seller", href: "/seller" },
        { label: t("finance"), href: "/seller/finance" },
        { label: t("payouts") },
      ]}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <NavLinkButton href="/seller/finance/payouts/pending">
            {fr ? "Voir les éléments en attente" : "View breakdown"}
          </NavLinkButton>
          <Link href="/seller/finance/payouts/request" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">{t("requestPayout")}</Link>
        </div>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "Référence, méthode…" : "Request ID, method…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "Référence" : "Request ID", render: (row) => (
          <Link href={`/seller/finance/payouts/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "method", label: fr ? "Méthode" : "Method", render: (row) => (fr ? String(row.methodFr ?? row.method) : String(row.method)) },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "paid" ? "success" : "warning"}>{fr ? String(row.statusFr ?? row.status) : String(row.status)}</Badge>
        )},
        { key: "date", label: t("date") },
        { key: "items", label: fr ? "Articles" : "Items", render: (row) => String(row.itemCount ?? "—") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex flex-col gap-1">
            <Link href={`/seller/finance/payouts/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
              {fr ? "Voir détail" : "View breakdown"}
            </Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
