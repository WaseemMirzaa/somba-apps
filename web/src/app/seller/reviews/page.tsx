"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerReviewList } from "@/lib/seller-entities";

export default function SellerReviewsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [replied, setReplied] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(sellerReviewList, filters, {
        searchFields: ["customer", "product", "review"],
        dateField: "date",
      }),
    [filters]
  );

  return (
    <SellerListPage
      title={t("reviews")}
      subtitle={fr ? "Vue liste — Client, Produit, Note, Avis, Date" : "List View — Customer, Product, Rating, Review, Date"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("reviews") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          searchPlaceholder={fr ? "Client, produit, avis…" : "Customer, product, review…"}
          showStatusFilter={false}
        />
      }
      columns={[
        { key: "customer", label: fr ? "Client" : "Customer" },
        { key: "product", label: fr ? "Produit" : "Product", render: (row) => (
          <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">{String(row.product)}</Link>
        )},
        { key: "rating", label: fr ? "Note" : "Rating", render: (row) => "★".repeat(row.rating as number) },
        { key: "review", label: fr ? "Avis" : "Review", render: (row) => (fr ? String(row.reviewFr ?? row.review) : String(row.review)) },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            {replied.has(row.productId as number) ? (
              <span className="text-emerald-600">{fr ? "Répondu ✓" : "Replied ✓"}</span>
            ) : (
              <button onClick={() => { setReplied((s) => new Set(s).add(row.productId as number)); toast(fr ? "Réponse envoyée au client" : "Reply sent to customer"); }} className="text-[var(--primary)] hover:underline">{fr ? "Répondre" : "Reply"}</button>
            )}
            <button onClick={() => toast(fr ? "Avis signalé à l'administrateur" : "Review reported to admin", "info")} className="text-slate-500 hover:underline">{fr ? "Signaler" : "Report"}</button>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
