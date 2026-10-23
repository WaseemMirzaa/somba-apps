/**
 * Estimated delivery (mirrors api/src/common/delivery/estimate.ts). The seller sets each product's delivery time
 * in days; an order is expected on the order day (Kinshasa time, UTC+1) plus its slowest line. Shoppers never
 * choose a date.
 */
export const DELIVERY_DAYS = { min: 1, max: 30, fallback: 3 } as const;

export function deliveryDaysOf(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < DELIVERY_DAYS.min) return DELIVERY_DAYS.fallback;
  return Math.min(DELIVERY_DAYS.max, Math.round(n));
}

/** The Kinshasa calendar day (YYYY-MM-DD) `plusDays` from now. */
export function localDayPlus(plusDays: number, now = new Date()): string {
  return new Date(now.getTime() + 60 * 60_000 + plusDays * 86_400_000).toISOString().slice(0, 10);
}

/** Expected day for lines taking these delivery times (the slowest wins). */
export function estimateFor(days: unknown[], now = new Date()): string {
  return localDayPlus(days.length ? Math.max(...days.map(deliveryDaysOf)) : DELIVERY_DAYS.fallback, now);
}

/** "Mon 26 Oct" / "lun. 26 oct." for a stored YYYY-MM-DD day; null when missing or malformed. */
export function dayLabel(ymd: string | null | undefined, fr: boolean): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(fr ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
