/**
 * Estimated delivery = the seller's PREPARATION time + the platform's TRANSIT time for the route. Each product carries
 * `prepDays` (0-30); a store adds its handling days; the platform adds `localDeliveryDays` (hub -> customer) plus the days
 * parcels spend between warehouses. An order is expected by the order day (Kinshasa time) plus its slowest seller.
 * Shoppers never choose a date.
 *
 * `deliveryDays` is the LEGACY figure (`prep + local`, at least 1, no handling): still served and written so the web wizard
 * and old apps round-trip it exactly.
 */
export const DELIVERY_DAYS = { min: 1, max: 30, fallback: 3 } as const;
/** A product's preparation time: 0 is allowed (ships the same day); unset uses the fallback. */
export const PREP_DAYS = { min: 0, max: 30, fallback: 2 } as const;
/** Platform days from the hub to the customer (`localDeliveryDays`). */
export const LOCAL_DAYS = { min: 0, max: 30, fallback: 1 } as const;

/** Kinshasa is UTC+1 all year (no DST). */
const TZ_OFFSET_MIN = 60;

/** Local calendar day (YYYY-MM-DD) `plusDays` after `now`, in Kinshasa time. */
export function localDay(now: Date, plusDays = 0): string {
  return new Date(now.getTime() + TZ_OFFSET_MIN * 60_000 + plusDays * 86_400_000).toISOString().slice(0, 10);
}

/** A product's delivery time, clamped to the allowed range (unset or broken values use the fallback). */
export function deliveryDaysOf(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < DELIVERY_DAYS.min) return DELIVERY_DAYS.fallback;
  return Math.min(DELIVERY_DAYS.max, Math.round(n));
}

/**
 * The day an order with lines taking `days` is expected (YYYY-MM-DD): order day + the slowest line (+ `extraDays` when the
 * parcels travel between two cities), never more than {@link DELIVERY_DAYS}.max in total.
 */
export function estimatedDeliveryDate(days: unknown[], now = new Date(), extraDays = 0): string {
  const slowest = days.length ? Math.max(...days.map(deliveryDaysOf)) : DELIVERY_DAYS.fallback;
  const extra = Number.isFinite(extraDays) && extraDays > 0 ? Math.round(extraDays) : 0;
  return localDay(now, Math.min(DELIVERY_DAYS.max, slowest + extra));
}

// ── preparation + transit ───────────────────────────────────────────────────────────────────────────────────────────

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/** The platform's local transit days from the setting (unset or broken = 1). 0 is a valid value. */
export function localDaysOf(value: unknown): number {
  if (value === null || value === undefined || value === '') return LOCAL_DAYS.fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= LOCAL_DAYS.min ? clampInt(n, LOCAL_DAYS.min, LOCAL_DAYS.max) : LOCAL_DAYS.fallback;
}

/**
 * A product's preparation time in days (0-30; 0 is real, never turned into the fallback). When `prepDays` is missing it is
 * derived from the legacy `deliveryDays` (`deliveryDays - local`), and otherwise it is {@link PREP_DAYS}.fallback.
 */
export function prepDaysOf(prepDays: unknown, legacyDeliveryDays?: unknown, local: number = LOCAL_DAYS.fallback): number {
  if (prepDays !== null && prepDays !== undefined && prepDays !== '') {
    const n = Number(prepDays);
    if (Number.isFinite(n) && n >= PREP_DAYS.min) return clampInt(n, PREP_DAYS.min, PREP_DAYS.max);
  }
  if (legacyDeliveryDays !== null && legacyDeliveryDays !== undefined && legacyDeliveryDays !== '') {
    const n = Number(legacyDeliveryDays);
    if (Number.isFinite(n) && n >= DELIVERY_DAYS.min) return clampInt(n - local, PREP_DAYS.min, PREP_DAYS.max);
  }
  return PREP_DAYS.fallback;
}

/** A store's handling days, 0-14 (see `MAX_HANDLING_DAYS`). */
export function handlingDaysOf(value: unknown, max = 14): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

/** The legacy `deliveryDays` of a product: preparation + local transit, never below 1 or above 30 (no handling). */
export function legacyDeliveryDays(prep: number, local: number): number {
  return Math.min(DELIVERY_DAYS.max, Math.max(DELIVERY_DAYS.min, prep + local));
}

/** What shoppers see on a product: preparation + the store's handling + local transit, 1-30. */
export function totalDays(prep: number, handling: number, local: number): number {
  return Math.min(DELIVERY_DAYS.max, Math.max(DELIVERY_DAYS.min, prep + handling + local));
}

/** The prep a legacy `deliveryDays` write means: `deliveryDays - local`, 0-30 (so the served legacy figure round-trips exactly). */
export function prepFromLegacy(deliveryDays: number, local: number): number {
  return clampInt(deliveryDays - local, PREP_DAYS.min, PREP_DAYS.max);
}

/**
 * The platform's days for one seller's route: express = `expressDays`; standard = the local days plus `extraDays` (the lane
 * transit rounded up to days, the inter-city allowance when no lane says, or 0).
 */
export function routeDaysFor(opts: { local: number; extraDays?: number; express?: boolean; expressDays?: number }): number {
  if (opts.express) return Math.max(0, Math.round(Number(opts.expressDays) || 0));
  const extra = Number.isFinite(opts.extraDays) && (opts.extraDays as number) > 0 ? Math.round(opts.extraDays as number) : 0;
  return Math.max(0, Math.round(opts.local)) + extra;
}

/** One seller's side of an order: its slowest preparation, its handling and the platform days its parcels travel. */
export interface EstimatePart {
  prep: number;
  handling?: number;
  route: number;
}

/** Days for one seller: `prep + handling + route`, at most 30. */
export const partDays = (p: EstimatePart): number => Math.min(DELIVERY_DAYS.max, Math.max(0, p.prep + (p.handling ?? 0) + p.route));

/**
 * The order's estimate from its per-seller parts: the SLOWEST seller decides (`max over sellers of prep + handling + route`),
 * at most 30 days. `now` is the moment counting starts (an express order passes the hub's next working moment). Returns
 * the deciding part, its days and the date (YYYY-MM-DD, Kinshasa).
 */
export function estimateFromParts(parts: EstimatePart[], now = new Date()): { days: number; date: string; deciding: EstimatePart | null } {
  if (!parts.length) return { days: DELIVERY_DAYS.fallback, date: localDay(now, DELIVERY_DAYS.fallback), deciding: null };
  let deciding = parts[0];
  for (const p of parts) if (partDays(p) > partDays(deciding)) deciding = p;
  const days = partDays(deciding);
  return { days, date: localDay(now, days), deciding };
}
