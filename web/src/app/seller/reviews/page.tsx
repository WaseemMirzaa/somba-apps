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
  const { t } = useLocale();
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
      subtitle="List View — Customer, Product, Rating, Review, Date"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("reviews") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          searchPlaceholder="Customer, product, review…"
          showStatusFilter={false}
        />
      }
      columns={[
        { key: "customer", label: "Customer" },
        { key: "product", label: "Product", render: (row) => (
          <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">{String(row.product)}</Link>
        )},
        { key: "rating", label: "Rating", render: (row) => "★".repeat(row.rating as number) },
        { key: "review", label: "Review" },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            {replied.has(row.productId as number) ? (
              <span className="text-emerald-600">Replied ✓</span>
            ) : (
              <button onClick={() => { setReplied((s) => new Set(s).add(row.productId as number)); toast("Reply sent to customer"); }} className="text-[var(--primary)] hover:underline">Reply</button>
            )}
            <button onClick={() => toast("Review reported to admin", "info")} className="text-slate-500 hover:underline">Report</button>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
