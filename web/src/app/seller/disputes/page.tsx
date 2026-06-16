"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useDisputes } from "@/context/dispute-context";
import { useLocale } from "@/context/locale-context";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "seller_responded", label: "Seller responded", labelFr: "Réponse vendeur" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
  { value: "closed", label: "Closed", labelFr: "Fermé" },
];

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  open: "warning",
  seller_responded: "info",
  resolved: "success",
  closed: "default",
};

export default function SellerDisputesPage() {
  const { disputes } = useDisputes();
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(disputes, filters, {
        searchFields: ["id", "orderId", "buyerName", "productName", "reason"],
        dateField: "createdAt",
        statusField: "status",
      }),
    [disputes, filters]
  );

  return (
    <SellerListPage
      title={locale === "fr" ? "Litiges" : "Disputes"}
      subtitle={
        locale === "fr"
          ? "Gérer les litiges clients liés à vos commandes"
          : "Manage customer disputes on your orders"
      }
      breadcrumbs={[
        { label: "Seller", href: "/seller" },
        { label: locale === "fr" ? "Litiges" : "Disputes" },
      ]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={
            locale === "fr" ? "ID litige, commande, client…" : "Dispute ID, order, buyer…"
          }
        />
      }
      columns={[
        {
          key: "id",
          label: locale === "fr" ? "ID litige" : "Dispute ID",
          render: (row) => (
            <Link
              href={`/seller/disputes/${row.id}`}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              {String(row.id)}
            </Link>
          ),
        },
        {
          key: "orderId",
          label: locale === "fr" ? "Commande" : "Order",
          render: (row) => (
            <Link
              href={`/seller/orders/${row.orderId}`}
              className="text-[var(--primary)] hover:underline"
            >
              {String(row.orderId)}
            </Link>
          ),
        },
        { key: "buyerName", label: locale === "fr" ? "Client" : "Buyer" },
        { key: "productName", label: locale === "fr" ? "Produit" : "Product" },
        {
          key: "reason",
          label: locale === "fr" ? "Motif" : "Reason",
          render: (row) => (
            <span className="max-w-[10rem] text-slate-600">
              {String(row.reason).replace(/_/g, " ")}
            </span>
          ),
        },
        {
          key: "status",
          label: t("status"),
          render: (row) => (
            <Badge variant={statusVariant[row.status as string] ?? "default"}>
              {String(row.status).replace(/_/g, " ")}
            </Badge>
          ),
        },
        { key: "createdAt", label: t("date") },
        {
          key: "actions",
          label: t("action"),
          render: (row) => (
            <Link
              href={`/seller/disputes/${row.id}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              {t("view")}
            </Link>
          ),
        },
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
