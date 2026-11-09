/**
 * One "Pay" = one order (audit C-01).
 *
 * Every checkout attempt carries an idempotency key (`clientRequestId`, a UUID made on the first click and sent
 * unchanged on every retry of that attempt). The API returns the SAME order for the same key, never a second order or
 * a second charge. `orders:create` may legitimately take long (the server waits on the payment provider), so it gets
 * a long time limit, and when even that passes the page asks the server what became of the attempt
 * (`orders:byRequest`) before telling the shopper anything.
 */

/** How long `orders:create` may take (the server can wait 15 s, and a retry, on the payment provider). */
export const PLACE_ORDER_TIMEOUT_MS = 45_000;

type Request = <T>(event: string, body?: unknown, opts?: { timeoutMs?: number }) => Promise<T>;

/** A failure whose outcome is not known (no answer, or "still processing"): the same key must be kept for the retry. */
export class AttemptUnknownError extends Error {
  readonly outcomeUnknown = true;
}

/** A random (version 4) UUID. */
export function newAttemptKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** socket.io's ack timeout ("operation has timed out"), as opposed to a refusal the server sent. */
export function isNoAnswer(e: unknown): boolean {
  const err = e as { raw?: unknown; message?: unknown } | null;
  return !!err && err.raw === undefined && /timed out|timeout/i.test(String(err.message ?? ""));
}

/** Whether the attempt's result is still open after this error (keep the key), or the server answered (new key next time). */
export function outcomeUnknown(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  // `order_processing`: the server says an earlier request with this key is still running.
  return e instanceof AttemptUnknownError || isNoAnswer(e) || err?.code === "order_processing" || err?.message === "Socket not connected.";
}

const TEXT = {
  processing: {
    en: "We have not heard back yet: your order may still be going through. Check My orders before you try again.",
    fr: "Nous n'avons pas encore de réponse : votre commande est peut-être en cours. Consultez Mes commandes avant de réessayer.",
  },
  unknown: {
    en: "We could not find out whether your order was placed. Check My orders before you try again.",
    fr: "Nous n'avons pas pu savoir si votre commande a été passée. Consultez Mes commandes avant de réessayer.",
  },
  notSent: {
    en: "Your order did not reach us and nothing was charged. Check your connection and try again.",
    fr: "Votre commande ne nous est pas parvenue et rien n'a été débité. Vérifiez votre connexion et réessayez.",
  },
  failed: {
    en: "This order did not go through and nothing was charged. Please place it again.",
    fr: "Cette commande n'a pas abouti et rien n'a été débité. Veuillez la passer à nouveau.",
  },
} as const;

/**
 * `orders:create` with the attempt's key. On no answer it asks `orders:byRequest`: the order when it was placed,
 * otherwise an error that says plainly what is known (an {@link AttemptUnknownError} when the result is still open).
 */
export async function placeOrderAttempt<T>(request: Request, input: Record<string, unknown>, key: string, fr: boolean): Promise<T> {
  const lang = fr ? "fr" : "en";
  try {
    return await request<T>("orders:create", { ...input, clientRequestId: key }, { timeoutMs: PLACE_ORDER_TIMEOUT_MS });
  } catch (e) {
    if (!isNoAnswer(e)) throw e;
  }
  let found: { state?: string; order?: T } | null;
  try {
    found = await request<{ state?: string; order?: T }>("orders:byRequest", { clientRequestId: key });
  } catch {
    throw new AttemptUnknownError(TEXT.unknown[lang]);
  }
  if (found?.state === "placed" && found.order) return found.order;
  if (found?.state === "failed") throw new Error(TEXT.failed[lang]);
  if (found?.state === "processing") throw new AttemptUnknownError(TEXT.processing[lang]);
  if (found?.state === "none") throw new AttemptUnknownError(TEXT.notSent[lang]);
  throw new AttemptUnknownError(TEXT.unknown[lang]);
}
