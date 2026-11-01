"use client";

import { useEffect, useState } from "react";
import { Copy, Palmtree } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ProductCard } from "@/components/landing/product-card";
import { toShopProduct, type ShopProduct } from "@/lib/catalog";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Product, Seller } from "@/lib/realtime/types";
import { StoreHeader } from "@/components/shop/store-header";
import { ContactSeller } from "@/components/shop/contact-seller";
import { couponLabel, useStoreCoupons } from "@/lib/shop-engage";
import { useSocketEvent, usePublicSettings } from "@/lib/shop-live";
import { useToast } from "@/context/toast-context";
import { formatCurrency } from "@/lib/utils";
import { localized } from "@/lib/i18n-fields";

type StoreExtras = {
  onVacation?: boolean;
  vacationUntil?: string | null;
  handlingDays?: number;
  returnsPolicy?: string | null;
  returnsPolicyFr?: string | null;
  shippingPolicy?: string | null;
  shippingPolicyFr?: string | null;
};
type Storefront = { seller: Seller & StoreExtras & { pickupAddress?: string | null }; products: Product[] };

const BADGE: Record<string, { en: string; fr: string }> = {
  gold: { en: "Gold", fr: "Or" },
  silver: { en: "Silver", fr: "Argent" },
  bronze: { en: "Bronze", fr: "Bronze" },
  somba_assured: { en: "Somba Assured", fr: "Somba Assuré" },
};

