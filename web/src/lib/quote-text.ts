/**
 * Wording and shape helpers for the delivery quote card (`delivery:quote`, docs/contracts/areas.md): the fallback
 * note when the covering warehouse has no rider, and the route between warehouses with per-hop transit time.
 *
 * Customers see ONE fee line, "Platform commission" ({@link platformFee}, {@link platformFeeLabel}); the server no longer
 * sends them how it is made up (no hop costs, transfer, distance part), so nothing here prices a hop.
 *
 * No imports: `npm test` loads this file on its own.
 */

export type QuoteFallback = null | "city" | "nearest" | "no_riders";

export interface HopLike {
  fromHubId?: string | null;
  fromHubName?: string | null;
  toHubId?: string | null;
  toHubName?: string | null;
  /** How long the lane takes (hours). Absent on an old server. */
  transitHours?: number | null;
}

export interface OriginLike {
  sellerId?: string;
  hubId?: string | null;
  hubName?: string | null;
  areaName?: string | null;
  areaNameEn?: string | null;
  fallback?: QuoteFallback | string | null;
  coveringHubId?: string | null;
  coveringHubName?: string | null;
  hops?: HopLike[] | null;
  transitHours?: number | null;
}

export interface QuoteLike {
  fallback?: QuoteFallback | string | null;
  coveringHubName?: string | null;
  destinationHubName?: string | null;
  destinationHub?: { name: string } | null;
  /** Older shape: one chain for the whole quote. */
  hops?: HopLike[] | null;
  origins?: OriginLike[] | null;
}

/** Transit time as people say it: "4 h", "1 d 12 h" ("1 j 12 h" in French). */
export function formatTransit(hours: number | null | undefined, fr: boolean): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h ? `${d} ${fr ? "j" : "d"} ${h} h` : `${d} ${fr ? "j" : "d"}`;
}

/**
 * "~4 h" for a hop's transit time, or null when there is nothing to say: the server did not send it, or it is 0 (a direct
 * transfer with no lane configured has no known transit, and "~0 min" would read as a promise).
 */
export function hopTransitText(hours: number | null | undefined, fr: boolean): string | null {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null;
  return `~${formatTransit(hours, fr)}`;
}

const hasName = (s: string | null | undefined): s is string => typeof s === "string" && s.trim() !== "";

/**
 * Why a warehouse other than the covering one delivers: "{covering} has no rider available right now — delivered from
 * {destination}." Old servers that do not name the warehouses get the earlier generic sentence.
 */
export function quoteFallbackNote(q: QuoteLike | null | undefined, fr: boolean): string | null {
  const kind = q?.fallback;
  if (!q || !kind) return null;
  if (kind === "no_riders") {
    return fr
      ? "Aucun entrepôt proche n'a de livreur disponible pour le moment. Votre commande est acceptée et notre équipe est prévenue."
      : "No warehouse nearby has riders available right now. Your order is still accepted and our team has been alerted.";
  }
  if (kind !== "city" && kind !== "nearest") return null;
  const covering = hasName(q.coveringHubName) ? q.coveringHubName : null;
  const dest = hasName(q.destinationHubName) ? q.destinationHubName : hasName(q.destinationHub?.name) ? q.destinationHub!.name : null;
  if (covering && dest) {
    return fr
      ? `${covering} n'a pas de livreur disponible pour le moment — livraison depuis ${dest}.`
      : `${covering} has no rider available right now — delivered from ${dest}.`;
  }
  const who = covering ?? (fr ? "L'entrepôt qui couvre votre zone" : "The warehouse covering your area");
  if (kind === "city") {
    return fr
      ? `${who} n'a pas de livreur disponible pour le moment : un autre entrepôt de votre ville livrera.`
      : `${who} has no rider available right now: another warehouse of your city will deliver.`;
  }
  return fr
    ? `${who} n'a pas de livreur disponible pour le moment : l'entrepôt de votre province le plus proche en capacité livrera.`
    : `${who} has no rider available right now: the nearest staffed warehouse of your province will deliver.`;
}

