"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { DualCurrency } from "@/components/ui/dual-currency";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { useMarket } from "@/context/market-context";
import { useShop } from "@/context/shop-context";
import { BUSINESS } from "@/lib/config";

const addresses = [
  { id: 1, label: "Domicile", address: "8 Rue de la Paix, Apt 4B", city: "Paris", commune: "2e arrondissement", zoneId: "zone-a", default: true },
  { id: 2, label: "Bureau", address: "45 Avenue des Champs-Élysées", city: "Paris", commune: "8e arrondissement", zoneId: "zone-b", default: false },
  { id: 3, label: "Kinshasa", address: "12 Ave du Commerce, Gombe", city: "Kinshasa", commune: "Gombe", zoneId: "gombe", default: false },
];

export default function ShopCheckoutPage() {
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const { profile, getZoneFee } = useMarket();
  const { cart, promoDiscount } = useShop();
  const router = useRouter();
  const [crossCity, setCrossCity] = useState(true);
  const [openBox, setOpenBox] = useState(true);
  const [guestEmail, setGuestEmail] = useState("");
  const [selectedAddress, setSelectedAddress] = useState(addresses.find((a) => a.default)?.id ?? addresses[0].id);
  const [orderNote, setOrderNote] = useState("");

  const addr = addresses.find((a) => a.id === selectedAddress)!;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0) || 1498;
  const deliveryFee = getZoneFee(addr.zoneId);
  const total = subtotal - promoDiscount + deliveryFee;

  function continueToPayment() {
    const params = new URLSearchParams({
      address: String(selectedAddress),
      zone: addr.zoneId,
      total: String(total),
      crossCity: String(crossCity),
      openBox: String(openBox),
      note: orderNote,
    });
    router.push(`/shop/checkout/payment?${params}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={locale === "fr" ? "Caisse" : "Checkout"} breadcrumbs={[{ label: "Cart", href: "/shop/cart" }, { label: "Checkout" }]} />

      {!isAuthenticated && (
        <div className="card-premium p-4">
          <p className="text-sm font-medium">{locale === "fr" ? "Achat invité activé" : "Guest checkout enabled"}</p>
          <input className="input-premium mt-2 w-full px-4 py-2.5 text-sm" placeholder="Email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
          <Link href="/shop/login" className="mt-2 inline-block text-xs text-[var(--primary)]">{locale === "fr" ? "Se connecter" : "Sign in"}</Link>
        </div>
      )}

      <DetailSection title={locale === "fr" ? "Adresse de livraison" : "Delivery Address"}>
        <div className="space-y-3">
          {addresses.map((a) => (
            <label key={a.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selectedAddress === a.id ? "border-blue-500 bg-blue-50" : "border-[var(--border)]"}`}>
              <input type="radio" name="address" checked={selectedAddress === a.id} onChange={() => setSelectedAddress(a.id)} className="mt-1" />
              <div>
                <p className="font-medium">{a.label}</p>
                <p className="text-sm text-slate-500">{a.address}, {a.commune}, {a.city}</p>
                <p className="text-xs text-[var(--primary)]">{profile.zones.find((z) => z.id === a.zoneId)?.name ?? a.zoneId}</p>
              </div>
            </label>
          ))}
          <button type="button" onClick={() => router.push("/shop/account/addresses")} className="text-sm font-medium text-[var(--primary)] hover:underline">+ Add address</button>
        </div>
      </DetailSection>

      <DetailSection title={locale === "fr" ? "Options de livraison" : "Delivery Options"}>
        <label className="mb-4 flex items-center gap-3 rounded-xl border p-4">
          <input type="checkbox" checked={crossCity} onChange={(e) => setCrossCity(e.target.checked)} />
          <span className="text-sm">Cross-city delivery {BUSINESS.crossCityDelivery ? "(allowed)" : "(blocked)"}</span>
        </label>
        <label className="mb-4 flex items-center gap-3 rounded-xl border p-4">
          <input type="checkbox" checked={openBox} onChange={(e) => setOpenBox(e.target.checked)} />
          <span className="text-sm">Open Box Delivery</span>
        </label>
        <textarea className="input-premium mb-4 w-full px-3 py-2 text-sm" placeholder={locale === "fr" ? "Note de commande (optionnel)" : "Order note (optional)"} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} rows={2} />
        <InfoGrid items={[
          { label: locale === "fr" ? "Frais de zone" : "Zone delivery fee", value: deliveryFee === 0 ? "FREE" : <DualCurrency amount={deliveryFee} /> },
          { label: "ETA", value: crossCity ? "3-5 days" : "1-2 days" },
          { label: locale === "fr" ? "Total" : "Total", value: <DualCurrency amount={total} className="font-bold text-blue-700" /> },
        ]} />
      </DetailSection>

      <Button onClick={continueToPayment} className="w-full">
        {locale === "fr" ? "Continuer vers le paiement" : "Continue to Payment"}
      </Button>
    </div>
  );
}
