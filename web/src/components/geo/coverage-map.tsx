"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import { DEFAULT_CENTER, MAPS_KEY, MAPS_MAP_ID, loadGoogleMaps } from "@/lib/google-maps";
import { areaName, geoTree, useCoverageMap, useGeoVersion, type Area, type AreaNode } from "@/lib/areas";
import { useRealtime } from "@/context/realtime-context";

export interface MapHub {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  active?: boolean;
}

/** One colour per warehouse (distinct on a map, readable beside white text). */
export const HUB_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const UNSERVED = "#94a3b8";
const DIMMED = "#cbd5e1";

export const hubColor = (hubs: { id: string }[], hubId: string | null | undefined): string => {
  const i = hubs.findIndex((h) => h.id === hubId);
  return i < 0 ? UNSERVED : HUB_COLORS[i % HUB_COLORS.length];
};

/** The areas that get a pin: every commune, plus cities without communes and provinces without cities. */
function pinAreas(root: AreaNode | null): Area[] {
  const out: Area[] = [];
  const walk = (n: AreaNode) => {
    const kids = (n.children ?? []).filter((k) => k.level !== "quartier");
    if (n.level === "commune") out.push(n);
    else if (n.level === "city" && !kids.some((k) => k.level === "commune" || k.level === "district")) out.push(n);
    else if (n.level === "province" && !kids.some((k) => k.level === "city")) out.push(n);
    kids.forEach(walk);
  };
  if (root) walk(root);
  return out.filter((a) => a.lat != null && a.lng != null && a.active !== false);
}

type Status = "nokey" | "loading" | "ready" | "error";

/**
 * Google map of the delivery coverage: a dot per commune (or city) coloured by the warehouse that serves it, grey
 * when nobody does, plus a square per warehouse. `highlightHubId` dims every other warehouse's areas (warehouse portal).
 * Without a Maps key the legend still lists which areas each warehouse covers.
 */
