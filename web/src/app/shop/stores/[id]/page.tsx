"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ProductCard } from "@/components/landing/product-card";
import { getSeller } from "@/lib/entities";
import { products, stores, categories } from "@/lib/mock-data";
import { useLocale } from "@/context/locale-context";
import { useModeration } from "@/context/moderation-context";

export default function ShopStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { isSellerBlocked, isProductVisible } = useModeration();
  const seller = getSeller(Number(id));
  const store = stores.find((s) => s.name === seller?.storeName) ?? stores[0];
  const storeProducts = products.filter(
    (p) => (p.seller === seller?.storeName || p.seller === store.name) && isProductVisible(p)
  );
  const categoryFr = categories.find((c) => c.name === seller?.category)?.nameFr ?? seller?.category;

  if (!seller) {
    return <div className="text-center text-slate-500">{fr ? "Boutique introuvable" : "Store not found"}</div>;
  }

  if (isSellerBlocked(seller.id)) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-20 text-center">
        <p className="text-lg font-semibold text-slate-900">{fr ? "Boutique indisponible" : "Store unavailable"}</p>
        <p className="text-sm text-slate-500">
          {fr ? "Cette boutique n'est pas disponible pour le moment." : "This store is currently not available."}
        </p>
        <Link href="/shop" className="inline-block text-sm font-medium text-[var(--primary)] hover:underline">
          {fr ? "← Retour à la boutique" : "← Back to shop"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-2xl border border-blue-100 bg-white p-6">
        <div className="relative h-20 w-20 overflow-hidden rounded-full">
          <Image src={store.image} alt={seller.storeName} fill className="object-cover" sizes="80px" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{seller.storeName}</h1>
          <p className="text-slate-500">⭐ {seller.rating || store.rating} · {store.followers.toLocaleString()} {fr ? "abonnés" : "followers"} · {store.products} {fr ? "produits" : "products"}</p>
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{fr ? `Vendeur ${store.badgeFr}` : `${store.badge} Seller`}</span>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "À propos" : "About"}>
          <p className="text-sm text-slate-600">{fr ? `${seller.storeName} — spécialiste ${categoryFr} basé à ${seller.city}, ${seller.country}.` : `${seller.storeName} — ${seller.category} specialist based in ${seller.city}, ${seller.country}.`}</p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Avis sur la boutique" : "Store Reviews"}>
          <p className="text-sm text-slate-500">{fr ? "Note de la boutique" : "Store rating"}: ⭐ {seller.rating || store.rating}</p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Politiques" : "Policies"}>
          <p className="text-sm text-slate-600">{fr ? "Politique de retour sous 7 jours. Livraison gratuite pour les commandes de plus de 50 $." : "7-day return policy. Free shipping on orders over $50."}</p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits" : "Products"} span={3}>
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
