"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { ADJUST_REASONS, removableUnits, variantLabels, type StockItem } from "@/lib/seller-stock";

type Target = Pick<StockItem, "productId" | "name" | "stock" | "variantStock" | "pool">;

interface AdjustResult {
  productId: string;
  stock: number;
  variantStock: Record<string, number> | null;
  variant: string | null;
  delta: number;
  stockAfter: number;
}

/**
 * "Add / remove N units" (`inventory:adjust`): never an absolute value, always a delta with a reason, so the movement
 * log tells what happened. Opens in a dialog; the lists refresh from the `product:updated` push the server sends.
 */
export function StockAdjust({
  item,
  onDone,
  className = "",
}: {
  item: Target;
  onDone?: (r: AdjustResult) => void;
  className?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [variant, setVariant] = useState("");
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]["value"]>("manual_adjust");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = variantLabels(item);
  const n = Number(qty);
  const whole = qty.trim() !== "" && Number.isInteger(n) && n > 0 && n <= 1_000_000;
  const room = removableUnits(item, variant || null);
  const tooMany = mode === "remove" && whole && n > room;
  const problem = !whole
    ? fr ? "Saisissez un nombre entier d'unités (1 ou plus)." : "Enter a whole number of units (1 or more)."
    : tooMany
      ? fr ? `Vous ne pouvez retirer que ${room} unité(s) ici.` : `You can only remove ${room} unit(s) here.`
      : null;

  function show() {
    setMode("add");
    setQty("");
    setVariant("");
    setReason("manual_adjust");
    setNote("");
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const delta = mode === "add" ? n : -n;
      const r = await sellerRequest<AdjustResult>("inventory:adjust", {
        productId: item.productId,
        delta,
        reason,
        ...(variant ? { variant } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast(
        fr
          ? `Stock ${delta > 0 ? "augmenté" : "réduit"} de ${Math.abs(delta)} : ${r.stockAfter} en stock`
          : `Stock ${delta > 0 ? "increased" : "reduced"} by ${Math.abs(delta)}: ${r.stockAfter} in stock`,
      );
      onDone?.(r);
      setOpen(false);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  const field = "input-premium w-full px-3 py-2 text-sm";
  return (
    <>
      <button type="button" onClick={show} className={`text-xs text-[var(--primary)] hover:underline ${className}`}>
        {fr ? "Ajuster le stock" : "Adjust stock"}
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={fr ? `Ajuster le stock · ${item.name}` : `Adjust stock · ${item.name}`}
        footer={
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" disabled={!!problem || busy} onClick={() => void save()}>{busy ? "…" : fr ? "Enregistrer" : "Save"}</Button>
          </>
        }
      >
        <p className="text-xs text-slate-500">
          {fr
            ? `En stock aujourd'hui : ${item.stock}. Ajoutez ou retirez des unités : chaque ajustement est inscrit dans l'historique des mouvements.`
            : `In stock today: ${item.stock}. Add or remove units: every adjustment is written to the movement log.`}
        </p>
        <div className="flex gap-2" role="group" aria-label={fr ? "Sens de l'ajustement" : "Direction"}>
          {(["add", "remove"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === m ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]" : "border-slate-200 text-slate-600"}`}
            >
              {m === "add" ? (fr ? "Ajouter des unités" : "Add units") : fr ? "Retirer des unités" : "Remove units"}
            </button>
          ))}
        </div>
        <label className="block text-xs text-slate-500">
          {fr ? "Nombre d'unités" : "Number of units"}
          <input type="number" min="1" step="1" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} className={`${field} mt-1`} aria-label={fr ? "Nombre d'unités" : "Number of units"} />
        </label>
        {labels.length > 0 && (
          <label className="block text-xs text-slate-500">
            {fr ? "Option concernée" : "Option"}
            <select value={variant} onChange={(e) => setVariant(e.target.value)} className={`${field} mt-1`}>
              <option value="">{fr ? "Réserve commune (hors option)" : "Shared pool (not tied to an option)"}</option>
              {labels.map((l) => (
                <option key={l} value={l}>{l} ({item.variantStock?.[l] ?? 0})</option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs text-slate-500">
          {fr ? "Motif" : "Reason"}
          <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={`${field} mt-1`}>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{fr ? r.fr : r.en}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          {fr ? "Note (facultative)" : "Note (optional)"}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={`${field} mt-1`} />
        </label>
        {qty !== "" && problem && <p className="text-xs text-red-600">{problem}</p>}
        <ErrorNote message={error} />
      </Modal>
    </>
  );
}
