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

/**
 * Expected day for lines taking these delivery times (the slowest wins). `extraDays` is what the route between
 * warehouses adds (the quote's `extraDays`: the lanes' transit rounded up, or the inter-city allowance).
 */
export function estimateFor(days: unknown[], now = new Date(), extraDays = 0): string {
  const extra = Number.isFinite(extraDays) && extraDays > 0 ? Math.ceil(extraDays) : 0;
  return localDayPlus((days.length ? Math.max(...days.map(deliveryDaysOf)) : DELIVERY_DAYS.fallback) + extra, now);
}

/** "Mon 26 Oct" / "lun. 26 oct." for a stored YYYY-MM-DD day; null when missing or malformed. */
export function dayLabel(ymd: string | null | undefined, fr: boolean): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(fr ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Delivery time = the seller's preparation + the platform's transit (api/src/common/delivery/estimate.ts).
 * The seller sets `prepDays` (0 to 30); the route (`localDeliveryDays`, lanes, express) is added by the platform.
 */
export const PREP_DAYS = { min: 0, max: 30, fallback: 2 } as const;
/** The platform's default for hub -> customer days, used until the public setting `localDeliveryDays` is read. */
export const LOCAL_DAYS_FALLBACK = 1;

/** A whole number 0 to 30 (a blank or non-numeric value is not one). */
export function isPrepDays(value: unknown): value is number {
  if (value === null || value === undefined || value === "") return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= PREP_DAYS.min && n <= PREP_DAYS.max;
}

/**
 * A product's preparation days: its `prepDays` when the server sends it (0 is a real answer); an old server only
 * sends the legacy `deliveryDays` (= prep + local), so the platform's local days come off it; else the default.
 */
export function prepDaysOf(p: { prepDays?: unknown; deliveryDays?: unknown } | null | undefined, localDays: number = LOCAL_DAYS_FALLBACK): number {
  if (p && isPrepDays(p.prepDays)) return Number(p.prepDays);
  const legacy = Number(p?.deliveryDays);
  if (p && p.deliveryDays !== null && p.deliveryDays !== undefined && Number.isFinite(legacy) && legacy >= 1) {
    const local = Number.isFinite(localDays) && localDays >= 0 ? Math.round(localDays) : LOCAL_DAYS_FALLBACK;
    return Math.min(PREP_DAYS.max, Math.max(PREP_DAYS.min, Math.round(legacy) - local));
  }
  return PREP_DAYS.fallback;
}

/**
 * The expected day to show: the server's own date when it sent one (the quote's `estimatedDeliveryDate`, the day
 * `orders:create` will stamp), otherwise the client's estimate from the lines.
 */
export function chooseEstimate(serverDay: string | null | undefined, fallback: () => string): string {
  return serverDay && /^\d{4}-\d{2}-\d{2}$/.test(serverDay) ? serverDay : fallback();
}
