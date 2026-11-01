import type { GeoArea } from '../database/entities/geo-area.entity';
import { GeoPoint, haversineKm, isGeoPoint } from '../common/geo/geo';
import { AreaIndex, namesOf } from './area-index';
import { AreaLevel, areaKeys, foldText, normArea } from './area-model';

/** A component of a Google Geocoding result (`address_components`). */
export interface GoogleComponent {
  types?: string[];
  long_name?: string;
  short_name?: string;
}

export interface TextHints {
  commune?: string | null;
  city?: string | null;
  province?: string | null;
  quartier?: string | null;
  country?: string | null;
}

export interface ResolveInput {
  components?: GoogleComponent[] | null;
  text?: TextHints | null;
  pin?: { lat?: unknown; lng?: unknown } | null;
}

export type MatchedBy = 'components' | 'text' | 'pin';

export interface Resolved {
  area: GeoArea | null;
  matchedBy: MatchedBy | null;
}

/** Pin matching is approximate: the nearest commune centroid within this distance, else the nearest city centroid. */
export const PIN_COMMUNE_KM = 25;
export const PIN_CITY_KM = 60;
/** Refining an already-matched city or province with the pin may look further. */
export const PIN_REFINE_KM = 60;

const COMMUNE_TYPES = ['sublocality_level_1', 'sublocality', 'administrative_area_level_3'];
const QUARTIER_TYPES = ['neighborhood', 'sublocality_level_2', 'sublocality_level_3'];

/** The names a Google result carries for a set of component types (long names, then short names), in the order given. */
function namesFor(components: readonly GoogleComponent[], types: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of types) {
    for (const c of components) {
      if (!c.types?.includes(t)) continue;
      for (const n of [c.long_name, c.short_name]) if (typeof n === 'string' && n.trim() && !out.includes(n.trim())) out.push(n.trim());
    }
  }
  return out;
}

/** One match among several names: the first name that finds exactly one area, else the first name's first hit when `under` narrows it. */
function pickOne(ix: AreaIndex, names: readonly string[], levels: readonly AreaLevel[], under: GeoArea | null): GeoArea | null {
  for (const n of names) {
    const hits = ix.lookup(n, { levels, under: under?.id });
    if (hits.length === 1) return hits[0];
    // Several areas share the name: only trust the first when we already know where we are (a unique exact spelling).
    if (hits.length > 1 && under) {
      const exactKey = areaKeys(n)[0];
      const exact = hits.filter((h) => areaKeys(h.googleName)[0] === exactKey || areaKeys(h.name)[0] === exactKey);
      if (exact.length === 1) return exact[0];
      return hits[0];
    }
  }
  return null;
}

interface Names {
  province: string[];
  city: string[];
  commune: string[];
  quartier: string[];
}

/** Walk down: province -> city -> commune (or district) -> quartier, each step only below the previous match. */
function descend(ix: AreaIndex, names: Names): GeoArea | null {
  let cur: GeoArea | null = null;
  const province = pickOne(ix, names.province, ['province'], null);
  if (province) cur = province;
  const city = pickOne(ix, names.city, ['city'], cur);
  if (city) cur = city;
  else if (cur && names.city.length) {
    // Google sometimes reports the commune as the locality.
    const asCommune = pickOne(ix, names.city, ['commune', 'district'], cur);
    if (asCommune && !names.commune.length) cur = asCommune;
  }
  if (!cur && names.commune.length) {
    // No province or city at all: a commune name is only trusted when it is unique.
    const hits = names.commune.flatMap((n) => ix.lookup(n, { levels: ['commune', 'district'] }));
    const uniq = [...new Map(hits.map((h) => [h.id, h])).values()];
    if (uniq.length === 1) cur = uniq[0];
  } else if (cur && names.commune.length) {
    const commune = pickOne(ix, names.commune, ['commune'], cur) ?? pickOne(ix, names.commune, ['district'], cur);
    if (commune) cur = commune;
  }
  if (cur && names.quartier.length && ['city', 'district', 'commune'].includes(cur.level)) {
    const q = pickOne(ix, names.quartier, ['quartier'], cur);
    if (q) cur = q;
  }
  return cur && cur.level !== 'country' ? cur : null;
}

