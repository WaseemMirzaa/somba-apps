"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { useShop } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useMarket } from "@/context/market-context";

export default function ShopCartPage() {
  const { locale } = useLocale();
  const { profile } = useMarket();
  const { cart, updateQty, removeFromCart, moveToWishlist, promoCode, promoDiscount, applyPromo, removePromo } = useShop();
  const { toast } = useToast();
  const [promoInput, setPromoInput] = useState("");

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoDiscount || (cart.length > 0 ? 0 : 0);
  const delivery = profile.zones[0]?.deliveryFeeUsd ?? 0;
  const total = subtotal - discount + delivery;

  const grouped = cart.reduce<Record<string, typeof cart>>((acc, item) => {
    (acc[item.seller] ??= []).push(item);
    return acc;
  }, {});

  function handleApplyPromo() {
    if (applyPromo(promoInput)) {
      toast(locale === "fr" ? "Code promo appliqué" : "Promo code applied");
    } else {
      toast(locale === "fr" ? "Code invalide" : "Invalid promo code");
    }
  }

  if (cart.length === 0) {
    return (
      <div className="space-y-6 py-16 text-center">
        <PageHeader title={locale === "fr" ? "Panier" : "Shopping Cart"} />
        <p className="text-slate-500">{locale === "fr" ? "Votre panier est vide" : "Your cart is empty"}</p>
        <Link href="/shop/products" className="text-blue-600 hover:underline">
          {locale === "fr" ? "Continuer vos achats" : "Continue shopping"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={locale === "fr" ? "Panier" : "Shopping Cart"} subtitle={locale === "fr" ? "Groupé par vendeur" : "Grouped by seller"} />

      {Object.entries(grouped).map(([seller, items]) => (
        <DetailSection key={seller} title={seller}>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={`${item.id}-${item.variant}`} className="flex gap-4">
                <Link href={`/shop/products/${item.id}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="80px" />
                </Link>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                    {locale === "fr" ? item.nameFr : item.name}
                  </Link>
                  <p className="text-xs text-slate-500">{item.variant}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <select
                      className="rounded border border-blue-200 px-2 py-1 text-sm"
                      value={item.qty}
                      onChange={(e) => updateQty(item.id, item.variant, Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button className="text-xs text-red-500" onClick={() => { removeFromCart(item.id, item.variant); toast("Removed"); }}>
                      {locale === "fr" ? "Supprimer" : "Remove"}
                    </button>
                    <button className="text-xs text-slate-500" onClick={() => { moveToWishlist(item.id, item.variant); toast("Saved"); }}>
                      {locale === "fr" ? "Sauvegarder" : "Save for later"}
                    </button>
                  </div>
                </div>
                <DualCurrency amount={item.price * item.qty} className="font-semibold text-blue-700" />
              </div>
            ))}
          </div>
        </DetailSection>
      ))}

      <div className="card-premium p-4">
        <p className="mb-2 text-sm font-medium">{locale === "fr" ? "Code promo" : "Promo code"}</p>
        <div className="flex gap-2">
          <input
            className="input-premium flex-1 px-3 py-2 text-sm"
            placeholder="SOMBA10"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            disabled={!!promoCode}
          />
          {promoCode ? (
            <button onClick={removePromo} className="rounded-xl border px-4 py-2 text-sm text-red-600">
              {locale === "fr" ? "Retirer" : "Remove"}
            </button>
          ) : (
            <button onClick={handleApplyPromo} className="btn-primary px-4 py-2 text-sm">
              {locale === "fr" ? "Appliquer" : "Apply"}
            </button>
          )}
        </div>
        {promoCode && <p className="mt-1 text-xs text-emerald-600">{promoCode} applied</p>}
      </div>

      <div className="card-premium p-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>{locale === "fr" ? "Sous-total" : "Subtotal"}</span><DualCurrency amount={subtotal} /></div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>{locale === "fr" ? "Réduction" : "Discount"}</span><span>-<DualCurrency amount={discount} /></span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{locale === "fr" ? "Livraison (zone)" : "Delivery (zone)"}</span>
            {delivery === 0 ? "FREE" : <DualCurrency amount={delivery} />}
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 text-lg font-bold">
            <span>{locale === "fr" ? "Total" : "Total"}</span>
            <DualCurrency amount={total} className="text-blue-700" />
          </div>
        </div>
        <Link href="/shop/checkout" className="btn-primary mt-4 block w-full py-3 text-center">
          {locale === "fr" ? "Passer à la caisse" : "Continue to Checkout"}
        </Link>
      </div>
    </div>
  );
}
