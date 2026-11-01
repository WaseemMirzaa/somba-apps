/**
 * Geography for routing: great-circle distance and "nearest warehouse". Pure functions, no I/O.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A warehouse as the router sees it. `activeRiders` undefined = unknown, treated as "has riders". */
export interface GeoHub {
  id: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
  active?: boolean | null;
  activeRiders?: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Is this a usable coordinate pair (finite, inside the globe)? */
export function isGeoPoint(p: unknown): p is GeoPoint {
  if (!p || typeof p !== 'object') return false;
  const { lat, lng } = p as Record<string, unknown>;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Validate a latitude / longitude pair coming from a client. Returns null when either is missing or out of range. */
export function cleanPoint(lat: unknown, lng: unknown): GeoPoint | null {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  return isGeoPoint(p) ? { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 } : null;
}

/** Great-circle (haversine) distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The nearest warehouse to a point. Only warehouses that are active, have coordinates and (unless
 * `requireRiders:false`) have at least one active rider qualify. Ties break on id so the choice is stable.
 */
export function nearestHub<T extends GeoHub>(point: GeoPoint, hubs: readonly T[], opts: { requireRiders?: boolean } = {}): T | null {
  const requireRiders = opts.requireRiders !== false;
  let best: T | null = null;
  let bestKm = Infinity;
  for (const h of hubs) {
    if (h.active === false) continue;
    if (requireRiders && (h.activeRiders ?? 1) < 1) continue;
    if (!isGeoPoint({ lat: h.lat, lng: h.lng })) continue;
    const km = haversineKm(point, { lat: h.lat as number, lng: h.lng as number });
    if (km < bestKm - 1e-9 || (Math.abs(km - bestKm) <= 1e-9 && best && h.id < best.id)) {
      best = h;
      bestKm = km;
    }
  }
  return best;
}

const FROM = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ';
const TO = 'aaaaaaceeeeiiiinooooouuuuyy';

/** Lower-case, accents stripped, punctuation squashed: "  Kinshasa, Limeté " -> "kinshasa limete". For comparing place names. */
export function normPlace(v: string | null | undefined): string {
  if (!v) return '';
  let out = '';
  for (const ch of v.toLowerCase()) {
    const i = FROM.indexOf(ch);
    out += i >= 0 ? TO[i] : ch;
  }
  return out.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The map pin and city inside an address JSON string (`geo: {lat,lng}` or top-level `lat`/`lng`); free text gives nothing. */
export function parseAddressPin(raw: string | null | undefined): { point: GeoPoint | null; city: string | null } {
  if (!raw) return { point: null, city: null };
  let a: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(raw);
    a = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    a = null;
  }
  if (!a) return { point: null, city: null };
  const geo = (a.geo && typeof a.geo === 'object' ? (a.geo as Record<string, unknown>) : a) as Record<string, unknown>;
  return { point: cleanPoint(geo.lat, geo.lng), city: typeof a.city === 'string' && a.city.trim() ? a.city.trim() : null };
}
