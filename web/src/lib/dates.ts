/**
 * Timestamps from the API are UTC instants (`2026-10-22T13:38:02.221Z`).
 * Show them in the viewer's time zone: slicing the ISO text prints UTC wall
 * time, which is hours off for anyone not on UTC (an order placed at 18:38 in
 * Karachi read "13:38"). Charts that bucket by UTC day say so and keep UTC.
 */

type DateInput = string | number | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, "0");

/** A bare calendar date ('2026-10-22') is not an instant: never shift it. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' of the instant in the viewer's time zone ('' when empty; unparseable text as-is). */
export function localDay(v: DateInput): string {
  if (typeof v === "string" && CALENDAR_DATE.test(v)) return v;
  const d = toDate(v);
  if (!d) return v == null ? "" : String(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD HH:mm' of the instant in the viewer's time zone ('' when empty; unparseable text as-is). */
export function localDateTime(v: DateInput): string {
  if (typeof v === "string" && CALENDAR_DATE.test(v)) return v;
  const d = toDate(v);
  if (!d) return v == null ? "" : String(v);
  return `${localDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