/** Does a country component name the platform's country? (A result in Brazzaville must not be matched to Kinshasa.) null = no country component. */
function countryMatches(ix: AreaIndex, components: readonly GoogleComponent[]): boolean | null {
  const country = ix.root;
  if (!country) return null;
  const wanted = components.filter((c) => c.types?.includes('country'));
  if (!wanted.length) return null;
  const mine = new Set<string>([normArea(country.code), ...namesOf(country).flatMap((n) => areaKeys(n))]);
  return wanted.some((c) => [c.long_name, c.short_name].some((n) => !!n && areaKeys(n).some((k) => mine.has(k))));
}

export function resolveFromComponents(ix: AreaIndex, components: readonly GoogleComponent[] | null | undefined): GeoArea | null {
  if (!components?.length) return null;
  if (countryMatches(ix, components) === false) return null;
  return descend(ix, {
    province: namesFor(components, ['administrative_area_level_1']),
    city: namesFor(components, ['locality', 'administrative_area_level_2']),
    commune: namesFor(components, COMMUNE_TYPES),
    quartier: namesFor(components, QUARTIER_TYPES),
  });
}

export function resolveFromText(ix: AreaIndex, text: TextHints | null | undefined): GeoArea | null {
  if (!text) return null;
  const list = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? [v.trim()] : []);
  return descend(ix, { province: list(text.province), city: list(text.city), commune: list(text.commune), quartier: list(text.quartier) });
}

/** The area whose centroid is nearest to a pin, among the given levels (and below `under`), within `maxKm`. */
export function nearestArea(ix: AreaIndex, pin: GeoPoint, levels: readonly AreaLevel[], maxKm: number, under?: string | null): GeoArea | null {
  let best: GeoArea | null = null;
  let bestKm = Infinity;
  for (const a of ix.byId.values()) {
    if (!levels.includes(a.level) || a.lat === null || a.lng === null || a.active === false) continue;
    if (under && !ix.isUnder(a.id, under)) continue;
    const km = haversineKm(pin, { lat: a.lat, lng: a.lng });
    if (km < bestKm) {
      best = a;
      bestKm = km;
    }
  }
  return best && bestKm <= maxKm ? best : null;
}

export function resolveFromPin(ix: AreaIndex, pin: { lat?: unknown; lng?: unknown } | null | undefined): GeoArea | null {
  const p = pin ? { lat: Number(pin.lat), lng: Number(pin.lng) } : null;
  if (!p || !isGeoPoint(p)) return null;
  return nearestArea(ix, p, ['commune'], PIN_COMMUNE_KM) ?? nearestArea(ix, p, ['city'], PIN_CITY_KM);
}

const isDescendantOrSame = (ix: AreaIndex, a: GeoArea, of: GeoArea) => a.id === of.id || ix.isUnder(a.id, of.id);

/**
 * The most specific area for an address, from whatever it carries: Google components (either language), typed text,
 * a map pin. The deepest consistent match wins (components over text over pin on a tie); a deeper match from a weaker
 * source is only taken when it lies inside the stronger one. A pin refines a province / city / district match to the
 * nearest commune inside it.
 */
export function resolveArea(ix: AreaIndex, input: ResolveInput): Resolved {
  const sources: { area: GeoArea | null; by: MatchedBy }[] = [
    { area: resolveFromComponents(ix, input.components), by: 'components' },
    { area: resolveFromText(ix, input.text), by: 'text' },
  ];
  // A result outside the country is never rescued by a text hint or a pin.
  if (input.components?.length && countryMatches(ix, input.components) === false) return { area: null, matchedBy: null };

  let best: Resolved = { area: null, matchedBy: null };
  for (const s of sources) {
    if (!s.area) continue;
    if (!best.area) best = { area: s.area, matchedBy: s.by };
    else if (isDescendantOrSame(ix, s.area, best.area) && s.area.depth > best.area.depth) best = { area: s.area, matchedBy: s.by };
  }

  const pin = input.pin ? { lat: Number(input.pin.lat), lng: Number(input.pin.lng) } : null;
  if (pin && isGeoPoint(pin)) {
    if (!best.area) {
      const a = resolveFromPin(ix, pin);
      if (a) best = { area: a, matchedBy: 'pin' };
    } else if (['province', 'city', 'district'].includes(best.area.level)) {
      const refined = nearestArea(ix, pin, ['commune'], PIN_REFINE_KM, best.area.id);
      if (refined && refined.depth > best.area.depth) best = { area: refined, matchedBy: 'pin' };
    }
  }
  return best;
}

