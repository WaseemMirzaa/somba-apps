"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { formatCurrency } from "@/lib/utils";
import { EXCHANGE_STATUS_OPTIONS, exchangeStatusLabel, exchangeStatusVariant } from "@/lib/seller-labels";

/** Exchanges on this store's items: the customer swaps one item for another. The warehouse processes them. */
export default function SellerExchangesPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerExchangeList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerExchangeList, filters, {
        searchFields: ["id", "orderId", "customer", "fromName", "toName", "fromSku", "toSku"],
        dateField: "date",
        statusField: "status",
      }),
    [sellerExchangeList, filters],
  );

  return (
    <SellerListPage
      title={fr ? "Échanges" : "Exchanges"}
      subtitle={
        fr
          ? "Échanges en direct (lecture seule) : l'entrepôt les traite, vous êtes notifié à chaque étape"
          : "Live exchanges (read-only): the warehouse processes them and you are notified at each step"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: fr ? "Échanges" : "Exchanges" }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={EXCHANGE_STATUS_OPTIONS}
          searchPlaceholder={fr ? "N° dossier, commande, client, article…" : "Case ID, order, customer, item…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "N° dossier" : "Case ID", render: (row) => (
          <Link href={`/seller/exchanges/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order" },
        { key: "customer", label: t("customer") },
        { key: "swap", label: fr ? "Échange" : "Swap", render: (row) => (
          <span className="text-sm">{String(row.fromName)} → {String(row.toName)}</span>
        )},
        { key: "priceDiffUsd", label: fr ? "Écart de prix" : "Price difference", render: (row) => formatCurrency(Number(row.priceDiffUsd)) },
        { key: "status", label: t("status"), render: (row) => <Badge variant={exchangeStatusVariant(String(row.status))}>{exchangeStatusLabel(String(row.status), fr)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/exchanges/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
