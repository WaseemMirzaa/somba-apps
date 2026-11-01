/** Pure helpers for the seller finance views (no database): line states, months, CSV. */

export const round2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2));

/**
 * Where one sold line stands on its way to the seller's pocket:
 *   in_progress  the parcel is still on its way (not earned yet)
 *   clearing     delivered, inside the hold (`payoutClearanceHours`); becomes withdrawable at `clearanceEndsAt`
 *   available    delivered and cleared, not on any payout yet
 *   in_payout    on the statement of a payout that is requested / being sent
 *   paid_out     on the statement of a payout that was paid
 *   returned     the order was returned: the sale is taken back
 */
export type EarningState = 'in_progress' | 'clearing' | 'available' | 'in_payout' | 'paid_out' | 'returned';
export const EARNING_STATES: readonly EarningState[] = ['in_progress', 'clearing', 'available', 'in_payout', 'paid_out', 'returned'];

/** Orders whose goods are still on their way. */
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'] as const;

export function lineState(
  line: { orderStatus: string; deliveredAt: Date | null; payoutStatus: string | null },
  holdHours: number,
  now = Date.now(),
): { state: EarningState; clearanceEndsAt: Date | null } {
  const clearanceEndsAt = line.orderStatus === 'delivered' && line.deliveredAt ? new Date(line.deliveredAt.getTime() + holdHours * 3_600_000) : null;
  if (line.orderStatus === 'returned') return { state: 'returned', clearanceEndsAt: null };
  if (line.payoutStatus === 'paid') return { state: 'paid_out', clearanceEndsAt };
  if (line.payoutStatus === 'requested' || line.payoutStatus === 'sending') return { state: 'in_payout', clearanceEndsAt };
  if (line.orderStatus !== 'delivered') return { state: 'in_progress', clearanceEndsAt: null };
  return { state: clearanceEndsAt && clearanceEndsAt.getTime() > now ? 'clearing' : 'available', clearanceEndsAt };
}

/** "YYYY-MM" check + the half-open UTC range [start, end) of that month. */
export function monthRange(month: unknown): { month: string; start: Date; end: Date } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month ?? ''));
  if (!m) throw new Error('Choose a month like 2026-10.');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y < 2020 || y > 2100) throw new Error('Choose a month like 2026-10.');
  return { month: `${m[1]}-${m[2]}`, start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

export const monthKey = (d: Date): string => d.toISOString().slice(0, 7);

/** The `n` months ending at `now`'s, newest first ("2026-10", "2026-09", ...). */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}

/** A date input (ISO, or YYYY-MM-DD for a whole day) as an instant; `endOfDay` makes a bare date inclusive. */
export function dateInput(v: unknown, endOfDay: boolean): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const t = Date.parse(bare ? `${s}T00:00:00.000Z` : s);
  if (!Number.isFinite(t)) throw new Error('That date is not valid.');
  return new Date(bare && endOfDay ? t + 86_400_000 - 1 : t);
}

/** One CSV cell: quoted when it holds a comma, quote, newline or leading/trailing space; formulas are defused. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v) : v;
  // A cell starting with = + - @ would run as a formula when opened in a spreadsheet.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text with a UTF-8 byte-order mark (so accents open correctly in Excel). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Money for a CSV or a document: plain "1234.50". */
export const fixed2 = (n: number) => round2(n).toFixed(2);
