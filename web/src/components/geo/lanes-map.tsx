"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import { DEFAULT_CENTER, MAPS_KEY, MAPS_MAP_ID, loadGoogleMaps } from "@/lib/google-maps";
import type { MapHub } from "@/components/geo/coverage-map";
import type { Lane, RouteHop } from "@/lib/logistics";

type Status = "nokey" | "loading" | "ready" | "error";

/**
 * The lanes between warehouses as lines between their pins (blue = active, grey dashed = off). A route preview is drawn
 * on top in orange. Without a Maps key the page's table is the only view and this says so.
 */
export function LanesMap({ fr, hubs, lanes, route, height = 380 }: { fr: boolean; hubs: MapHub[]; lanes: Lane[]; route?: RouteHop[] | null; height?: number }) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsRef = useRef<typeof google.maps | null>(null);
  const overlays = useRef<{ setMap(m: google.maps.Map | null): void }[]>([]);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [status, setStatus] = useState<Status>(MAPS_KEY ? "loading" : "nokey");
  const pos = useMemo(() => new Map(hubs.filter((h) => h.lat != null && h.lng != null).map((h) => [h.id, { lat: h.lat as number, lng: h.lng as number }])), [hubs]);

  useEffect(() => {
    if (!MAPS_KEY || !mapDiv.current) return;
    let cancelled = false;
    loadGoogleMaps()
      .then(async (maps) => {
        const { Map } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;
        await maps.importLibrary("marker");
        if (cancelled || !mapDiv.current) return;
        mapsRef.current = maps;
        mapRef.current = new Map(mapDiv.current, {
          center: DEFAULT_CENTER,
          zoom: 6,
          mapId: MAPS_MAP_ID,
          streetViewControl: false,
          mapTypeControl: false,
          clickableIcons: false,
        });
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        console.error("[lanes-map] Google Maps unavailable:", e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !maps || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    markers.current.forEach((m) => {
      m.map = null;
    });
    markers.current = [];
    const bounds = new maps.LatLngBounds();
    let count = 0;
    const seen = new Set<string>();
    for (const l of lanes) {
      const a = pos.get(l.fromHubId);
      const b = pos.get(l.toHubId);
      if (!a || !b) continue;
      const key = [l.fromHubId, l.toHubId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const line = new maps.Polyline({
        path: [a, b],
        map,
        strokeColor: l.active ? "#2563eb" : "#94a3b8",
        strokeOpacity: l.active ? 0.9 : 0.6,
        strokeWeight: l.active ? 3 : 2,
        icons: l.active ? undefined : [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "12px" }],
      });
      overlays.current.push(line);
    }
    for (const hop of route ?? []) {
      const a = pos.get(hop.fromHubId);
      const b = pos.get(hop.toHubId);
      if (!a || !b) continue;
      overlays.current.push(new maps.Polyline({ path: [a, b], map, strokeColor: "#ea580c", strokeOpacity: 1, strokeWeight: 6, zIndex: 10 }));
    }
    for (const h of hubs) {
      const p = pos.get(h.id);
      if (!p) continue;
      const el = document.createElement("div");
      el.style.cssText = "width:22px;height:22px;border-radius:4px;background:#0f172a;color:#fff;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:700 10px/1 sans-serif";
      el.textContent = "W";
      markers.current.push(new maps.marker.AdvancedMarkerElement({ map, position: p, content: el, title: h.name, zIndex: 5 }));
      bounds.extend(p);
      count++;
    }
    if (count > 1) map.fitBounds(bounds, 56);
    else if (count === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(10);
    }
  }, [status, hubs, lanes, route, pos]);

  if (status === "nokey" || status === "error") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <MapPinOff className="h-4 w-4 shrink-0" />
        {fr ? "La carte est indisponible : la liste des liaisons ci-dessus reste complète." : "The map is unavailable: the lane list above is still complete."}
      </p>
    );
  }
  return <div ref={mapDiv} style={{ height }} className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" aria-label={fr ? "Carte des liaisons entre entrepôts" : "Map of the lanes between warehouses"} data-testid="lanes-map" />;
}
