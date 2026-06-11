"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Heart, Star, ShoppingCart, Truck, Share2, MapPin } from "lucide-react";
import { DualCurrency } from "@/components/ui/dual-currency";
import { useMarket } from "@/context/market-context";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ProductCard } from "@/components/landing/product-card";
import { getProductDetail } from "@/lib/entities";
import { products } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";
import { useShop } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function ShopProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const { addToCart, toggleWishlist, isInWishlist, toggleFollowStore, isFollowingStore, addRecentlyViewed } = useShop();
  const { toast } = useToast();
  const { profile, getZoneFee } = useMarket();
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [pincode, setPincode] = useState("");
  const [zoneChecked, setZoneChecked] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [extraQuestions, setExtraQuestions] = useState<{ q: string; a: string; author: string }[]>([]);
  const product = getProductDetail(Number(id));

  useEffect(() => {
    if (product) addRecentlyViewed(product.id);
  }, [product, addRecentlyViewed]);

  function checkDelivery() {
    const zone = profile.zones.find((z) => pincode.toLowerCase().includes(z.id) || pincode.length >= 3);
    setZoneChecked(zone ? `${zone.name} — ${getZoneFee(zone.id) === 0 ? "FREE" : `$${getZoneFee(zone.id)}`}` : "Delivery available");
  }

  function shareProduct() {
    if (navigator.share) {
      navigator.share({ title: product?.name, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast("Link copied");
    }
  }

  if (!product) {
    return <div className="text-center text-slate-500">Product not found</div>;
  }

  const name = localizedField(locale, product.name, product.nameFr);
  const related = products.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: product.category, href: "/shop/products" },
          { label: name },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-blue-50">
          <Image src={product.image} alt={name} fill className="object-cover" priority />
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm text-slate-500">{product.brand} · {product.category}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-medium">{product.rating}</span>
              <span className="text-slate-400">({product.reviews.toLocaleString()} reviews)</span>
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <DualCurrency amount={product.price} className="text-3xl font-bold text-blue-700" />
            <span className="text-lg text-slate-400 line-through">{formatCurrency(product.originalPrice, locale)}</span>
            <span className="rounded bg-blue-600 px-2 py-0.5 text-sm font-bold text-white">-{product.discount}%</span>
          </div>

          <p className="text-sm text-emerald-600">Wallet cashback: {formatCurrency(product.walletCashback, locale)}</p>

          {product.variants.map((v) => (
            <div key={v.name}>
              <p className="mb-2 text-sm font-medium text-slate-700">{v.name}</p>
              <div className="flex flex-wrap gap-2">
                {v.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSelectedVariant((s) => ({ ...s, [v.name]: opt }))}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm",
                      selectedVariant[v.name] === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "border-blue-200 hover:border-blue-500"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex gap-2">
              <input className="input-premium flex-1 px-3 py-2 text-sm" placeholder={t("pincodeZonePlaceholder")} value={pincode} onChange={(e) => setPincode(e.target.value)} />
              <button onClick={checkDelivery} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"><MapPin className="h-4 w-4" /></button>
            </div>
            {zoneChecked && <p className="text-xs text-emerald-700">{zoneChecked}</p>}
            <div className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-blue-600" />
              <span>Delivery in {product.deliveryDays} days</span>
            </div>
            <div className="flex gap-4 text-xs text-slate-600">
              {product.codAvailable && <span>✓ COD Available</span>}
              {product.openBoxAvailable && <span>✓ Open Box</span>}
              <span>✓ {product.returnWindow}-day returns</span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-blue-100 p-4">
            <Link href={`/shop/stores/${product.sellerId}`} className="flex flex-1 items-center gap-3 hover:opacity-80">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                {product.seller[0]}
              </div>
              <div>
                <p className="font-medium text-slate-900">{product.seller}</p>
                <p className="text-xs text-slate-500">⭐ {product.sellerRating} · Health {product.sellerHealthScore}%</p>
              </div>
            </Link>
            <button onClick={() => { toggleFollowStore(product.seller); toast(isFollowingStore(product.seller) ? "Unfollowed" : "Following store"); }} className="text-sm text-blue-600">
              {isFollowingStore(product.seller) ? "Following" : "Follow"}
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                const variant = Object.values(selectedVariant).join(" / ") || "Default";
                addToCart({ id: product.id, name: product.name, nameFr: product.nameFr, price: product.price, image: product.image, seller: product.seller, variant });
                toast("Added to cart");
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 py-3 font-semibold text-blue-700 hover:bg-blue-50"
            >
              <ShoppingCart className="h-5 w-5" />
              Add to Cart
            </button>
            <button
              onClick={() => {
                const variant = Object.values(selectedVariant).join(" / ") || "Default";
                addToCart({ id: product.id, name: product.name, nameFr: product.nameFr, price: product.price, image: product.image, seller: product.seller, variant, qty: 1 });
                router.push("/shop/checkout");
              }}
              className="flex flex-1 items-center justify-center rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Buy Now
            </button>
            <button
              onClick={() => { toggleWishlist(product.id); toast(isInWishlist(product.id) ? "Removed from wishlist" : "Added to wishlist"); }}
              className={cn("rounded-xl border border-blue-200 p-3", isInWishlist(product.id) ? "text-red-500" : "text-slate-500")}
            >
              <Heart className={cn("h-5 w-5", isInWishlist(product.id) && "fill-red-500")} />
            </button>
            <button onClick={shareProduct} className="rounded-xl border border-blue-200 p-3 text-slate-500">
              <Share2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title="Description" span={2}>
          <p className="text-sm text-slate-600">{product.description}</p>
          <ul className="mt-4 list-inside list-disc text-sm text-slate-600">
            {product.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </DetailGridSection>

        <DetailGridSection title="Seller Information">
          <InfoGrid items={[
            { label: "Store", value: <Link href={`/shop/stores/${product.sellerId}`} className="text-blue-600 hover:underline">{product.seller}</Link> },
            { label: "Rating", value: `⭐ ${product.sellerRating}` },
            { label: "Followers", value: product.sellerFollowers.toLocaleString() },
            { label: "Health Score", value: `${product.sellerHealthScore}%` },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Specifications" span={2}>
          <InfoGrid items={Object.entries(product.specifications).map(([k, v]) => ({ label: k, value: v }))} />
          <p className="mt-4 text-sm text-slate-500">Warranty: {product.warranty}</p>
        </DetailGridSection>

        <DetailGridSection
          title={`Reviews (${product.reviews})`}
          action={<Link href={`/shop/products/${product.id}/reviews`} className="text-sm text-blue-600 hover:underline">View all</Link>}
          span={3}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {product.reviews_list.map((r, i) => (
              <div key={i} className="rounded-lg border border-blue-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.author}</span>
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{r.text}</p>
                <p className="text-xs text-slate-400">{r.date}</p>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title="Customer Questions" span={3}>
          <div className="mb-4 flex gap-2">
            <input
              className="input-premium flex-1 px-4 py-2 text-sm"
              placeholder="Posez votre question (FR) / Ask your question (EN)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button
              className="btn-primary px-4 py-2 text-sm"
              onClick={() => {
                if (!question.trim()) return;
                setExtraQuestions((q) => [...q, { q: question, a: "Seller will respond within 24h.", author: "Somba" }]);
                setQuestion("");
                toast("Question submitted");
              }}
            >
              Submit
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[...product.questions, ...extraQuestions].map((q, i) => (
              <div key={i} className="rounded-lg border border-[var(--border)] p-4">
                <p className="font-medium text-slate-900">Q: {q.q}</p>
                <p className="mt-1 text-sm text-slate-600">A: {q.a} <span className="text-slate-400">— {q.author}</span></p>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>

      <section>
        <h2 className="mb-4 text-xl font-bold">Similar Products</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {related.map((p) => (
            <Link key={p.id} href={`/shop/products/${p.id}`}>
              <ProductCard product={p} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
