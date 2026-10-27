import { GeoPoint, cleanPoint } from '../common/geo/geo';

/** What an address JSON string (order `shippingAddress`) says about where it is. */
export interface ShippingFields {
  areaId: string | null;
  commune: string | null;
  city: string | null;
  region: string | null;
  quartier: string | null;
  point: GeoPoint | null;
  components: unknown[] | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Read the place fields out of an address JSON string: `areaId`, `commune`, `city`, `region` (province), `quartier`,
 * the pin (`geo: {lat,lng}` or top-level `lat`/`lng`) and Google `components`. Free text or bad JSON gives nothing.
 */
export function parseShipping(raw: string | null | undefined): ShippingFields {
  const empty: ShippingFields = { areaId: null, commune: null, city: null, region: null, quartier: null, point: null, components: null };
  if (!raw) return empty;
  let a: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(raw);
    a = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    a = null;
  }
  if (!a) return empty;
  const geo = (a.geo && typeof a.geo === 'object' ? a.geo : a) as Record<string, unknown>;
  return {
    areaId: text(a.areaId),
    commune: text(a.commune),
    city: text(a.city),
    region: text(a.region) ?? text(a.province),
    quartier: text(a.quartier),
    point: cleanPoint(geo.lat, geo.lng),
    components: Array.isArray(a.components) ? a.components.slice(0, 40) : null,
  };
}
