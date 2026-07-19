"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { useShopCategories } from "@/lib/catalog";

export default function ShopCategoriesPage() {
  const { t, locale } = useLocale();
  const categories = useShopCategories();

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("categories")}
        subtitle={locale === "fr" ? "Parcourir tous les rayons" : "Browse all departments"}
        breadcrumbs={[
          { label: locale === "fr" ? "Boutique" : "Shop", href: "/" },
          { label: t("categories") },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/shop/search?q=${encodeURIComponent(cat.name)}`}
            className="card-premium group overflow-hidden"
          >
            <div className="relative h-40 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cat.image}
                alt={cat.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4">
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-white">
                  {locale === "fr" ? cat.nameFr : cat.name}
                </h3>
                <p className="text-sm text-white/80">{locale === "fr" ? "Explorer →" : "Explore →"}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
