"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/landing/product-card";
import { PageHeader } from "@/components/ui/page-header";
import { products, categories as categoryList } from "@/lib/mock-data";
import { useShop } from "@/context/shop-context";
import { useLocale } from "@/context/locale-context";
import { L } from "@/lib/locale-helpers";

export default function ShopProductsPage() {
  const { t, locale } = useLocale();
  const [sort, setSort] = useState("popularity");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [minDiscount, setMinDiscount] = useState(0);
  const [priceMax, setPriceMax] = useState(2000);
  const { recentlyViewed } = useShop();

  const brands = ["all", ...new Set(products.map((p) => p.seller))];
  const categorySlugs = ["all", ...new Set(products.map((p) => p.category))];

  const categoryLabel = (slug: string) => {
    if (slug === "all") return t("categories");
    const cat = categoryList.find((c) => c.name === slug);
    return cat ? L(locale, cat.name, cat.nameFr) : slug;
  };

  const sorted = useMemo(() => {
    let list = [...products];
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (brand !== "all") list = list.filter((p) => p.seller === brand);
    if (minRating > 0) list = list.filter((p) => p.rating >= minRating);
    if (minDiscount > 0) list = list.filter((p) => p.discount >= minDiscount);
    list = list.filter((p) => p.price <= priceMax);
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    if (sort === "discount") list.sort((a, b) => b.discount - a.discount);
    return list;
  }, [sort, category, brand, minRating, minDiscount, priceMax]);

  const buyAgain = products.filter((p) => recentlyViewed.includes(p.id)).slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader title={t("allProducts")} subtitle={`${sorted.length} ${t("productsCount")}`} />

      {buyAgain.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">{t("buyAgain")}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {buyAgain.map((p) => (
              <Link key={p.id} href={`/shop/products/${p.id}`}><ProductCard product={p} /></Link>
            ))}
          </div>
        </section>
      )}

      <div className="card-premium grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <select className="input-premium px-3 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="popularity">{t("popularity")}</option>
          <option value="price-asc">{t("priceAsc")}</option>
          <option value="price-desc">{t("priceDesc")}</option>
          <option value="rating">{t("rating")}</option>
          <option value="discount">{t("discount")}</option>
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categorySlugs.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={brand} onChange={(e) => setBrand(e.target.value)}>
          {brands.map((b) => <option key={b} value={b}>{b === "all" ? t("allBrands") : b}</option>)}
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
          <option value={0}>{t("anyRating")}</option>
          <option value={4}>{t("stars4Plus")}</option>
          <option value={4.5}>{t("stars45Plus")}</option>
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={minDiscount} onChange={(e) => setMinDiscount(Number(e.target.value))}>
          <option value={0}>{t("anyDiscount")}</option>
          <option value={10}>{t("off10Plus")}</option>
          <option value={15}>{t("off15Plus")}</option>
        </select>
        <input type="range" min={100} max={2000} step={50} value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} className="col-span-2" />
        <span className="text-sm text-slate-500">{t("maxPrice")} ${priceMax}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {sorted.map((p) => (
          <Link key={p.id} href={`/shop/products/${p.id}`}><ProductCard product={p} /></Link>
        ))}
      </div>
    </div>
  );
}
