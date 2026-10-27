"use client";

import { pickText } from "@/lib/i18n-fields";
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { useShop, useCartLines } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { addressPin, useDeliveryQuote } from "@/lib/logistics";
import { DeliveryQuoteCard, NotServedNotice, QuoteFeeValue, SellerAreaNotice } from "@/components/shop/delivery-quote";
import { chainText } from "@/lib/areas";
import { formatCurrency } from "@/lib/utils";
import { useCatalog } from "@/lib/catalog";
import { variantDisplay } from "@/components/shop/order-products";

function qtyOptions(qty: number, stock: number | null): number[] {
  const max = Math.max(1, Math.min(10, stock ?? 10));
  return Array.from({ length: Math.max(max, qty) }, (_, i) => i + 1);
}

export default function ShopCartPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { updateQty, removeFromCart, moveToWishlist, promoCode, promoDiscount, promoSellerId, applyPromo, removePromo } = useShop();
  const { lines, subtotal, hasUnavailable, hasVacation, savings } = useCartLines();
  const { toast } = useToast();
  const catalog = useCatalog();
  const promoStore = promoSellerId ? catalog.find((p) => p.sellerId === promoSellerId)?.seller ?? null : null;
  const [promoInput, setPromoInput] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const discount = Math.min(promoDiscount, subtotal);

  // The delivery fee is quoted by the server from the address (nearest warehouse + distance): never guessed here.
  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const addresses = rt.addresses;
  const addressId = useMemo(() => {
    if (pickedAddress && addresses.some((a) => a.id === pickedAddress)) return pickedAddress;
    return (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? null;
  }, [pickedAddress, addresses]);
  const address = addresses.find((a) => a.id === addressId) ?? null;
  const pinned = !!addressPin(address);
  const quoteLines = useMemo(() => lines.filter((l) => !l.unavailable).map((l) => ({ productId: l.id, qty: l.qty })), [lines]);
  const { quote, loading: quoteLoading, error: quoteError, notServed: quoteNotServed, sellerBlocked } = useDeliveryQuote({
    addressId: address?.id ?? null,
    lines: quoteLines,
    enabled: !!address && pinned,
  });
  // An address outside every served area: no fee, and checkout stays closed until another address is chosen.
  const deepestArea = address?.areaChain?.[address.areaChain.length - 1] ?? null;
  const notServed = quoteNotServed ?? (address && address.served === false ? { area: deepestArea?.name ?? address.commune ?? address.city ?? "", areaEn: deepestArea?.nameEn ?? undefined } : null);
  const delivery = quote?.feeUsd ?? 0;
  const total = Math.max(0, subtotal - discount) + delivery;

  const grouped = lines.reduce<Record<string, typeof lines>>((acc, item) => {
    (acc[item.seller || "Somba&Teka"] ??= []).push(item);
    return acc;
  }, {});

  async function handleApplyPromo() {
    if (!rt.user) {
      toast(fr ? "Connectez-vous pour utiliser un code promo" : "Sign in to use a promo code", "info");
      return;
    }
    setPromoBusy(true);
    const res = await applyPromo(promoInput);
    setPromoBusy(false);
    if (res.ok) {
      toast(fr ? "Code promo appliqué" : "Promo code applied");
      setPromoInput("");
    } else {
      toast(res.reason ?? (fr ? "Code invalide" : "Invalid promo code"), "error");
    }
  }

  if (lines.length === 0) {
    return (
      <div className="space-y-6 py-16 text-center">
        <PageHeader title={fr ? "Panier" : "Shopping Cart"} />
        <p className="text-slate-500">{fr ? "Votre panier est vide" : "Your cart is empty"}</p>
        <Link href="/shop/products" className="text-[var(--primary)] hover:underline">
          {fr ? "Continuer vos achats" : "Continue shopping"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Panier" : "Shopping Cart"} subtitle={fr ? "Groupé par vendeur" : "Grouped by seller"} />

      {hasUnavailable && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {fr
            ? "Certains articles ne sont plus disponibles. Retirez-les avant de passer à la caisse."
            : "Some items are no longer available. Remove them before checking out."}
        </div>
      )}

      {hasVacation && (
        <div role="alert" data-testid="cart-vacation" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {fr
            ? "Une boutique de votre panier est en vacances : retirez ses articles ou gardez-les pour plus tard avant de passer à la caisse."
            : "A store in your cart is on vacation: remove its items or save them for later before you check out."}
        </div>
      )}

      {Object.entries(grouped).map(([seller, items]) => (
        <DetailSection key={seller} title={`${fr ? "Vendu par" : "Sold by"} ${seller}`}>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={`${item.id}-${item.variant}`} className="flex gap-4">
                <Link href={`/shop/products/${item.id}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {item.image && <Image src={item.image} alt={item.name} fill className="object-cover" sizes="80px" />}
                </Link>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.id}`} className="font-medium text-slate-900 hover:text-[var(--primary)]">
                    {fr ? item.nameFr : item.name}
                  </Link>
                  <p className="text-xs text-slate-500">{variantDisplay(item.variant, fr ? item.variantFr : item.variantEn, fr)}</p>
                  {item.unavailable && (
                    <p className="text-xs font-medium text-red-600">{fr ? "Indisponible" : "Unavailable"}</p>
                  )}
                  {item.onVacation && (
                    <p className="text-xs font-medium text-amber-700" data-testid="line-vacation">
                      {(fr ? item.vacationNotice?.fr : item.vacationNotice?.en) || (fr ? "La boutique est en vacances." : "The store is on vacation.")}
                    </p>
                  )}
                  {!item.unavailable && item.livePrice !== item.price && (
                    <p className="text-xs text-amber-700">{fr ? "Le prix a changé" : "Price has changed"}</p>
                  )}
                  {item.priceInfo && item.priceInfo.source !== "base" && item.priceInfo.was != null && (
                    <p className="mt-0.5 text-xs font-semibold text-amber-800">
                      {item.priceInfo.source === "flash" ? (fr ? "Vente flash" : "Flash sale") : (item.priceInfo.campaignName ? pickText(fr, item.priceInfo.campaignName, item.priceInfo.campaignNameFr) : null) ?? (fr ? "Promotion" : "Campaign")}
                      {" · -"}{item.priceInfo.pct}%
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <select
                      className="rounded border border-blue-200 px-2 py-1 text-sm"
                      aria-label={`${fr ? "Quantité" : "Quantity"}: ${fr ? item.nameFr : item.name}`}
                      value={item.qty}
                      onChange={(e) => updateQty(item.id, item.variant, Number(e.target.value))}
                    >
                      {qtyOptions(item.qty, item.stock).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <button className="text-xs text-red-600" aria-label={`${fr ? "Supprimer" : "Remove"} ${fr ? item.nameFr : item.name}`} onClick={() => { removeFromCart(item.id, item.variant); toast(fr ? "Retiré" : "Removed"); }}>
                      {fr ? "Supprimer" : "Remove"}
                    </button>
                    <button className="text-xs text-slate-500" onClick={() => { moveToWishlist(item.id, item.variant); toast(fr ? "Enregistré" : "Saved"); }}>
                      {fr ? "Sauvegarder" : "Save for later"}
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <DualCurrency amount={item.livePrice * item.qty} className="font-semibold text-blue-700" />
                  {item.priceInfo?.was != null && item.priceInfo.was > item.livePrice && item.qty > 0 && (
                    <s className="block text-xs text-slate-500">
                      <span className="sr-only">{fr ? "Ancien prix " : "Was "}</span>
                      {formatCurrency(item.priceInfo.was * item.qty, locale)}
                    </s>
                  )}
                  {item.qty > 1 && <p className="text-xs text-slate-500">{formatCurrency(item.livePrice, locale)} × {item.qty}</p>}
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      ))}

      <div className="card-premium p-4">
        <p className="mb-2 text-sm font-medium">{fr ? "Code promo" : "Promo code"}</p>
        <div className="flex gap-2">
          <input
            className="input-premium flex-1 px-3 py-2 text-sm"
            placeholder={fr ? "Entrez votre code" : "Enter your code"}
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            disabled={!!promoCode}
          />
          {promoCode ? (
            <button onClick={removePromo} className="rounded-xl border px-4 py-2 text-sm text-red-600">
              {fr ? "Retirer" : "Remove"}
            </button>
          ) : (
            <button onClick={handleApplyPromo} disabled={promoBusy || !promoInput.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {promoBusy ? "…" : fr ? "Appliquer" : "Apply"}
            </button>
          )}
        </div>
        {promoCode && (
          <p className="mt-1 text-xs text-emerald-600" data-testid="promo-applied">
            {promoCode} {fr ? "appliqué" : "applied"}
            {promoSellerId && (promoStore ? (fr ? ` · valable uniquement sur les produits de ${promoStore}` : ` · applies to ${promoStore} products only`) : fr ? " · coupon boutique" : " · store coupon")}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">{fr ? "Un seul code : code Somba ou coupon d'une boutique." : "One code only: a Somba code or a store coupon."}</p>
      </div>

      <div className="card-premium space-y-3 p-4">
        <p className="text-sm font-medium">{fr ? "Livraison" : "Delivery"}</p>
        {!rt.user ? (
          <p className="text-xs text-slate-500">
            {fr
              ? "Les frais de livraison sont calculés à partir de votre adresse épinglée. Connectez-vous pour les voir."
              : "The delivery fee is worked out from your pinned address. Sign in to see it."}{" "}
            <Link href="/shop/login?next=/shop/cart" className="font-medium text-[var(--primary)] hover:underline">{fr ? "Se connecter" : "Sign in"}</Link>
          </p>
        ) : addresses.length === 0 ? (
          <p className="text-xs text-slate-500">
            {fr ? "Ajoutez une adresse épinglée sur la carte pour connaître les frais de livraison." : "Add an address pinned on the map to see your delivery fee."}{" "}
            <Link href="/shop/checkout" className="font-medium text-[var(--primary)] hover:underline">{fr ? "Ajouter une adresse" : "Add an address"}</Link>
          </p>
        ) : (
          <>
            <select
              className="input-premium w-full px-3 py-2 text-sm"
              aria-label={fr ? "Adresse de livraison" : "Delivery address"}
              value={addressId ?? ""}
              onChange={(e) => setPickedAddress(e.target.value)}
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {[a.line1, a.commune, a.city].filter(Boolean).join(", ")}
                  {addressPin(a) ? "" : fr ? " (sans épingle)" : " (not pinned)"}
                  {a.served === false ? (fr ? " (non desservie)" : " (not served)") : ""}
                </option>
              ))}
            </select>
            {!pinned && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {fr ? "Placez votre adresse de livraison sur la carte." : "Pin your delivery address on the map."}{" "}
                <Link href="/shop/checkout" className="font-semibold underline">{fr ? "Ajouter une épingle" : "Add a pin"}</Link>
              </p>
            )}
            {notServed ? (
              <NotServedNotice notServed={notServed} areaObj={deepestArea} fr={fr}>
                <Link href="/shop/account/addresses" className="font-semibold underline">{fr ? "Gérer mes adresses" : "Manage my addresses"}</Link>
              </NotServedNotice>
            ) : sellerBlocked ? (
              <SellerAreaNotice fr={fr} />
            ) : (
              <DeliveryQuoteCard quote={quote} loading={quoteLoading} error={quoteError} fr={fr} locale={locale} />
            )}
            {address?.areaChain && address.areaChain.length > 0 && !notServed && (
              <p className="text-xs text-slate-500">{chainText(address.areaChain, fr, { skipLevels: ["district"] })}</p>
            )}
          </>
        )}
      </div>

      <div className="card-premium p-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>{fr ? "Sous-total" : "Subtotal"}</span><DualCurrency amount={subtotal} /></div>
          {savings > 0 && (
            <div className="flex justify-between text-xs text-amber-800">
              <span>{fr ? "Dont économisé grâce aux promotions" : "Includes promotion savings of"}</span><span>{formatCurrency(savings, locale)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>{fr ? "Réduction" : "Discount"}</span><span>-<DualCurrency amount={discount} /></span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{fr ? "Livraison" : "Delivery"}</span>
            <QuoteFeeValue quote={quote} loading={quoteLoading} error={quoteError} fr={fr} notServed={notServed} missing={fr ? "Selon votre adresse" : "Based on your address"} />
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 text-lg font-bold">
            <span>Total</span>
            <DualCurrency amount={total} className="text-blue-700" />
          </div>
        </div>
        {hasUnavailable || hasVacation || notServed || sellerBlocked ? (
          <button disabled className="btn-primary mt-4 block w-full py-3 text-center opacity-50" data-testid="checkout-blocked">
            {fr ? "Passer à la caisse" : "Continue to Checkout"}
          </button>
        ) : (
          <Link href="/shop/checkout" className="btn-primary mt-4 block w-full py-3 text-center">
            {fr ? "Passer à la caisse" : "Continue to Checkout"}
          </Link>
        )}
      </div>
    </div>
  );
}
