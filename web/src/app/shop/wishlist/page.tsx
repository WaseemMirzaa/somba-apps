"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { useShop } from "@/context/shop-context";
import { useLocale } from "@/context/locale-context";
import { useCatalog } from "@/lib/catalog";

export default function ShopWishlistPage() {
  const { wishlist } = useShop();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const products = useCatalog();
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <div className="space-y-8">
      <PageHeader
        title={fr ? "Liste de souhaits" : "Wishlist"}
        subtitle={fr ? `${wishlistProducts.length} articles enregistrés` : `${wishlistProducts.length} saved items`}
        breadcrumbs={[{ label: fr ? "Boutique" : "Shop", href: "/" }, { label: fr ? "Liste de souhaits" : "Wishlist" }]}
      />

      {wishlistProducts.length === 0 ? (
        <p className="text-center text-slate-500 py-12">{fr ? "Aucun article enregistré" : "No saved items yet"}</p>
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
