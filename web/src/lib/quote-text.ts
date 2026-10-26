/**
 * Wording and shape helpers for the delivery quote card (`delivery:quote`, docs/contracts/areas.md): the fallback
 * note when the covering warehouse has no rider, and the route between warehouses with per-hop transit and cost.
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
  /** The lane's own cost; null = the standard transfer fee. Absent on an old server. */
  costUsd?: number | null;
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
  transferUsd?: number | null;
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
  /** What this hop costs: the lane's own cost, else the standard transfer fee when it can be worked out. */
  costUsd: number | null;
  /** True when `costUsd` is the standard transfer fee rather than a lane's own cost. */
  standardFee: boolean;
}

export interface RouteRow {
  /** Who it is for: the seller's area, "" when the quote has one route only. */
  label: string;
  hops: HopRow[];
  /** Hours for the whole route (sum of hops, or the origin's own `transitHours`). */
  transitHours: number | null;
}

const hopKey = (h: HopLike) => `${h.fromHubId || h.fromHubName || ""}>${h.toHubId || h.toHubName || ""}`;

/**
 * The fee of a hop with no lane cost. The quote does not send the `deliveryTransferUsd` setting, so it is worked out
 * from the total: `transferUsd` is paid once per DISTINCT hop, minus what the lanes with their own cost take.
 * Null when it cannot be worked out.
 */
export function standardHopFee(q: QuoteLike | null | undefined): number | null {
  if (!q || q.transferUsd == null || !Number.isFinite(q.transferUsd)) return null;
  const distinct = new Map<string, HopLike>();
  for (const chain of chainsOf(q)) for (const h of chain.hops) distinct.set(hopKey(h), h);
  const rows = [...distinct.values()];
  const standard = rows.filter((h) => h.costUsd == null);
  if (standard.length === 0) return null;
  const custom = rows.reduce((n, h) => n + (h.costUsd ?? 0), 0);
  const left = q.transferUsd - custom;
  if (!Number.isFinite(left) || left < -0.005) return null;
  return Math.round((Math.max(0, left) / standard.length) * 100) / 100;
}

function chainsOf(q: QuoteLike): { label: OriginLike | null; hops: HopLike[]; transitHours: number | null }[] {
  const origins = (q.origins ?? []).filter((o) => (o.hops ?? []).length > 0);
  if (origins.length > 0) return origins.map((o) => ({ label: o, hops: o.hops ?? [], transitHours: o.transitHours ?? null }));
  if ((q.hops ?? []).length > 0) return [{ label: null, hops: q.hops ?? [], transitHours: null }];
  return [];
}

/** One route per seller that travels (or the quote's single chain on an older server), each hop with transit and cost. */
export function quoteRoutes(q: QuoteLike | null | undefined, fr: boolean): RouteRow[] {
  if (!q) return [];
  const chains = chainsOf(q);
  const fee = standardHopFee(q);
  return chains.map((c) => {
    const hops: HopRow[] = c.hops.map((h) => ({
      from: h.fromHubName ?? "",
      to: h.toHubName ?? "",
      transitHours: h.transitHours != null && Number.isFinite(h.transitHours) ? h.transitHours : null,
      costUsd: h.costUsd != null ? h.costUsd : fee,
      standardFee: h.costUsd == null && fee != null,
    }));
    const sum = hops.every((h) => h.transitHours != null) ? hops.reduce((n, h) => n + (h.transitHours ?? 0), 0) : null;
    return {
      label: chains.length > 1 && c.label ? originAreaName(c.label, fr) || (c.label.hubName ?? "") : "",
      hops,
      transitHours: c.transitHours ?? sum,
    };
  });
}
