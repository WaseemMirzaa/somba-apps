"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Star, Truck, Share2, MapPin } from "lucide-react";
import { MobileAppPurchaseCta } from "@/components/shop/mobile-app-purchase-cta";
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
import { useShop } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { cn } from "@/lib/utils";

export default function ShopProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toggleFollowStore, isFollowingStore, addRecentlyViewed } = useShop();
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
    setZoneChecked(zone ? `${zone.name} — ${getZoneFee(zone.id) === 0 ? (locale === "fr" ? "GRATUIT" : "FREE") : `$${getZoneFee(zone.id)}`}` : (locale === "fr" ? "Livraison disponible" : "Delivery available"));
  }

  function shareProduct() {
    if (navigator.share) {
      navigator.share({ title: product?.name, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast(locale === "fr" ? "Lien copié" : "Link copied");
    }
  }

  if (!product) {
    return <div className="text-center text-slate-500">{locale === "fr" ? "Produit introuvable" : "Product not found"}</div>;
  }

  const name = locale === "fr" ? product.nameFr : product.name;
  const related = products.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: locale === "fr" ? "Accueil" : "Home", href: "/" },
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
              <span className="text-slate-400">({product.reviews.toLocaleString()} {locale === "fr" ? "avis" : "reviews"})</span>
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <DualCurrency amount={product.price} className="text-3xl font-bold text-blue-700" />
            <span className="text-lg text-slate-400 line-through">{formatCurrency(product.originalPrice, locale)}</span>
            <span className="rounded bg-[var(--primary)] px-2 py-0.5 text-sm font-bold text-white">-{product.discount}%</span>
          </div>

          <p className="text-sm text-emerald-600">{locale === "fr" ? "Remboursement portefeuille" : "Wallet cashback"}: {formatCurrency(product.walletCashback, locale)}</p>

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
              <input className="input-premium flex-1 px-3 py-2 text-sm" placeholder={locale === "fr" ? "Code postal / zone" : "Pincode / zone"} value={pincode} onChange={(e) => setPincode(e.target.value)} />
              <button onClick={checkDelivery} className="btn-primary rounded-lg px-3 py-2 text-sm"><MapPin className="h-4 w-4" /></button>
            </div>
            {zoneChecked && <p className="text-xs text-emerald-700">{zoneChecked}</p>}
            <div className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-[var(--primary)]" />
              <span>{locale === "fr" ? `Livraison en ${product.deliveryDays} jours` : `Delivery in ${product.deliveryDays} days`}</span>
            </div>
            <div className="flex gap-4 text-xs text-slate-600">
              {product.codAvailable && <span>✓ {locale === "fr" ? "Paiement à la livraison" : "Pay at Delivery"}</span>}
              {product.openBoxAvailable && <span>✓ {locale === "fr" ? "Colis ouvert" : "Open Box"}</span>}
              <span>✓ {locale === "fr" ? `Retours sous ${product.returnWindow} jours` : `${product.returnWindow}-day returns`}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-blue-100 p-4">
            <Link href={`/shop/stores/${product.sellerId}`} className="flex flex-1 items-center gap-3 hover:opacity-80">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                {product.seller[0]}
              </div>
              <div>
                <p className="font-medium text-slate-900">{product.seller}</p>
                <p className="text-xs text-slate-500">⭐ {product.sellerRating} · {locale === "fr" ? "Santé" : "Health"} {product.sellerHealthScore}%</p>
              </div>
            </Link>
            <button onClick={() => { toggleFollowStore(product.seller); toast(isFollowingStore(product.seller) ? (locale === "fr" ? "Ne plus suivre" : "Unfollowed") : (locale === "fr" ? "Boutique suivie" : "Following store")); }} className="text-sm text-[var(--primary)]">
              {isFollowingStore(product.seller) ? (locale === "fr" ? "Suivi" : "Following") : (locale === "fr" ? "Suivre" : "Follow")}
            </button>
          </div>

          <MobileAppPurchaseCta />
          <button onClick={shareProduct} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-blue-50">
            <Share2 className="h-4 w-4" />
            {locale === "fr" ? "Partager" : "Share product"}
          </button>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={locale === "fr" ? "Description" : "Description"} span={2}>
          <p className="text-sm text-slate-600">{product.description}</p>
          <ul className="mt-4 list-inside list-disc text-sm text-slate-600">
            {product.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </DetailGridSection>

        <DetailGridSection title={locale === "fr" ? "Informations sur le vendeur" : "Seller Information"}>
          <InfoGrid items={[
            { label: locale === "fr" ? "Boutique" : "Store", value: <Link href={`/shop/stores/${product.sellerId}`} className="text-[var(--primary)] hover:underline">{product.seller}</Link> },
            { label: locale === "fr" ? "Note" : "Rating", value: `⭐ ${product.sellerRating}` },
            { label: locale === "fr" ? "Abonnés" : "Followers", value: product.sellerFollowers.toLocaleString() },
            { label: locale === "fr" ? "Indice de santé" : "Health Score", value: `${product.sellerHealthScore}%` },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={locale === "fr" ? "Spécifications" : "Specifications"} span={2}>
          <InfoGrid items={Object.entries(product.specifications).map(([k, v]) => ({ label: k, value: v }))} />
          <p className="mt-4 text-sm text-slate-500">{locale === "fr" ? "Garantie" : "Warranty"}: {product.warranty}</p>
        </DetailGridSection>

        <DetailGridSection
          title={locale === "fr" ? `Avis (${product.reviews})` : `Reviews (${product.reviews})`}
          action={<Link href={`/shop/products/${product.id}/reviews`} className="text-sm text-[var(--primary)] hover:underline">{locale === "fr" ? "Voir tout" : "View all"}</Link>}
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

        <DetailGridSection title={locale === "fr" ? "Questions des clients" : "Customer Questions"} span={3}>
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
                setExtraQuestions((q) => [...q, { q: question, a: locale === "fr" ? "Le vendeur répondra sous 24h." : "Seller will respond within 24h.", author: "Somba" }]);
                setQuestion("");
                toast(locale === "fr" ? "Question soumise" : "Question submitted");
              }}
            >
              {locale === "fr" ? "Soumettre" : "Submit"}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[...product.questions, ...extraQuestions].map((q, i) => (
              <div key={i} className="rounded-lg border border-[var(--border)] p-4">
                <p className="font-medium text-slate-900">{locale === "fr" ? "Q :" : "Q:"} {q.q}</p>
                <p className="mt-1 text-sm text-slate-600">{locale === "fr" ? "R :" : "A:"} {q.a} <span className="text-slate-400">— {q.author}</span></p>
              </div>
            ))}
          </div>
        </DetailGridSection>
      </DetailGrid>

      <section>
        <h2 className="mb-4 text-xl font-bold">{locale === "fr" ? "Produits similaires" : "Similar Products"}</h2>
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
