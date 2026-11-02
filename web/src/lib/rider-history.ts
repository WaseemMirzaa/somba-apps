/**
 * The rider's history (finished tasks): search by order reference and a range of days. The web twin of the Flutter rider
 * app (`rider-app/lib/services/history_filter.dart`): same rules, same words. Pure functions; the page is `app/rider/history`.
 *
 * No imports: `npm test` loads this file on its own.
 */

/** "som-12 " matches "SOM-1234": case, spaces and a leading "#" are ignored. */
const norm = (s: string): string => s.toLowerCase().replace(/[\s#]/g, "");

/** Does `reference` contain what the rider typed? An empty query matches everything. */
export function matchesReference(reference: string, query: string): boolean {
  const q = norm(query);
  return q === "" || norm(reference).includes(q);
}

/** `YYYY-MM-DD` of a date in the viewer's own calendar (what an `<input type="date">` holds). */
export function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Is the ISO moment `iso` on one of the days from `from` to `to`, both included, as `YYYY-MM-DD` (either may be empty = open)?
 * Something with no (or an unreadable) date matches only when no day is asked for.
 */
export function inDayRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  const day = dayKey(d);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** When a finished leg ended: delivered, else last touched (a failure), else made. */
export const finishedAt = (t: { deliveredAt?: string | null; updatedAt?: string | null; createdAt?: string | null }): string | null => t.deliveredAt ?? t.updatedAt ?? t.createdAt ?? null;

/** When a run ended: closed, else every parcel received, else it left, else it was made. */
export const runFinishedAt = (r: { closedAt?: string | null; arrivedAt?: string | null; dispatchedAt?: string | null; createdAt?: string | null }): string | null =>
  r.closedAt ?? r.arrivedAt ?? r.dispatchedAt ?? r.createdAt ?? null;

export interface HistoryFilter {
  query: string;
  from: string;
  to: string;
}

export const EMPTY_HISTORY_FILTER: HistoryFilter = { query: "", from: "", to: "" };

export const isFiltering = (f: HistoryFilter): boolean => f.query.trim() !== "" || f.from !== "" || f.to !== "";

/** The finished tasks (`orderId` is the order reference on the web) that match the search and the days. */
export function filterFinishedTasks<T extends { orderId: string; deliveredAt?: string | null; updatedAt?: string | null; createdAt?: string | null }>(tasks: T[], f: HistoryFilter): T[] {
  return tasks.filter((t) => matchesReference(t.orderId, f.query) && inDayRange(finishedAt(t), f.from, f.to));
}

/** The finished runs that match: by the run's reference or by the order reference of any parcel inside, and by the days. */
export function filterFinishedRuns<R extends { reference: string; closedAt?: string | null; arrivedAt?: string | null; dispatchedAt?: string | null; createdAt?: string | null }>(
  runs: R[],
  parcelRefs: (run: R) => string[],
  f: HistoryFilter,
): R[] {
  return runs.filter((r) => (matchesReference(r.reference, f.query) || parcelRefs(r).some((ref) => matchesReference(ref, f.query))) && inDayRange(runFinishedAt(r), f.from, f.to));
}
