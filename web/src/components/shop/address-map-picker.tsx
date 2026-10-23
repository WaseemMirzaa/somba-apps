"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import {
  DEFAULT_CENTER,
  MAPS_KEY,
  MAPS_MAP_ID,
  loadGoogleMaps,
  partsFromComponents,
  reverseGeocode,
  type AddressGeo,
  type PickedParts,
} from "@/lib/google-maps";

type Status = "nokey" | "loading" | "ready" | "error";
type LatLng = { lat: number; lng: number };

/** AdvancedMarker positions can be a LatLng object or a literal; normalise to a literal. */
function toLiteral(p: google.maps.LatLng | google.maps.LatLngLiteral | google.maps.LatLngAltitude | null | undefined): LatLng | null {
  if (!p) return null;
  const lat = typeof p.lat === "function" ? p.lat() : p.lat;
  const lng = typeof p.lng === "function" ? p.lng() : p.lng;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

/**
 * Google Maps address picker: search a place, click the map, drag the pin or use the current location.
 * Every pick reports `{lat,lng,placeId,formatted}` plus address parts to pre-fill the form.
 * If Maps is unavailable (no key / key rejected) it says so and the surrounding form keeps working by hand.
 */
export function AddressMapPicker({
  value,
  onPick,
  fr,
}: {
  value: AddressGeo | null;
  onPick: (geo: AddressGeo, parts: PickedParts) => void;
  fr: boolean;
}) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const searchDiv = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const startRef = useRef(value);
  const commitRef = useRef<((pos: LatLng) => void) | null>(null);
  const [status, setStatus] = useState<Status>(MAPS_KEY ? "loading" : "nokey");
  const [pinned, setPinned] = useState<AddressGeo | null>(value);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!MAPS_KEY) {
      console.info("[address-map] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set: map picking is disabled, manual entry still works.");
      return;
    }
    let cancelled = false;
    loadGoogleMaps()
      .then(async (maps) => {
        const { Map } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;
        const { AdvancedMarkerElement } = (await maps.importLibrary("marker")) as google.maps.MarkerLibrary;
        const { PlaceAutocompleteElement } = (await maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (cancelled || !mapDiv.current) return;

        const start = startRef.current;
        const map = new Map(mapDiv.current, {
          center: start ?? DEFAULT_CENTER,
          zoom: start ? 16 : 12,
          mapId: MAPS_MAP_ID,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const marker = new AdvancedMarkerElement({
          map: start ? map : null,
          position: start ? { lat: start.lat, lng: start.lng } : undefined,
          gmpDraggable: true,
          title: fr ? "Glissez pour ajuster" : "Drag to adjust",
        });

        const show = (pos: LatLng) => {
          marker.position = pos;
          marker.map = map;
          map.panTo(pos);
          if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
        };
        const report = (geo: AddressGeo, parts: PickedParts) => {
          setPinned(geo);
          onPickRef.current(geo, parts);
        };
        /** A pin from a click / drag / geolocation: reverse-geocode it into address parts. */
        const commit = async (pos: LatLng) => {
          show(pos);
          try {
            const r = await reverseGeocode(maps, pos);
            report({ ...pos, placeId: r.placeId, formatted: r.formatted }, r.parts);
          } catch (e) {
            console.warn("[address-map] reverse geocoding failed (is the Geocoding API enabled?)", e);
            report(pos, {});
          }
        };
        commitRef.current = (p) => void commit(p);

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          const p = toLiteral(e.latLng);
          if (p) void commit(p);
        });
        marker.addListener("dragend", () => {
          const p = toLiteral(marker.position);
          if (p) void commit(p);
        });

        // Place search (Places API New): picking a suggestion drops the pin and fills the address parts.
        const ac = new PlaceAutocompleteElement({});
        ac.style.width = "100%";
        const onPlace = async (place: google.maps.places.Place) => {
          await place.fetchFields({ fields: ["id", "formattedAddress", "location", "addressComponents"] });
          const loc = place.location?.toJSON();
          if (!loc) return;
          show(loc);
          report(
            { ...loc, placeId: place.id, formatted: place.formattedAddress ?? undefined },
            partsFromComponents((place.addressComponents ?? []).map((c) => ({ types: c.types, long: c.longText ?? "" }))),
          );
        };
        // `gmp-select` is the current event; `gmp-placeselect` is the older name some versions still emit.
        ac.addEventListener("gmp-select", (ev: Event) => {
          const pred = (ev as unknown as { placePrediction?: { toPlace(): google.maps.places.Place } }).placePrediction;
          if (pred) void onPlace(pred.toPlace());
        });
        ac.addEventListener("gmp-placeselect", (ev: Event) => {
          const place = (ev as unknown as { place?: google.maps.places.Place }).place;
          if (place) void onPlace(place);
        });
        searchDiv.current?.replaceChildren(ac);
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        console.error("[address-map] Google Maps unavailable:", e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // The map is created once per mount; the parent remounts it (via `key`) when it edits a different address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation || !commitRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        commitRef.current?.({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (status === "nokey" || status === "error") {
    return (
      <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="inline-flex items-center gap-2 font-medium">
          <MapPin className="h-4 w-4" />
          {fr ? "La sélection sur la carte est indisponible pour le moment." : "Picking a location on the map is unavailable right now."}
        </span>
        <p className="mt-1 text-xs">{fr ? "Saisissez votre adresse ci-dessous." : "Please type your address below."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">
          {fr ? "Repérez votre adresse sur la carte" : "Find your address on the map"}
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={status !== "ready" || locating}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          {locating ? (fr ? "Localisation…" : "Locating…") : fr ? "Ma position" : "Use my location"}
        </button>
      </div>
      <div ref={searchDiv} className="min-h-10" aria-label={fr ? "Rechercher une adresse" : "Search for an address"} />
      <div ref={mapDiv} className="h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" />
      <p className="text-xs text-slate-500">
        {pinned
          ? `${fr ? "Position épinglée" : "Pinned"}: ${pinned.formatted ?? `${pinned.lat.toFixed(5)}, ${pinned.lng.toFixed(5)}`}`
          : fr
            ? "Cherchez, touchez la carte ou faites glisser l'épingle : les champs ci-dessous se remplissent."
            : "Search, tap the map or drag the pin — the fields below fill in for you."}
      </p>
    </div>
  );
}
