/**
 * Estimated delivery. Each product carries the seller's delivery time in days (`deliveryDays`); an order is
 * expected by the order day (Kinshasa time) plus its slowest line. Shoppers never choose a date.
 */
export const DELIVERY_DAYS = { min: 1, max: 30, fallback: 3 } as const;

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
