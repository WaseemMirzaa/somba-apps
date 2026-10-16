"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";

export default function SellerReviewsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerReviewList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () => applyListFilters(sellerReviewList, filters, { searchFields: ["customer", "product", "review"], dateField: "date" }),
    [sellerReviewList, filters]
  );

  return (
    <SellerListPage
      title={t("reviews")}
      subtitle={fr ? "Avis clients sur vos produits (lecture seule)" : "Customer reviews on your products (read-only)"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("reviews") }]}
      filters={
        <div className="space-y-2">
          <ListFilters values={filters} onChange={setFilters} searchPlaceholder={fr ? "Client, produit, avis…" : "Customer, product, review…"} showStatusFilter={false} />
          <p className="text-xs text-slate-500">
            {fr
              ? "Répondre aux avis ou les signaler n'est pas encore possible : le serveur n'a pas cette fonction. Pour un avis abusif, écrivez au support en citant le produit et l'auteur."
              : "Replying to or reporting reviews is not possible yet: the server has no such function. For an abusive review, write to support quoting the product and author."}
          </p>
        </div>
      }
      columns={[
        { key: "customer", label: t("customer") },
        { key: "product", label: fr ? "Produit" : "Product", render: (row) => (
          <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">{String(row.product)}</Link>
        )},
        { key: "rating", label: fr ? "Note" : "Rating", render: (row) => "★".repeat(row.rating as number) },
        { key: "review", label: fr ? "Avis" : "Review", render: (row) => (
          <p className="max-w-sm text-slate-700">{String(row.review)}</p>
        )},
        { key: "date", label: t("date") },
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