// ── free text ("14 Avenue du Commerce, Gombe, Kinshasa") ───────────────────────

const words = (s: string): string => ` ${foldText(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * The area named inside a free-text address: comma-separated segments are tried first (a city, then a commune under it),
 * then any commune / city / province name that appears as whole words ("Avenue Lumumba Limete Kinshasa").
 * Used for stores and warehouses from before areas existed, which only have a text address.
 */
export function resolveFromFreeText(ix: AreaIndex, raw: string | null | undefined): GeoArea | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  const segments = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  let cityName: string | undefined;
  for (const seg of [...segments].reverse()) {
    if (ix.lookup(seg, { levels: ['city'] }).length) {
      cityName = seg;
      break;
    }
  }
  const city = cityName ? pickOne(ix, [cityName], ['city'], null) : null;
  let communeName: string | undefined;
  for (const seg of segments) {
    if (seg === cityName) continue;
    if (ix.lookup(seg, { levels: ['commune'], under: city?.id }).length) {
      communeName = seg;
      break;
    }
  }
  const viaSegments = resolveFromText(ix, { city: cityName ?? null, commune: communeName ?? null });
  if (viaSegments && viaSegments.depth >= 4) return viaSegments;

  // Whole-word scan, most specific level first, longest name first.
  const padded = words(text);
  const hit = (levels: readonly AreaLevel[], under?: GeoArea | null, skip: ReadonlySet<string> = new Set()): GeoArea | null => {
    let best: { a: GeoArea; len: number } | null = null;
    let fallback: { a: GeoArea; len: number } | null = null;
    for (const a of ix.byId.values()) {
      if (!levels.includes(a.level) || (under && !ix.isUnder(a.id, under.id))) continue;
      for (const n of [a.name, a.nameEn, a.googleName, a.googleNameEn, ...(a.aliases ?? [])]) {
        if (!n) continue;
        const w = words(n);
        if (w.trim().length < 3 || !padded.includes(w)) continue;
        // A commune that shares its name with the city ("Kinshasa") only counts when no other commune is named.
        const slot = skip.has(w) ? 'fallback' : 'best';
        const cur = slot === 'best' ? best : fallback;
        if (!cur || w.length > cur.len) {
          if (slot === 'best') best = { a, len: w.length };
          else fallback = { a, len: w.length };
        }
      }
    }
    return (best ?? fallback)?.a ?? null;
  };
  const cityHit = viaSegments && viaSegments.level === 'city' ? viaSegments : hit(['city'], null);
  const sameAsCity = new Set(cityHit ? [cityHit.name, cityHit.nameEn, cityHit.googleName, cityHit.googleNameEn].filter((n): n is string => !!n).map(words) : []);
  const communeHit = hit(['commune'], cityHit, sameAsCity);
  return communeHit ?? cityHit ?? hit(['province'], null);
}

/**
 * The area of something that carries typed place names, an optional free-text address and an optional pin (a stored
 * address, a store, a warehouse). The deepest consistent match wins; the pin refines a province / city / district to
 * the nearest commune inside it, and is used alone when the text names nothing.
 */
export function locate(ix: AreaIndex, input: { text?: TextHints | null; free?: string | null; pin?: { lat?: unknown; lng?: unknown } | null }): GeoArea | null {
  const typed = resolveFromText(ix, input.text);
  const free = input.free ? resolveFromFreeText(ix, input.free) : null;
  let best = typed;
  if (free && (!best || (free.depth > best.depth && isDescendantOrSame(ix, free, best)))) best = free;
  const pin = input.pin ? { lat: Number(input.pin.lat), lng: Number(input.pin.lng) } : null;
  if (pin && isGeoPoint(pin)) {
    if (!best) return resolveFromPin(ix, pin);
    if (['province', 'city', 'district'].includes(best.level)) {
      const refined = nearestArea(ix, pin, ['commune'], PIN_REFINE_KM, best.id);
      if (refined && refined.depth > best.depth) best = refined;
    }
  }
  return best;
}
