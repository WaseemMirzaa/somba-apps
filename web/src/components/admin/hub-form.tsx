"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";

type Form = { name: string; city: string; country: string; address: string; capacity: string };
type Errors = Partial<Record<keyof Form, string>>;

const EMPTY: Form = { name: "", city: "", country: "", address: "", capacity: "500" };

/** Client-side checks that mirror warehouse.service.ts saveHub (the server stays the authority). */
export function validateHub(f: Form, fr: boolean): Errors {
  const e: Errors = {};
  const name = f.name.trim();
  const city = f.city.trim();
  const address = f.address.trim();
  if (name.length < 2 || name.length > 100) e.name = fr ? "Nom : 2 à 100 caractères." : "Name: 2 to 100 characters.";
  if (city.length < 2 || city.length > 100) e.city = fr ? "Ville : 2 à 100 caractères." : "City: 2 to 100 characters.";
  if (f.country.trim().length > 100) e.country = fr ? "Pays : 100 caractères maximum." : "Country: 100 characters at most.";
  if (address && (address.length < 3 || address.length > 200)) e.address = fr ? "Adresse : 3 à 200 caractères." : "Address: 3 to 200 characters.";
  const cap = Number(f.capacity);
  if (!f.capacity.trim() || !Number.isInteger(cap) || cap < 1 || cap > 1_000_000) {
    e.capacity = fr ? "Capacité : entier de 1 à 1 000 000." : "Capacity: a whole number from 1 to 1,000,000.";
  }
  return e;
}

/** Create (no `hub`) or edit a hub through warehouse:saveHub; server errors are shown in the form. */
export function HubFormModal({
  open,
  hub,
  onClose,
  onSaved,
}: {
  open: boolean;
  hub: HubRow | null;
  onClose: () => void;
  onSaved: (hub: HubRow) => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      hub
        ? { name: hub.name, city: hub.city, country: hub.country ?? "", address: hub.address ?? "", capacity: String(hub.capacity) }
        : EMPTY,
    );
    setErrors({});
    setServerError(null);
  }, [open, hub]);

  async function submit() {
    const v = validateHub(form, fr);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      const saved = await socketClient.request<HubRow>("warehouse:saveHub", {
        ...(hub ? { id: hub.id } : {}),
        name: form.name.trim(),
        city: form.city.trim(),
        country: form.country.trim() || null,
        address: form.address.trim() || null,
        capacity: Number(form.capacity),
      });
      toast(hub ? (fr ? "Hub mis à jour" : "Hub updated") : fr ? "Hub créé" : "Hub created", "success");
      onSaved(saved);
      onClose();
    } catch (e) {
      setServerError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <input
        className="input-premium mt-1 w-full px-4 py-2 text-sm"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={!!errors[key]}
        {...props}
      />
      {errors[key] && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{errors[key]}</span>}
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={hub ? (fr ? "Modifier le hub" : "Edit hub") : fr ? "Nouveau hub" : "New hub"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>{fr ? "Annuler" : "Cancel"}</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "…" : fr ? "Enregistrer" : "Save"}</Button>
        </>
      }
    >
      {field("name", fr ? "Nom du hub" : "Hub name", { maxLength: 100, autoFocus: true })}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("city", fr ? "Ville" : "City", { maxLength: 100 })}
        {field("country", fr ? "Pays (optionnel)" : "Country (optional)", { maxLength: 100 })}
      </div>
      {field("address", fr ? "Adresse (optionnel)" : "Address (optional)", { maxLength: 200 })}
      {field("capacity", fr ? "Capacité (colis)" : "Capacity (parcels)", { inputMode: "numeric" })}
      <ErrorNote message={serverError} />
    </Modal>
  );
}
