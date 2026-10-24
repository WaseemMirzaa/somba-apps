"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/landing/product-card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/loader";
import { useCatalog, useShopCategories } from "@/lib/catalog";
import { useShop } from "@/context/shop-context";
import { useLocale } from "@/context/locale-context";

/** Category filter values: the category row id, or `name:<English name>` for a product the server sent without one. */
const BY_NAME = "name:";

function ProductsList() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const products = useCatalog();
  const shopCategories = useShopCategories();
  // `?category=<id>` comes from the category tiles.
  const wanted = useSearchParams().get("category") ?? "all";
  const [sort, setSort] = useState("popularity");
  const [picked, setPicked] = useState<string | null>(null);
  const [brand, setBrand] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [minDiscount, setMinDiscount] = useState(0);
  const [priceCap, setPriceCap] = useState<number | null>(null);
  const { recentlyViewed } = useShop();

  const topPrice = Math.max(10, Math.ceil(Math.max(0, ...products.map((p) => p.price)) / 50) * 50);
  const priceMax = priceCap ?? topPrice;
  const brands = ["all", ...new Set(products.map((p) => p.seller))];
  // Labels come from the categories list (translated by the platform), not from the products' own copies (L17).
  const categoryOptions = useMemo(() => {
    const known = new Set(shopCategories.map((c) => c.uuid));
    const options = shopCategories.map((c) => ({ value: c.uuid, label: fr ? c.nameFr : c.name }));
    const orphans = new Map<string, string>();
    for (const p of products) {
      if (!p.categoryId || !known.has(p.categoryId)) orphans.set(`${BY_NAME}${p.category}`, fr ? p.categoryFr : p.category);
    }
    for (const [value, label] of orphans) options.push({ value, label });
    return options;
  }, [shopCategories, products, fr]);
  const category = picked ?? (categoryOptions.some((o) => o.value === wanted) ? wanted : "all");
  const categoryLabel = (value: string) =>
    value === "all" ? (fr ? "Toutes les catégories" : "All categories") : (categoryOptions.find((o) => o.value === value)?.label ?? value);
  const categories = ["all", ...categoryOptions.map((o) => o.value)];

  const sorted = useMemo(() => {
    let list = [...products];
    if (category.startsWith(BY_NAME)) list = list.filter((p) => p.category === category.slice(BY_NAME.length));
    else if (category !== "all") list = list.filter((p) => p.categoryId === category);
    if (brand !== "all") list = list.filter((p) => p.seller === brand);
    if (minRating > 0) list = list.filter((p) => p.rating >= minRating);
    if (minDiscount > 0) list = list.filter((p) => p.discount >= minDiscount);
    list = list.filter((p) => p.price <= priceMax);
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    if (sort === "discount") list.sort((a, b) => b.discount - a.discount);
    return list;
  }, [products, sort, category, brand, minRating, minDiscount, priceMax]);

  const buyAgain = products.filter((p) => recentlyViewed.includes(p.id)).slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Tous les produits" : "All Products"} subtitle={fr ? `${sorted.length} produits` : `${sorted.length} products`} />

      {buyAgain.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">{fr ? "Récemment consultés" : "Recently viewed"}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {buyAgain.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <div className="card-premium grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <select className="input-premium px-3 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="popularity">{fr ? "Popularité" : "Popularity"}</option>
          <option value="price-asc">{fr ? "Prix ↑" : "Price ↑"}</option>
          <option value="price-desc">{fr ? "Prix ↓" : "Price ↓"}</option>
          <option value="rating">{fr ? "Note" : "Rating"}</option>
          <option value="discount">{fr ? "Remise %" : "Discount %"}</option>
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={category} onChange={(e) => setPicked(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={brand} onChange={(e) => setBrand(e.target.value)}>
          {brands.map((b) => <option key={b} value={b}>{b === "all" ? (fr ? "Toutes les marques" : "All brands") : b}</option>)}
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
          <option value={0}>{fr ? "Toutes les notes" : "Any rating"}</option>
          <option value={4}>{fr ? "4+ étoiles" : "4+ stars"}</option>
          <option value={4.5}>{fr ? "4,5+ étoiles" : "4.5+ stars"}</option>
        </select>
        <select className="input-premium px-3 py-2 text-sm" value={minDiscount} onChange={(e) => setMinDiscount(Number(e.target.value))}>
          <option value={0}>{fr ? "Toute remise" : "Any discount"}</option>
          <option value={10}>{fr ? "10%+ de remise" : "10%+ off"}</option>
          <option value={15}>{fr ? "15%+ de remise" : "15%+ off"}</option>
        </select>
        <input type="range" min={0} max={topPrice} step={Math.max(1, Math.round(topPrice / 40))} value={priceMax} onChange={(e) => setPriceCap(Number(e.target.value))} className="col-span-2" />
        <span className="text-sm text-slate-500">{fr ? `Max ${priceMax} $` : `Max $${priceMax}`}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {sorted.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

export default function ShopProductsPage() {
  return (
    <Suspense fallback={<PageLoader className="py-12" />}>
      <ProductsList />
    </Suspense>
  );
}
