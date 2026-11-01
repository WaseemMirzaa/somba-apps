/**
 * Google Maps loader + helpers for the address picker.
 *
 * Needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (a browser key restricted to your site's HTTP referrers) with these APIs
 * enabled in Google Cloud: Maps JavaScript API, Places API (New), Geocoding API.
 * Without the key the picker explains that and the address form keeps working with manual entry.
 */
import { countryFromGoogle } from "@/lib/countries";
import type { GeoComponent } from "@/lib/areas";
import { currentLocale } from "@/lib/api-errors";

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
/** Advanced markers need a Map ID; "DEMO_MAP_ID" is Google's development map, replace it with your own style in production. */
export const MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
/** Default view when no pin exists yet: Kinshasa (the primary market). */
export const DEFAULT_CENTER = { lat: -4.3224, lng: 15.307 };

export interface AddressGeo {
  lat: number;
  lng: number;
  placeId?: string;
  formatted?: string;
}

/** Address parts a map pick can fill into the form. */
export interface PickedParts {
  line1?: string;
  commune?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
}

/** What a pick also hands back: Google's raw address components, to send to `geo:resolve` (docs/contracts/areas.md). */
export interface PickedMeta {
  components: GeoComponent[];
}

export class MapsError extends Error {
  constructor(public code: "no-key" | "load-failed" | "auth-failed", message: string) {
    super(message);
  }
}

type GoogleWindow = Window & { google?: typeof google; gm_authFailure?: () => void; __initGoogleMaps?: () => void };
let loading: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (!MAPS_KEY) return Promise.reject(new MapsError("no-key", "No Google Maps API key configured."));
  if (loading) return loading;
  const w = window as GoogleWindow;
  loading = new Promise<typeof google.maps>((resolve, reject) => {
    if (w.google?.maps?.importLibrary) {
      resolve(w.google.maps);
      return;
    }
    // Google calls this when the key is rejected (wrong referrer, API not enabled, billing off...).
    w.gm_authFailure = () => {
      loading = null;
      reject(new MapsError("auth-failed", "Google rejected the Maps API key."));
    };
    w.__initGoogleMaps = () => resolve(w.google!.maps);
    const s = document.createElement("script");
    // Labels on the map follow the language the page was opened in; address lookups ask for the live language themselves.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&loading=async&v=weekly&language=${currentLocale()}&callback=__initGoogleMaps`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new MapsError("load-failed", "Could not load Google Maps."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

interface Component {
  types: string[];
  long: string;
  /** Google's short form: for the country component this is the ISO code ("CD"). */
  short?: string;
}

/** The country of a pick, stored as its ISO code ("CD"); see `countryFromGoogle`. */
function pickedCountry(components: Component[]): string | undefined {
  const c = components.find((x) => x.types.includes("country"));
  return c ? countryFromGoogle(c.long, c.short) : undefined;
}

/** Turn Google address components into the fields our address form uses. */
export function partsFromComponents(components: Component[]): PickedParts {
  const get = (...types: string[]) => components.find((c) => types.some((t) => c.types.includes(t)))?.long;
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  return {
    line1: street || get("premise", "establishment", "point_of_interest") || undefined,
    commune: get("sublocality_level_1", "sublocality", "neighborhood", "administrative_area_level_3"),
    city: get("locality", "postal_town", "administrative_area_level_2"),
    region: get("administrative_area_level_1"),
    country: pickedCountry(components),
    postalCode: get("postal_code"),
  };
}

/** Google components in the shape `geo:resolve` takes. */
export function toGeoComponents(components: Component[]): GeoComponent[] {
  return components.map((c) => ({ types: c.types, long_name: c.long, short_name: c.short }));
}

/**
 * Reverse-geocode a pin into address parts + a formatted line.
 * `language` asks Google for names in the UI language ("fr" or "en"); the server matches either spelling.
 * The components of every result are merged (most specific first) so a missing commune on the first result is
 * still found on the next one.
 */
export async function reverseGeocode(
  maps: typeof google.maps,
  pos: { lat: number; lng: number },
  language: string = currentLocale(),
): Promise<{ parts: PickedParts; components: GeoComponent[]; formatted?: string; placeId?: string }> {
  const { Geocoder } = (await maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
  const res = await new Geocoder().geocode({ location: pos, language });
  const best = res.results[0];
  if (!best) return { parts: {}, components: [] };
  const seen = new Set<string>();
  const merged: Component[] = [];
  for (const r of res.results) {
    for (const c of r.address_components) {
      const key = `${c.types.join(",")}|${c.long_name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ types: c.types, long: c.long_name, short: c.short_name });
    }
  }
  return {
    parts: partsFromComponents(best.address_components.map((c) => ({ types: c.types, long: c.long_name, short: c.short_name }))),
    components: toGeoComponents(merged),
    formatted: best.formatted_address,
    placeId: best.place_id,
  };
}

export const mapsLinkTo = (geo: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lng}`;
