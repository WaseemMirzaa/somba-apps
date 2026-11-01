"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest, useSocketEvent } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";

/**
 * The store's low-stock line (`inventory:settings`): a product at or below it is flagged "low", and the seller gets a
 * notice the moment a product crosses it (once per crossing; restocking above the line re-arms it).
 */
export function StockThresholdCard({
  current,
  canEdit,
  onSaved,
}: {
  current: number | null;
  canEdit: boolean;
  onSaved?: (n: number) => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  // What the person is typing; null = show the saved value.
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = typed ?? (current !== null ? String(current) : "");
  const setValue = (v: string) => setTyped(v);
  // Another tab / team member changing the line arrives as a push.
  useSocketEvent<{ lowStockThreshold: number }>("inventory:settings", () => setTyped(null));

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 100_000;
  const dirty = current !== null && valid && n !== current;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sellerRequest<{ lowStockThreshold: number }>("inventory:settings", { lowStockThreshold: n });
      toast(fr ? `Seuil de stock bas enregistré : ${r.lowStockThreshold}` : `Low-stock line saved: ${r.lowStockThreshold}`);
      setTyped(null);
      onSaved?.(r.lowStockThreshold);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 p-4">
        <span className="rounded-xl bg-amber-50 p-2"><BellRing className="h-5 w-5 text-amber-600" /></span>
        <div className="min-w-[16rem] flex-1">
          <p className="text-sm font-semibold text-slate-900">{fr ? "Seuil de stock bas" : "Low-stock line"}</p>
          <p className="text-xs text-slate-500">
            {fr
              ? "Un produit (ou une option) à ce nombre d'unités ou moins est signalé « stock bas » et vous recevez une alerte au moment où il passe sous le seuil. Remettre du stock au-dessus du seuil réarme l'alerte."
              : "A product (or option) at this many units or fewer is flagged “low” and you get an alert the moment it crosses the line. Restocking above the line re-arms the alert."}
          </p>
        </div>
        <label className="text-xs text-slate-500">
          {fr ? "Seuil (unités)" : "Line (units)"}
          <input
            type="number"
            min="0"
            max="100000"
            step="1"
            value={value}
            disabled={!canEdit}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            className="input-premium mt-1 block w-28 px-3 py-2 text-sm"
          />
        </label>
        {canEdit && (
          <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "…" : fr ? "Enregistrer" : "Save"}
          </button>
        )}
        {value !== "" && !valid && <p className="w-full text-xs text-red-600">{fr ? "Entier de 0 à 100 000." : "Whole number from 0 to 100,000."}</p>}
        {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
