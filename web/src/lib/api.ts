/**
 * Thin client for the Somba&Teka NestJS API (see `/api`).
 *
 * The web app is a prototype: pages render mock data by default and *upgrade*
 * to live API data when the backend is reachable. Every call fails soft — if
 * the API is down (e.g. on a static preview deploy) the caller falls back to
 * its mock, so nothing breaks.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3001/api";

const TOKEN_KEY = "somba-token";
const SEED_PASSWORD = process.env.NEXT_PUBLIC_API_PASSWORD || "password123";

/** Default seeded credentials to auto-authenticate a persona role (prototype). */
function credsForRole(role: string): { email: string; password: string } {
  const email = role === "seller" ? "gombe@somba.com" : "admin@somba.com";
  return { email, password: SEED_PASSWORD };
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(", ") : msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** POST /auth/login → stores the JWT and returns the user. */
export async function login(email: string, password: string) {
  const data = await raw<{ accessToken: string; user: unknown }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.accessToken);
  return data;
}

/** Ensure we have a token for the given persona role (auto-login for the prototype). */
export async function ensureAuth(role: string): Promise<boolean> {
  if (getToken()) return true;
  try {
    const { email, password } = credsForRole(role);
    await login(email, password);
    return true;
  } catch {
    return false;
  }
}

async function withAuth<T>(role: string, fn: () => Promise<T>): Promise<T> {
  const ok = await ensureAuth(role);
  if (!ok) throw new ApiError(401, "API unavailable");
  try {
    return await fn();
  } catch (e) {
    // A stale token (e.g. after a reseed) → clear and retry once.
    if (e instanceof ApiError && e.status === 401) {
      setToken(null);
      if (await ensureAuth(role)) return fn();
    }
    throw e;
  }
}

export const api = {
  get: <T>(path: string, role = "admin") => withAuth<T>(role, () => raw<T>(path)),
  post: <T>(path: string, body?: unknown, role = "admin") =>
    withAuth<T>(role, () => raw<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined })),
  patch: <T>(path: string, body?: unknown, role = "admin") =>
    withAuth<T>(role, () => raw<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined })),
  del: <T>(path: string, role = "admin") => withAuth<T>(role, () => raw<T>(path, { method: "DELETE" })),
};