export default function ShopStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const [store, setStore] = useState<Storefront | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();
  const settings = usePublicSettings();
  const coupons = useStoreCoupons(typeof id === "string" ? id : undefined);
  const [vacationNotice, setVacationNotice] = useState<{ en: string; fr: string } | null>(null);

  // The store goes away / comes back while the page is open.
  useSocketEvent<{ sellerId: string; onVacation: boolean; vacationUntil: string | null; notice?: { en: string; fr: string } | null }>("store:vacation", (v) => {
    if (v.sellerId !== id) return;
    setVacationNotice(v.onVacation ? v.notice ?? null : null);
    setStore((cur) =>
      cur
        ? {
            ...cur,
            seller: { ...cur.seller, onVacation: v.onVacation, vacationUntil: v.vacationUntil },
            products: cur.products.map((p) => ({ ...p, sellerOnVacation: v.onVacation, sellerVacationUntil: v.vacationUntil, sellerVacationNotice: v.onVacation ? v.notice ?? p.sellerVacationNotice ?? null : null })),
          }
        : cur,
    );
  });

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => toast(fr ? `Code ${code} copié` : `Code ${code} copied`),
      () => toast(code, "info"),
    );
  }

  useEffect(() => {
    if (!id || rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<Storefront>("sellers:storefront", { id })
      .then((s) => {
        if (!alive) return;
        setStore(s);
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setStore(null);
        setError(e.message);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [id, rt.status]);

  if (!loaded) {
    return <div className="text-center text-slate-500">{fr ? "Chargement…" : "Loading…"}</div>;
  }

  if (!store) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-20 text-center">
        <p className="text-lg font-semibold text-slate-900">{fr ? "Boutique introuvable" : "Store not found"}</p>
        {error && <p className="text-sm text-slate-500">{error}</p>}
        <Link href="/shop/products" className="inline-block text-sm font-medium text-[var(--primary)] hover:underline">
          {fr ? "← Voir les produits" : "← Browse products"}
        </Link>
      </div>
    );
  }

  const { seller } = store;
  const products: ShopProduct[] = store.products.map(toShopProduct);
  const badge = BADGE[seller.badge];
  const notice = vacationNotice ?? store.products.find((p) => p.sellerVacationNotice)?.sellerVacationNotice ?? null;
  const returnsPolicy = fr ? seller.returnsPolicyFr || seller.returnsPolicy : seller.returnsPolicy || seller.returnsPolicyFr;
  const shippingPolicy = fr ? seller.shippingPolicyFr || seller.shippingPolicy : seller.shippingPolicy || seller.shippingPolicyFr;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
        <StoreHeader name={seller.name} logoUrl={seller.logoUrl} bannerUrl={seller.bannerUrl} />
        <div className="px-6 pb-6 pt-3">
          <h1 className="text-2xl font-bold">{seller.name}</h1>
          <p className="text-slate-500">
            {seller.rating > 0 ? `⭐ ${seller.rating} · ` : ""}
            {products.length} {fr ? "produits" : "products"}
          </p>
          {badge && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {fr ? `Vendeur ${badge.fr}` : `${badge.en} Seller`}
            </span>
          )}
          {seller.onVacation && (
            <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="store-vacation">
              <Palmtree className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {notice
                  ? (fr ? notice.fr : notice.en)
                  : fr
                    ? "Cette boutique est en vacances et ne prend pas de nouvelles commandes pour le moment."
                    : "This store is on vacation and is not taking new orders for now."}
              </span>
            </div>
          )}
          {(seller.handlingDays ?? 0) > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {fr ? `Délai de préparation : ${seller.handlingDays} j (ajouté au délai de livraison)` : `Handling time: ${seller.handlingDays} day${seller.handlingDays === 1 ? "" : "s"} (added to the delivery time)`}
            </p>
          )}
          <ContactSeller sellerId={seller.id} fr={fr} className="mt-3" returnTo={`/shop/stores/${seller.id}`} />
          {localized(seller, "description", fr) && (
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-slate-700">{localized(seller, "description", fr)}</p>
          )}
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Politiques" : "Policies"} span={coupons.length > 0 ? 2 : 3}>
          <div className="space-y-3 text-sm text-slate-600">
            <div>
              <p className="font-medium text-slate-800">{fr ? "Retours" : "Returns"}</p>
              <p className="whitespace-pre-line" data-testid="store-returns-policy">
                {returnsPolicy ||
                  (settings.returnWindowDays > 0
                    ? (fr ? `Retours sous ${settings.returnWindowDays} jours après la livraison.` : `${settings.returnWindowDays}-day returns after delivery.`)
                    : (fr ? "Les retours sont fermés pour le moment." : "Returns are closed at the moment."))}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800">{fr ? "Expédition" : "Shipping"}</p>
              <p className="whitespace-pre-line" data-testid="store-shipping-policy">
                {shippingPolicy || (fr ? "Livraison depuis l'entrepôt Somba de votre zone." : "Delivered from the Somba warehouse that serves your area.")}
              </p>
            </div>
            <p>
              <Link href="/legal/returns" className="text-[var(--primary)] hover:underline">{fr ? "Politique de retour Somba" : "Somba return policy"}</Link>
              {" · "}
              <Link href="/legal/shipping" className="text-[var(--primary)] hover:underline">{fr ? "Livraison" : "Shipping"}</Link>
            </p>
          </div>
        </DetailGridSection>

        {coupons.length > 0 && (
          <DetailGridSection title={fr ? "Coupons de la boutique" : "Store coupons"}>
            <ul className="space-y-2" data-testid="store-coupons">
              {coupons.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono font-bold text-amber-900">{c.code} <span className="font-sans text-xs font-semibold">{couponLabel(c)}</span></p>
                    {c.minOrder ? <p className="text-xs text-amber-800">{fr ? "Dès" : "From"} {formatCurrency(c.minOrder, locale)}</p> : null}
                    {c.description && <p className="text-xs text-amber-800">{c.description}</p>}
                  </div>
                  <button type="button" onClick={() => copyCode(c.code)} aria-label={`${fr ? "Copier le code" : "Copy code"} ${c.code}`} className="rounded-lg border border-amber-300 bg-white p-2 text-amber-900 hover:bg-amber-100">
                    <Copy className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Produits" : "Products"} span={3}>
          {products.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Cette boutique n'a aucun produit en ligne pour le moment." : "This store has no live products right now."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
