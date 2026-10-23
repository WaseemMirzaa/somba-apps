"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { dayLabel, estimateFor } from "@/lib/delivery-estimate";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import type { AddressGeo, PickedParts } from "@/lib/google-maps";
import { usePublicSettings, useVerificationStatus, zoneLabel } from "@/lib/shop-live";
import type { Address } from "@/lib/realtime/types";

function CheckoutContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const router = useRouter();
  const { promoDiscount, promoCode, zoneId, setZoneId } = useShop();
  const { lines, subtotal, hasUnavailable, savings } = useCartLines();
  const verification = useVerificationStatus();
  const settings = usePublicSettings();
  const zones = settings.deliveryZones;

  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const [openBox, setOpenBox] = useState(true);
  const [orderNote, setOrderNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ label: string; line1: string; commune: string; city: string; phone: string; zoneId: string; geo: AddressGeo | null }>({ label: "", line1: "", commune: "", city: "", phone: rt.user?.phone ?? "", zoneId: "", geo: null });

  const addresses = rt.addresses;
  // Selected address: the customer's pick, else the default, else the first one.
  const selectedId = useMemo(() => {
    if (pickedAddress && addresses.some((a) => a.id === pickedAddress)) return pickedAddress;
    return (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? null;
  }, [pickedAddress, addresses]);
  const address = addresses.find((a) => a.id === selectedId) ?? null;

  // Following the chosen address, default the zone to the address's zone.
  useEffect(() => {
    if (!address?.zoneId) return;
    if (zones.some((z) => z.id === address.zoneId) && zoneId !== address.zoneId) setZoneId(address.zoneId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address?.id, address?.zoneId, zones]);

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const zoneMissing = zones.length > 0 && !zone;
  const deliveryFee = zone?.feeUsd ?? 0;
  const discount = Math.min(promoDiscount, subtotal);
  const total = Math.round((Math.max(0, subtotal - discount) + deliveryFee) * 100) / 100;

  /** A map pick pre-fills the typed fields (still editable) and keeps the pin for the order. */
  function applyPick(geo: AddressGeo, parts: PickedParts) {
    setForm((f) => ({
      ...f,
      geo,
      line1: parts.line1 ?? f.line1,
      city: parts.city ?? f.city,
      commune: parts.commune ?? f.commune,
    }));
  }

  async function saveAddress() {
    if (!form.line1.trim() || !form.city.trim()) {
      toast(fr ? "Adresse et ville obligatoires" : "Street address and city are required", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await socketClient.request<Address>("addresses:create", {
        label: form.label.trim() || (fr ? "Domicile" : "Home"),
        line1: form.line1.trim(),
        city: form.city.trim(),
        commune: form.commune.trim() || undefined,
        phone: form.phone.trim() || undefined,
        zoneId: form.zoneId || undefined,
        ...(form.geo ? { geo: form.geo } : {}),
      });
      setPickedAddress(created.id);
      if (created.zoneId && zones.some((z) => z.id === created.zoneId)) setZoneId(created.zoneId);
      setShowAdd(false);
      setForm({ label: "", line1: "", commune: "", city: "", phone: rt.user?.phone ?? "", zoneId: "", geo: null });
      toast(fr ? "Adresse ajoutée" : "Address added");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const canContinue = lines.length > 0 && !hasUnavailable && !!address && !zoneMissing && !verification.blocked;

  function continueToPayment() {
    if (!address) {
      toast(fr ? "Choisissez ou ajoutez une adresse de livraison" : "Choose or add a delivery address", "error");
      return;
    }
    if (zoneMissing) {
      toast(fr ? "Choisissez une zone de livraison" : "Choose a delivery zone", "error");
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
                {a.phone && <p className="text-xs text-slate-400">{a.phone}</p>}
              </div>
            </label>
          ))}

          {showAdd ? (
            <div className="space-y-3 rounded-xl border border-dashed border-blue-200 p-4">
              <AddressMapPicker value={form.geo} onPick={applyPick} fr={fr} />
              <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Libellé (Domicile, Bureau...)" : "Label (Home, Office...)"} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Adresse (rue, numéro)" : "Street address"} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Commune / Quartier" : "Commune / District"} value={form.commune} onChange={(e) => setForm({ ...form, commune: e.target.value })} />
                <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Ville" : "City"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Téléphone de contact" : "Contact phone"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {zones.length > 0 && (
                <select className="input-premium w-full px-4 py-2 text-sm" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                  <option value="">{fr ? "Zone de livraison" : "Delivery zone"}</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{zoneLabel(z, fr)} — {z.city}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <Button onClick={saveAddress} disabled={saving}>{saving ? "…" : fr ? "Enregistrer l'adresse" : "Save address"}</Button>
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
        {zones.length > 0 && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Zone de livraison" : "Delivery zone"}</label>
            <select className="input-premium w-full px-3 py-2 text-sm" value={zoneId ?? ""} onChange={(e) => setZoneId(e.target.value || null)}>
              <option value="">{fr ? "Choisir une zone" : "Choose a zone"}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {zoneLabel(z, fr)} — {z.city} ({z.feeUsd === 0 ? (fr ? "gratuit" : "free") : `$${z.feeUsd.toFixed(2)}`})
                </option>
              ))}
            </select>
          </div>
        )}
        {/* The sellers set each product's delivery time; the shopper only sees the resulting estimate. */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border p-4 text-sm" data-testid="delivery-estimate">
          <span className="font-semibold">{fr ? "Livraison estimée :" : "Estimated delivery:"}</span>
          <span>{dayLabel(estimateFor(lines.map((l) => l.deliveryDays)), fr)}</span>
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
          { label: fr ? "Frais de zone" : "Zone delivery fee", value: zoneMissing ? (fr ? "Choisissez une zone" : "Choose a zone") : deliveryFee === 0 ? (fr ? "GRATUIT" : "FREE") : <DualCurrency amount={deliveryFee} /> },
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
