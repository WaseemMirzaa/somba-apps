"use client";

/**
 * Geography, warehouse coverage and "served area" helpers (`docs/contracts/areas.md`).
 *
 *   Country → Province → City → District → Commune → Quartier
 *
 * Every `geo:*` reply is language-neutral: an area carries a French name (`name`) and an English name (`nameEn`, which
 * falls back to `name`). The screen picks one with `areaName(area, fr)`. Nothing here guesses a name or a coverage:
 * what is served, and by which warehouse, always comes from the server (`served`, `hubId`, `hubName`).
 */

import { useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";

export {
  notServedArea,
  notServedCityNames,
  notServedFromAck,
  notServedFromError,
  notServedText,
  parseNotServed,
  type NotServedInfo,
  type ServedCity,
} from "@/lib/not-served";
export { groupCommunes, type CommuneGroup } from "@/lib/area-groups";

export type AreaLevel = "country" | "province" | "city" | "district" | "commune" | "quartier";

export interface Area {
  id: string;
  code: string;
  level: AreaLevel;
  /** Official name (French). */
  name: string;
  /** English name; null/absent = same as `name`. */
  nameEn: string | null;
  /** Exact Google Geocoding spelling with language=fr / language=en. */
  googleName: string;
  googleNameEn?: string | null;
  aliases: string[];
  parentId: string | null;
  /** Codes joined by "/", e.g. "CD/CD-KN/CD-KN-KIN/CD-KN-KIN-MTA/CD-KN-LIM". */
  path: string;
  depth: number;
  lat: number | null;
  lng: number | null;
  active: boolean;
  sortOrder?: number;
  /** A city's status in the data (`official` | `decree-2013`); null elsewhere. */
  status?: string | null;
  /** Computed by the server: this area or an ancestor is covered by an active warehouse. */
  served: boolean;
  /** Not served itself, but something inside it is (Haut-Katanga when only Lubumbashi is covered): still selectable. */
  partiallyServed?: boolean;
  /** The warehouse that serves it (most specific coverage), null when not served. */
  hubId: string | null;
  hubName: string | null;
  childCount: number;
}

export type AreaChain = Area[];
/** A commune as `geo:communes` sends it: with its district (null when it sits directly under the city). */
export type CommuneRow = Area & { district?: Area | null };
export type AreaNode = Area & { children: AreaNode[] };
export type CoverageArea = Area & { feeOverrideUsd: number | null };

export interface GeoComponent {
  types: string[];
  long_name: string;
  short_name?: string;
}

export interface AreaHint {
  components?: GeoComponent[];
  text?: { commune?: string; city?: string; province?: string };
  pin?: { lat: number; lng: number };
}

export interface ResolveResult {
  area: Area | null;
  chain: AreaChain;
  served: boolean;
  hubId: string | null;
  hubName: string | null;
  matchedBy: "components" | "text" | "pin" | null;
}

type L = { en: string; fr: string };

export const LEVEL_LABEL: Record<AreaLevel, L> = {
  country: { en: "Country", fr: "Pays" },
  province: { en: "Province", fr: "Province" },
  city: { en: "City", fr: "Ville" },
  district: { en: "District", fr: "District" },
  commune: { en: "Commune", fr: "Commune" },
  quartier: { en: "Neighbourhood", fr: "Quartier" },
};

export const levelLabel = (level: AreaLevel, fr: boolean) => (fr ? LEVEL_LABEL[level].fr : LEVEL_LABEL[level].en);

export { areaName, chainText, deliveryAreaText, type QuotedArea } from "@/lib/area-names";
import { areaName } from "@/lib/area-names";

/** What goes in the address text fields: Google's spelling, so the server's matching and the display agree. */
export const googleText = (a: Area | null | undefined, fr: boolean): string => (a ? (fr ? a.googleName : a.googleNameEn || a.googleName) || a.name : "");

/** The text fields of an address (`city`, `commune`, `region`) written from the picked areas, in Google's spelling. */
export function addressTextFromChain(chain: AreaChain | null | undefined, fr: boolean): { city: string; commune: string; region: string } {
  const at = (l: AreaLevel) => (chain ?? []).find((a) => a.level === l);
  return {
    city: googleText(at("city") ?? at("province"), fr),
    commune: googleText(at("quartier") ?? at("commune"), fr),
    region: googleText(at("province"), fr),
  };
}

export const chainAt = (chain: AreaChain | null | undefined, level: AreaLevel): Area | undefined => (chain ?? []).find((a) => a.level === level);

/** True when the area is hidden from pickers (`active: false`). */
export const isHidden = (a: Area) => a.active === false;

// ───────────────────────────── requests + cache ─────────────────────────────

const childCache = new Map<string, Promise<Area[]>>();
const areaCache = new Map<string, Promise<AreaChain>>();
const communeCache = new Map<string, Promise<CommuneRow[]>>();
let treeCache: Promise<AreaNode | null> | null = null;
let servedCitiesCache: Promise<Area[] | null> | null = null;
let geoVersion = 0;
const versionListeners = new Set<() => void>();
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

/** Forget every cached read and tell the mounted hooks to ask again (a warehouse/coverage/area changed). */
export function invalidateGeo(): void {
  if (invalidateTimer) return;
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    childCache.clear();
    areaCache.clear();
    communeCache.clear();
    treeCache = null;
    servedCitiesCache = null;
    geoVersion += 1;
    versionListeners.forEach((l) => l());
  }, 60);
}

