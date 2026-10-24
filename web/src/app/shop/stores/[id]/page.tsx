"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ProductCard } from "@/components/landing/product-card";
import { toShopProduct, type ShopProduct } from "@/lib/catalog";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Product, Seller } from "@/lib/realtime/types";
import { StoreHeader } from "@/components/shop/store-header";
import { localized } from "@/lib/i18n-fields";

type Storefront = { seller: Seller & { pickupAddress?: string | null }; products: Product[] };

const BADGE: Record<string, { en: string; fr: string }> = {
  gold: { en: "Gold", fr: "Or" },
  silver: { en: "Silver", fr: "Argent" },
  bronze: { en: "Bronze", fr: "Bronze" },
  somba_assured: { en: "Somba Assured", fr: "Somba Assuré" },
};

export default function ShopStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const [store, setStore] = useState<Storefront | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id || rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<Storefront>("sellers:storefront", { id })
      .then((s) => {
        if (!alive) return;
        setStore(s);
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setStore(null);
        setError(e.message);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [id, rt.status]);

  if (!loaded) {
    return <div className="text-center text-slate-500">{fr ? "Chargement…" : "Loading…"}</div>;
  }

  if (!store) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-20 text-center">
        <p className="text-lg font-semibold text-slate-900">{fr ? "Boutique introuvable" : "Store not found"}</p>
        {error && <p className="text-sm text-slate-500">{error}</p>}
        <Link href="/shop/products" className="inline-block text-sm font-medium text-[var(--primary)] hover:underline">
          {fr ? "← Voir les produits" : "← Browse products"}
        </Link>
      </div>
    );
  }

  const { seller } = store;
  const products: ShopProduct[] = store.products.map(toShopProduct);
  const badge = BADGE[seller.badge];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
        <StoreHeader name={seller.name} logoUrl={seller.logoUrl} bannerUrl={seller.bannerUrl} />
        <div className="px-6 pb-6 pt-3">
          <h1 className="text-2xl font-bold">{seller.name}</h1>
          <p className="text-slate-500">
            {seller.rating > 0 ? `⭐ ${seller.rating} · ` : ""}
            {products.length} {fr ? "produits" : "products"}
          </p>
          {badge && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {fr ? `Vendeur ${badge.fr}` : `${badge.en} Seller`}
            </span>
          )}
          {localized(seller, "description", fr) && (
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-slate-700">{localized(seller, "description", fr)}</p>
          )}
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Politiques" : "Policies"}>
          <p className="text-sm text-slate-600">
            {fr ? "Retours sous 7 jours. " : "7-day returns. "}
            <Link href="/legal/returns" className="text-[var(--primary)] hover:underline">{fr ? "Politique de retour" : "Return policy"}</Link>
            {" · "}
            <Link href="/legal/shipping" className="text-[var(--primary)] hover:underline">{fr ? "Livraison" : "Shipping"}</Link>
          </p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits" : "Products"} span={3}>
          {products.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Cette boutique n'a aucun produit en ligne pour le moment." : "This store has no live products right now."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
