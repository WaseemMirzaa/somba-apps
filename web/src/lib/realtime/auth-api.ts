import type { AuthResult, BackendUser } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ACCESS_KEY = "somba.accessToken";
const REFRESH_KEY = "somba.refreshToken";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message ?? `Request failed (${res.status})`);
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
