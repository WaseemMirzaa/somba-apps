"use client";

import Link from "next/link";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { sellerReviewList } from "@/lib/seller-entities";

export default function SellerReviewsPage() {
  const { t } = useLocale();

  return (
    <SellerListPage
      title={t("reviews")}
      subtitle="List View — Customer, Product, Rating, Review, Date"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("reviews") }]}
      columns={[
        { key: "id", label: "ID", render: (row) => (
          <Link href={`/seller/reviews/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
        )},
        { key: "customer", label: "Customer" },
        { key: "product", label: "Product", render: (row) => (
          <Link href={`/seller/products/${row.productId}`} className="text-sky-600 hover:underline">{String(row.product)}</Link>
        )},
        { key: "rating", label: "Rating", render: (row) => "★".repeat(row.rating as number) },
        { key: "review", label: "Review" },
        { key: "date", label: t("date") },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/reviews/${row.id}`} className="text-xs text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={sellerReviewList as unknown as Record<string, unknown>[]}
    />
  );
}
