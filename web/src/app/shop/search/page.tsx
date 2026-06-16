"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { PageLoader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";
import { products } from "@/lib/mock-data";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") || "").toLowerCase();
  const { t } = useLocale();

  const results = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.nameFr.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.seller.toLowerCase().includes(query)
      )
    : products;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("searchResults")}
        subtitle={query ? `"${query}" — ${results.length} results` : `${results.length} products`}
        breadcrumbs={[
          { label: "Shop", href: "/" },
          { label: t("searchResults") },
        ]}
      />

      {results.length === 0 ? (
        <div className="card-premium py-16 text-center">
          <p className="text-slate-500">No products found for &quot;{query}&quot;</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {results.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopSearchPage() {
  return (
    <Suspense fallback={<PageLoader className="py-12" />}>
      <SearchResults />
    </Suspense>
  );
}
