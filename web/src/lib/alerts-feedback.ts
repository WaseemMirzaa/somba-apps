import type { AlertsResult } from "@/lib/web-push";

/** The toast shown after "Turn on alerts" (bell, rider card and the first-open banner share it). */
export function alertsResultToast(r: AlertsResult, fr: boolean): { text: string; kind: "success" | "error" } {
  if (r.ok) {
    return {
      kind: "success",
      text: r.push
        ? fr ? "Alertes activées, même onglet fermé" : "Alerts on, even with the tab closed"
        : fr ? "Alertes activées tant qu'un onglet est ouvert" : "Alerts on while a tab is open",
    };
  }
  if (r.reason === "denied") return { kind: "error", text: fr ? "Alertes bloquées : autorisez-les dans les réglages du navigateur" : "Alerts are blocked: allow them in your browser settings" };
  if (r.reason === "unsupported") return { kind: "error", text: fr ? "Ce navigateur ne gère pas les alertes" : "This browser does not support alerts" };
  return { kind: "error", text: fr ? `Impossible d'activer les alertes : ${r.message ?? ""}` : `Could not turn on alerts: ${r.message ?? ""}` };
}
