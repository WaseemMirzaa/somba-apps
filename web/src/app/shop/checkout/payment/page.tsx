"use client";

import { useCallback, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { DualCurrency } from "@/components/ui/dual-currency";
import { PageLoader } from "@/components/ui/loader";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { PaymentPending } from "@/components/shop/payment-pending";
import { OrderLines } from "@/components/shop/order-lines";
import { OneDeliveryNote } from "@/components/shop/one-delivery-note";
import { VerificationNotice } from "@/components/shop/verification";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useShop, useCartLines, type CartLine } from "@/context/shop-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  MOBILE_MONEY_METHODS,
  addressToShipping,
  isMobileMoneyMethod,
  isVerificationError,
  usePublicSettings,
  useVerificationStatus,
  zoneLabel,
} from "@/lib/shop-live";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/lib/realtime/types";

function PaymentContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const rt = useRealtime();
  const router = useRouter();
  const params = useSearchParams();
  const { promoCode, promoDiscount, zoneId, clearCart, addToCart } = useShop();
  const { lines, subtotal, hasUnavailable, savings } = useCartLines();
  const verification = useVerificationStatus();
  const settings = usePublicSettings();

  const addressId = params.get("address");
  const openBox = params.get("openBox") === "true";
  const note = params.get("note") ?? "";
  const address = rt.addresses.find((a) => a.id === addressId) ?? null;

  const zone = settings.deliveryZones.find((z) => z.id === zoneId) ?? null;
  const zoneMissing = settings.deliveryZones.length > 0 && !zone;
  const deliveryFee = zone?.feeUsd ?? 0;
  const discount = Math.min(promoDiscount, subtotal);
  const total = Math.round((Math.max(0, subtotal - discount) + deliveryFee) * 100) / 100;

  const balance = rt.walletBalance;
  const walletEnough = balance >= total;

  const [method, setMethod] = useState<string>("");
  const [msisdn, setMsisdn] = useState(rt.user?.phone ?? "");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Order | null>(null);
  const snapshot = useRef<CartLine[]>([]);

  // Default method: wallet when it covers the total, otherwise Airtel Money.
  const chosen = method || (walletEnough ? "wallet" : "airtel_money");
  const mobile = isMobileMoneyMethod(chosen);

  const methods = useMemo(() => {
    const list: { id: string; label: string; hint?: string; disabled?: boolean }[] = [
      {
        id: "wallet",
        label: fr ? "Portefeuille Somba" : "Somba wallet",
        hint: `${fr ? "Solde" : "Balance"}: ${formatCurrency(balance, locale)}${walletEnough ? "" : fr ? " — insuffisant" : " — not enough"}`,
        disabled: !walletEnough,
      },
      ...MOBILE_MONEY_METHODS.map((m) => ({ id: m.id, label: m.label })),
    ];
    if (settings.codEnabled) {
      list.push({ id: "cod", label: fr ? "Paiement à la livraison" : "Cash on delivery" });
    }
    return list;
  }, [fr, locale, balance, walletEnough, settings.codEnabled]);

  const handleConfirmed = useCallback(
    (order: Order) => {
      router.replace(`/shop/orders/${order.reference}/confirmed`);
    },
    [router],
  );

  const restoreCart = useCallback(() => {
    for (const l of snapshot.current) {
      addToCart({ id: l.id, name: l.name, nameFr: l.nameFr, price: l.livePrice, image: l.image, seller: l.seller, variant: l.variant, qty: l.qty });
    }
    router.replace("/shop/cart");
  }, [addToCart, router]);

  async function placeOrder() {
    setError(null);
    if (verification.blocked) {
      setError(null);
      return;
    }
    if (!address) {
      setError(fr ? "Choisissez une adresse de livraison." : "Choose a delivery address first.");
      return;
    }
    if (lines.length === 0 || hasUnavailable) {
      setError(fr ? "Votre panier contient des articles indisponibles ou est vide." : "Your cart is empty or has unavailable items.");
      return;
    }
    if (zoneMissing) {
      setError(fr ? "Choisissez une zone de livraison." : "Choose a delivery zone first.");
      return;
    }
    if (mobile && msisdn.replace(/\D/g, "").length < 9) {
      setError(fr ? "Saisissez le numéro Mobile Money qui approuvera le paiement." : "Enter the mobile-money number that will approve the payment.");
      return;
    }
    if (chosen === "wallet" && !walletEnough) {
      setError(fr ? "Solde du portefeuille insuffisant." : "Your wallet balance is not enough.");
      return;
    }

    setPlacing(true);
    try {
      const shipping = JSON.parse(addressToShipping(address, zoneId)) as Record<string, unknown>;
      if (note.trim()) shipping.note = note.trim();
      shipping.openBox = openBox;
      const order = await socketClient.request<Order>("orders:create", {
        items: lines.map((l) => ({ productId: l.id, qty: l.qty, variant: l.variant })),
        paymentMethod: chosen,
        ...(zoneId ? { zoneId } : {}),
        shippingAddress: JSON.stringify(shipping),
        ...(promoCode ? { promoCode } : {}),
        ...(mobile ? { paymentPhone: msisdn.trim() } : {}),
      });
      // The order exists: only now is the cart emptied.
      snapshot.current = lines;
      clearCart();
      if (mobile && order.status === "pending") {
        setCreated(order);
        return;
      }
      toast(fr ? "Commande passée" : "Order placed");
      router.replace(`/shop/orders/${order.reference}/confirmed`);
    } catch (e) {
      const message = (e as Error).message || (fr ? "La commande a échoué." : "Could not place the order.");
      setError(message);
      toast(message, "error");
    } finally {
      setPlacing(false);
    }
  }

  if (created) {
    return <PaymentPending order={created} onConfirmed={handleConfirmed} onRestoreCart={restoreCart} />;
  }

  if (lines.length === 0) {
    return (
      <div className="space-y-4 py-16 text-center">
        <PageHeader title={fr ? "Paiement" : "Payment"} />
        <p className="text-slate-500">{fr ? "Votre panier est vide." : "Your cart is empty."}</p>
        <Link href="/shop/products" className="text-[var(--primary)] hover:underline">{fr ? "Voir les produits" : "Browse products"}</Link>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="space-y-4 py-16 text-center">
        <PageHeader title={fr ? "Paiement" : "Payment"} />
        <p className="text-slate-500">{fr ? "Aucune adresse de livraison sélectionnée." : "No delivery address selected."}</p>
        <Link href="/shop/checkout" className="text-[var(--primary)] hover:underline">{fr ? "Retour à la caisse" : "Back to checkout"}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={fr ? "Paiement" : "Payment"} breadcrumbs={[{ label: fr ? "Caisse" : "Checkout", href: "/shop/checkout" }, { label: fr ? "Paiement" : "Payment" }]} />

      <DetailSection title={fr ? "Récapitulatif" : "Summary"}>
        <OrderLines lines={lines} />
        <OneDeliveryNote lines={lines} className="mt-4" />
        <InfoGrid items={[
          { label: fr ? "Livraison à" : "Deliver to", value: `${address.label} — ${[address.line1, address.commune, address.city].filter(Boolean).join(", ")}`, full: true },
          { label: fr ? "Articles" : "Items", value: lines.reduce((s, l) => s + l.qty, 0) },
          { label: fr ? "Sous-total" : "Subtotal", value: <DualCurrency amount={subtotal} /> },
          ...(savings > 0 ? [{ label: fr ? "Dont économisé (promotions)" : "Includes promotion savings", value: <span className="text-amber-800">{formatCurrency(savings, locale)}</span> }] : []),
          ...(discount > 0 ? [{ label: `${fr ? "Réduction" : "Discount"} (${promoCode})`, value: <span className="text-emerald-600">-<DualCurrency amount={discount} /></span> }] : []),
          { label: `${fr ? "Livraison" : "Delivery"}${zone ? ` — ${zoneLabel(zone, fr)}` : ""}`, value: deliveryFee === 0 ? (fr ? "GRATUIT" : "FREE") : <DualCurrency amount={deliveryFee} /> },
        ]} />
      </DetailSection>

      <DetailSection title={fr ? "Mode de paiement" : "Payment Method"}>
        <div className="space-y-3">
          {methods.map((m) => (
            <label
              key={m.id}
              className={`flex items-center gap-3 rounded-xl border p-4 ${m.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${chosen === m.id ? "border-blue-500 bg-blue-50" : "border-[var(--border)]"}`}
            >
              <input type="radio" name="payment" checked={chosen === m.id} disabled={m.disabled} onChange={() => setMethod(m.id)} />
              <div className="flex-1">
                <span className="font-medium">{m.label}</span>
                {m.hint && <p className="text-xs text-slate-500">{m.hint}</p>}
              </div>
            </label>
          ))}
        </div>

        {!walletEnough && (
          <p className="mt-2 text-xs text-slate-500">
            <Link href="/shop/account" className="text-[var(--primary)] underline">{fr ? "Recharger le portefeuille" : "Top up your wallet"}</Link>
          </p>
        )}

        {mobile && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Numéro Mobile Money" : "Mobile-money number"}</label>
            <input
              className="input-premium w-full px-4 py-2 text-sm"
              type="tel"
              inputMode="tel"
              placeholder="+243 8X XXX XXXX"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              {fr ? "Vous recevrez une demande à approuver sur ce téléphone." : "You will get a request to approve on this phone."}
            </p>
          </div>
        )}
        {chosen === "cod" && (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            {fr ? "Vous payez en espèces au livreur à la réception." : "You pay the rider in cash when the parcel arrives."}
          </p>
        )}

        <p className="mt-4 text-lg font-bold">Total: <DualCurrency amount={total} /></p>

        {(verification.blocked || isVerificationError(error)) ? (
          <div className="mt-3"><VerificationNotice status={verification} serverMessage={isVerificationError(error) ? error : null} /></div>
        ) : error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <Button onClick={placeOrder} disabled={placing || zoneMissing || verification.blocked} className="mt-4 w-full">
          {placing ? (fr ? "Traitement…" : "Placing…") : fr ? "Payer" : "Pay"}
        </Button>
        <Link href="/shop/checkout" className="mt-2 block text-center text-sm text-slate-500 hover:underline">{fr ? "← Retour" : "← Back"}</Link>
      </DetailSection>
    </div>
  );
}

export default function ShopPaymentPage() {
  return (
    <RequireSignIn next="/shop/checkout">
      <Suspense fallback={<PageLoader className="p-8" />}>
        <PaymentContent />
      </Suspense>
    </RequireSignIn>
  );
}
