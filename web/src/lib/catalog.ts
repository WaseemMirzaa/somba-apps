"use client";

import { useMemo } from "react";
import { useRealtime } from "@/context/realtime-context";
import type { Category, Product } from "@/lib/realtime/types";

/**
 * Shape the storefront pages expect (mirrors the old mock `products` objects),
 * derived from the live backend Product so screens migrate with a one-line
 * data-source swap instead of a rewrite.
 */
export interface ShopProduct {
  id: string;
  name: string;
  nameFr: string;
  price: number;
  originalPrice: number;
  discount: number;
  rating: number;
  reviews: number;
  image: string;
  category: string;
  categoryFr: string;
  seller: string;
  sellerId: string | null;
  stock: number;
  deliveryDays: number;
  description: string;
}

export function toShopProduct(p: Product): ShopProduct {
  return {
    id: p.id,
    name: p.name,
    nameFr: p.nameFr ?? p.name,
    price: p.price,
    originalPrice: p.originalPrice ?? p.price,
    discount: p.discount ?? 0,
    rating: p.rating ?? 0,
    reviews: p.reviewsCount ?? 0,
    image: p.image ?? "",
    category: p.category,
    categoryFr: p.categoryFr ?? p.category,
    seller: p.sellerName ?? "Somba&Teka",
    sellerId: p.sellerId,
    stock: p.stock ?? 0,
    deliveryDays: p.deliveryDays ?? 3,
    description: p.description ?? "",
  };
}

/** Live product catalog (backend-backed), in the storefront shape. */
export function useCatalog(): ShopProduct[] {
  const { products } = useRealtime();
  return useMemo(() => products.map(toShopProduct), [products]);
}

export interface ShopCategory {
  id: number;
  name: string;
  nameFr: string;
  icon: string;
  image: string;
}

export function useShopCategories(): ShopCategory[] {
  const { categories } = useRealtime();
  return useMemo(
    () =>
      categories.map((c: Category, i) => ({
        id: i + 1,
        name: c.name,
        nameFr: c.nameFr ?? c.name,
        icon: c.icon ?? "🛍️",
        image: c.image ?? "",
      })),
    [categories],
  );
}

/** Look up a single live product by id (string uuid). */
export function useProduct(id: string | undefined): ShopProduct | undefined {
  const catalog = useCatalog();
  return useMemo(
    () => (id ? catalog.find((p) => p.id === id) : undefined),
    [catalog, id],
  );
}

/**
 * PDP detail shape built from a live backend product. Only real fields are
 * exposed (name/price/image/rating/reviews/stock/discount/seller); reviews and
 * questions are loaded from the server by the page itself.
 */
export function productDetailFrom(p: ShopProduct) {
  return {
    id: p.id,
    name: p.name,
    nameFr: p.nameFr,
    category: p.category,
    categoryFr: p.categoryFr,
    price: p.price,
    originalPrice: p.originalPrice,
    discount: p.discount,
    rating: p.rating,
    reviews: p.reviews,
    stock: p.stock,
    inStock: p.stock > 0,
    deliveryDays: p.deliveryDays,
    returnWindow: 7,
    sellerId: p.sellerId,
    seller: p.seller,
    description: p.description,
    image: p.image,
  };
}

export function useProductDetail(id: string | undefined) {
  const p = useProduct(id);
  return useMemo(() => (p ? productDetailFrom(p) : undefined), [p]);
}