export function CoverageMap({ fr, hubs, highlightHubId, height = 420 }: { fr: boolean; hubs: MapHub[]; highlightHubId?: string | null; height?: number }) {
  const rt = useRealtime();
  const version = useGeoVersion();
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsRef = useRef<typeof google.maps | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const [status, setStatus] = useState<Status>(MAPS_KEY ? "loading" : "nokey");
  const [tree, setTree] = useState<{ version: number; root: AreaNode | null } | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const coverage = useCoverageMap();
  const coverageByArea = coverage.byArea;
  const connected = rt.status === "connected";

  const ordered = useMemo(() => [...hubs].sort((a, b) => a.name.localeCompare(b.name)), [hubs]);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    geoTree()
      .then((root) => {
        if (!alive) return;
        setTree({ version, root });
        setTreeError(null);
      })
      .catch((e: Error) => alive && setTreeError(e.message));
    return () => {
      alive = false;
    };
  }, [connected, version]);

  const pins = useMemo(() => pinAreas(tree?.root ?? null), [tree]);

  // Create the map once.
  useEffect(() => {
    if (!MAPS_KEY || !mapDiv.current) return;
    let cancelled = false;
    loadGoogleMaps()
      .then(async (maps) => {
        const { Map, InfoWindow } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;
        await maps.importLibrary("marker");
        if (cancelled || !mapDiv.current) return;
        mapsRef.current = maps;
        mapRef.current = new Map(mapDiv.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          mapId: MAPS_MAP_ID,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        info.current = new InfoWindow();
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        console.error("[coverage-map] Google Maps unavailable:", e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Draw the pins whenever the data changes.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !maps || !map) return;
    markers.current.forEach((m) => {
      m.map = null;
    });
    markers.current = [];
    // Frame what is served (and the warehouses); the grey dots of provinces nobody serves yet would zoom out to the continent.
    const bounds = new maps.LatLngBounds();
    let count = 0;
    const servedPins = pins.filter((a) => coverageByArea.has(a.id));
    const framed = new Set((servedPins.length ? servedPins : pins).map((a) => a.id));
    const dot = (color: string, size: number, square = false, label?: string) => {
      const el = document.createElement("div");
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:${square ? "4px" : "50%"};background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);${label ? "display:flex;align-items:center;justify-content:center;color:#fff;font:700 10px/1 sans-serif" : ""}`;
      if (label) el.textContent = label;
      return el;
    };
    for (const a of pins) {
      const owner = coverageByArea.get(a.id);
      const mine = !highlightHubId || owner?.hubId === highlightHubId;
      const color = !owner ? UNSERVED : mine ? hubColor(ordered, owner.hubId) : DIMMED;
      const pos = { lat: a.lat as number, lng: a.lng as number };
      const m = new maps.marker.AdvancedMarkerElement({
        map,
        position: pos,
        content: dot(color, mine || !owner ? 16 : 12),
        title: `${areaName(a, fr)}${owner ? ` · ${owner.hubName}` : ` · ${fr ? "non desservie" : "not served"}`}`,
        zIndex: mine ? 2 : 1,
      });
      m.addListener("click", () => {
        info.current?.setContent(`<strong>${escapeHtml(areaName(a, fr))}</strong><br/>${owner ? escapeHtml(owner.hubName) : fr ? "Pas encore desservie" : "Not served yet"}`);
        info.current?.open({ map, anchor: m });
      });
      markers.current.push(m);
      if (framed.has(a.id)) {
        bounds.extend(pos);
        count++;
      }
    }
    for (const h of ordered) {
      if (h.lat == null || h.lng == null) continue;
      const pos = { lat: h.lat, lng: h.lng };
      const faded = !!highlightHubId && h.id !== highlightHubId;
      const m = new maps.marker.AdvancedMarkerElement({
        map,
        position: pos,
        content: dot(faded ? DIMMED : hubColor(ordered, h.id), 24, true, "W"),
        title: `${fr ? "Entrepôt" : "Warehouse"} · ${h.name}${h.active === false ? ` (${fr ? "inactif" : "inactive"})` : ""}`,
        zIndex: 5,
      });
      m.addListener("click", () => {
        info.current?.setContent(`<strong>${escapeHtml(h.name)}</strong><br/>${fr ? "Entrepôt" : "Warehouse"}`);
        info.current?.open({ map, anchor: m });
      });
      markers.current.push(m);
      bounds.extend(pos);
      count++;
    }
    if (count > 1) map.fitBounds(bounds, 48);
    else if (count === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(12);
    }
  }, [status, pins, coverageByArea, ordered, highlightHubId, fr]);

  // Legend: how many mapped areas each warehouse covers.
  const counts = useMemo(() => {
    const byHub = new Map<string, Area[]>();
    for (const a of pins) {
      const o = coverageByArea.get(a.id);
      if (o) byHub.set(o.hubId, [...(byHub.get(o.hubId) ?? []), a]);
    }
    const unserved = pins.filter((a) => !coverageByArea.has(a.id));
    return { byHub, unserved };
  }, [pins, coverageByArea]);

  const error = treeError ?? coverage.error;
  return (
    <div className="space-y-3" data-testid="coverage-map">
      {(status === "nokey" || status === "error") && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <MapPinOff className="h-4 w-4 shrink-0" />
          {fr ? "La carte est indisponible : la liste ci-dessous montre ce que chaque entrepôt couvre." : "The map is unavailable: the list below shows what each warehouse covers."}
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {MAPS_KEY && status !== "nokey" && status !== "error" && (
        <div ref={mapDiv} style={{ height }} className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" aria-label={fr ? "Carte de la couverture" : "Coverage map"} />
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600" data-testid="coverage-legend">
        {ordered.map((h) => {
          const list = counts.byHub.get(h.id) ?? [];
          const faded = !!highlightHubId && h.id !== highlightHubId;
          return (
            <li key={h.id} className="flex items-center gap-1.5" data-hub={h.id}>
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: faded ? DIMMED : hubColor(ordered, h.id) }} />
              <span className={faded ? "text-slate-400" : "font-medium text-slate-800"}>{h.name}</span>
              <span className="text-slate-400">({list.length})</span>
            </li>
          );
        })}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: UNSERVED }} />
          <span>{fr ? "Pas encore desservie" : "Not served yet"}</span>
          <span className="text-slate-400">({counts.unserved.length})</span>
        </li>
      </ul>
      {(status === "nokey" || status === "error") && (
        <div className="space-y-2 text-xs text-slate-600">
          {ordered.map((h) => (
            <p key={h.id}>
              <strong className="text-slate-800">{h.name}</strong>: {(counts.byHub.get(h.id) ?? []).map((a) => areaName(a, fr)).join(", ") || "—"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
