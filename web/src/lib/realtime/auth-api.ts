import type { AuthResult, BackendUser } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ACCESS_KEY = "somba.accessToken";
const REFRESH_KEY = "somba.refreshToken";

/** An error from the credential endpoints, with the HTTP status (0 when the server could not be reached). */
export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The server's French (`messageFr`, a string or a list joined with a space), when it sent one. */
    readonly messageFr?: string,
  ) {
    super(message);
  }
}

/**
 * What the server did with a request to send a code or a link. `reason` says why nothing went out: `not_configured`
 * (this server has no SMS / e-mail provider yet) or `failed` (the provider refused it). `to` is where it went, masked.
 */
export interface SendOutcome {
  sent: boolean;
  reason?: "not_configured" | "failed";
  to?: string;
}

/**
 * The account has two-factor authentication on: the password was right, now ask for the 6-digit code (or a
 * recovery code) and finish with `authApi.login2fa(challenge, code)`. The challenge is valid for 5 minutes.
 */
export class TwoFactorRequired extends Error {
  constructor(readonly challenge: string) {
    super("Two-factor authentication code required.");
  }
}

async function post<T>(
  path: string,
  body: unknown,
  accessToken?: string | null,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    throw new AuthApiError((e as Error).message || "Cannot reach the server.", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Nest validation errors arrive as an array of messages.
    const msg = Array.isArray(json?.message) ? json.message.join(" ") : json?.message;
    // `messageFr` (docs/contracts/error-text.md): the same shape as `message`, in French. Callers show it when the page is French.
    const fr = Array.isArray(json?.messageFr)
      ? json.messageFr.filter((x: unknown) => typeof x === "string").join(" ")
      : typeof json?.messageFr === "string"
        ? json.messageFr
        : undefined;
    throw new AuthApiError(msg ?? `Request failed (${res.status})`, res.status, fr?.trim() || undefined);
  }
  return json as T;
}

/** The refresh in flight in this tab, shared by every caller that needs one at the same moment (see `refreshStored`). */
let refreshing: Promise<AuthResult> | null = null;

/** REST is used ONLY for the one-shot credential exchange. */
export const authApi = {
  apiUrl: API_URL,

  async login(email: string, password: string): Promise<AuthResult> {
    const res = await post<AuthResult | { needs2fa: true; challenge: string }>("/api/v1/auth/login", { email, password });
    if ("needs2fa" in res && res.needs2fa) throw new TwoFactorRequired(res.challenge);
    return res as AuthResult;
  },

  /** Second step of a sign-in on an account with two-factor authentication on. */
  login2fa(challenge: string, code: string): Promise<AuthResult> {
    return post<AuthResult>("/api/v1/auth/login/2fa", { challenge, code });
  },

  register(input: {
    email: string;
    password: string;
    name: string;
    role?: string;
    phone?: string;
    /** The language the person is reading the site in: stored on the account (SMS, push and e-mail follow it). */
    locale?: "en" | "fr";
  }): Promise<AuthResult> {
    return post<AuthResult>("/api/v1/auth/register", input);
  },

  refresh(refreshToken: string): Promise<AuthResult> {
    return post<AuthResult>("/api/v1/auth/refresh", { refreshToken });
  },

  /**
   * Trade the STORED refresh token for new tokens and store BOTH (the server rotates refresh tokens: the one just used
   * stops working a few seconds later, and presenting it again after that signs the account out everywhere). Callers in
   * this tab that ask at the same moment share one request; another tab reads the newest token from storage, and the
   * server's short grace window covers two tabs refreshing at once. Rejects with `AuthApiError` (status 401 when there is
   * no stored token).
   */
  refreshStored(): Promise<AuthResult> {
    if (refreshing) return refreshing;
    const stored = authApi.getRefresh();
    if (!stored) return Promise.reject(new AuthApiError("Session expired. Please sign in again.", 401));
    refreshing = authApi
      .refresh(stored)
      .then((r) => {
        authApi.saveTokens(r);
        return r;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  },

  // ---- account recovery + verification (one-shot REST) ----
  /** Always succeeds — never reveals whether the email has an account. */
  forgotPassword(email: string) {
    return post<SendOutcome>("/api/v1/auth/forgot", { email });
  },
  resetPassword(token: string, password: string) {
    return post<{ reset: boolean }>("/api/v1/auth/reset", { token, password });
  },
  verifyEmail(token: string) {
    return post<{ verified: boolean }>("/api/v1/auth/email/verify", { token });
  },
  sendEmailVerification() {
    return post<SendOutcome>("/api/v1/auth/email/send", {}, authApi.getAccess());
  },
  sendPhoneOtp() {
    return post<SendOutcome>("/api/v1/auth/phone/send", {}, authApi.getAccess());
  },
  verifyPhoneOtp(code: string) {
    return post<{ verified: boolean }>("/api/v1/auth/phone/verify", { code }, authApi.getAccess());
  },

  async me(accessToken: string): Promise<BackendUser | null> {
    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendUser;
  },

  // ---- token persistence (browser only) ----
  saveTokens(r: AuthResult) {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACCESS_KEY, r.accessToken);
    localStorage.setItem(REFRESH_KEY, r.refreshToken);
  },
  getAccess(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
