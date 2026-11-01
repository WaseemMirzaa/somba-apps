"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import { useSellerData } from "@/lib/seller";
import { productStatusLabel, productStatusVariant } from "@/lib/seller-labels";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { StoreHeader } from "@/components/shop/store-header";
import { localized } from "@/lib/i18n-fields";

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
        <StoreHeader name={sellerStore.name} logoUrl={seller?.logoUrl} bannerUrl={seller?.bannerUrl} />
        <h2 className="mt-4 text-xl font-bold">{sellerStore.name}</h2>
        <p className="text-sm text-slate-500">
          {sellerStore.badge} · {sellerStore.rating > 0 ? `⭐ ${Number(sellerStore.rating).toFixed(1)}` : fr ? "Pas encore noté" : "Not rated yet"} · {live.length} {fr ? "produit(s) en ligne" : "live product(s)"}
        </p>
        {localized(seller, "description", fr) && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{localized(seller, "description", fr)}</p>
        )}
        {seller?.onVacation && seller.vacationUntil && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {fr
              ? `En vacances jusqu'au ${new Date(seller.vacationUntil).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })} : les clients ne peuvent pas commander.`
              : `On vacation until ${new Date(seller.vacationUntil).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}: shoppers cannot order.`}
          </p>
        )}
        {(seller?.handlingDays ?? 0) > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            {fr ? `Préparation : ${seller?.handlingDays} jour(s) avant la remise du colis.` : `Handling time: ${seller?.handlingDays} day(s) before the parcel is handed over.`}
          </p>
        )}
        {(["returnsPolicy", "shippingPolicy"] as const).map((k) => {
          const text = localized(seller, k, fr);
          return text ? (
            <div key={k} className="mt-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {k === "returnsPolicy" ? (fr ? "Politique de retour" : "Returns policy") : fr ? "Politique d'expédition" : "Shipping policy"}
              </h3>
              <p className="whitespace-pre-line text-sm text-slate-700">{text}</p>
            </div>
          ) : null;
        })}
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
