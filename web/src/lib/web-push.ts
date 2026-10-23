"use client";

import { socketClient } from "@/lib/realtime/socket-client";

/**
 * Firebase web push for the seller, admin and warehouse portals. Off until every NEXT_PUBLIC_FIREBASE_* value and
 * the VAPID key are set (docs/MOBILE-PUSH.md); until then the portals still raise desktop alerts while a tab is
 * open (see useTabAlerts). The device token is registered with `devices:register` as a `web` device, and
 * unregistered on sign-out.
 */
const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
const TOKEN_KEY = "somba.webPushToken";

/** Every value Firebase web push needs is set. */
export function webPushConfigured(): boolean {
  return [CONFIG.apiKey, CONFIG.projectId, CONFIG.messagingSenderId, CONFIG.appId, VAPID_KEY].every((v) => v.trim() !== "");
}

/** The browser can show notifications at all (not on the server, not in an old browser). */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the token is simply registered again next time */
  }
}

/** This browser has a push token registered (the service worker shows alerts when no portal tab is in front). */
export function webPushActive(): boolean {
  return webPushConfigured() && notificationPermission() === "granted" && !!savedToken();
}

async function messagingToken(): Promise<string | null> {
  if (!webPushConfigured() || !("serviceWorker" in navigator)) return null;
  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  if (!(await isSupported())) return null;
  const app = getApps()[0] ?? initializeApp(CONFIG);
  // The worker reads the same public config from its URL, so nothing is hard-coded in /public.
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${new URLSearchParams(CONFIG).toString()}`);
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

export type AlertsResult = { ok: true; push: boolean } | { ok: false; reason: "unsupported" | "denied" | "failed"; message?: string };

/**
 * "Turn on alerts": ask for the notification permission, then (when Firebase is configured) register this browser
 * for push. Without Firebase the permission alone enables desktop alerts while a portal tab is open.
 */
export async function enableAlerts(): Promise<AlertsResult> {
  if (!notificationsSupported()) return { ok: false, reason: "unsupported" };
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };
  if (!webPushConfigured()) return { ok: true, push: false };
  try {
    const token = await messagingToken();
    if (!token) return { ok: true, push: false };
    await socketClient.request("devices:register", { token, platform: "web", app: "web" });
    saveToken(token);
    return { ok: true, push: true };
  } catch (e) {
    return { ok: false, reason: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/** After sign-in (or switching account): move this browser's token to the account now signed in. */
export async function syncWebPush(): Promise<void> {
  const token = savedToken();
  if (!token || !webPushConfigured() || notificationPermission() !== "granted") return;
  try {
    await socketClient.request("devices:register", { token, platform: "web", app: "web" });
  } catch {
    /* best-effort: alerts still arrive in the open tab */
  }
}

/** Sign-out: stop pushes to this browser for the account that is leaving (fire-and-forget, before the socket closes). */
export function unregisterWebPush(): void {
  const token = savedToken();
  if (!token) return;
  socketClient.current?.emit("devices:unregister", { token });
}
