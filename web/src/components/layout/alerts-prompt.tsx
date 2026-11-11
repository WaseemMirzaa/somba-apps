"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { ALERTS_PROMPT_KEY, alertsPromptDecision, type AlertsPromptDecision } from "@/lib/alerts-prompt";
import { alertsResultToast } from "@/lib/alerts-feedback";
import { enableAlerts, notificationPermission } from "@/lib/web-push";

function readDismissed(): number | null {
  try {
    const v = Number(localStorage.getItem(ALERTS_PROMPT_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * First-open notification prompt, mounted once in the root layout so every portal (shop, seller, admin, warehouse,
 * rider) gets it after sign-in. "Turn on" is a real click, which Safari and Firefox require for the permission prompt.
 * "Not now" snoozes it for 7 days in this browser. Without a secure context (plain http) it shows a hint instead.
 */
export function AlertsPrompt() {
  const { user } = useRealtime();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const pathname = usePathname();
  const [decision, setDecision] = useState<AlertsPromptDecision>("hide");
  const [busy, setBusy] = useState(false);
  const role = user?.role ?? null;

  const evaluate = () =>
    setDecision(
      alertsPromptDecision({
        permission: notificationPermission(),
        secureContext: typeof window !== "undefined" && window.isSecureContext === true,
        dismissedAt: readDismissed(),
        now: Date.now(),
        role,
        pathname,
      }),
    );

  // The browser's permission is unknown on the server: decide after mount and whenever the page or account changes.
  useEffect(() => {
    const id = window.setTimeout(evaluate, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, pathname]);

  function snooze() {
    try {
      localStorage.setItem(ALERTS_PROMPT_KEY, String(Date.now()));
    } catch {
      /* storage blocked: it simply shows again next visit */
    }
    setDecision("hide");
  }

  async function turnOn() {
    setBusy(true);
    const r = await enableAlerts();
    setBusy(false);
    const t = alertsResultToast(r, fr);
    toast(t.text, t.kind);
    evaluate();
  }

  if (decision === "hide") return null;
  const hint = decision === "hint";
  return (
    <div
      role="region"
      aria-label={fr ? "Notifications" : "Notifications"}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0"
    >
      <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">
          {hint
            ? fr ? "Les notifications nécessitent l'adresse sécurisée https://" : "Notifications need the secure https:// address"
            : fr ? "Activez les notifications pour être prévenu des nouvelles commandes, livraisons et messages" : "Turn on notifications to hear about new orders, deliveries and messages"}
        </p>
        <div className="mt-3 flex gap-2">
          {!hint && (
            <button onClick={() => void turnOn()} disabled={busy} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? "…" : fr ? "Activer" : "Turn on"}
            </button>
          )}
          <button onClick={snooze} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {hint ? (fr ? "Compris" : "Got it") : fr ? "Plus tard" : "Not now"}
          </button>
        </div>
      </div>
      <button onClick={snooze} aria-label={fr ? "Fermer" : "Dismiss"} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
