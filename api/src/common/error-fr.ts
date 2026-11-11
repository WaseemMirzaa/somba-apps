/**
 * The server explains its errors in French: `errorFr(message)` is the French version of an English error sentence,
 * or `null` when the dictionary does not know it. Nothing here changes what the server throws or returns; the
 * socket acks (`errorFr`) and the HTTP error body (`messageFr`) carry the result next to the English text, so a
 * client that reads French shows it without a list of its own (contract: `docs/contracts/error-text.md`).
 *
 * The dictionary is `error-fr-exact.ts` (whole sentences) and `error-fr-rules.ts` (sentences with a number, a name
 * or a status in them); `error-fr.spec.ts` fails when a message a user can see has no French.
 */

import { ERROR_FR_EXACT } from './error-fr-exact';
import { ERROR_FR_RULES } from './error-fr-rules';

/** Sentences longer than this are free text somebody typed, never one of ours. */
const MAX_LENGTH = 600;

/** Trim, collapse spaces and fold curly apostrophes, so a sentence is found however it was typed. */
const normalise = (m: string): string => m.trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'");

const EXACT = new Map<string, string>(Object.entries(ERROR_FR_EXACT).map(([k, v]) => [normalise(k), v]));

/** The French version of an English error message, or null when it is not one the server knows. */
export function errorFr(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const msg = normalise(message);
  if (!msg || msg.length > MAX_LENGTH) return null;
  const exact = EXACT.get(msg);
  if (exact) return exact;
  for (const [re, build] of ERROR_FR_RULES) {
    const m = re.exec(msg);
    if (!m) continue;
    const fr = build(m);
    // A rule that gives the sentence back untouched (an unknown part inside it) did not translate it.
    if (fr && normalise(fr) !== msg) return fr;
  }
  return null;
}

/**
 * The French version of a list of messages (class-validator reports one per field): all of them or null, so a client
 * never shows half a list in one language.
 */
export function errorFrList(messages: readonly unknown[]): string[] | null {
  if (!messages.length) return null;
  const out: string[] = [];
  for (const m of messages) {
    const fr = errorFr(m);
    if (fr === null) return null;
    out.push(fr);
  }
  return out;
}

/** Add `errorFr` to a failure ack (`{ ok: false, error }`) when the dictionary knows the message; any other value comes back as it was. */
export function withErrorFr<T>(ack: T): T {
  if (!ack || typeof ack !== 'object') return ack;
  const a = ack as { ok?: unknown; error?: unknown; errorFr?: unknown };
  if (a.ok !== false || typeof a.error !== 'string' || a.errorFr !== undefined) return ack;
  const fr = errorFr(a.error);
  return fr === null ? ack : ({ ...a, errorFr: fr } as T);
}

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** How deep and how wide {@link withNestedFr} looks: acks are small; a long list is data, not a list of refusals. */
const NESTED_DEPTH = 3;
const NESTED_ITEMS = 100;

/**
 * Inside a successful ack, a refusal that sits in the data (`{ ok: false, reason }` for a promo code, a line of a stock
 * check, a payout of a batch) gets `reasonFr` / `errorFr` next to its `reason` / `error`. Plain objects and arrays only,
 * nothing is changed in place (an object with something to add is copied), and a result with nothing to add is
 * returned as the same object.
 */
export function withNestedFr<T>(value: T, depth = 0): T {
  if (depth > NESTED_DEPTH) return value;
  if (Array.isArray(value)) {
    if (value.length > NESTED_ITEMS) return value;
    let changed: unknown[] | null = null;
    value.forEach((item, i) => {
      const next = withNestedFr(item, depth + 1);
      if (next !== item) (changed ??= value.slice())[i] = next;
    });
    return (changed ?? value) as T;
  }
  if (!isPlain(value)) return value;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(value)) {
    if ((k === 'reason' || k === 'error') && typeof v === 'string') {
      const key = `${k}Fr`;
      if (value[key] === undefined) {
        const fr = errorFr(v);
        if (fr !== null) (out ??= { ...value })[key] = fr;
      }
    } else if (v && typeof v === 'object') {
      const next = withNestedFr(v, depth + 1);
      if (next !== v) (out ??= { ...value })[k] = next;
    }
  }
  return (out ?? value) as T;
}

/** Everything a socket ack gets: `errorFr` on a failure, `reasonFr` / `errorFr` on refusals nested in a success. */
export function ackWithFr<T>(ack: T): T {
  if (!isPlain(ack)) return ack;
  if (ack.ok === false) return withErrorFr(ack);
  if (ack.ok === true && ack.data && typeof ack.data === 'object') {
    const data = withNestedFr(ack.data);
    return data === ack.data ? ack : ({ ...ack, data } as T);
  }
  return ack;
}
