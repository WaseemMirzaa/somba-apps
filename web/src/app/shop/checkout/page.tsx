"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { DualCurrency } from "@/components/ui/dual-currency";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { OrderLines } from "@/components/shop/order-lines";
import { OneDeliveryNote } from "@/components/shop/one-delivery-note";
import { VerificationNotice } from "@/components/shop/verification";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useShop, useCartLines } from "@/context/shop-context";
import { DeliveryQuoteCard, NotServedNotice, QuoteFeeValue } from "@/components/shop/delivery-quote";
import { AreaPicker, type AreaSelection } from "@/components/geo/area-picker";
import { addressTextFromChain, chainText, notServedArea, notServedText, type AreaHint, type NotServedInfo } from "@/lib/areas";
import { AddressPinEditor, UnpinnedWarning, pinRequiredText } from "@/components/shop/address-pin-editor";
import { addressPin, useDeliveryQuote } from "@/lib/logistics";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { dayLabel, estimateFor } from "@/lib/delivery-estimate";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import type { AddressGeo, PickedMeta, PickedParts } from "@/lib/google-maps";
import { useVerificationStatus } from "@/lib/shop-live";
import type { Address } from "@/lib/realtime/types";

/** The one-line refusal used in a snackbar (the full message with the served cities is on the page). */
function notServedLine(n: NotServedInfo, fr: boolean): string {
  return notServedText(notServedArea(n, fr), [], fr);
}

function CheckoutContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const router = useRouter();
  const { promoDiscount, promoCode } = useShop();
  const { lines, subtotal, hasUnavailable, hasVacation, savings } = useCartLines();
  const verification = useVerificationStatus();

  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const [openBox, setOpenBox] = useState(true);
  const [orderNote, setOrderNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ label: string; line1: string; phone: string; geo: AddressGeo | null }>({ label: "", line1: "", phone: rt.user?.phone ?? "", geo: null });
  const [hint, setHint] = useState<AreaHint | null>(null);
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  const addresses = rt.addresses;
  // Selected address: the customer's pick, else the default, else the first one.
  const selectedId = useMemo(() => {
    if (pickedAddress && addresses.some((a) => a.id === pickedAddress)) return pickedAddress;
    return (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? null;
  }, [pickedAddress, addresses]);
  const address = addresses.find((a) => a.id === selectedId) ?? null;

  const pinned = !!addressPin(address);
  const quoteLines = useMemo(() => lines.filter((l) => !l.unavailable).map((l) => ({ productId: l.id, qty: l.qty })), [lines]);
  const { quote, loading: quoteLoading, error: quoteError, notServed: quoteNotServed } = useDeliveryQuote({
    addressId: address && pinned ? address.id : null,
    lines: quoteLines,
    enabled: !!address && pinned,
  });
  // Outside every served area: the quote is refused (or the address already says so). No fee, no checkout.
  const addressUnserved = !!address && address.served === false;
  const deepestArea = address?.areaChain?.[address.areaChain.length - 1] ?? null;
  const notServed = quoteNotServed ?? (addressUnserved ? { area: deepestArea?.name ?? address?.commune ?? address?.city ?? "", areaEn: deepestArea?.nameEn ?? undefined } : null);
  const deliveryFee = quote?.feeUsd ?? 0;
  const discount = Math.min(promoDiscount, subtotal);
  const total = Math.round((Math.max(0, subtotal - discount) + deliveryFee) * 100) / 100;

  /** A map pick pre-fills the typed fields (still editable) and keeps the pin for the order. */
  function applyPick(geo: AddressGeo, parts: PickedParts, meta: PickedMeta) {
    setForm((f) => ({ ...f, geo, line1: parts.line1 ?? f.line1 }));
    setHint({ components: meta.components, pin: { lat: geo.lat, lng: geo.lng }, text: { commune: parts.commune, city: parts.city, province: parts.region } });
  }

  async function saveAddress() {
    if (!form.line1.trim()) {
      toast(fr ? "L'adresse est obligatoire" : "Street address is required", "error");
      return;
    }
    if (!form.geo) {
      toast(pinRequiredText(fr), "error");
      return;
    }
    if (!area?.areaId || (area.served && !area.complete)) {
      toast(fr ? "Choisissez la province, la ville et la commune." : "Choose the province, city and commune.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await socketClient.request<Address>("addresses:create", {
        label: form.label.trim() || (fr ? "Domicile" : "Home"),
        line1: form.line1.trim(),
        phone: form.phone.trim() || undefined,
        geo: form.geo,
        areaId: area.areaId,
        ...addressTextFromChain(area.chain, fr),
      });
      setPickedAddress(created.id);
      setShowAdd(false);
      setForm({ label: "", line1: "", phone: rt.user?.phone ?? "", geo: null });
      setHint(null);
      setArea(null);
      toast(fr ? "Adresse ajoutée" : "Address added");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const canContinue = lines.length > 0 && !hasUnavailable && !hasVacation && !!address && pinned && !!quote && !notServed && !verification.blocked;

  function continueToPayment() {
    if (!address) {
      toast(fr ? "Choisissez ou ajoutez une adresse de livraison" : "Choose or add a delivery address", "error");
      return;
    }
    if (!pinned) {
      toast(pinRequiredText(fr), "error");
      setPinningId(address.id);
      return;
    }
    if (notServed) {
      toast(notServedLine(notServed, fr), "error");
      return;
    }
    const params = new URLSearchParams({ address: address.id, openBox: String(openBox), note: orderNote });
    router.push(`/shop/checkout/payment?${params}`);
  }

  if (lines.length === 0) {
    return (
      <div className="space-y-4 py-16 text-center">
        <PageHeader title={fr ? "Caisse" : "Checkout"} />
        <p className="text-slate-500">{fr ? "Votre panier est vide." : "Your cart is empty."}</p>
        <Link href="/shop/products" className="text-[var(--primary)] hover:underline">{fr ? "Voir les produits" : "Browse products"}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={fr ? "Caisse" : "Checkout"} breadcrumbs={[{ label: fr ? "Panier" : "Cart", href: "/shop/cart" }, { label: fr ? "Caisse" : "Checkout" }]} />

      {hasUnavailable && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {fr ? "Certains articles ne sont plus disponibles." : "Some items in your cart are no longer available."}{" "}
          <Link href="/shop/cart" className="font-medium underline">{fr ? "Modifier le panier" : "Edit cart"}</Link>
        </div>
      )}

      {hasVacation && (
        <div role="alert" data-testid="checkout-vacation" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {fr ? "Une boutique de votre panier est en vacances." : "A store in your cart is on vacation."}{" "}
          <Link href="/shop/cart" className="font-medium underline">{fr ? "Modifier le panier" : "Edit cart"}</Link>
        </div>
      )}

      {verification.blocked && <VerificationNotice status={verification} />}

      <DetailSection title={fr ? "Votre commande" : "Your order"}>
        <OrderLines lines={lines} />
      </DetailSection>

      <DetailSection title={fr ? "Adresse de livraison" : "Delivery Address"}>
        <div className="space-y-3">
          {addresses.length === 0 && !showAdd && (
            <p className="text-sm text-slate-500">{fr ? "Vous n'avez pas encore d'adresse enregistrée." : "You have no saved address yet."}</p>
          )}
          {addresses.map((a) => (
            <label key={a.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selectedId === a.id ? "border-blue-500 bg-blue-50" : "border-[var(--border)]"}`}>
              <input type="radio" name="address" checked={selectedId === a.id} onChange={() => setPickedAddress(a.id)} className="mt-1" />
              <div>
                <p className="font-medium">{a.label} {a.isDefault && <span className="text-xs text-[var(--primary)]">{fr ? "(Par défaut)" : "(Default)"}</span>}</p>
                <p className="text-sm text-slate-500">{[a.line1, a.commune, a.city].filter(Boolean).join(", ")}</p>
                {a.areaChain && a.areaChain.length > 0 && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {chainText(a.areaChain, fr, { skipLevels: ["district"] })}
                    {a.served === false && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-100">{fr ? "Pas encore desservie" : "Not served yet"}</span>}
                  </p>
                )}
                {a.phone && <p className="text-xs text-slate-400">{a.phone}</p>}
                {addressPin(a) ? (
                  <p className="mt-1 text-xs text-emerald-700">📍 {fr ? "Épinglée sur la carte" : "Pinned on the map"}</p>
                ) : (
                  <UnpinnedWarning fr={fr} onPin={() => { setPickedAddress(a.id); setPinningId(a.id); }} />
                )}
              </div>
            </label>
          ))}
          {pinningId && addresses.find((a) => a.id === pinningId) && (
            <AddressPinEditor
              key={pinningId}
              address={addresses.find((a) => a.id === pinningId)!}
              fr={fr}
              onSaved={() => setPinningId(null)}
              onCancel={() => setPinningId(null)}
            />
          )}

          {showAdd ? (
            <div className="space-y-3 rounded-xl border border-dashed border-blue-200 p-4">
              <AddressMapPicker value={form.geo} onPick={applyPick} fr={fr} />
              <AreaPicker fr={fr} hint={hint} onChange={setArea} />
              <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Libellé (Domicile, Bureau...)" : "Label (Home, Office...)"} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Adresse (rue, numéro)" : "Street address"} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
              <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Téléphone de contact" : "Contact phone"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {!form.geo && <p role="note" className="text-xs text-amber-800">{pinRequiredText(fr)}</p>}
              <div className="flex gap-2">
                <Button onClick={saveAddress} disabled={saving || !form.geo}>{saving ? "…" : fr ? "Enregistrer l'adresse" : "Save address"}</Button>
                <Button variant="ghost" onClick={() => setShowAdd(false)}>{fr ? "Annuler" : "Cancel"}</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAdd(true)} className="text-sm font-medium text-[var(--primary)] hover:underline">
              {fr ? "+ Ajouter une adresse" : "+ Add address"}
            </button>
          )}
        </div>
      </DetailSection>

      <DetailSection title={fr ? "Options de livraison" : "Delivery Options"}>
        {address && !pinned && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {pinRequiredText(fr)}
          </p>
        )}
        <div className="mb-4">
          {notServed ? (
            <NotServedNotice notServed={notServed} areaObj={deepestArea} fr={fr} />
          ) : (
            <DeliveryQuoteCard quote={quote} loading={quoteLoading} error={quoteError} fr={fr} locale={locale} />
          )}
        </div>
        {/* The sellers set each product's delivery time; the shopper only sees the resulting estimate. */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border p-4 text-sm" data-testid="delivery-estimate">
          <span className="font-semibold">{fr ? "Livraison estimée :" : "Estimated delivery:"}</span>
          <span>{dayLabel(estimateFor(lines.map((l) => l.deliveryDays), new Date(), quote?.extraDays ?? Math.ceil((quote?.transitHours ?? 0) / 24)), fr)}</span>
        </div>
        <label className="mb-4 flex items-center gap-3 rounded-xl border p-4">
          <input type="checkbox" checked={openBox} onChange={(e) => setOpenBox(e.target.checked)} />
          <span className="text-sm">{fr ? "Livraison colis ouvert" : "Open Box Delivery"}</span>
        </label>
        <textarea className="input-premium mb-4 w-full px-3 py-2 text-sm" placeholder={fr ? "Note pour le livreur (optionnel)" : "Note for the rider (optional)"} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} rows={2} />
        <OneDeliveryNote lines={lines} />
        <InfoGrid items={[
          { label: fr ? "Sous-total" : "Subtotal", value: <DualCurrency amount={subtotal} /> },
          ...(savings > 0 ? [{ label: fr ? "Dont économisé (promotions)" : "Includes promotion savings", value: <span className="text-amber-800">{formatCurrency(savings, locale)}</span> }] : []),
          ...(discount > 0 ? [{ label: `${fr ? "Réduction" : "Discount"}${promoCode ? ` (${promoCode})` : ""}`, value: <span className="text-emerald-600">-<DualCurrency amount={discount} /></span> }] : []),
          { label: fr ? "Frais de livraison" : "Delivery fee", value: <QuoteFeeValue quote={quote} loading={quoteLoading} error={quoteError} fr={fr} notServed={notServed} missing={address && !pinned ? (fr ? "Épinglez l'adresse" : "Pin the address") : undefined} /> },
          { label: "Total", value: <DualCurrency amount={total} className="font-bold text-blue-700" /> },
        ]} />
      </DetailSection>

      <Button onClick={continueToPayment} disabled={!canContinue} className="w-full">
        {fr ? "Continuer vers le paiement" : "Continue to Payment"}
      </Button>
    </div>
  );
}

export default function ShopCheckoutPage() {
  return (
    <RequireSignIn next="/shop/checkout">
      <CheckoutContent />
    </RequireSignIn>
  );
}
