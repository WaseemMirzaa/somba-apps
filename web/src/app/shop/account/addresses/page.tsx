"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

type Address = { id: number; label: string; line1: string; city: string; commune: string; country: string; default: boolean };

const initialAddresses: Address[] = [
  { id: 1, label: "Domicile", line1: "8 Rue de la Paix, Apt 4B", city: "Paris", commune: "2e arrondissement", country: "France", default: true },
  { id: 2, label: "Bureau", line1: "45 Avenue des Champs-Élysées", city: "Paris", commune: "8e arrondissement", country: "France", default: false },
];

export default function ShopAddressesPage() {
  const { toast } = useToast();
  const { t } = useLocale();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ label: "", line1: "", city: "", commune: "", country: "France" });

  function resetForm() {
    setForm({ label: "", line1: "", city: "", commune: "", country: "France" });
    setShowAdd(false);
    setEditingId(null);
  }

  function saveAddress() {
    if (!form.line1.trim() || !form.city.trim()) { toast(t("fillRequiredFields"), "error"); return; }
    if (editingId !== null) {
      setAddresses((a) => a.map((addr) => addr.id === editingId ? { ...addr, ...form } : addr));
      toast(t("addressUpdated"));
    } else {
      setAddresses((a) => [...a, { id: Date.now(), ...form, label: form.label || t("newLabel"), default: false }]);
      toast(t("addressAdded"));
    }
    resetForm();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t("addresses")}
        subtitle={t("globalAddresses")}
        backHref="/shop/account"
        breadcrumbs={[{ label: t("account"), href: "/shop/account" }, { label: t("addresses") }]}
        actions={<Link href="/shop/account/addresses/new"><Button size="sm">{t("addAddress")}</Button></Link>}
      />

      {(showAdd || editingId !== null) && (
        <div className="card-premium space-y-3 p-6">
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("addressLabelPlaceholder")} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("streetAddressPlaceholder")} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} required />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("cityPlaceholder")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
          <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("communePlaceholder")} value={form.commune} onChange={(e) => setForm({ ...form, commune: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={saveAddress}>{editingId !== null ? t("updateAddress") : t("saveAddress")}</Button>
            <Button variant="ghost" onClick={resetForm}>{t("cancel")}</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {addresses.map((addr) => (
          <div key={addr.id} className="card-premium p-5">
            <div className="flex justify-between">
              <p className="font-semibold">{addr.label} {addr.default && <span className="text-xs text-blue-600">({t("defaultLabel")})</span>}</p>
              <div className="flex gap-3">
                {!addr.default && (
                  <button onClick={() => { setAddresses((a) => a.map((item) => ({ ...item, default: item.id === addr.id }))); toast(t("defaultAddressUpdated")); }} className="text-xs text-slate-500 hover:text-blue-600">{t("setDefault")}</button>
                )}
                <button
                  onClick={() => {
                    setEditingId(addr.id);
                    setForm({ label: addr.label, line1: addr.line1, city: addr.city, commune: addr.commune, country: addr.country });
                    setShowAdd(false);
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {t("edit")}
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">{addr.line1}, {addr.commune}, {addr.city}, {addr.country}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
