"use client";

import { useState } from "react";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import type { Area } from "@/lib/areas";

export interface AreaForm {
  name: string;
  nameEn: string;
  googleName: string;
  googleNameEn: string;
  /** One alias per line (commas also separate). */
  aliases: string;
  lat: string;
  lng: string;
}

export type AreaFormErrors = Partial<Record<keyof AreaForm, string>>;

export const EMPTY_AREA_FORM: AreaForm = { name: "", nameEn: "", googleName: "", googleNameEn: "", aliases: "", lat: "", lng: "" };

export const formFromArea = (a: Area): AreaForm => ({
  name: a.name,
  nameEn: a.nameEn ?? "",
  googleName: a.googleName ?? "",
  googleNameEn: a.googleNameEn ?? "",
  aliases: (a.aliases ?? []).join("\n"),
  lat: a.lat != null ? String(a.lat) : "",
  lng: a.lng != null ? String(a.lng) : "",
});

export const parseAliases = (text: string): string[] => [...new Set(text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];

/** Mirrors the server's checks (the server stays the authority and its message is shown too). */
export function validateAreaForm(f: AreaForm, fr: boolean): AreaFormErrors {
  const e: AreaFormErrors = {};
  const len = (v: string, min: number, max: number) => v.trim().length >= min && v.trim().length <= max;
  if (!len(f.name, 2, 150)) e.name = fr ? "Nom officiel : 2 à 150 caractères." : "Official name: 2 to 150 characters.";
  if (f.nameEn.trim() && !len(f.nameEn, 2, 150)) e.nameEn = fr ? "Nom anglais : 2 à 150 caractères, ou laissez vide." : "English name: 2 to 150 characters, or leave empty.";
  if (f.googleName.trim() && !len(f.googleName, 1, 150)) e.googleName = fr ? "Nom Google : 150 caractères maximum." : "Google name: 150 characters at most.";
  if (f.googleNameEn.trim() && !len(f.googleNameEn, 1, 150)) e.googleNameEn = fr ? "Nom Google (EN) : 150 caractères maximum." : "Google name (EN): 150 characters at most.";
  const aliases = parseAliases(f.aliases);
  if (aliases.length > 30 || aliases.some((a) => a.length > 100)) e.aliases = fr ? "30 alias au maximum, 100 caractères chacun." : "At most 30 aliases, 100 characters each.";
  const hasLat = f.lat.trim() !== "";
  const hasLng = f.lng.trim() !== "";
  if (hasLat !== hasLng) {
    e.lat = fr ? "Renseignez la latitude et la longitude, ou aucune." : "Give both latitude and longitude, or neither.";
  } else if (hasLat) {
    const lat = Number(f.lat.replace(",", "."));
    const lng = Number(f.lng.replace(",", "."));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = fr ? "Latitude : -90 à 90." : "Latitude: -90 to 90.";
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = fr ? "Longitude : -180 à 180." : "Longitude: -180 to 180.";
  }
  return e;
}

/** The payload fields shared by `geo:create` and `geo:update`. Empty optional fields are sent as null so they clear. */
export function areaPayload(f: AreaForm, mode: "create" | "update"): Record<string, unknown> {
  const hasPin = f.lat.trim() !== "" && f.lng.trim() !== "";
  const opt = (v: string) => (v.trim() === "" ? (mode === "update" ? null : undefined) : v.trim());
  return {
    name: f.name.trim(),
    nameEn: opt(f.nameEn),
    ...(f.googleName.trim() ? { googleName: f.googleName.trim() } : {}),
    ...(f.googleNameEn.trim() ? { googleNameEn: f.googleNameEn.trim() } : {}),
    aliases: parseAliases(f.aliases),
    ...(hasPin
      ? { lat: Number(f.lat.replace(",", ".")), lng: Number(f.lng.replace(",", ".")) }
      : mode === "update"
        ? { lat: null, lng: null }
        : {}),
  };
}

/** Names (French + English), Google spellings, aliases and the pin: the fields of one area, shared by the edit and add forms. */
export function AreaFields({ form, setForm, errors, fr, disabled }: { form: AreaForm; setForm: (f: AreaForm) => void; errors: AreaFormErrors; fr: boolean; disabled?: boolean }) {
  const [showMap, setShowMap] = useState(false);
  const lat = Number(form.lat.replace(",", "."));
  const lng = Number(form.lng.replace(",", "."));
  const pin = form.lat.trim() && form.lng.trim() && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  const input = (key: keyof AreaForm, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <input
        className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={!!errors[key]}
        disabled={disabled}
        data-testid={`area-field-${key}`}
        {...props}
      />
      {hint && <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{hint}</span>}
      {errors[key] && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{errors[key]}</span>}
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {input("name", fr ? "Nom officiel (français)" : "Official name (French)", undefined, { maxLength: 150 })}
        {input("nameEn", fr ? "Nom anglais" : "English name", fr ? "Laissez vide s'il est identique." : "Leave empty when it is the same.", { maxLength: 150 })}
        {input("googleName", fr ? "Nom Google (langue fr)" : "Google name (language fr)", fr ? "Orthographe exacte renvoyée par Google en français." : "The exact spelling Google returns in French.", { maxLength: 150 })}
        {input("googleNameEn", fr ? "Nom Google (langue en)" : "Google name (language en)", fr ? "Orthographe exacte renvoyée par Google en anglais." : "The exact spelling Google returns in English.", { maxLength: 150 })}
      </div>
      <label className="block text-xs font-medium text-slate-500">
        {fr ? "Alias (un par ligne)" : "Aliases (one per line)"}
        <textarea
          className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900"
          rows={3}
          value={form.aliases}
          onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          disabled={disabled}
          data-testid="area-field-aliases"
        />
        <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
          {fr ? "Autres orthographes tapées par les gens. La recherche ignore les accents, la casse, les tirets et les apostrophes." : "Other spellings people type. Matching ignores accents, case, hyphens and apostrophes."}
        </span>
        {errors.aliases && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{errors.aliases}</span>}
      </label>
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Position (épingle)" : "Pin"}</p>
          {!disabled && (
            <button type="button" onClick={() => setShowMap((v) => !v)} className="text-xs font-medium text-[var(--primary)] hover:underline">
              {showMap ? (fr ? "Masquer la carte" : "Hide the map") : fr ? "Placer sur la carte" : "Place on the map"}
            </button>
          )}
        </div>
        {showMap && !disabled && (
          <AddressMapPicker
            fr={fr}
            value={pin}
            onPick={(geo) => setForm({ ...form, lat: geo.lat.toFixed(6), lng: geo.lng.toFixed(6) })}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {input("lat", fr ? "Latitude" : "Latitude", undefined, { inputMode: "decimal", placeholder: "-4.3105" })}
          {input("lng", fr ? "Longitude" : "Longitude", undefined, { inputMode: "decimal", placeholder: "15.3136" })}
        </div>
      </div>
    </div>
  );
}
