"use client";

import { useEffect, useState } from "react";
import { MapPin, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import { AreaPicker, type AreaSelection } from "@/components/geo/area-picker";
import { PickupAreaBanner } from "@/components/seller/pickup-area-banner";
import { chainText, type AreaHint } from "@/lib/areas";
import type { PickedMeta, PickedParts, AddressGeo } from "@/lib/google-maps";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";

const parseCoord = (v: string, min: number, max: number): number | null => {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * The store's name, pickup address and the pickup MAP PIN (`sellers:update`). The pin is required: the nearest
 * warehouse (the origin of every pickup) is computed from it, and a store without a pin cannot list products.
 */
export function StoreProfileForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore } = useSellerData();
  const access = useSellerAccess();
  const [hint, setHint] = useState<AreaHint | null>(null);
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seller) return;
    /* eslint-disable react-hooks/set-state-in-effect -- fill the form from the loaded store */
    setName(seller.name);
    setPickup(seller.pickupAddress ?? "");
    setLat(seller.pickupLat != null ? String(seller.pickupLat) : "");
    setLng(seller.pickupLng != null ? String(seller.pickupLng) : "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [seller]);

  const canEdit = access.can("storefront") && !access.suspended;
  const latN = parseCoord(lat, -90, 90);
  const lngN = parseCoord(lng, -180, 180);
  const pinOk = latN !== null && lngN !== null;
  const pinTouched = lat.trim() !== "" || lng.trim() !== "";
  const nameOk = name.trim().length >= 2 && name.trim().length <= 100;
  const pickupOk = pickup.trim() === "" || (pickup.trim().length >= 5 && pickup.trim().length <= 300);
  const pinChanged = !!seller && (latN !== (seller.pickupLat ?? null) || lngN !== (seller.pickupLng ?? null));
  // Area routing: the pickup area (not the distance) decides the origin warehouse. The area picker previews it.
  const savedAreaId = seller?.pickupAreaId ?? null;
  const areaChanged = !!seller && !!area && (area.areaId ?? null) !== savedAreaId && !(area.areaId === null && savedAreaId === null);
  const areaOk = !pinChanged && !areaChanged ? true : !!area?.areaId && (!area.served || area.complete);
  const dirty = !!seller && (name.trim() !== seller.name || pickup.trim() !== (seller.pickupAddress ?? "") || pinChanged || areaChanged);
  const savedPin = seller?.pickupLat != null && seller?.pickupLng != null;

  async function save() {
    if (!nameOk || !pickupOk || !pinOk || !areaOk || busy || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await updateStore({
        name: name.trim(),
        pickupAddress: pickup.trim() === "" ? null : pickup.trim(),
        ...(pinChanged ? { pickupLat: latN, pickupLng: lngN } : {}),
        ...(areaChanged || pinChanged ? { pickupAreaId: area?.areaId ?? null } : {}),
      });
      toast(fr ? "Boutique enregistrée" : "Store saved");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "input-premium w-full px-4 py-2 text-sm";
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Nom de la boutique" : "Store name"}</label>
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={!canEdit} />
        {!nameOk && <p className="mt-1 text-xs text-red-600">{fr ? "2 à 100 caractères." : "2 to 100 characters."}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Adresse de collecte" : "Pickup address"}</label>
        <textarea className={fieldClass} rows={2} value={pickup} onChange={(e) => setPickup(e.target.value)} maxLength={300} disabled={!canEdit} placeholder={fr ? "Où les livreurs récupèrent vos colis (rue, quartier, commune, ville)" : "Where riders collect your parcels (street, area, commune, city)"} />
        {!pickupOk && <p className="mt-1 text-xs text-red-600">{fr ? "5 à 300 caractères, ou laissez vide." : "5 to 300 characters, or leave empty."}</p>}
        {!pickup.trim() && <p className="mt-1 text-xs text-amber-700">{fr ? "Sans adresse de collecte, les livreurs ne savent pas où passer." : "Without a pickup address riders do not know where to collect."}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {fr ? "Position du lieu de collecte sur la carte" : "Pickup location on the map"} <span className="text-red-600">*</span>
            </p>
            <p className="text-xs text-slate-500">
              {fr
                ? "Obligatoire. L'entrepôt qui couvre la zone de ce point collecte vos colis : sans position, vous ne pouvez pas publier de produits."
                : "Required. The warehouse covering this point's area collects your parcels: without a pin you cannot list products."}
            </p>
          </div>
        </div>
        {!savedPin && (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {fr ? "Placez votre lieu de collecte sur la carte avant de publier des produits." : "Pin your pickup location on the map before listing products."}
          </p>
        )}
        {canEdit && (
          <AddressMapPicker
            fr={fr}
            value={pinOk ? { lat: latN as number, lng: lngN as number } : null}
            onPick={(geo: AddressGeo, parts: PickedParts, meta: PickedMeta) => {
              setLat(geo.lat.toFixed(6));
              setLng(geo.lng.toFixed(6));
              if (!pickup.trim() && geo.formatted) setPickup(geo.formatted.slice(0, 300));
              setHint({ components: meta.components, pin: { lat: geo.lat, lng: geo.lng }, text: { commune: parts.commune, city: parts.city, province: parts.region } });
            }}
          />
        )}
        {seller && <AreaPicker key={seller.id} fr={fr} hint={hint} initialChain={seller.pickupAreaChain ?? null} onChange={setArea} disabled={!canEdit} purpose="pickup" testId="pickup-area-picker" />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Latitude" : "Latitude"}</label>
            <input className={fieldClass} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-4.3105" disabled={!canEdit} aria-label={fr ? "Latitude" : "Latitude"} />
            {pinTouched && latN === null && <p className="mt-1 text-xs text-red-600">{fr ? "Latitude de -90 à 90." : "Latitude from -90 to 90."}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Longitude" : "Longitude"}</label>
            <input className={fieldClass} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="15.3136" disabled={!canEdit} aria-label={fr ? "Longitude" : "Longitude"} />
            {pinTouched && lngN === null && <p className="mt-1 text-xs text-red-600">{fr ? "Longitude de -180 à 180." : "Longitude from -180 to 180."}</p>}
          </div>
        </div>
        {seller?.originHubId && seller.pickupServed !== false && !areaChanged && !pinChanged && (
          <p className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900" data-testid="origin-hub">
            <Warehouse className="h-4 w-4 shrink-0" />
            <span>
              {fr ? "Votre entrepôt de collecte : " : "Your pickup warehouse: "}
              <strong>{seller.originHubName ?? "—"}</strong>
              {seller.pickupAreaChain?.length ? ` · ${chainText(seller.pickupAreaChain, fr, { skipLevels: ["district"] })}` : ""}
            </span>
          </p>
        )}
        {savedPin && !seller?.originHubId && seller?.pickupServed !== false && (
          <p className="text-xs text-amber-700">
            {fr ? "Aucun entrepôt actif avec des livreurs ne couvre encore votre zone." : "No active warehouse with riders covers your area yet."}
          </p>
        )}
      </div>

      <PickupAreaBanner />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!pinOk && <p className="text-xs text-red-600">{fr ? "La position sur la carte est obligatoire pour enregistrer." : "The map position is required to save."}</p>}
      {pinOk && !areaOk && <p className="text-xs text-red-600">{fr ? "Choisissez la province, la ville et la commune de collecte." : "Choose the pickup province, city and commune."}</p>}
      {canEdit && (
        <Button onClick={() => void save()} disabled={!seller || !nameOk || !pickupOk || !pinOk || !areaOk || !dirty || busy}>
          {busy ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer" : "Save"}
        </Button>
      )}
    </div>
  );
}