/** The pickup side of the same fallback, for one seller: "{covering} has no rider available right now — collected by {origin}." */
export function originFallbackNote(o: OriginLike | null | undefined, fr: boolean): string | null {
  const kind = o?.fallback;
  if (!o || (kind !== "city" && kind !== "nearest")) return null;
  if (!hasName(o.coveringHubName) || !hasName(o.hubName) || o.coveringHubName === o.hubName) return null;
  return fr
    ? `${o.coveringHubName} n'a pas de livreur disponible pour le moment — collecte par ${o.hubName}.`
    : `${o.coveringHubName} has no rider available right now — collected by ${o.hubName}.`;
}

/** The seller's area in the reader's language (the origin row carries both names). */
export const originAreaName = (o: OriginLike, fr: boolean): string => (fr ? o.areaName : o.areaNameEn || o.areaName) ?? "";

export interface HopRow {
  from: string;
  to: string;
  /** Hours the lane takes; null when the server did not say (old server). */
  transitHours: number | null;
}

export interface RouteRow {
  /** Who it is for: the seller's area, "" when the quote has one route only. */
  label: string;
  hops: HopRow[];
  /** Hours for the whole route (sum of hops, or the origin's own `transitHours`). */
  transitHours: number | null;
}

function chainsOf(q: QuoteLike): { label: OriginLike | null; hops: HopLike[]; transitHours: number | null }[] {
  const origins = (q.origins ?? []).filter((o) => (o.hops ?? []).length > 0);
  if (origins.length > 0) return origins.map((o) => ({ label: o, hops: o.hops ?? [], transitHours: o.transitHours ?? null }));
  if ((q.hops ?? []).length > 0) return [{ label: null, hops: q.hops ?? [], transitHours: null }];
  return [];
}

/** One route per seller that travels (or the quote's single chain on an older server), each hop with its transit time. */
export function quoteRoutes(q: QuoteLike | null | undefined, fr: boolean): RouteRow[] {
  if (!q) return [];
  const chains = chainsOf(q);
  return chains.map((c) => {
    const hops: HopRow[] = c.hops.map((h) => ({
      from: h.fromHubName ?? "",
      to: h.toHubName ?? "",
      transitHours: h.transitHours != null && Number.isFinite(h.transitHours) ? h.transitHours : null,
    }));
    const sum = hops.every((h) => h.transitHours != null) ? hops.reduce((n, h) => n + (h.transitHours ?? 0), 0) : null;
    return {
      label: chains.length > 1 && c.label ? originAreaName(c.label, fr) || (c.label.hubName ?? "") : "",
      hops,
      transitHours: c.transitHours ?? sum,
    };
  });
}

/** The ONE fee row of every customer totals list (cart, checkout, payment, order): the sum of every fee the customer pays, delivery included. */
export const platformFeeLabel = (fr: boolean): string => (fr ? "Commission de la plateforme" : "Platform commission");

/**
 * The fee to show for a quote or an order: `platformFeeUsd` (what the server sums for customers), else the total fee an
 * older server sends (`feeUsd` on a quote, `deliveryFee` / `deliveryFeeUsd` on an order). 0 when there is none.
 */
export function platformFee(x: { platformFeeUsd?: number | null; feeUsd?: number | null; deliveryFeeUsd?: number | null; deliveryFee?: number | null } | null | undefined): number {
  if (!x) return 0;
  for (const v of [x.platformFeeUsd, x.feeUsd, x.deliveryFeeUsd, x.deliveryFee]) if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

/** Where the parcel comes from, in the short fee check on a product page: "Express · straight from the store" or "from Hub". Empty when unknown. */
export function feeOriginText(q: { deliveryMode?: string | null; destinationHubName?: string | null; destinationHub?: { name: string } | null } | null | undefined, fr: boolean): string {
  if (!q) return "";
  if (q.deliveryMode === "express") return fr ? "Express · directement depuis la boutique" : "Express · straight from the store";
  const hub = hasName(q.destinationHubName) ? q.destinationHubName : hasName(q.destinationHub?.name) ? q.destinationHub!.name : null;
  return hub ? `${fr ? "depuis" : "from"} ${hub}` : "";
}
