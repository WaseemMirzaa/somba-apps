"use client";

import { pickText } from "@/lib/i18n-fields";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { DualCurrency } from "@/components/ui/dual-currency";
import { useShop, useCartLines } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { usePublicSettings, zoneLabel } from "@/lib/shop-live";
import { formatCurrency } from "@/lib/utils";
import { variantDisplay } from "@/components/shop/order-products";

function qtyOptions(qty: number, stock: number | null): number[] {
  const max = Math.max(1, Math.min(10, stock ?? 10));
  return Array.from({ length: Math.max(max, qty) }, (_, i) => i + 1);
}

export default function ShopCartPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { updateQty, removeFromCart, moveToWishlist, promoCode, promoDiscount, applyPromo, removePromo, zoneId, setZoneId } = useShop();
  const { lines, subtotal, hasUnavailable, savings } = useCartLines();
  const settings = usePublicSettings();
  const { toast } = useToast();
  const [promoInput, setPromoInput] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const zones = settings.deliveryZones;
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const discount = Math.min(promoDiscount, subtotal);
  const delivery = zone?.feeUsd ?? 0;
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
        {promoCode && <p className="mt-1 text-xs text-emerald-600">{promoCode} {fr ? "appliqué" : "applied"}</p>}
      </div>

      <div className="card-premium p-4">
        <p className="mb-2 text-sm font-medium">{fr ? "Zone de livraison" : "Delivery zone"}</p>
        {zones.length === 0 ? (
          <p className="text-xs text-slate-500">
            {settings.loaded
              ? (fr ? "Les frais de livraison seront calculés par le serveur à la commande." : "Delivery fees are calculated by the server when you place the order.")
              : (fr ? "Chargement des zones…" : "Loading zones…")}
          </p>
        ) : (
          <select
            className="input-premium w-full px-3 py-2 text-sm"
            value={zoneId ?? ""}
            onChange={(e) => setZoneId(e.target.value || null)}
          >
            <option value="">{fr ? "Choisir une zone" : "Choose a zone"}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {zoneLabel(z, fr)} — {z.city} ({z.feeUsd === 0 ? (fr ? "gratuit" : "free") : formatCurrency(z.feeUsd, locale)})
              </option>
            ))}
          </select>
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
            <span>{fr ? "Livraison (zone)" : "Delivery (zone)"}</span>
            {!zone ? (
              <span className="text-slate-500">{fr ? "Choisissez une zone" : "Choose a zone"}</span>
            ) : delivery === 0 ? (fr ? "GRATUIT" : "FREE") : <DualCurrency amount={delivery} />}
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 text-lg font-bold">
            <span>Total</span>
            <DualCurrency amount={total} className="text-blue-700" />
          </div>
        </div>
        {hasUnavailable ? (
          <button disabled className="btn-primary mt-4 block w-full py-3 text-center opacity-50">
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
