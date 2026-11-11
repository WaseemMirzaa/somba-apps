"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { alertsCardState } from "@/lib/rider-alerts";
import { alertsResultToast } from "@/lib/alerts-feedback";
import { enableAlerts, notificationPermission, webPushActive, webPushConfigured } from "@/lib/web-push";

/**
 * "Turn on alerts" for the rider portal (web push). The warehouse assigns every task, so a rider has to be told when one
 * arrives: with the Firebase web config and `NEXT_PUBLIC_FIREBASE_VAPID_KEY` the browser gets a push even with the tab
 * closed; without them the alerts show while a portal tab is open, and the card says so. Nothing breaks when push is not set up.
 */
export function RiderAlertsCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [state, setState] = useState<ReturnType<typeof alertsCardState>>("hidden");
  const [busy, setBusy] = useState(false);

  const read = () => alertsCardState({ permission: notificationPermission(), configured: webPushConfigured(), registered: webPushActive() });

  // The browser's permission is not known while the page is rendered on the server: read it after mount.
  useEffect(() => {
    const id = window.setTimeout(() => setState(read()), 0);
    return () => window.clearTimeout(id);
  }, []);

  async function turnOn() {
    setBusy(true);
    const r = await enableAlerts();
    setBusy(false);
    setState(read());
    const t = alertsResultToast(r, fr);
    toast(t.text, t.kind);
  }

  if (state === "hidden") return null;
  const text: Record<Exclude<typeof state, "hidden">, string> = {
    ask: webPushConfigured()
      ? fr ? "Recevez une alerte à chaque nouvelle tâche, même quand cet onglet est fermé." : "Get an alert for each new task, even when this tab is closed."
      : fr ? "Recevez une alerte à chaque nouvelle tâche tant qu'un onglet est ouvert." : "Get an alert for each new task while a tab is open.",
    blocked: fr ? "Les alertes sont bloquées. Autorisez-les dans les réglages du navigateur pour ce site." : "Alerts are blocked. Allow them for this site in your browser settings.",
    "on-push": fr ? "Alertes activées : vous êtes prévenu d'une nouvelle tâche, même onglet fermé." : "Alerts are on: you are told about a new task, even with the tab closed.",
    "on-tab": fr ? "Alertes activées tant qu'un onglet est ouvert." : "Alerts are on while a tab is open.",
  };
  return (
    <div data-testid="rider-alerts" data-state={state} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <BellRing className="h-4 w-4 shrink-0 text-amber-600" />
      <p className="flex-1 text-xs text-amber-900">{text[state]}</p>
      {state === "ask" && (
        <Button size="sm" onClick={() => void turnOn()} disabled={busy}>
          {busy ? "…" : fr ? "Activer les alertes" : "Turn on alerts"}
        </Button>
      )}
    </div>
  );
}
