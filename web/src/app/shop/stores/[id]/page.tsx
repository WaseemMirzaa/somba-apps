"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ProductCard } from "@/components/landing/product-card";
import { getSeller } from "@/lib/entities";
import { products, stores } from "@/lib/mock-data";
import { useLocale } from "@/context/locale-context";
import { storeNameLabel } from "@/lib/locale-helpers";

export default function ShopStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const seller = getSeller(Number(id));
  const store = stores.find((s) => s.name === seller?.storeName) ?? stores[0];
  const storeProducts = products.filter((p) => p.seller === seller?.storeName || p.seller === store.name);

  if (!seller) {
    return <div className="text-center text-slate-500">{t("notFound")}</div>;
  }

  const displayName = storeNameLabel(locale, seller.storeName, seller.storeNameFr);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-2xl border border-blue-100 bg-white p-6">
        <div className="relative h-20 w-20 overflow-hidden rounded-full">
          <Image src={store.image} alt={displayName} fill className="object-cover" sizes="80px" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-slate-500">⭐ {seller.rating || store.rating} · {store.followers.toLocaleString()} {t("followers")} · {store.products} {t("productsCount")}</p>
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{store.badge} {t("seller")}</span>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={t("about")}>
          <p className="text-sm text-slate-600">{displayName} — {t("specialist")} {seller.category} {t("basedIn")} {seller.city}, {seller.country}.</p>
        </DetailGridSection>

        <DetailGridSection title={t("storeReviews")}>
          <p className="text-sm text-slate-500">{t("storeRatingLabel")}: ⭐ {seller.rating || store.rating}</p>
        </DetailGridSection>

        <DetailGridSection title={t("policies")}>
          <p className="text-sm text-slate-600">{t("storeReturnPolicy")}</p>
        </DetailGridSection>

        <DetailGridSection title={t("products")} span={3}>
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
