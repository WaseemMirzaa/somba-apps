"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { priceView } from "@/lib/catalog";
import { useLocale } from "@/context/locale-context";
import { useShop } from "@/context/shop-context";
import { cn } from "@/lib/utils";
import { daysLabel, pickText } from "@/lib/i18n-fields";
import { trackCampaign, useCampaignView } from "@/lib/shop-engage";

interface ProductCardProps {
  product: {
    id: number | string;
    name: string;
    nameFr: string;
    price: number;
    originalPrice: number;
    discount: number;
    basePrice?: number;
    campaignPct?: number;
    campaignName?: string | null;
    campaignNameFr?: string | null;
    priceSource?: "base" | "flash" | "campaign";
    rating: number;
    reviews: number;
    image: string;
    deliveryDays?: number;
    /** A promoted product reports a campaign view when shown and a click when opened. */
    campaignId?: string | null;
    sellerOnVacation?: boolean;
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toggleWishlist, isInWishlist } = useShop();
  const name = fr ? product.nameFr : product.name;
  const view = priceView(product);
  const wished = isInWishlist(String(product.id));
  useCampaignView(product.campaignId);

  return (
    <article className="card-premium group relative overflow-hidden">
      <button
        type="button"
        onClick={() => toggleWishlist(String(product.id))}
        aria-pressed={wished}
        aria-label={
          wished
            ? fr ? `Retirer ${name} des favoris` : `Remove ${name} from wishlist`
            : fr ? `Ajouter ${name} aux favoris` : `Add ${name} to wishlist`
        }
        className={cn(
          "absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 shadow-md backdrop-blur transition-all hover:scale-110",
          wished ? "text-red-500" : "text-slate-400",
        )}
      >
        <Heart className={cn("h-4 w-4", wished && "fill-red-500")} aria-hidden="true" />
      </button>

      <Link href={`/shop/products/${product.id}`} className="block" onClick={() => trackCampaign(product.campaignId, "click")}>
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/50">
          <Image
            src={product.image || "/brand/logo-stack.png"}
            alt={name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          {view.pct > 0 && (
            <span className="absolute left-3 top-3 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white shadow-lg">
              -{view.pct}%
            </span>
          )}
          {product.sellerOnVacation && (
            <span className="absolute right-3 bottom-3 rounded-lg bg-slate-700/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {fr ? "En vacances" : "On vacation"}
            </span>
          )}
          {view.source !== "base" && (
            <span className="absolute bottom-3 left-3 max-w-[85%] truncate rounded-lg bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {view.source === "flash" ? (fr ? "Vente flash" : "Flash sale") : (view.campaignName ? pickText(fr, view.campaignName, view.campaignNameFr) : null) ?? (fr ? "Promotion" : "Campaign")}
            </span>
          )}
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-800 group-hover:text-[var(--primary-hover)]">
            {name}
          </h3>

          <div className="mt-2 flex items-center gap-1.5">
            {product.reviews > 0 ? (
              <>
                <div className="flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                  <span className="text-xs font-semibold text-amber-700">{product.rating}</span>
                </div>
                <span className="text-xs text-slate-500">({product.reviews.toLocaleString()})</span>
              </>
            ) : (
              <span className="text-xs text-slate-500">{fr ? "Pas encore d'avis" : "No reviews yet"}</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
              {formatCurrency(view.price, locale)}
            </span>
            {view.was != null && (
              <s className="text-xs text-slate-500">
                <span className="sr-only">{fr ? "Ancien prix " : "Was "}</span>
                {formatCurrency(view.was, locale)}
              </s>
            )}
          </div>

          {product.deliveryDays ? (
            <p className="mt-2 text-xs font-medium text-emerald-700">
              {fr ? `Livraison en ${product.deliveryDays}j` : `Delivery in ${daysLabel(product.deliveryDays, false)}`}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
