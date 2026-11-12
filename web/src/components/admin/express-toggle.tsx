"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg, useRole } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { usePublicSettings } from "@/lib/shop-live";
import { canSetExpress, expressNote } from "@/lib/admin-controls";

/**
 * Express delivery is switched per store by KOMORIKO (`sellers:setExpress`, Super Admin and Operations), not by the seller.
 * The server needs the store's pickup location pinned: it answers with its own sentence when it is not, and that sentence is
 * shown as it comes (inline, and as a notice).
 */
export function ExpressToggle({ sellerId, on, pinned, onChanged }: { sellerId: string; on: boolean; pinned: boolean; onChanged?: (now: boolean) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const role = useRole();
  const settings = usePublicSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = canSetExpress(role);
  // Nothing to turn on without a pin; a store that already has express on can always be switched off.
  const blocked = !on && !pinned;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const saved = await socketClient.request<{ expressDelivery?: boolean }>("sellers:setExpress", { sellerId, enabled: !on });
      const now = typeof saved?.expressDelivery === "boolean" ? saved.expressDelivery : !on;
      onChanged?.(now);
      toast(now ? (fr ? "Livraison express activée pour cette boutique" : "Express delivery turned on for this store") : fr ? "Livraison express désactivée pour cette boutique" : "Express delivery turned off for this store", "success");
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="express-toggle">
      <p className="text-sm text-slate-500">
        {fr
          ? "Quand la boutique et le client sont dans la même commune, un livreur peut aller directement de la boutique chez le client. Seul KOMORIKO active cette option, boutique par boutique."
          : "When the store and the customer are in the same commune, a rider can go straight from the store to the customer. Only KOMORIKO turns this on, store by store."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={fr ? "Livraison express" : "Express delivery"}
          disabled={!allowed || busy || blocked}
          onClick={() => void toggle()}
          className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-emerald-500" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className="text-sm text-slate-700">{on ? (fr ? "Activée" : "On") : fr ? "Désactivée" : "Off"}</span>
      </div>
      {!allowed && (
        <p role="note" className="text-xs text-slate-500">{fr ? "Seuls le Super admin et les Opérations peuvent modifier ce réglage." : "Only the Super Admin and Operations can change this."}</p>
      )}
      {blocked && (
        <p role="note" data-testid="express-no-pin" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {fr
            ? "Cette boutique n'a pas de lieu de collecte placé sur la carte. Demandez au vendeur de le placer dans les paramètres de la boutique avant d'activer la livraison express."
            : "This store has no pinned pickup location. Ask the seller to pin it in Store settings before turning on express delivery."}
        </p>
      )}
      {!settings.expressDeliveryEnabled && (
        <p role="note" className="text-xs text-slate-500">{expressNote(false, fr)}</p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
