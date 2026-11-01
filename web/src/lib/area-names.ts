/**
 * Area names in the reader's language, and the delivery area an order is shown with.
 *
 * Pure (type-only imports): `npm test` loads this file on its own. `lib/areas.ts` re-exports `areaName` / `chainText`.
 */
import type { Area, AreaChain, AreaLevel } from "@/lib/areas";

/** An area's name in the reader's language: English falls back to the French (official) name. */
export function areaName(a: Pick<Area, "name" | "nameEn"> | null | undefined, fr: boolean): string {
  if (!a) return "";
  return fr ? a.name : a.nameEn || a.name;
}

/** The chain as one line, most specific first: "Limete, Mont-Amba, Kinshasa". Countries are left out. */
export function chainText(chain: AreaChain | null | undefined, fr: boolean, opts: { skipLevels?: AreaLevel[]; max?: number } = {}): string {
  const skip = new Set<AreaLevel>(["country", ...(opts.skipLevels ?? [])]);
  const names: string[] = [];
  for (const a of [...(chain ?? [])].reverse()) {
    if (skip.has(a.level)) continue;
    const n = areaName(a, fr);
    if (n && names[names.length - 1] !== n) names.push(n);
  }
  return names.slice(0, opts.max ?? names.length).join(", ");
}

/** What `delivery:quote` says about the pin: the area and its chain (the quote re-resolves the pin, it may land next door). */
export interface QuotedArea {
  destinationArea?: Pick<Area, "name" | "nameEn"> | null;
  destinationAreaChain?: AreaChain | null;
}

/**
 * The delivery area of an order, as text ("Gombe, Kinshasa"). The area the order was placed for
 * (`orders.destinationAreaId`, read as `stored`) always wins: a quote asked for the same pin today can resolve to the
 * neighbouring commune and would name another area than the one the customer chose. The quote is only the fallback for
 * an order without a stored area. "—" when neither is known.
 */
export function deliveryAreaText(stored: AreaChain | null | undefined, quote: QuotedArea | null | undefined, fr: boolean): string {
  if (stored?.length) return chainText(stored, fr, { skipLevels: ["district"] }) || "—";
  if (quote?.destinationAreaChain?.length) return chainText(quote.destinationAreaChain, fr, { skipLevels: ["district"] }) || "—";
  if (quote?.destinationArea) return areaName(quote.destinationArea, fr) || "—";
  return "—";
}
