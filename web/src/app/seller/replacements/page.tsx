"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import {
  REPLACEMENT_STATUS_OPTIONS,
  replacementStatusLabelReal,
  replacementStatusVariantReal,
} from "@/lib/seller-labels";

export default function SellerReplacementsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerReplacementList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerReplacementList, filters, {
        searchFields: ["id", "orderId", "customer", "sku", "productName"],
        dateField: "date",
        statusField: "status",
      }),
    [sellerReplacementList, filters]
  );

  return (
    <SellerListPage
      title={t("replacements")}
      subtitle={
        fr
          ? "Remplacements en direct (lecture seule) : l'entrepôt les traite"
          : "Live replacements (read-only): the warehouse processes them"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("replacements") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={REPLACEMENT_STATUS_OPTIONS}
          searchPlaceholder={fr ? "N° dossier, commande, client, SKU…" : "Case ID, order, customer, SKU…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "N° dossier" : "Case ID", render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order" },
        { key: "customer", label: t("customer") },
        { key: "productName", label: fr ? "Produit" : "Product" },
        { key: "sku", label: "SKU" },
        { key: "status", label: t("status"), render: (row) => <Badge variant={replacementStatusVariantReal(String(row.status))}>{replacementStatusLabelReal(String(row.status), fr)}</Badge> },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
