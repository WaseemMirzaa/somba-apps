"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { missingPick, variantLabel } from "@/lib/variants";
import { useParams, useRouter } from "next/navigation";
import { Star, Truck, Share2, ShoppingCart } from "lucide-react";
import { MobileAppPurchaseCta } from "@/components/shop/mobile-app-purchase-cta";
import { DualCurrency } from "@/components/ui/dual-currency";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ProductCard } from "@/components/landing/product-card";
import { useProductDetail, useCatalog, priceView } from "@/lib/catalog";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useShop } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketEvent, usePublicSettings, useProductReviews, zoneLabel } from "@/lib/shop-live";
import { dayLabel, estimateFor } from "@/lib/delivery-estimate";

type ProductQuestion = {
  id: string;
  productId: string;
  askedBy: string;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  createdAt: string;
};

export default function ShopProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const productId = typeof id === "string" ? id : undefined;
  const { locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const rt = useRealtime();
  const { addToCart, toggleFollowStore, isFollowingStore, addRecentlyViewed, cart } = useShop();
  const { toast } = useToast();
  const settings = usePublicSettings();
  const [qty, setQty] = useState(1);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [pickError, setPickError] = useState<string | null>(null);
  const [zonePick, setZonePick] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const { reviews, loaded: reviewsLoaded, error: reviewsError, reload: reloadReviews } = useProductReviews(productId);
  const product = useProductDetail(productId);
  const catalog = useCatalog();

  useEffect(() => {
    if (product) addRecentlyViewed(product.id);
  }, [product, addRecentlyViewed]);

  const loadQuestions = useCallback(() => {
    if (!productId) return;
    socketClient
      .request<ProductQuestion[]>("questions:list", { productId })
      .then(setQuestions)
      .catch(() => setQuestions([]));
  }, [productId]);

  useEffect(() => {
    if (!productId || rt.status !== "connected") return;
    loadQuestions();
  }, [productId, rt.status, loadQuestions]);

  // The seller's answer arrives live.
  useSocketEvent<ProductQuestion>("question:updated", (q) => {
    if (q.productId !== productId) return;
    setQuestions((cur) => cur.map((x) => (x.id === q.id ? q : x)));
  });

  async function submitQuestion() {
    if (!productId) return;
    if (!rt.user) {
      toast(fr ? "Connectez-vous pour poser une question" : "Sign in to ask a question", "info");
      router.push(`/shop/login?next=${encodeURIComponent(`/shop/products/${productId}`)}`);
      return;
    }
    if (question.trim().length < 3) {
      toast(fr ? "Écrivez votre question" : "Write your question first", "error");
      return;
    }
    setAsking(true);
    try {
      const q = await socketClient.request<ProductQuestion>("questions:ask", { productId, question: question.trim() });
      setQuestions((cur) => [q, ...cur.filter((x) => x.id !== q.id)]);
      setQuestion("");
      toast(fr ? "Question envoyée au vendeur" : "Question sent to the seller");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAsking(false);
    }
  }

  function shareProduct() {
    if (navigator.share) {
      navigator.share({ title: product?.name, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast(fr ? "Lien copié" : "Link copied");
    }
  }

  if (!product) {
    const loading = rt.status !== "connected" || catalog.length === 0;
    return (
      <div className="text-center text-slate-500">
        {loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Produit introuvable" : "Product not found"}
      </div>
    );
  }

  const priceInfo = priceView(product);
  const name = fr ? product.nameFr : product.name;
  const category = fr ? product.categoryFr : product.category;
  const related = catalog.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 4);
  const maxQty = Math.max(1, Math.min(10, product.stock));
  const inCart = cart.filter((c) => c.id === product.id).reduce((s, c) => s + c.qty, 0);
  const zone = settings.deliveryZones.find((z) => z.id === zonePick);

  function add(goToCart: boolean) {
    if (!product || !product.inStock) return;
    const missing = missingPick(product.variants, picks);
    if (missing) {
      setPickError(missing.name);
      toast(fr ? `Choisissez : ${missing.name}` : `Choose a ${missing.name.toLowerCase()}`, "error");
      return;
    }
    setPickError(null);
    addToCart({
      id: product.id,
      name: product.name,
      nameFr: product.nameFr,
      price: product.price,
      image: product.image,
      seller: product.seller,
      variant: variantLabel(product.variants, picks),
      qty,
    });
    toast(fr ? "Ajouté au panier" : "Added to cart");
    if (goToCart) router.push("/shop/cart");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: fr ? "Accueil" : "Home", href: "/" },
          { label: category, href: "/shop/products" },
          { label: name },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-blue-50">
          <Image src={product.image || "/brand/logo-stack.png"} alt={name} fill className="object-cover" priority />
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm text-slate-500">{product.seller} · {category}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-medium">{product.rating}</span>
              <span className="text-slate-400">({product.reviews.toLocaleString()} {fr ? "avis" : "reviews"})</span>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <DualCurrency amount={priceInfo.price} className="text-3xl font-bold text-blue-700" />
              {priceInfo.was != null && (
                <s className="text-lg text-slate-500">
                  <span className="sr-only">{fr ? "Ancien prix " : "Was "}</span>
                  {formatCurrency(priceInfo.was, locale)}
                </s>
              )}
              {priceInfo.pct > 0 && (
                <span className="rounded bg-[var(--primary)] px-2 py-0.5 text-sm font-bold text-white">-{priceInfo.pct}%</span>
              )}
            </div>
            {priceInfo.source !== "base" && (
              <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                {priceInfo.source === "flash"
                  ? (fr ? "Vente flash" : "Flash sale")
                  : priceInfo.campaignName ?? (fr ? "Promotion en cours" : "Campaign price")}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-blue-100 p-4">
            <p className={`text-sm font-medium ${product.inStock ? "text-emerald-700" : "text-red-600"}`}>
              {product.inStock
                ? product.stock <= 5
                  ? (fr ? `Plus que ${product.stock} en stock` : `Only ${product.stock} left in stock`)
                  : (fr ? "En stock" : "In stock")
                : (fr ? "Rupture de stock" : "Out of stock")}
            </p>
            {product.variants.map((g) => (
              <div key={g.name} data-testid={`variant-${g.name}`}>
                <p className={`mb-1.5 text-sm font-medium ${pickError === g.name ? "text-red-600" : "text-slate-700"}`}>
                  {g.name}
                  {picks[g.name] ? `: ${picks[g.name]}` : pickError === g.name ? (fr ? " — à choisir" : " — please choose") : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => {
                    const on = picks[g.name] === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setPicks((cur) => ({ ...cur, [g.name]: o }));
                          if (pickError === g.name) setPickError(null);
                        }}
                        className={`min-w-11 rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-slate-300 text-slate-700 hover:border-[var(--primary)]"}`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-600" htmlFor="qty">{fr ? "Quantité" : "Quantity"}</label>
              <select
                id="qty"
                className="rounded border border-blue-200 px-2 py-1.5 text-sm"
                value={qty}
                disabled={!product.inStock}
                onChange={(e) => setQty(Number(e.target.value))}
              >
                {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                onClick={() => add(false)}
                disabled={!product.inStock}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" />
                {fr ? "Ajouter au panier" : "Add to cart"}
              </button>
              <button
                onClick={() => add(true)}
                disabled={!product.inStock}
                className="rounded-xl border border-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
              >
                {fr ? "Acheter maintenant" : "Buy now"}
              </button>
            </div>
            {inCart > 0 && (
              <p className="text-xs text-slate-500">
                {fr ? `${inCart} déjà dans votre panier` : `${inCart} already in your cart`} ·{" "}
                <Link href="/shop/cart" className="text-[var(--primary)] underline">{fr ? "Voir le panier" : "View cart"}</Link>
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            {settings.deliveryZones.length > 0 && (
              <>
                <select className="input-premium w-full px-3 py-2 text-sm" value={zonePick} onChange={(e) => setZonePick(e.target.value)}>
                  <option value="">{fr ? "Vérifier les frais de livraison par zone" : "Check delivery fee by zone"}</option>
                  {settings.deliveryZones.map((z) => <option key={z.id} value={z.id}>{zoneLabel(z, fr)} — {z.city}</option>)}
                </select>
                {zone && (
                  <p className="text-xs text-emerald-700">
                    {zoneLabel(zone, fr)}: {zone.feeUsd === 0 ? (fr ? "livraison gratuite" : "free delivery") : `$${zone.feeUsd.toFixed(2)}`}
                  </p>
                )}
              </>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-[var(--primary)]" />
              <span data-testid="product-delivery-estimate">
                {fr
                  ? `Livraison en ${product.deliveryDays} jours · prévue le ${dayLabel(estimateFor([product.deliveryDays]), fr)}`
                  : `Delivery in ${product.deliveryDays} days · expected ${dayLabel(estimateFor([product.deliveryDays]), fr)}`}
              </span>
            </div>
            <div className="flex gap-4 text-xs text-slate-600">
              <span>✓ {fr ? `Retours sous ${product.returnWindow} jours` : `${product.returnWindow}-day returns`}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-blue-100 p-4">
            {product.sellerId ? (
              <Link href={`/shop/stores/${product.sellerId}`} className="flex flex-1 items-center gap-3 hover:opacity-80">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {product.seller[0]}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{product.seller}</p>
                  <p className="text-xs text-slate-500">{fr ? "Voir la boutique" : "View store"}</p>
                </div>
              </Link>
            ) : (
              <div className="flex-1 font-medium text-slate-900">{product.seller}</div>
            )}
            <button onClick={() => { toggleFollowStore(product.seller); toast(isFollowingStore(product.seller) ? (fr ? "Ne plus suivre" : "Unfollowed") : (fr ? "Boutique suivie" : "Following store")); }} className="text-sm text-[var(--primary)]">
              {isFollowingStore(product.seller) ? (fr ? "Suivi" : "Following") : (fr ? "Suivre" : "Follow")}
            </button>
          </div>

          <button onClick={shareProduct} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-blue-50">
            <Share2 className="h-4 w-4" />
            {fr ? "Partager" : "Share product"}
          </button>
          <MobileAppPurchaseCta />
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title="Description" span={2}>
          <p className="whitespace-pre-line text-sm text-slate-600">
            {product.description || (fr ? "Aucune description fournie par le vendeur." : "The seller has not added a description yet.")}
          </p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Informations sur le vendeur" : "Seller Information"}>
          <InfoGrid items={[
            {
              label: fr ? "Boutique" : "Store",
              value: product.sellerId
                ? <Link href={`/shop/stores/${product.sellerId}`} className="text-[var(--primary)] hover:underline">{product.seller}</Link>
                : product.seller,
            },
            { label: fr ? "Délai de livraison" : "Delivery time", value: fr ? `${product.deliveryDays} jours` : `${product.deliveryDays} days` },
          ]} />
        </DetailGridSection>

        <DetailGridSection
          title={fr ? `Avis (${reviews.length})` : `Reviews (${reviews.length})`}
          action={<Link href={`/shop/products/${product.id}/reviews`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Voir tout" : "View all"}</Link>}
          span={3}
        >
          {reviewsError ? (
            <p role="alert" className="text-sm text-red-700">
              {reviewsError}{" "}
              <button type="button" onClick={() => void reloadReviews()} className="font-medium underline">{fr ? "Réessayer" : "Retry"}</button>
            </p>
          ) : !reviewsLoaded ? (
            <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucun avis pour le moment." : "No reviews yet."}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reviews.slice(0, 4).map((r) => (
                <div key={r.id} className="rounded-lg border border-blue-50 p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.author}</span>
                    <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{r.text}</p>
                  <p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</p>
                  {r.sellerReply && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="text-xs font-semibold text-slate-700">
                        {fr ? "Réponse du vendeur" : "Seller reply"}
                        {r.sellerReplyAt && <span className="font-normal text-slate-500"> · {new Date(r.sellerReplyAt).toLocaleDateString()}</span>}
                      </p>
                      <p className="mt-1 text-slate-600">{r.sellerReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Questions des clients" : "Customer Questions"} span={3}>
          <div className="mb-4 flex gap-2">
            <input
              className="input-premium flex-1 px-4 py-2 text-sm"
              placeholder={fr ? "Posez votre question au vendeur" : "Ask the seller a question"}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitQuestion(); }}
            />
            <button className="btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={asking} onClick={submitQuestion}>
              {fr ? "Envoyer" : "Ask"}
            </button>
          </div>
          {questions.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucune question pour le moment." : "No questions yet."}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {questions.map((q) => (
                <div key={q.id} className="rounded-lg border border-[var(--border)] p-4">
                  <p className="font-medium text-slate-900">{fr ? "Q :" : "Q:"} {q.question}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {q.answer ? (
                      <>{fr ? "R :" : "A:"} {q.answer} {q.answeredBy && <span className="text-slate-400">— {q.answeredBy}</span>}</>
                    ) : (
                      <span className="text-slate-400">{fr ? "En attente de la réponse du vendeur." : "Waiting for the seller's answer."}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>

      {related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">{fr ? "Produits similaires" : "Similar Products"}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
