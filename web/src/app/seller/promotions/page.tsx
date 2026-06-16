"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { promotionList } from "@/lib/seller-entities";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "scheduled", label: "Scheduled", labelFr: "Planifié" },
  { value: "ended", label: "Ended", labelFr: "Terminé" },
];

export default function SellerPromotionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(promotionList, filters, {
        searchFields: ["campaign", "products"],
        dateField: "startDate",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title={t("promotions")}
      subtitle={fr ? "Vue liste — Campagne, Produits, Remise, Date de début/fin, Statut" : "List View — Campaign, Products, Discount, Start/End Date, Status"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("promotions") }]}
      actions={
        <Link href="/seller/promotions/create" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          {fr ? "Créer une campagne" : "Create Campaign"}
        </Link>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "Campagne, produits…" : "Campaign, products…"}
        />
      }
      columns={[
        { key: "campaign", label: fr ? "Campagne" : "Campaign", render: (row) => (
          <Link href={`/seller/promotions/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.campaign)}</Link>
        )},
        { key: "products", label: fr ? "Produits" : "Products" },
        { key: "discount", label: fr ? "Remise" : "Discount", render: (row) => `${row.discount}%` },
        { key: "startDate", label: fr ? "Début" : "Start" },
        { key: "endDate", label: fr ? "Fin" : "End" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "active" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/promotions/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
