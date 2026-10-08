import type { AuthResult, BackendUser } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ACCESS_KEY = "somba.accessToken";
const REFRESH_KEY = "somba.refreshToken";

async function post<T>(
  path: string,
  body: unknown,
  accessToken?: string | null,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Nest validation errors arrive as an array of messages.
    const msg = Array.isArray(json?.message) ? json.message.join(" ") : json?.message;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return json as T;
}

/** REST is used ONLY for the one-shot credential exchange. */
export const authApi = {
  apiUrl: API_URL,

  login(email: string, password: string): Promise<AuthResult> {
    return post<AuthResult>("/api/v1/auth/login", { email, password });
  },

  register(input: {
    email: string;
    password: string;
    name: string;
    role?: string;
    phone?: string;
  }): Promise<AuthResult> {
    return post<AuthResult>("/api/v1/auth/register", input);
  },

  refresh(refreshToken: string): Promise<AuthResult> {
    return post<AuthResult>("/api/v1/auth/refresh", { refreshToken });
  },

  // ---- account recovery + verification (one-shot REST) ----
  /** Always succeeds — never reveals whether the email has an account. */
  forgotPassword(email: string) {
    return post<{ sent: boolean }>("/api/v1/auth/forgot", { email });
  },
  resetPassword(token: string, password: string) {
    return post<{ reset: boolean }>("/api/v1/auth/reset", { token, password });
  },
  verifyEmail(token: string) {
    return post<{ verified: boolean }>("/api/v1/auth/email/verify", { token });
  },
  sendEmailVerification() {
    return post<{ sent: boolean }>("/api/v1/auth/email/send", {}, authApi.getAccess());
  },
  sendPhoneOtp() {
    return post<{ sent: boolean }>("/api/v1/auth/phone/send", {}, authApi.getAccess());
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
