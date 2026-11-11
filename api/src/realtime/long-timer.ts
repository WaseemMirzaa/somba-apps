/** The longest delay Node's `setTimeout` honours (2^31 - 1 ms, about 24.8 days). A longer one fires after 1 ms. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

export interface LongTimer {
  clear(): void;
}

/**
 * `setTimeout` for any delay. A delay above {@link MAX_TIMEOUT_MS} is waited out in steps; `fn` runs once, at the end.
 * Sockets use it for the access token's expiry: with a one-year token a plain `setTimeout` fired at once, the server
 * asked for a new token on every connect and then closed the socket, so the app reconnected in a loop.
 */
export function setLongTimeout(fn: () => void, delayMs: number): LongTimer {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let cleared = false;
  const target = Date.now() + Math.max(0, delayMs);
  const step = () => {
    if (cleared) return;
    const left = target - Date.now();
    if (left <= 0) return fn();
    handle = setTimeout(step, Math.min(left, MAX_TIMEOUT_MS));
    handle.unref?.();
  };
  step();
  return {
    clear() {
      cleared = true;
      if (handle) clearTimeout(handle);
    },
  };
}
