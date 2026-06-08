"use client";

import { useState } from "react";
import Link from "next/link";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerReviewList } from "@/lib/seller-entities";

export default function SellerReviewsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [replied, setReplied] = useState<Set<number>>(new Set());

  return (
    <SellerListPage
      title={t("reviews")}
      subtitle="List View — Customer, Product, Rating, Review, Date"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("reviews") }]}
      columns={[
        { key: "customer", label: "Customer" },
        { key: "product", label: "Product", render: (row) => (
          <Link href={`/seller/products/${row.productId}`} className="text-sky-600 hover:underline">{String(row.product)}</Link>
        )},
        { key: "rating", label: "Rating", render: (row) => "★".repeat(row.rating as number) },
        { key: "review", label: "Review" },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            {replied.has(row.productId as number) ? (
              <span className="text-emerald-600">Replied ✓</span>
            ) : (
              <button onClick={() => { setReplied((s) => new Set(s).add(row.productId as number)); toast("Reply sent to customer"); }} className="text-sky-600 hover:underline">Reply</button>
            )}
            <button onClick={() => toast("Review reported to admin", "info")} className="text-slate-500 hover:underline">Report</button>
          </div>
        )},
      ]}
      data={sellerReviewList as unknown as Record<string, unknown>[]}
    />
  );
}
