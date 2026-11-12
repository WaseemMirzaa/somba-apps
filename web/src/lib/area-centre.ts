/**
 * The centre of the area a shopper chose, as a map pin of last resort.
 *
 * A delivery address needs a pin (`requirePinnedAddress`). Without a Google Maps key, or with the key refused, the only
 * ways to pin were the device location (browsers refuse it on a plain-http site) or typing coordinates. The areas carry the
 * coordinates of their centre, so a shopper who picked the commune can pin the address there: not the door, but enough for
 * the warehouse, the distance-based fee and the area check, and the street line tells the rider the rest.
 */
export type CentreArea = { level?: string; name?: string; nameEn?: string | null; lat?: number | null; lng?: number | null };
export type AreaCentre = { lat: number; lng: number; name: string; level: string };

/** Most specific first. A province is too big to be a pin; a country never is. */
const PINNABLE = ["quartier", "commune", "district", "city"];

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** The deepest area of the chain that has coordinates (a quartier, else the commune, else the city). */
export function areaCentre(chain: readonly CentreArea[] | null | undefined, fr: boolean): AreaCentre | null {
  for (const level of PINNABLE) {
    const a = (chain ?? []).find((x) => x?.level === level && finite(x.lat) && finite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180);
    if (a) return { lat: a.lat as number, lng: a.lng as number, name: (fr ? a.name : a.nameEn || a.name) ?? "", level };
  }
  return null;
}
