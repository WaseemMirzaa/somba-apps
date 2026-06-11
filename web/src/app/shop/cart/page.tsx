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
import { localizedField } from "@/lib/locale-helpers";
import { useMarket } from "@/context/market-context";

export default function ShopCartPage() {
  const { t, locale } = useLocale();
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
      toast(t("promoCodeApplied"));
    } else {
      toast(t("invalidPromoCode"));
    }
  }

  if (cart.length === 0) {
    return (
      <div className="space-y-6 py-16 text-center">
        <PageHeader title={t("shoppingCart")} />
        <p className="text-slate-500">{t("cartEmpty")}</p>
        <Link href="/shop/products" className="text-blue-600 hover:underline">
          {t("continueShopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("shoppingCart")} subtitle={t("groupedBySeller")} />

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
                    {localizedField(locale, item.name, item.nameFr)}
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
                      {t("removeItem")}
                    </button>
                    <button className="text-xs text-slate-500" onClick={() => { moveToWishlist(item.id, item.variant); toast(t("saved")); }}>
                      {t("saveForLater")}
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
        <p className="mb-2 text-sm font-medium">{t("promoCode")}</p>
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
              {t("removeItem")}
            </button>
          ) : (
            <button onClick={handleApplyPromo} className="btn-primary px-4 py-2 text-sm">
              {t("apply")}
            </button>
          )}
        </div>
        {promoCode && <p className="mt-1 text-xs text-emerald-600">{promoCode} applied</p>}
      </div>

      <div className="card-premium p-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>{t("subtotal")}</span><DualCurrency amount={subtotal} /></div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>{t("cartDiscount")}</span><span>-<DualCurrency amount={discount} /></span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t("deliveryZone")}</span>
            {delivery === 0 ? t("free") : <DualCurrency amount={delivery} />}
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 text-lg font-bold">
            <span>{t("total")}</span>
            <DualCurrency amount={total} className="text-blue-700" />
          </div>
        </div>
        <Link href="/shop/checkout" className="btn-primary mt-4 block w-full py-3 text-center">
          {t("continueToCheckout")}
        </Link>
      </div>
    </div>
  );
}
