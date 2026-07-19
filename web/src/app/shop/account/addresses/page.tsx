"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";

export default function ShopAddressesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { addresses, addAddress, updateAddress, removeAddress } = useRealtime();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", line1: "", city: "", commune: "", country: "France" });

  function resetForm() {
    setForm({ label: "", line1: "", city: "", commune: "", country: "France" });
    setShowAdd(false);
    setEditingId(null);
  }

  async function saveAddress() {
    if (!form.line1.trim() || !form.city.trim()) {
      toast(fr ? "Remplissez les champs obligatoires" : "Fill in required fields", "error");
      return;
    }
    try {
      if (editingId !== null) {
        await updateAddress(editingId, { ...form });
        toast(fr ? "Adresse mise à jour" : "Address updated");
      } else {
        await addAddress({ ...form, label: form.label || (fr ? "Nouvelle" : "New") });
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
        subtitle={fr ? "Adresses de livraison en France et à l'international" : "France & global delivery addresses"}
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
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Libellé (Domicile, Bureau...)" : "Label (Home, Office...)"} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Adresse" : "Street address"} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} required />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Ville" : "City"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Commune / Quartier" : "Commune / District"} value={form.commune} onChange={(e) => setForm({ ...form, commune: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={saveAddress}>{editingId !== null ? (fr ? "Mettre à jour l'adresse" : "Update Address") : (fr ? "Enregistrer l'adresse" : "Save Address")}</Button>
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
                    setForm({ label: addr.label, line1: addr.line1, city: addr.city, commune: addr.commune ?? "", country: addr.country ?? "France" });
                    setShowAdd(false);
                  }}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  {fr ? "Modifier" : "Edit"}
                </button>
                <button onClick={async () => { await removeAddress(addr.id); toast(fr ? "Adresse supprimée" : "Address removed"); }} className="text-xs text-red-500 hover:underline">{fr ? "Supprimer" : "Delete"}</button>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">{addr.line1}, {addr.commune}, {addr.city}, {addr.country}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
