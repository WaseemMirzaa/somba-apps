/**
 * A per-socket sliding-window limit for the gateways that do not use `WsThrottleInterceptor` (it also caps the payload
 * at 64 KB, which a CSV import must exceed). Same defaults as that interceptor: 40 events per second per socket
 * (`WS_RATE_MAX`, `WS_RATE_WINDOW_MS`). Throws the message a client shows; the handler's `catch` turns it into
 * `{ ok: false, error }`. Keyed by the socket object, so a closed socket's counter is garbage collected.
 */
const buckets = new WeakMap<object, { count: number; start: number }>();

export function limitSocket(
  client: object,
  max = Number(process.env.WS_RATE_MAX ?? 40),
  windowMs = Number(process.env.WS_RATE_WINDOW_MS ?? 1000),
  now = Date.now(),
): void {
  const b = buckets.get(client);
  if (!b || now - b.start >= windowMs) {
    buckets.set(client, { count: 1, start: now });
    return;
  }
  if (++b.count > max) throw new Error('Too many requests — slow down.');
}
