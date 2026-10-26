"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import { AreaPicker, type AreaSelection } from "@/components/geo/area-picker";
import { chainAt, useAreaChain, type AreaHint } from "@/lib/areas";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";

type Form = { name: string; city: string; country: string; address: string; capacity: string; lat: string; lng: string };
type Errors = Partial<Record<keyof Form | "area", string>>;

const EMPTY: Form = { name: "", city: "", country: "", address: "", capacity: "500", lat: "", lng: "" };

/** Client-side checks that mirror the hubs service (the server stays the authority and its message is shown too). */
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
  const lat = Number(f.lat.replace(",", "."));
  const lng = Number(f.lng.replace(",", "."));
  if (!f.lat.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = fr ? "Latitude : -90 à 90." : "Latitude: -90 to 90.";
  if (!f.lng.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = fr ? "Longitude : -180 à 180." : "Longitude: -180 to 180.";
  return e;
}

/** Create (no `hub`) or edit a hub (`hubs:create` / `hubs:update`) with a map picker for its position; server errors show in the form. */
export function HubFormModal(props: {
  open: boolean;
  hub: HubRow | null;
  onClose: () => void;
  onSaved: (hub: HubRow) => void;
}) {
  // Mounted only while open so every opening starts from the hub's current values.
  return props.open ? <HubFormBody {...props} /> : null;
}

function HubFormBody({ open, hub, onClose, onSaved }: { open: boolean; hub: HubRow | null; onClose: () => void; onSaved: (hub: HubRow) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(
    hub
      ? {
          name: hub.name,
          city: hub.city,
          country: hub.country ?? "",
          address: hub.address ?? "",
          capacity: String(hub.capacity),
          lat: hub.lat != null ? String(hub.lat) : "",
          lng: hub.lng != null ? String(hub.lng) : "",
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Where the warehouse sits (province → city → commune). A pin on the map fills it in; the admin can correct it.
  const [hint, setHint] = useState<AreaHint | null>(null);
  const [area, setArea] = useState<AreaSelection | null>(null);
  const cityTouched = useRef(false);
  const initialChain = useAreaChain(hub?.area ?? null);
  const areaRequired = !hub || !!hub.areaId;

  const lat = Number(form.lat.replace(",", "."));
  const lng = Number(form.lng.replace(",", "."));
  const pin = form.lat.trim() && form.lng.trim() && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  /** The picked area names the city (and the country) unless the admin typed their own city. */
  function onAreaChange(sel: AreaSelection) {
    setArea(sel);
    if (sel.areaId) setErrors((e) => (e.area || e.city ? { ...e, area: undefined, city: cityTouched.current ? e.city : undefined } : e));
    const city = chainAt(sel.chain, "city") ?? chainAt(sel.chain, "province");
    if (city && !cityTouched.current) setForm((f) => (f.city === city.name && f.country ? f : { ...f, city: city.name, country: f.country || "CD" }));
  }

  async function submit() {
    const v: Errors = validateHub(form, fr);
    if (areaRequired && !area?.areaId) v.area = fr ? "Choisissez où se trouve cet entrepôt." : "Choose where this warehouse is.";
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        city: form.city.trim(),
        country: form.country.trim() || undefined,
        address: form.address.trim() || undefined,
        capacity: Number(form.capacity),
        lat,
        lng,
        ...(area?.areaId ? { areaId: area.areaId } : {}),
      };
      const saved = hub
        ? await socketClient.request<HubRow>("hubs:update", { id: hub.id, ...body })
        : await socketClient.request<HubRow>("hubs:create", body);
      toast(hub ? (fr ? "Hub mis à jour" : "Hub updated") : fr ? "Hub créé" : "Hub created", "success");
      onSaved({ ...(hub ?? {}), ...saved } as HubRow);
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
        onChange={(e) => {
          if (key === "city") cityTouched.current = true;
          setForm({ ...form, [key]: e.target.value });
        }}
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
      {initialChain !== undefined && (
        <AreaPicker key={hub?.id ?? "new"} fr={fr} hint={hint} initialChain={initialChain} allowUnserved purpose="warehouse" onChange={onAreaChange} testId="hub-area-picker" />
      )}
      {errors.area && <span className="block text-xs font-medium text-red-600" role="alert" data-testid="hub-area-error">{errors.area}</span>}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("city", fr ? "Ville" : "City", { maxLength: 100 })}
        {field("country", fr ? "Pays (optionnel)" : "Country (optional)", { maxLength: 100 })}
      </div>
      {field("address", fr ? "Adresse (optionnel)" : "Address (optional)", { maxLength: 200 })}
      {field("capacity", fr ? "Capacité (colis)" : "Capacity (parcels)", { inputMode: "numeric" })}

      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Position sur la carte" : "Position on the map"}</p>
        <p className="text-xs text-slate-500">
          {fr
            ? "Ce sont les zones couvertes qui décident quel entrepôt sert une commande ; l'épingle place l'entrepôt sur la carte et sert au calcul de la distance et des frais."
            : "The covered areas decide which warehouse serves an order; the pin places the warehouse on the map and drives the distance and the delivery fee."}
        </p>
        <AddressMapPicker
          key={hub?.id ?? "new"}
          fr={fr}
          value={pin}
          onPick={(geo, parts, meta) => {
            setForm((f) => ({
              ...f,
              lat: geo.lat.toFixed(6),
              lng: geo.lng.toFixed(6),
              city: f.city.trim() ? f.city : (parts.city ?? f.city),
              address: f.address.trim() ? f.address : (geo.formatted ?? f.address),
            }));
            setHint({ components: meta.components, pin: { lat: geo.lat, lng: geo.lng }, text: { commune: parts.commune, city: parts.city, province: parts.region } });
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {field("lat", fr ? "Latitude" : "Latitude", { inputMode: "decimal", placeholder: "-4.3105" })}
          {field("lng", fr ? "Longitude" : "Longitude", { inputMode: "decimal", placeholder: "15.3136" })}
        </div>
      </div>
      <ErrorNote message={serverError} />
    </Modal>
  );
}
