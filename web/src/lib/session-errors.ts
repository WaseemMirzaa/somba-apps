/**
 * When a refused sign-in token means "the session is over". A refresh the server REFUSED (401/403: revoked because the password
 * changed elsewhere or an admin switched the account off, expired, wrong role) signs the person out and erases the stored
 * tokens. A refresh the server could not ANSWER (offline = status 0, rate limit 429, a server error 5xx) does not: the stored
 * tokens are kept and the call is retried, so a blip never costs the rider their shift.
 * Used by `context/realtime-context.tsx` (reconnect and first load).
 *
 * No imports: `npm test` loads this file on its own.
 */

/** A failure that says nothing about the session itself (the network, the rate limit, a server fault). */
export const isTransientAuthStatus = (status: number): boolean => status === 0 || status === 429 || status >= 500;

/** After this many transient failures in a row, stop retrying. */
export const MAX_REFRESH_RETRIES = 3;

/** What to do after a refresh failed with `status` on try number `attempt` (0 for the first): retry (after `delayMs`) or end the session. */
export function refreshFailureAction(status: number, attempt: number): { action: "retry"; delayMs: number } | { action: "end" } {
  if (isTransientAuthStatus(status) && attempt < MAX_REFRESH_RETRIES) return { action: "retry", delayMs: 1500 * 2 ** attempt };
  return { action: "end" };
}
