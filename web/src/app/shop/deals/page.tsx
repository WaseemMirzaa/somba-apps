"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { products } from "@/lib/mock-data";
import { useLocale } from "@/context/locale-context";

export default function ShopDealsPage() {
  const { locale } = useLocale();
  const deals = products.filter((p) => p.discount >= 13);

  return (
    <div className="space-y-6">
      <PageHeader title={locale === "fr" ? "Ventes flash" : "Flash Deals"} subtitle={locale === "fr" ? "Offres limitées" : "Limited-time offers"} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {deals.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
