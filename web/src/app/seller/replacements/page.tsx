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

const REPLACEMENT_STATUS_LABELS: Record<string, { en: string; fr: string }> = {
  pending: { en: "Pending", fr: "En attente" },
  processing: { en: "Processing", fr: "En cours" },
  allocated: { en: "Allocated", fr: "Alloué" },
  shipped: { en: "Shipped", fr: "Expédié" },
  completed: { en: "Completed", fr: "Terminé" },
};

function replacementStatusLabel(status: string, fr: boolean) {
  const entry = REPLACEMENT_STATUS_LABELS[status];
  if (entry) return fr ? entry.fr : entry.en;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SellerReplacementsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
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
      subtitle={
        fr
          ? "Vue liste — N° dossier, commande, client, SKU, statut"
          : "List View — Replacement ID, Order, Customer, SKU, Status"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("replacements") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "N° dossier, commande, client, SKU…" : "Case ID, order, customer, SKU…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "N° dossier" : "Case ID", render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order" },
        { key: "customer", label: fr ? "Client" : "Customer" },
        { key: "sku", label: "SKU" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{replacementStatusLabel(String(row.status), fr)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/replacements/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
