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
 * PDP detail shape built from a live backend product. Core commerce fields
 * (name/price/image/rating/reviews/stock/discount/seller) are real; the
 * purely presentational bits (specs, variants, warranty) are generated so the
 * page renders fully without a separate mock detail store.
 */
export function productDetailFrom(p: ShopProduct) {
  return {
    id: p.id,
    sku: `SKU-${p.id.slice(0, 6)}`,
    name: p.name,
    nameFr: p.nameFr,
    brand: p.seller,
    category: p.category,
    categoryFr: p.categoryFr,
    subcategory: p.category,
    price: p.price,
    originalPrice: p.originalPrice,
    discount: p.discount,
    tax: Math.round(p.price * 0.1),
    rating: p.rating,
    reviews: p.reviews,
    stock: p.stock,
    inStock: p.stock > 0,
    deliveryDays: p.deliveryDays,
    codAvailable: true,
    openBoxAvailable: p.price > 200,
    returnWindow: 7,
    sellerId: p.sellerId,
    seller: p.seller,
    sellerRating: 4.6,
    sellerFollowers: 45000,
    sellerHealthScore: 92,
    description:
      p.description ||
      `Premium ${p.name} with excellent build quality and performance.`,
    descriptionFr:
      p.description ||
      `${p.nameFr} haut de gamme avec une excellente qualité de fabrication.`,
    features: ["Premium build", "Warranty included", "Fast delivery", "Easy returns"],
    featuresFr: ["Fabrication haut de gamme", "Garantie incluse", "Livraison rapide", "Retours faciles"],
    specifications: { Material: "Premium", Warranty: "1 Year" },
    specificationsFr: { Matériau: "Haut de gamme", Garantie: "1 an" },
    warranty: "1 Year Manufacturer Warranty",
    warrantyFr: "Garantie fabricant 1 an",
    image: p.image,
    images: [p.image, p.image],
    variants: [
      { name: "Color", nameFr: "Couleur", options: ["Black", "Blue", "Silver"], optionsFr: ["Noir", "Bleu", "Argent"] },
    ],
    reviews_list: [] as { author: string; rating: number; text: string; textFr: string; date: string }[],
    questions: [] as { q: string; qFr: string; a: string; aFr: string; author: string; authorFr: string }[],
  };
}

export function useProductDetail(id: string | undefined) {
  const p = useProduct(id);
  return useMemo(() => (p ? productDetailFrom(p) : undefined), [p]);
}
