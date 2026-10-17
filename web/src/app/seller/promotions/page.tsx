"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { CAMPAIGN_STATUS_OPTIONS, campaignStatusLabel, campaignStatusVariant } from "@/lib/seller-labels";

export default function SellerPromotionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { promotionList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(promotionList, filters, {
        searchFields: ["campaign", "reference"],
        dateField: "startDate",
        statusField: "status",
      }),
    [promotionList, filters]
  );

  return (
    <SellerListPage
      title={t("promotions")}
      subtitle={fr ? "Vos campagnes en direct : une campagne est approuvée par le marketing avant de démarrer" : "Your campaigns, live: marketing approves a campaign before it starts"}
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
          statusOptions={CAMPAIGN_STATUS_OPTIONS}
          searchPlaceholder={fr ? "Campagne, produits…" : "Campaign, products…"}
        />
      }
      columns={[
        { key: "campaign", label: fr ? "Campagne" : "Campaign", render: (row) => (
          <Link href={`/seller/promotions/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.campaign)}</Link>
        )},
        { key: "reference", label: fr ? "Référence" : "Reference" },
        { key: "discount", label: fr ? "Remise" : "Discount", render: (row) => `${row.discount}%` },
        { key: "products", label: fr ? "Produits" : "Products", render: (row) => ((row.productIds as string[] | undefined)?.length ? String(row.products) : fr ? "Tous" : "All") },
        { key: "startDate", label: fr ? "Début" : "Start" },
        { key: "endDate", label: fr ? "Fin" : "End" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={campaignStatusVariant(String(row.status))}>{campaignStatusLabel(String(row.status), fr)}</Badge>
        )},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/promotions/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
      emptyMessage={fr ? "Aucune campagne. Créez-en une pour proposer une remise sur vos produits." : "No campaigns yet. Create one to offer a discount on your products."}
    />
  );
}
