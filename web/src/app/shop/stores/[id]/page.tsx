"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ProductCard } from "@/components/landing/product-card";
import { getSeller } from "@/lib/entities";
import { products, stores } from "@/lib/mock-data";

export default function ShopStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seller = getSeller(Number(id));
  const store = stores.find((s) => s.name === seller?.storeName) ?? stores[0];
  const storeProducts = products.filter((p) => p.seller === seller?.storeName || p.seller === store.name);

  if (!seller) {
    return <div className="text-center text-slate-500">Store not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-2xl border border-blue-100 bg-white p-6">
        <div className="relative h-20 w-20 overflow-hidden rounded-full">
          <Image src={store.image} alt={seller.storeName} fill className="object-cover" sizes="80px" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{seller.storeName}</h1>
          <p className="text-slate-500">⭐ {seller.rating || store.rating} · {store.followers.toLocaleString()} followers · {store.products} products</p>
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{store.badge} Seller</span>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title="About">
          <p className="text-sm text-slate-600">{seller.storeName} — {seller.category} specialist based in {seller.city}, {seller.country}.</p>
        </DetailGridSection>

        <DetailGridSection title="Store Reviews">
          <p className="text-sm text-slate-500">Store rating: ⭐ {seller.rating || store.rating}</p>
        </DetailGridSection>

        <DetailGridSection title="Policies">
          <p className="text-sm text-slate-600">7-day return policy. Free shipping on orders over $50.</p>
        </DetailGridSection>

        <DetailGridSection title="Products" span={3}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(storeProducts.length ? storeProducts : products.slice(0, 4)).map((p) => (
              <Link key={p.id} href={`/shop/products/${p.id}`}>
                <ProductCard product={p} />
              </Link>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
