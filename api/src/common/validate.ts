/**
 * Input validation for WebSocket payloads. The global ValidationPipe only covers
 * HTTP DTOs, so every handler must validate what it accepts from the client.
 * All helpers throw an Error with a message that is safe to show the user.
 */

/** A finite number within [min, max] (optionally an integer). */
export function num(
  x: unknown,
  field: string,
  opts: { min?: number; max?: number; int?: boolean } = {},
): number {
  const n = typeof x === 'number' ? x : Number(x);
  const { min = -Infinity, max = Infinity, int = false } = opts;
  if (x === null || x === undefined || x === '' || !Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    const range = Number.isFinite(min) && Number.isFinite(max) ? ` between ${min} and ${max}` : Number.isFinite(min) ? ` of at least ${min}` : '';
    throw new Error(`${field} must be ${int ? 'a whole number' : 'a number'}${range}.`);
  }
  return n;
}

/** Money in USD: > 0, <= 1,000,000, rounded to cents. */
export function price(x: unknown, field = 'Price'): number {
  return Number(num(x, field, { min: 0.01, max: 1_000_000 }).toFixed(2));
}

/** A non-empty trimmed string within [min, max] characters. */
export function str(x: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
  const { min = 1, max = 500 } = opts;
  const s = typeof x === 'string' ? x.trim() : '';
  if (s.length < min || s.length > max) {
    throw new Error(`${field} must be ${min === max ? `${min}` : `${min}-${max}`} characters.`);
  }
  return s;
}

/** An optional string: undefined/null/'' -> null, otherwise validated. */
export function optStr(x: unknown, field: string, max = 500): string | null {
  if (x === undefined || x === null || x === '') return null;
  return str(x, field, { min: 1, max });
}

/** One of a closed set of values. */
export function oneOf<T extends string>(x: unknown, allowed: readonly T[], field: string): T {
  if (typeof x !== 'string' || !(allowed as readonly string[]).includes(x)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return x as T;
}

/** Copy only the listed keys (drop everything else a client may have sent). */
export function pick<T extends object, K extends keyof T>(obj: unknown, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k as string];
      if (v !== undefined) out[k] = v as T[K];
    }
  }
  return out;
}
