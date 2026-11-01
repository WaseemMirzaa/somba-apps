"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import { AreaPicker, type AreaSelection } from "@/components/geo/area-picker";
import { addressTextFromChain, chainText, type AreaHint } from "@/lib/areas";
import type { AddressGeo, PickedMeta, PickedParts } from "@/lib/google-maps";
import { addressCountryCode, addressLine } from "@/lib/countries";
import { UnpinnedWarning, pinRequiredText } from "@/components/shop/address-pin-editor";
import { addressPin } from "@/lib/logistics";
import type { Address } from "@/lib/realtime/types";

type AddressForm = { label: string; line1: string; country: string; geo: AddressGeo | null };
const EMPTY_FORM: AddressForm = { label: "", line1: "", country: "", geo: null };

export default function ShopAddressesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { addresses, addAddress, updateAddress, removeAddress } = useRealtime();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  /** What the last map pick gave (Google's components + the pin): the area pickers fill in from it. */
  const [hint, setHint] = useState<AreaHint | null>(null);
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [editChain, setEditChain] = useState<Address["areaChain"]>(null);

  function resetForm() {
    setForm(EMPTY_FORM);
    setHint(null);
    setArea(null);
    setEditChain(null);
    setShowAdd(false);
    setEditingId(null);
  }

  /** A map pick pre-fills the street and the area pickers (the customer can still edit them) and keeps the pin. */
  function applyPick(geo: AddressGeo, parts: PickedParts, meta: PickedMeta) {
    setForm((f) => ({ ...f, geo, line1: parts.line1 ?? f.line1, country: parts.country ?? f.country }));
    setHint({
      components: meta.components,
      pin: { lat: geo.lat, lng: geo.lng },
      text: { commune: parts.commune, city: parts.city, province: parts.region },
    });
  }

  async function saveAddress() {
    if (!form.line1.trim()) {
      toast(fr ? "Remplissez les champs obligatoires" : "Fill in required fields", "error");
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
    try {
      // The country comes from a map pick only. It is never defaulted: an address without one simply has none.
      const country = form.country.trim();
      const text = addressTextFromChain(area.chain, fr);
      const body = { label: form.label, line1: form.line1, geo: form.geo, areaId: area.areaId, ...text };
      if (editingId !== null) {
        await updateAddress(editingId, { ...body, country: country || null });
        toast(fr ? "Adresse mise à jour" : "Address updated");
      } else {
        await addAddress({ ...body, country: country || undefined, label: form.label || (fr ? "Nouvelle" : "New") });
        toast(fr ? "Adresse ajoutée" : "Address added");
      }
      resetForm();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={fr ? "Adresses" : "Addresses"}
        subtitle={fr ? "Les adresses où nous livrons vos commandes" : "The addresses we deliver your orders to"}
        backHref="/shop/account"
        breadcrumbs={[{ label: fr ? "Mon compte" : "Account", href: "/shop/account" }, { label: fr ? "Adresses" : "Addresses" }]}
        actions={<Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>{fr ? "Ajouter une adresse" : "Add Address"}</Button>}
      />

      {addresses.length === 0 && !showAdd && (
        <div className="card-premium p-6 text-center text-sm text-slate-500">
          {fr ? "Aucune adresse enregistrée." : "No saved addresses yet."}
        </div>
      )}

      {(showAdd || editingId !== null) && (
        <div className="card-premium space-y-3 p-6">
          <AddressMapPicker key={editingId ?? "new"} value={form.geo} onPick={applyPick} fr={fr} />
          <AreaPicker key={`area-${editingId ?? "new"}`} fr={fr} hint={hint} initialChain={editChain} onChange={setArea} />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Libellé (Domicile, Bureau...)" : "Label (Home, Office...)"} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Adresse (rue, numéro)" : "Street address"} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} required />
          {!form.geo && <p role="note" className="text-xs text-amber-800">{pinRequiredText(fr)}</p>}
          <div className="flex gap-2">
            <Button onClick={saveAddress} disabled={!form.geo}>{editingId !== null ? (fr ? "Mettre à jour l'adresse" : "Update Address") : (fr ? "Enregistrer l'adresse" : "Save Address")}</Button>
            <Button variant="ghost" onClick={resetForm}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {addresses.map((addr) => (
          <div key={addr.id} className="card-premium p-5">
            <div className="flex justify-between">
              <p className="font-semibold">{addr.label} {addr.isDefault && <span className="text-xs text-[var(--primary)]">{fr ? "(Par défaut)" : "(Default)"}</span>}</p>
              <div className="flex gap-3">
                {!addr.isDefault && (
                  <button onClick={async () => { await updateAddress(addr.id, { isDefault: true }); toast(fr ? "Adresse par défaut mise à jour" : "Default address updated"); }} className="text-xs text-slate-500 hover:text-[var(--primary)]">{fr ? "Définir par défaut" : "Set default"}</button>
                )}
                <button
                  onClick={() => {
                    setEditingId(addr.id);
                    setForm({ label: addr.label, line1: addr.line1, country: addressCountryCode(addr) ?? "", geo: addr.geo ?? null });
                    setEditChain(addr.areaChain ?? null);
                    setHint(null);
                    setShowAdd(false);
                  }}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  {fr ? "Modifier" : "Edit"}
                </button>
                <button onClick={async () => { await removeAddress(addr.id); toast(fr ? "Adresse supprimée" : "Address removed"); }} className="text-xs text-red-500 hover:underline">{fr ? "Supprimer" : "Delete"}</button>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">{addressLine(addr, fr)}</p>
            {addr.areaChain && addr.areaChain.length > 0 && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500" data-testid="address-area">
                <MapPin className="h-3.5 w-3.5" />
                {chainText(addr.areaChain, fr, { skipLevels: ["district"] })}
                {addr.served === false ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-100">{fr ? "Pas encore desservie" : "Not served yet"}</span>
                ) : addr.served === true ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100">{fr ? "Desservie" : "Served"}</span>
                ) : null}
              </p>
            )}
            {addressPin(addr) ? (
              <p className="mt-1 text-xs text-emerald-700">📍 {fr ? "Position épinglée sur la carte" : "Pinned on the map"}</p>
            ) : (
              <UnpinnedWarning
                fr={fr}
                onPin={() => {
                  setEditingId(addr.id);
                  setForm({ label: addr.label, line1: addr.line1, country: addressCountryCode(addr) ?? "", geo: null });
                  setEditChain(addr.areaChain ?? null);
                  setHint(null);
                  setShowAdd(false);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
