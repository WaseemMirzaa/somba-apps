"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { useShop } from "@/context/shop-context";
import { products } from "@/lib/mock-data";
import { useLocale } from "@/context/locale-context";

export default function ShopWishlistPage() {
  const { wishlist } = useShop();
  const { locale, t } = useLocale();
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("wishlist")}
        subtitle={`${wishlistProducts.length} ${t("savedItemsCount")}`}
        breadcrumbs={[{ label: t("shop"), href: "/" }, { label: t("wishlist") }]}
      />

      {wishlistProducts.length === 0 ? (
        <p className="text-center text-slate-500 py-12">{t("noSavedItems")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {wishlistProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
