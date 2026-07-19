"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useShop } from "@/context/shop-context";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: {
    id: number | string;
    name: string;
    nameFr: string;
    price: number;
    originalPrice: number;
    discount: number;
    rating: number;
    reviews: number;
    image: string;
    deliveryDays?: number;
    flashPrice?: number;
    flashDiscount?: number;
  };
  flash?: boolean;
}

export function ProductCard({ product, flash }: ProductCardProps) {
  const { locale } = useLocale();
  const { toggleWishlist, isInWishlist } = useShop();
  const name = locale === "fr" ? product.nameFr : product.name;
  const price = flash && product.flashPrice ? product.flashPrice : product.price;
  const discount = flash && product.flashDiscount ? product.flashDiscount : product.discount;

  return (
    <Link href={`/shop/products/${product.id}`} className="group block">
      <article className="card-premium relative overflow-hidden">
        <button
          onClick={(e) => { e.preventDefault(); toggleWishlist(String(product.id)); }}
          className={cn(
            "absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 shadow-md backdrop-blur transition-all hover:scale-110",
            isInWishlist(String(product.id)) ? "text-red-500" : "text-slate-400"
          )}
        >
          <Heart className={cn("h-4 w-4", isInWishlist(String(product.id)) && "fill-red-500")} />
        </button>

        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/50">
          <Image
            src={product.image}
            alt={name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          {discount > 0 && (
            <span className="absolute left-3 top-3 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white shadow-lg">
              -{discount}%
            </span>
          )}
          {flash && (
            <span className="absolute bottom-3 left-3 rounded-lg bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Flash
            </span>
          )}
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-800 group-hover:text-[var(--primary-hover)]">
            {name}
          </h3>

          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-semibold text-amber-700">{product.rating}</span>
            </div>
            <span className="text-xs text-slate-400">({product.reviews.toLocaleString()})</span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
              {formatCurrency(price, locale)}
            </span>
            {product.originalPrice > price && (
              <span className="text-xs text-slate-400 line-through">
                {formatCurrency(product.originalPrice, locale)}
              </span>
            )}
          </div>

          {product.deliveryDays && (
            <p className="mt-2 text-xs font-medium text-emerald-600">
              {locale === "fr"
                ? `Livraison en ${product.deliveryDays}j`
                : `Delivery in ${product.deliveryDays} days`}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}
