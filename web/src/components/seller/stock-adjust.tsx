"use client";

import { useState } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";

/** Inline "set stock to N" form: calls products:update {stock} and shows the real result. */
export function StockAdjust({
  productId,
  current,
  className = "",
}: {
  productId: string;
  current: number;
  className?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { adjustStock } = useSellerData();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 1_000_000;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await adjustStock(productId, n);
      toast(fr ? `Stock mis à jour : ${n}` : `Stock updated to ${n}`);
      setOpen(false);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setValue(String(current)); setError(null); setOpen(true); }}
        className={`text-xs text-[var(--primary)] hover:underline ${className}`}
      >
        {fr ? "Ajuster le stock" : "Adjust stock"}
      </button>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="1"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setOpen(false); }}
          className="input-premium w-24 px-2 py-1 text-xs"
          aria-label={fr ? "Nouveau stock" : "New stock"}
        />
        <button type="button" disabled={!valid || busy} onClick={() => void save()} className="rounded bg-[var(--primary)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "…" : fr ? "Enregistrer" : "Save"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
          {fr ? "Annuler" : "Cancel"}
        </button>
      </div>
      {!valid && <p className="text-xs text-red-600">{fr ? "Entier ≥ 0 requis." : "Whole number, 0 or more."}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
