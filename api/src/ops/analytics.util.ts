/** Pure helpers for the analytics service (no database): day buckets, rates, store health. */

export const round2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2));
export const round1 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(1));

/** 'YYYY-MM-DD' of a Date in UTC. */
export const utcDayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Start of the UTC day containing `d`. */
export const startOfUtcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * The last `days` UTC days ending today (oldest first), plus the instant just
 * before the first one starts. `from` is 1 ms early on purpose: SQLite keeps
 * timestamps as text ('2026-10-17 00:00:00' with or without milliseconds) and a
 * row stamped exactly at midnight must still be inside the window.
 */
export function lastDays(days: number, now = new Date()): { keys: string[]; from: Date; fromKey: string } {
  const n = Math.min(Math.max(Math.floor(days) || 1, 1), 366);
  const today = startOfUtcDay(now).getTime();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(utcDayKey(new Date(today - i * 86_400_000)));
  return { keys, from: new Date(today - (n - 1) * 86_400_000 - 1), fromKey: keys[0] };
}

/** A `days` request parameter: integer within [1, max], else the default. */
export function clampDays(x: unknown, def: number, max = 90): number {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : def;
}

/** What a grouped "day" column holds, as 'YYYY-MM-DD' (strings from CAST, or a Date from a driver). */
export function dayKeyOf(v: unknown): string {
  if (v instanceof Date) return utcDayKey(v);
  return String(v ?? '').slice(0, 10);
}

/** Zero-filled daily series: one row per key, taking values from `rows` (keyed by day). */
export function fillDays<T extends Record<string, number>>(
  keys: string[],
  rows: Iterable<{ day: unknown; [k: string]: unknown }>,
  zero: T,
): ({ date: string } & T)[] {
  const byDay = new Map<string, { [k: string]: unknown }>();
  for (const r of rows) byDay.set(dayKeyOf(r.day), r);
  return keys.map((date) => {
    const r = byDay.get(date);
    const out: Record<string, number | string> = { date };
    for (const k of Object.keys(zero)) {
      const v = Number(r?.[k] ?? 0);
      out[k] = round2(Number.isFinite(v) ? v : 0);
    }
    return out as { date: string } & T;
  });
}

/** Percentage of a over b with one decimal; 0 when b is 0. */
export const pct = (a: number, b: number): number => (b > 0 ? round1((a / b) * 100) : 0);

/** Any date-ish value coming back from a raw query as a Date (SQLite returns UTC text). */
export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export interface HealthInputs {
  /** Orders in the window (nothing to judge without them). */
  orders: number;
  avgHoursToReady: number | null;
  cancelRatePct: number;
  /** Return + dispute requests per 100 orders. */
  problemRatePct: number;
  ratingAvg: number | null;
  ratingCount: number;
  repeatRatePct: number | null;
}

export interface StoreHealth {
  /** 0-100, null when there is nothing to judge yet. */
  score: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  components: { key: string; score: number; weight: number; value: number }[];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Linear score: 100 at `best`, 0 at `worst` (either direction). */
const scale = (v: number, best: number, worst: number) => Math.round(clamp01((v - worst) / (best - worst)) * 100);

/**
 * STORE HEALTH SCORE (0-100) — documented formula:
 *
 *   component              100 points at     0 points at     weight
 *   ready      speed to pack   <= 12 h       >= 72 h         25 %   (avg hours order -> "ready")
 *   cancel     cancel rate     0 %           >= 20 %         25 %   (cancelled / orders)
 *   problems   return+dispute  0 %           >= 15 %         20 %   (orders with a return or dispute / orders)
 *   reviews    average rating  5.0           <= 2.0          20 %   (visible reviews, all time)
 *   repeat     repeat buyers   >= 30 %       0 %             10 %   (customers with > 1 order / customers)
 *
 * Linear in between. A component with no data (no order was ever marked ready,
 * no review yet…) is left out and the remaining weights are re-normalised, so a
 * new store is not punished for what has not happened yet. With no orders and no
 * reviews at all the score is null. Grade: A >= 85, B >= 70, C >= 55, else D.
 */
export function computeStoreHealth(m: HealthInputs): StoreHealth {
  const parts: { key: string; score: number; weight: number; value: number }[] = [];
  if (m.avgHoursToReady !== null) parts.push({ key: 'ready', score: scale(m.avgHoursToReady, 12, 72), weight: 0.25, value: round1(m.avgHoursToReady) });
  if (m.orders > 0) {
    parts.push({ key: 'cancel', score: scale(m.cancelRatePct, 0, 20), weight: 0.25, value: m.cancelRatePct });
    parts.push({ key: 'problems', score: scale(m.problemRatePct, 0, 15), weight: 0.2, value: m.problemRatePct });
  }
  if (m.ratingAvg !== null && m.ratingCount > 0) parts.push({ key: 'reviews', score: scale(m.ratingAvg, 5, 2), weight: 0.2, value: round2(m.ratingAvg) });
  if (m.repeatRatePct !== null && m.orders > 0) parts.push({ key: 'repeat', score: scale(m.repeatRatePct, 30, 0), weight: 0.1, value: m.repeatRatePct });
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  if (!weight) return { score: null, grade: null, components: [] };
  const score = Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / weight);
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', components: parts };
}

export type AlertSeverity = 'info' | 'warning' | 'critical';
export interface AdminAlert {
  kind: string;
  severity: AlertSeverity;
  count: number;
  message: string;
  messageFr: string;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Keep alerts that have something to report, most severe first. */
export function sortAlerts(alerts: AdminAlert[]): AdminAlert[] {
  return alerts
    .filter((a) => a.count > 0)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count);
}
