"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useSellerData } from "@/lib/seller";
import { PAYOUT_STATUS_OPTIONS, payoutMethodLabel, payoutStatusLabel, payoutStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerPayoutsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { payoutList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(payoutList, filters, {
        searchFields: ["id", "methodKey", "providerRef"],
        dateField: "date",
        statusField: "status",
      }),
    [payoutList, filters]
  );

  return (
    <SellerListPage
      title={t("payouts")}
      subtitle={fr ? "Vos demandes de versement en direct : référence, montant, méthode, statut" : "Your payout requests, live: reference, amount, method, status"}
      breadcrumbs={[
        { label: fr ? "Vendeur" : "Seller", href: "/seller" },
        { label: t("finance"), href: "/seller/finance" },
        { label: t("payouts") },
      ]}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <NavLinkButton href="/seller/finance/payouts/pending">
            {fr ? "Gains par commande" : "Earnings per order"}
          </NavLinkButton>
          <Link href="/seller/finance/payouts/request" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">{t("requestPayout")}</Link>
        </div>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={PAYOUT_STATUS_OPTIONS}
          searchPlaceholder={fr ? "Référence, méthode…" : "Request ID, method…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "Référence" : "Request ID", render: (row) => (
          <Link href={`/seller/finance/payouts/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "methodKey", label: fr ? "Méthode" : "Method", render: (row) => payoutMethodLabel(String(row.methodKey), fr) },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={payoutStatusVariant(String(row.status))}>{payoutStatusLabel(String(row.status), fr)}</Badge>
        )},
        { key: "date", label: t("date") },
        { key: "providerRef", label: fr ? "Réf. de virement" : "Transfer ref.", render: (row) => String(row.providerRef ?? "—") },
        {
          key: "note",
          label: fr ? "Note de la finance" : "Finance note",
          render: (row) => (row.note ? <span className={row.status === "rejected" ? "text-red-700" : "text-slate-600"}>{String(row.note)}</span> : "—"),
        },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex flex-col gap-1">
            <Link href={`/seller/finance/payouts/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
              {fr ? "Voir le relevé" : "View statement"}
            </Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
