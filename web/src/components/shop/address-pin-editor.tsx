"use client";

import { useState } from "react";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressMapPicker } from "@/components/shop/address-map-picker";
import { AreaPicker, type AreaSelection } from "@/components/geo/area-picker";
import { addressTextFromChain, type AreaHint } from "@/lib/areas";
import { socketClient } from "@/lib/realtime/socket-client";
import { useToast } from "@/context/toast-context";
import type { AddressGeo, PickedMeta, PickedParts } from "@/lib/google-maps";
import type { Address } from "@/lib/realtime/types";

/** The sentence every client shows for an address without a map pin (the server refuses it too). */
export function pinRequiredText(fr: boolean): string {
  return fr ? "Placez votre adresse de livraison sur la carte." : "Pin your delivery address on the map.";
}

/**
 * Adds a map pin to a saved address (legacy addresses have none): pick on the map, then save.
 * The pin and the area decide the warehouse and the delivery fee, so checkout needs both.
 */
export function AddressPinEditor({
  address,
  fr,
  onSaved,
  onCancel,
}: {
  address: Address;
  fr: boolean;
  onSaved?: (a: Address) => void;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [geo, setGeo] = useState<AddressGeo | null>(null);
  const [hint, setHint] = useState<AreaHint | null>(null);
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [saving, setSaving] = useState(false);

  function onPick(g: AddressGeo, parts: PickedParts, meta: PickedMeta) {
    setGeo(g);
    setHint({ components: meta.components, pin: { lat: g.lat, lng: g.lng }, text: { commune: parts.commune, city: parts.city, province: parts.region } });
  }

  async function save() {
    if (!geo) {
      toast(pinRequiredText(fr), "error");
      return;
    }
    if (!area?.areaId || (area.served && !area.complete)) {
      toast(fr ? "Choisissez la province, la ville et la commune." : "Choose the province, city and commune.", "error");
      return;
    }
    setSaving(true);
    try {
      const patch = { geo, areaId: area.areaId, ...addressTextFromChain(area.chain, fr) };
      const updated = await socketClient.request<Address>("addresses:update", { id: address.id, patch });
      toast(fr ? "Adresse épinglée" : "Address pinned");
      onSaved?.(updated);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-blue-200 bg-white p-4" data-testid="address-pin-editor">
      <p className="text-sm font-medium text-slate-800">
        {fr ? "Épingler" : "Pin"} « {address.label} » — {[address.line1, address.city].filter(Boolean).join(", ")}
      </p>
      <AddressMapPicker value={geo} onPick={onPick} fr={fr} />
      <AreaPicker fr={fr} hint={hint} initialChain={address.areaChain ?? null} onChange={setArea} />
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !geo}>{saving ? "…" : fr ? "Enregistrer l'épingle" : "Save pin"}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{fr ? "Annuler" : "Cancel"}</Button>}
      </div>
    </div>
  );
}

/** "Not pinned" chip + warning for an address row. */
export function UnpinnedWarning({ fr, onPin }: { fr: boolean; onPin?: () => void }) {
  return (
    <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <MapPinOff className="h-4 w-4 shrink-0" />
      <span>{pinRequiredText(fr)}</span>
      {onPin && (
        <button type="button" onClick={onPin} className="font-semibold underline">
          {fr ? "Ajouter une épingle" : "Add a pin"}
        </button>
      )}
    </div>
  );
}
