/**
 * Optional `limit` / `offset` for list events. Lists keep returning a plain
 * array; when a client sends nothing it still gets a generous page
 * (DEFAULT_LIMIT) so existing apps are unaffected, and no client can ask for
 * an unbounded read (MAX_LIMIT).
 */
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 1000;

export interface Page {
  take: number;
  skip: number;
}

export function pageOf(body: unknown, opts: { def?: number; max?: number } = {}): Page {
  const max = opts.max ?? MAX_LIMIT;
  const def = Math.min(opts.def ?? DEFAULT_LIMIT, max);
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const l = Number(b.limit);
  const o = Number(b.offset);
  const take = Number.isFinite(l) && l >= 1 ? Math.min(Math.floor(l), max) : def;
  const skip = Number.isFinite(o) && o >= 0 ? Math.min(Math.floor(o), 10_000_000) : 0;
  return { take, skip };
}
