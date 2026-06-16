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

const RETURN_STATUS_LABELS: Record<string, { en: string; fr: string }> = {
  pending: { en: "Pending", fr: "En attente" },
  pending_inspection: { en: "Pending inspection", fr: "En attente d'inspection" },
  inspecting: { en: "Inspecting", fr: "Inspection" },
  approved: { en: "Approved", fr: "Approuvé" },
  rejected: { en: "Rejected", fr: "Rejeté" },
  refunded: { en: "Refunded", fr: "Remboursé" },
};

function returnStatusLabel(status: string, fr: boolean) {
  const entry = RETURN_STATUS_LABELS[status];
  if (entry) return fr ? entry.fr : entry.en;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SellerReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
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
      subtitle={
        fr
          ? "Vue liste — N° retour, commande, client, motif, montant, statut"
          : "List View — Return ID, Order, Customer, Reason, Amount, Status"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("returns") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "N° retour, commande, client…" : "Return ID, order, customer…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "N° retour" : "Return ID", render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "Commande" : "Order" },
        { key: "customer", label: t("customer") },
        { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => (fr ? String(row.reasonFr ?? row.reason) : String(row.reason)) },
        { key: "amount", label: t("amount"), render: (row) => formatCurrency(row.amount as number, locale) },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{returnStatusLabel(String(row.status), fr)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/returns/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
