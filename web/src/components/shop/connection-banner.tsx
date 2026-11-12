"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";

/** How long the shop may wait for its connection before saying so (a normal connect takes well under this). */
export const CONNECTION_GRACE_MS = 6000;

/**
 * The shop reads everything (products, delivery fees, the cart, orders) through one live connection. Without it a page
 * only says "Loading…". After a few seconds of waiting this says what is going on, so a shopper whose network is slow or
 * blocks the connection is not left guessing: it retries by itself, and a reload gives it a fresh start.
 */
export function ConnectionBanner() {
  const { status } = useRealtime();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const waiting = status === "connecting" || status === "error";
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (!waiting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLate(false);
      return;
    }
    const t = setTimeout(() => setLate(true), CONNECTION_GRACE_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  if (!waiting || !late) return null;
  return (
    <div role="status" data-testid="connection-banner" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">
          {fr ? "Connexion au serveur lente ou interrompue. Nouvelle tentative en cours…" : "The connection to the server is slow or interrupted. Retrying…"}
        </span>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-amber-100">
          {fr ? "Recharger la page" : "Reload the page"}
        </button>
      </div>
    </div>
  );
}
