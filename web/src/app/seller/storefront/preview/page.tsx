"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import { useSellerData } from "@/lib/seller";
import { productStatusLabel, productStatusVariant } from "@/lib/seller-labels";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";

export default function SellerStorefrontPreviewPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { sellerStore, sellerProductList, seller } = useSellerData();
  const live = sellerProductList.filter((p) => p.status === "live");
  const hidden = sellerProductList.length - live.length;

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Aperçu vitrine" : "Storefront Preview"} backHref="/seller/storefront" />
      <div className="card-premium p-6">
        <div className="h-32 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600" />
        <h2 className="mt-4 text-xl font-bold">{sellerStore.name}</h2>
        <p className="text-sm text-slate-500">
          {sellerStore.badge} · {sellerStore.rating > 0 ? `⭐ ${Number(sellerStore.rating).toFixed(1)}` : fr ? "Pas encore noté" : "Not rated yet"} · {live.length} {fr ? "produit(s) en ligne" : "live product(s)"}
        </p>
        {hidden > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {fr ? `${hidden} produit(s) non visible(s) par les clients (en attente, en pause ou refusés).` : `${hidden} product(s) are not visible to shoppers (pending, paused or rejected).`}
          </p>
        )}
      </div>
      {live.length === 0 ? (
        <p className="text-sm text-slate-500">{fr ? "Aucun produit en ligne pour le moment." : "No live products yet."}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((p) => (
            <Link key={p.id} href={`/seller/products/${p.id}`} className="card-premium overflow-hidden">
              <div className="aspect-[4/3] w-full overflow-hidden"><ProductImage src={p.image} alt={p.name} /></div>
              <div className="space-y-1 p-4">
                <p className="truncate font-semibold">{fr ? p.nameFr : p.name}</p>
                <p className="text-sm text-slate-600">{formatCurrency(p.price, locale)}</p>
                <Badge variant={productStatusVariant(p.status)}>{productStatusLabel(p.status, fr)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      {seller && (
        <Link href={`/shop/stores/${seller.id}`} className="text-sm text-[var(--primary)] hover:underline">
          {fr ? "Voir côté client →" : "View as customer →"}
        </Link>
      )}
    </div>
  );
}
