"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { noticeHref, type NoticePortal } from "@/lib/notice-links";
import { enableAlerts, notificationPermission, notificationsSupported, webPushActive, webPushConfigured } from "@/lib/web-push";
import { socketClient } from "@/lib/realtime/socket-client";
import { localizedNotice } from "@/lib/i18n-fields";
import type { AppNotification } from "@/lib/realtime/types";

const ALL_PAGE: Record<NoticePortal, string> = {
  admin: "/admin/notifications",
  seller: "/seller/notifications",
  warehouse: "/warehouse",
  shop: "/shop/notifications",
  rider: "/rider/notifications",
};

function ago(iso: string, fr: boolean): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return fr ? "à l'instant" : "just now";
  if (m < 60) return fr ? `il y a ${m} min` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return fr ? `il y a ${h} h` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB");
}

/**
 * New notices while a portal tab is open: a toast when the tab is in front, a desktop alert when it is in the
 * background (once alerts are allowed). When this browser has web push, the service worker shows background
 * alerts instead, so they are not shown twice.
 */
function useTabAlerts(portal: NoticePortal, fr: boolean) {
  const router = useRouter();
  const { toast } = useToast();
  const { status } = useRealtime();

  useEffect(() => {
    if (status !== "connected") return;
    const sock = socketClient.current;
    if (!sock) return;
    const onNew = (n: AppNotification) => {
      const href = noticeHref(n, portal);
      const text = localizedNotice(n, fr);
      if (document.visibilityState === "visible") {
        toast(text.title, "info");
        return;
      }
      if (notificationPermission() !== "granted" || webPushActive()) return;
      try {
        const alert = new Notification(text.title, { body: text.body, tag: n.id, icon: "/logo.svg" });
        alert.onclick = () => {
          window.focus();
          router.push(href);
          alert.close();
        };
      } catch {
        /* some browsers only allow notifications from a service worker */
      }
    };
    sock.on("notification:new", onNew);
    return () => {
      sock.off("notification:new", onNew);
    };
  }, [status, portal, router, toast, fr]);
}

/** Bell with the unread count and the latest notices, plus "Turn on alerts" for desktop and push alerts. */
export function NotificationBell({ portal, fr }: { portal: NoticePortal; fr: boolean }) {
  const { notifications, unreadCount, markRead, markAllRead } = useRealtime();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useTabAlerts(portal, fr);

  // Read the browser's permission after mount (it is not known during server rendering).
  useEffect(() => {
    const id = window.setTimeout(() => setPermission(notificationPermission()), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function turnOn() {
    setBusy(true);
    const r = await enableAlerts();
    setBusy(false);
    setPermission(notificationPermission());
    if (r.ok) {
      toast(
        r.push
          ? fr ? "Alertes activées, même onglet fermé" : "Alerts on, even with the tab closed"
          : fr ? "Alertes activées tant qu'un onglet est ouvert" : "Alerts on while a tab is open",
        "success",
      );
    } else if (r.reason === "denied") {
      toast(fr ? "Alertes bloquées : autorisez-les dans les réglages du navigateur" : "Alerts are blocked: allow them in your browser settings", "error");
    } else if (r.reason === "unsupported") {
      toast(fr ? "Ce navigateur ne gère pas les alertes" : "This browser does not support alerts", "error");
    } else {
      toast(fr ? `Impossible d'activer les alertes : ${r.message ?? ""}` : `Could not turn on alerts: ${r.message ?? ""}`, "error");
    }
  }

  /** `devices:test`: a test notice to yourself, pushed to every device registered for your account. */
  async function sendTest() {
    try {
      const r = await socketClient.request<{ pushEnabled: boolean; devices: number }>("devices:test");
      toast(
        r.pushEnabled
          ? fr ? `Test envoyé à ${r.devices} appareil(s)` : `Test sent to ${r.devices} device(s)`
          : fr ? "Test enregistré. Le push n'est pas encore configuré sur le serveur." : "Test saved. Push is not set up on the server yet.",
        "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  const latest = [...notifications].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8);
  const alertsOn = permission === "granted";

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl border border-[var(--border)] p-2.5 text-slate-600 transition-colors hover:bg-slate-50"
        aria-label={fr ? `Notifications, ${unreadCount} non lue(s)` : `Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[11px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={() => void markAllRead().catch((e) => toast(e instanceof Error ? e.message : String(e), "error"))} className="text-xs font-semibold text-[var(--primary)] hover:underline">
                {fr ? "Tout marquer lu" : "Mark all read"}
              </button>
            )}
          </div>
          {notificationsSupported() && !alertsOn && permission !== "denied" && (
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-amber-50 px-4 py-3">
              <BellRing className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="flex-1 text-xs text-amber-800">
                {webPushConfigured()
                  ? fr ? "Recevez une alerte même onglet fermé." : "Get an alert even when this tab is closed."
                  : fr ? "Recevez une alerte quand cet onglet est en arrière-plan." : "Get an alert when this tab is in the background."}
              </p>
              <button onClick={() => void turnOn()} disabled={busy} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                {busy ? "…" : fr ? "Activer les alertes" : "Turn on alerts"}
              </button>
            </div>
          )}
          {latest.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">{fr ? "Aucune notification" : "No notifications yet"}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-[var(--border)] overflow-y-auto">
              {latest.map((n) => {
                const text = localizedNotice(n, fr);
                return (
                <li key={n.id}>
                  <Link
                    href={noticeHref(n, portal)}
                    onClick={() => {
                      setOpen(false);
                      if (!n.read) void markRead(n.id).catch(() => undefined);
                    }}
                    className="flex gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-[var(--primary)]"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${n.read ? "text-slate-600" : "font-semibold text-slate-900"}`}>{text.title}</span>
                      <span className="line-clamp-2 block text-xs text-slate-500">{text.body}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{ago(n.createdAt, fr)}</span>
                    </span>
                  </Link>
                </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center border-t border-[var(--border)]">
            <Link href={ALL_PAGE[portal]} onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 text-center text-xs font-semibold text-[var(--primary)] hover:bg-slate-50">
              {fr ? "Voir toutes les notifications" : "See all notifications"}
            </Link>
            <button onClick={() => void sendTest()} className="border-l border-[var(--border)] px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
              {fr ? "Envoyer un test" : "Send a test"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
