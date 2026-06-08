"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { useShop } from "@/context/shop-context";
import { products } from "@/lib/mock-data";

export default function ShopWishlistPage() {
  const { wishlist } = useShop();
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Wishlist"
        subtitle={`${wishlistProducts.length} saved items`}
        breadcrumbs={[{ label: "Shop", href: "/" }, { label: "Wishlist" }]}
      />

      {wishlistProducts.length === 0 ? (
        <p className="text-center text-slate-500 py-12">No saved items yet</p>
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
