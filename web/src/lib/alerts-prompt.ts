/**
 * Decides what the first-open notification banner shows (kept pure so it can be tested with `node --test`).
 * "show" = the Turn on / Not now banner, "hint" = the https hint, "hide" = nothing.
 */
export type AlertsPromptInput = {
  /** `Notification.permission`, or "unsupported" when the browser has no Notification API. */
  permission: NotificationPermission | "unsupported";
  secureContext: boolean;
  /** Epoch ms the person last chose "Not now" (or dismissed the hint) in this browser. */
  dismissedAt: number | null;
  now: number;
  /** Backend role of the signed-in user, or null when nobody is signed in. */
  role: string | null;
  pathname: string;
};

export type AlertsPromptDecision = "show" | "hint" | "hide";

export const ALERTS_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const ALERTS_PROMPT_KEY = "komoriko.alertsPromptDismissedAt";

/** Pages that never get the banner: sign-in, registration and recovery screens, and the checkout flow. */
export function alertsPromptExcludedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return true;
  if (/^\/(login|get-app|legal|sell-online|purchase|live)(\/|$)/.test(p)) return true;
  return /^\/shop\/(login|register|forgot|reset|otp|verify-email|cart|checkout)(\/|$)/.test(p) ||
    /\/(first-password|register)(\/|$)/.test(p);
}

export function alertsPromptDecision(i: AlertsPromptInput): AlertsPromptDecision {
  if (!i.role || i.role === "guest") return "hide";
  if (alertsPromptExcludedPath(i.pathname)) return "hide";
  if (i.permission === "granted" || i.permission === "denied") return "hide";
  if (i.dismissedAt !== null && i.now - i.dismissedAt < ALERTS_PROMPT_SNOOZE_MS && i.now >= i.dismissedAt) return "hide";
  if (i.permission === "unsupported" || !i.secureContext) return "hint";
  return "show";
}
