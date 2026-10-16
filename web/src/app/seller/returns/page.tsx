"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { CASE_STATUS_OPTIONS, caseStatusLabel, caseStatusVariant } from "@/lib/seller-labels";
import { formatCurrency } from "@/lib/utils";

export default function SellerReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerReturnList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerReturnList, filters, {
        searchFields: ["id", "orderId", "customer", "reason"],
        dateField: "date",
        statusField: "status",
      }),
    [sellerReturnList, filters]
  );

  return (
    <SellerListPage
      title={t("returns")}
      subtitle={
        fr
          ? "Retours demandés par les clients sur vos commandes. La décision revient à l'administration."
          : "Returns customers requested on your orders. The administration makes the decision."
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("returns") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={CASE_STATUS_OPTIONS}
          searchPlaceholder={fr ? "N° retour, commande, client…" : "Return ID, order, customer…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "N° retour" : "Return ID", render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order" },
        { key: "customer", label: t("customer") },
        { key: "reason", label: fr ? "Motif" : "Reason", },
        { key: "amount", label: t("amount"), render: (row) => (Number(row.amount) > 0 ? formatCurrency(row.amount as number, locale) : "—") },
        { key: "status", label: t("status"), render: (row) => <Badge variant={caseStatusVariant(String(row.status))}>{caseStatusLabel(String(row.status), fr)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
