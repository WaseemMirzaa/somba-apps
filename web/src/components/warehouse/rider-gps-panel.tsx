"use client";

import { MapPin } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useRiderGps } from "@/lib/rider-gps";

/** Visible GPS status + the button that asks the browser for location permission. */
export function RiderGpsPanel() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const gps = useRiderGps();

  if (gps.state === "idle") return null;

  const sentAgo = gps.lastSentAt ? Math.max(0, Math.round((Date.now() - gps.lastSentAt) / 1000)) : null;

  let tone = "border-slate-200 bg-slate-50 text-slate-700";
  let text = "";
  if (gps.state === "tracking") {
    tone = "border-emerald-200 bg-emerald-50 text-emerald-800";
    text = fr
      ? `Position partagée avec le client (${gps.sharingFor} livraison${gps.sharingFor > 1 ? "s" : ""})${sentAgo != null ? ` · dernier envoi il y a ${sentAgo} s` : ""}${gps.accuracy != null ? ` · précision ±${Math.round(gps.accuracy)} m` : ""}.`
      : `Sharing your position with the customer (${gps.sharingFor} ${gps.sharingFor > 1 ? "deliveries" : "delivery"})${sentAgo != null ? ` · last sent ${sentAgo}s ago` : ""}${gps.accuracy != null ? ` · accuracy ±${Math.round(gps.accuracy)} m` : ""}.`;
  } else if (gps.state === "starting") {
    text = fr ? "Recherche de votre position…" : "Finding your position…";
  } else if (gps.state === "needs_permission") {
    tone = "border-amber-200 bg-amber-50 text-amber-900";
    text = fr
      ? "Vous avez une livraison en cours. Partagez votre position pour que le client puisse vous suivre (le navigateur vous demandera l'autorisation)."
      : "You have a delivery in progress. Share your position so the customer can follow it (your browser will ask for permission).";
  } else if (gps.state === "denied") {
    tone = "border-red-200 bg-red-50 text-red-800";
    text = fr
      ? "Localisation refusée. Autorisez-la dans les réglages du site de votre navigateur (icône de cadenas), puis réessayez."
      : "Location is blocked. Allow it in your browser's site settings (padlock icon), then try again.";
  } else if (gps.state === "unavailable") {
    tone = "border-red-200 bg-red-50 text-red-800";
    text = fr ? "Position indisponible pour le moment." : "Position is unavailable right now.";
  } else if (gps.state === "unsupported") {
    tone = "border-red-200 bg-red-50 text-red-800";
    text = fr ? "Ce navigateur ne prend pas en charge la géolocalisation. Utilisez l'application mobile." : "This browser does not support geolocation. Use the mobile app.";
  }

  const canStart = gps.state === "needs_permission" || gps.state === "denied" || gps.state === "unavailable";

  return (
    <div className={`rounded-xl border p-3 text-sm ${tone}`} role="status">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p>{text}</p>
          {gps.error && gps.state !== "denied" && <p className="mt-1 text-xs opacity-80">{gps.error}</p>}
          {canStart && (
            <button
              type="button"
              onClick={gps.start}
              className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {gps.state === "needs_permission"
                ? (fr ? "Partager ma position" : "Share my location")
                : (fr ? "Réessayer" : "Try again")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
