"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryImage } from "@/components/shop/category-image";
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
            href={`/shop/products?category=${encodeURIComponent(cat.uuid)}`}
            className="card-premium group overflow-hidden"
          >
            <div className="relative h-40 overflow-hidden">
              <CategoryImage
                src={cat.image}
                icon={cat.icon}
                alt={locale === "fr" ? cat.nameFr : cat.name}
                className="transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              {/* Anchored on both sides so a long name wraps (two lines) instead of running out of the tile. */}
              <div className="absolute inset-x-4 bottom-4">
                <h3 className="line-clamp-2 break-words font-[family-name:var(--font-display)] text-lg font-bold leading-snug text-white">
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
