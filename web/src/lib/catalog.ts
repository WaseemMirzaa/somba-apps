"use client";
import { readVariants, readVariantLabels, type VariantGroup, type VariantLabels } from "@/lib/variants";
import { pickText, type Lang, type TranslationStatus } from "@/lib/i18n-fields";

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
  /** The category row (filters compare ids: renaming or translating a category never moves its products). */
  categoryId: string | null;
  seller: string;
  sellerId: string | null;
  stock: number;
  deliveryDays: number;
  description: string;
  descriptionFr: string;
  /** The stored listing price (before any flash sale / campaign). */
  basePrice: number;
  campaignPct: number;
  campaignName: string | null;
  campaignNameFr: string | null;
  priceSource: "base" | "flash" | "campaign";
  /** Options the shopper must choose (empty = none). These labels are the purchase keys. */
  variants: VariantGroup[];
  /** Display labels of the options per language (null = show the canonical labels). */
  variantLabels: VariantLabels | null;
  sourceLang: Lang;
  /** Served field names the machine translator produced (e.g. "nameFr", "descriptionFr"). */
  machineTranslated: string[];
  translationStatus: TranslationStatus;
}

/** What a price tag shows: the price charged, the struck-through price and the badge. */
export interface PriceView {
  price: number;
  /** Struck-through price (null when nothing was reduced). */
  was: number | null;
  /** Discount badge percent (0 = no badge). */
  pct: number;
  source: "base" | "flash" | "campaign";
  campaignName: string | null;
  campaignNameFr: string | null;
}

/**
 * One rule for every price tag (cards, detail, cart, checkout): the price is the
 * one the server charges; the struck-through price is the normal listing price
 * (`basePrice`) when a campaign or flash sale lowered it, otherwise the
 * seller's own "was" price; the badge is the campaign percent, or the real
 * percent between the two prices.
 */
export function priceView(p: {
  price: number;
  basePrice?: number;
  originalPrice?: number;
  discount?: number;
  campaignPct?: number;
  campaignName?: string | null;
  campaignNameFr?: string | null;
  priceSource?: "base" | "flash" | "campaign";
}): PriceView {
  const source = p.priceSource ?? "base";
  const base = p.basePrice ?? p.originalPrice ?? p.price;
  if (source === "campaign" && base > p.price) {
    return { price: p.price, was: base, pct: p.campaignPct || Math.round((1 - p.price / base) * 100), source, campaignName: p.campaignName ?? null, campaignNameFr: p.campaignNameFr ?? null };
  }
  if (source === "flash" && base > p.price) {
    return { price: p.price, was: base, pct: Math.round((1 - p.price / base) * 100), source, campaignName: null, campaignNameFr: null };
  }
  const was = p.originalPrice && p.originalPrice > p.price ? p.originalPrice : null;
  return { price: p.price, was, pct: p.discount ?? (was ? Math.round((1 - p.price / was) * 100) : 0), source: "base", campaignName: null, campaignNameFr: null };
}

export function toShopProduct(p: Product): ShopProduct {
  return {
    id: p.id,
    // Either language falls back to the other one, so a screen never shows an empty title.
    name: pickText(false, p.name, p.nameFr),
    nameFr: pickText(true, p.name, p.nameFr),
    price: p.price,
    originalPrice: p.originalPrice ?? p.price,
    discount: p.discount ?? 0,
    rating: p.rating ?? 0,
    reviews: p.reviewsCount ?? 0,
    image: p.image ?? "",
    category: p.category,
    categoryFr: pickText(true, p.category, p.categoryFr),
    categoryId: p.categoryId ?? null,
    seller: p.sellerName ?? "Somba&Teka",
    sellerId: p.sellerId,
    stock: p.stock ?? 0,
    deliveryDays: p.deliveryDays ?? 3,
    description: pickText(false, p.description, p.descriptionFr),
    descriptionFr: pickText(true, p.description, p.descriptionFr),
    basePrice: p.basePrice ?? p.price,
    campaignPct: p.campaignPct ?? 0,
    campaignName: p.campaignName ?? null,
    campaignNameFr: p.campaignNameFr ?? null,
    priceSource: p.priceSource ?? "base",
    variants: readVariants(p.variants),
    variantLabels: readVariantLabels(p.variantLabels),
    sourceLang: p.sourceLang === "fr" ? "fr" : "en",
    machineTranslated: Array.isArray(p.machineTranslated) ? p.machineTranslated : [],
    translationStatus: p.translationStatus ?? "done",
  };
}

/** Live product catalog (backend-backed), in the storefront shape. */
export function useCatalog(): ShopProduct[] {
  const { products } = useRealtime();
  return useMemo(() => products.map(toShopProduct), [products]);
}

export interface ShopCategory {
  /** Position in the list (React key). */
  id: number;
  /** The category row id: what products' `categoryId` points at. */
  uuid: string;
  name: string;
  nameFr: string;
  icon: string;
  image: string;
  productCount: number | null;
}

export function useShopCategories(): ShopCategory[] {
  const { categories } = useRealtime();
  return useMemo(
    () =>
      categories.map((c: Category, i) => ({
        id: i + 1,
        uuid: c.id,
        name: pickText(false, c.name, c.nameFr),
        nameFr: pickText(true, c.name, c.nameFr),
        icon: c.icon ?? "🛍️",
        image: c.image ?? "",
        productCount: typeof c.productCount === "number" ? c.productCount : null,
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
    categoryId: p.categoryId,
    price: p.price,
    originalPrice: p.originalPrice,
    discount: p.discount,
    basePrice: p.basePrice,
    campaignPct: p.campaignPct,
    campaignName: p.campaignName,
    campaignNameFr: p.campaignNameFr,
    priceSource: p.priceSource,
    rating: p.rating,
    reviews: p.reviews,
    stock: p.stock,
    inStock: p.stock > 0,
    deliveryDays: p.deliveryDays,
    returnWindow: 7,
    sellerId: p.sellerId,
    seller: p.seller,
    description: p.description,
    descriptionFr: p.descriptionFr,
    image: p.image,
    variants: p.variants,
    variantLabels: p.variantLabels,
    machineTranslated: p.machineTranslated,
    translationStatus: p.translationStatus,
  };
}

export function useProductDetail(id: string | undefined) {
  const p = useProduct(id);
  return useMemo(() => (p ? productDetailFrom(p) : undefined), [p]);
}