/** Re-renders the caller whenever `geo:updated` / `coverage:updated` arrives; also keeps the socket listeners bound. */
export function useGeoVersion(): number {
  const rt = useRealtime();
  const [v, setV] = useState(geoVersion);
  useEffect(() => {
    const l = () => setV(geoVersion);
    versionListeners.add(l);
    return () => {
      versionListeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (rt.status !== "connected") return;
    const sock = socketClient.current;
    if (!sock) return;
    const h = () => invalidateGeo();
    sock.on("geo:updated", h);
    sock.on("coverage:updated", h);
    return () => {
      sock.off("geo:updated", h);
      sock.off("coverage:updated", h);
    };
  }, [rt.status]);
  return v;
}

/** Children of an area (null → the country's provinces), served first. Cached until the geography changes. */
export function geoChildren(parentId: string | null): Promise<Area[]> {
  const key = parentId ?? "root";
  let p = childCache.get(key);
  if (!p) {
    // The server hides inactive areas from everyone but admins.
    p = socketClient.request<Area[]>("geo:children", parentId ? { parentId } : {}).then((rows) => (Array.isArray(rows) ? rows : []));
    childCache.set(key, p);
    p.catch(() => childCache.delete(key));
  }
  return p;
}

/** One area by id with its ancestors (country first), hidden areas included (`geo:get`). Cached until the geography changes. */
export function geoAreaChain(id: string): Promise<AreaChain> {
  let p = areaCache.get(id);
  if (!p) {
    p = socketClient.request<{ chain?: AreaChain }>("geo:get", { id }).then((r) => (Array.isArray(r?.chain) ? r.chain : []));
    areaCache.set(id, p);
    p.catch(() => areaCache.delete(id));
  }
  return p;
}

/**
 * The area an order was placed for, from its stored `destinationAreaId`, with its ancestors. `chain` is null while it
 * loads (or when there is no id, or the server could not name it): the caller then falls back to the quote.
 */
export function useStoredAreaChain(areaId: string | null | undefined): { chain: AreaChain | null; loading: boolean } {
  const version = useGeoVersion();
  const rt = useRealtime();
  const [state, setState] = useState<{ key: string; chain: AreaChain | null } | null>(null);
  const connected = rt.status === "connected";
  const key = `${areaId ?? ""}:${version}`;
  useEffect(() => {
    if (!areaId || !connected) return;
    let alive = true;
    geoAreaChain(areaId)
      .then((chain) => alive && setState({ key, chain: chain.length ? chain : null }))
      .catch(() => alive && setState({ key, chain: null }));
    return () => {
      alive = false;
    };
  }, [areaId, connected, key]);
  const settled = !!areaId && state?.key === key;
  return { chain: settled ? state.chain : null, loading: !!areaId && !settled };
}

/** How the communes of a city are read: the one-call events, or (an old server) one call per district. */
type CommuneMode = "communes" | "flatten" | "legacy";
let communeMode: CommuneMode = "communes";
/** An event an old server does not know is never acknowledged: the request times out instead of failing. */
const isTimeout = (e: unknown) => /timed out/i.test((e as Error | undefined)?.message ?? "");
const COMMUNE_TIMEOUT_MS = 4000;

async function readCommunes(cityId: string): Promise<CommuneRow[]> {
  if (communeMode === "communes") {
    try {
      const rows = await socketClient.request<CommuneRow[]>("geo:communes", { cityId }, { timeoutMs: COMMUNE_TIMEOUT_MS });
      if (Array.isArray(rows)) return rows;
    } catch (e) {
      // A real refusal (unknown city…) is final; only silence means the server does not know the event.
      if (!isTimeout(e)) throw e;
      communeMode = "flatten";
    }
  }
  if (communeMode === "flatten") {
    try {
      const rows = await socketClient.request<CommuneRow[]>("geo:children", { parentId: cityId, flatten: "commune" }, { timeoutMs: COMMUNE_TIMEOUT_MS });
      // An old server ignores `flatten` and answers with the city's own children (districts): no communes in it.
      if (Array.isArray(rows) && (rows.length === 0 || rows.some((r) => r.level === "commune"))) return rows;
    } catch (e) {
      if (!isTimeout(e)) throw e;
    }
    communeMode = "legacy";
  }
  // Old servers: the city's children, then the children of each district.
  const kids = await geoChildren(cityId);
  const districts = kids.filter((k) => k.level === "district");
  const lists = await Promise.all(districts.map((d) => geoChildren(d.id)));
  const byDistrict = new Map(districts.map((d) => [d.id, d] as const));
  const nested = lists.flatMap((rows) => rows.filter((a) => a.level === "commune")).map((a): CommuneRow => ({ ...a, district: a.parentId ? (byDistrict.get(a.parentId) ?? null) : null }));
  const direct = kids.filter((k) => k.level === "commune").map((a): CommuneRow => ({ ...a, district: null }));
  return [...nested, ...direct];
}

/**
 * Every commune of a city in ONE call (`geo:communes { cityId }`), each with its `district` (null when none), served
 * first. Falls back to `geo:children { flatten: 'commune' }`, then to one call per district on an old server. Cached.
 */
export function geoCommunes(cityId: string): Promise<CommuneRow[]> {
  let p = communeCache.get(cityId);
  if (!p) {
    p = readCommunes(cityId);
    communeCache.set(cityId, p);
    p.catch(() => communeCache.delete(cityId));
  }
  return p;
}

/** The cities with any coverage (`geo:servedCities`): what the not-served message lists. Null on an old server. */
export function geoServedCities(): Promise<Area[] | null> {
  if (!servedCitiesCache) {
    servedCitiesCache = socketClient
      .request<Area[]>("geo:servedCities", {}, { timeoutMs: COMMUNE_TIMEOUT_MS })
      .then((rows) => (Array.isArray(rows) ? rows : null))
      .catch(() => null);
  }
  return servedCitiesCache;
}

export function geoSearch(q: string, opts: { level?: AreaLevel; servedOnly?: boolean; limit?: number } = {}): Promise<Area[]> {
  return socketClient.request<Area[]>("geo:search", { q, ...opts }).then((rows) => (Array.isArray(rows) ? rows : []));
}

export function geoResolve(hint: AreaHint): Promise<ResolveResult> {
  return socketClient.request<ResolveResult>("geo:resolve", hint);
}

/** The whole tree down to communes (country → province → city → district → commune), one request, cached. */
export function geoTree(): Promise<AreaNode | null> {
  if (!treeCache) {
    treeCache = socketClient
      .request<AreaNode | AreaNode[] | null>("geo:tree", { rootCode: "CD", depth: 4 })
      .then((r) => (Array.isArray(r) ? (r[0] ?? null) : r ?? null));
    treeCache.catch(() => {
      treeCache = null;
    });
  }
  return treeCache;
}

/** A flat list of every node of a tree. */
export function flattenTree(root: AreaNode | null | undefined): AreaNode[] {
  const out: AreaNode[] = [];
  const walk = (n: AreaNode) => {
    out.push(n);
    (n.children ?? []).forEach(walk);
  };
  if (root) walk(root);
  return out;
}

export interface Footprint {
  ready: boolean;
  /** Cities (or the provinces without cities) where at least one area is served. */
  cities: Area[];
  /** True when the area, or something inside it, is served (or partly served): a picker may offer it. */
  has: (a: Pick<Area, "code" | "served"> & { partiallyServed?: boolean }) => boolean;
  /** The country's id (parent of the provinces), when known. */
  countryId: string | null;
  root: AreaNode | null;
}

/** A picker may offer an area that is served, partly served (something inside it is) or holds served areas. */
const offered = (a: Pick<Area, "served" | "partiallyServed">) => a.served || !!a.partiallyServed;

const EMPTY_FOOTPRINT: Footprint = { ready: false, cities: [], has: offered, countryId: null, root: null };

/**
 * Where we deliver: every area that is served or contains served areas. The pickers disable what is not in it
 * ("coming soon"), and the not-served message lists its cities.
 */
export function useFootprint(): Footprint {
  const version = useGeoVersion();
  const rt = useRealtime();
  const [state, setState] = useState<{ version: number; root: AreaNode | null; served: Area[] | null; failed: boolean } | null>(null);
  const connected = rt.status === "connected";
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    Promise.all([geoTree(), geoServedCities()])
      .then(([root, served]) => alive && setState({ version, root, served, failed: false }))
      .catch(() => alive && setState({ version, root: null, served: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [connected, version]);
  return useMemo(() => {
    if (!state || (!state.root && !state.failed)) return EMPTY_FOOTPRINT;
    if (!state.root) return { ...EMPTY_FOOTPRINT, ready: true };
    const withService = new Set<string>();
    const mark = (n: AreaNode): boolean => {
      let any = n.served;
      for (const c of n.children ?? []) if (mark(c)) any = true;
      if (any) withService.add(n.code);
      return any;
    };
    mark(state.root);
    const nodes = flattenTree(state.root);
    const cities = nodes.filter((n) => n.level === "city" && withService.has(n.code));
    const provincesWithoutCity = nodes.filter((n) => n.level === "province" && withService.has(n.code) && !(n.children ?? []).some((c) => c.level === "city"));
    const firstProvince = nodes.find((n) => n.level === "province");
    return {
      ready: true,
      // The server's own list (`geo:servedCities`) when it has one; else the cities worked out from the tree.
      cities: state.served ?? [...cities, ...provincesWithoutCity],
      has: (a) => offered(a) || withService.has(a.code),
      countryId: state.root.level === "country" ? state.root.id : (firstProvince?.parentId ?? null),
      root: state.root,
    };
  }, [state]);
}

/** Children of an area, re-read when the geography changes. */
export function useAreaChildren(parentId: string | null | undefined, enabled = true) {
  const version = useGeoVersion();
  const rt = useRealtime();
  const [data, setData] = useState<{ key: string; rows: Area[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${parentId ?? "root"}:${version}`;
  const connected = rt.status === "connected";
  useEffect(() => {
    if (!enabled || !connected || parentId === undefined) return;
    let alive = true;
    geoChildren(parentId)
      .then((rows) => {
        if (!alive) return;
        setData({ key, rows });
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [parentId, enabled, connected, key]);
  const rows = data && data.key.startsWith(`${parentId ?? "root"}:`) ? data.rows : null;
  return { rows, loading: enabled && parentId !== undefined && !rows && !error, error };
}

// ───────────────────────────── the "not served" message (see lib/not-served.ts) ─────────────────────────────

/** Names of the served cities in the reader's language, for `notServedText`. */
export function servedCityNames(footprint: Footprint, fr: boolean): string[] {
  return footprint.cities.map((c) => areaName(c, fr));
}

/** The chain (country → area) of an area, built from its `path` codes and the cached tree. Null while unknown. */
export function chainFromTree(area: Pick<Area, "path" | "code"> | null | undefined, root: AreaNode | null | undefined): AreaChain {
  if (!area || !root) return [];
  const byCode = new Map(flattenTree(root).map((n) => [n.code, n as Area]));
  return area.path
    .split("/")
    .map((code) => byCode.get(code))
    .filter((a): a is Area => !!a);
}

/**
 * The chain of an area for the pickers' `initialChain` (a warehouse's location has only the area, not its chain).
 * `undefined` while loading; an empty list when the area has no known ancestors.
 */
export function useAreaChain(area: Area | null | undefined): AreaChain | undefined {
  const rt = useRealtime();
  const [state, setState] = useState<{ id: string; chain: AreaChain } | null>(null);
  const connected = rt.status === "connected";
  const id = area?.id ?? null;
  const path = area?.path ?? "";
  useEffect(() => {
    if (!id || !connected) return;
    let alive = true;
    geoTree()
      .then((root) => alive && setState({ id, chain: chainFromTree({ path, code: "" }, root) }))
      .catch(() => alive && setState({ id, chain: [] }));
    return () => {
      alive = false;
    };
  }, [id, path, connected]);
  if (!area) return [];
  return state && state.id === id ? state.chain : undefined;
}

export interface CoverageEntry {
  areaId: string;
  hubId: string;
  hubName: string;
  /** The area itself is assigned to that warehouse (not just covered through a parent). */
  direct: boolean;
}

/** Who serves every area of the country (`coverage:map`), re-read whenever coverage changes. */
export function useCoverageMap(enabled = true) {
  const version = useGeoVersion();
  const rt = useRealtime();
  const [state, setState] = useState<{ version: number; rows: CoverageEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const connected = rt.status === "connected";
  useEffect(() => {
    if (!enabled || !connected) return;
    let alive = true;
    socketClient
      .request<CoverageEntry[]>("coverage:map", {})
      .then((rows) => {
        if (!alive) return;
        setState({ version, rows: Array.isArray(rows) ? rows : [] });
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [enabled, connected, version, bump]);
  const byArea = useMemo(() => new Map((state?.rows ?? []).map((r) => [r.areaId, r])), [state]);
  return { rows: state?.rows ?? [], byArea, loading: enabled && !state && !error, error, reload: () => setBump((n) => n + 1) };
}
