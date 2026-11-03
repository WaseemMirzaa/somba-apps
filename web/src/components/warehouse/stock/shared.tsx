"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { CameraButton } from "@/components/warehouse/camera-scanner";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { stockApi, type ProductMatch, type StockBin } from "@/lib/stock";
import { classifyScan, cleanScan } from "@/lib/stock-codes";
import { errorMessage } from "@/lib/warehouse-live";
import { pickText } from "@/lib/i18n-fields";
import { cn } from "@/lib/utils";

/** Run a write: busy while it runs, a toast when it fails and a toast when it worked. Returns the result, or null on failure. */
export function useAct() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, done: (r: T) => string): Promise<T | null> => {
      setBusy(true);
      try {
        const r = await fn();
        toast(done(r));
        return r;
      } catch (e) {
        toast(errorMessage(e), "error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}

/** The one filled button of a form: label only; while busy the label is swapped for a spinner of the same size. */
export function BusyButton({ busy, disabled, children, type = "submit", onClick }: { busy: boolean; disabled?: boolean; children: React.ReactNode; type?: "submit" | "button"; onClick?: () => void }) {
  return (
    <button type={type} onClick={onClick} disabled={busy || disabled} className="btn-primary relative rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">
      <span className={cn(busy && "invisible")}>{children}</span>
      {busy && <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin" aria-label="…" />}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "input-premium w-full px-3 py-2 text-sm";

/** Shown instead of a write form when the person may not write (and why). */
export function ReadOnlyNote({ why }: { why: "role" | "hub" | null }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (!why) return null;
  return (
    <p role="status" className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-800">
      {why === "hub"
        ? fr ? "Choisissez un entrepôt ci-dessus pour modifier son stock." : "Choose a warehouse above to change its stock."
        : fr ? "Votre rôle peut consulter le stock mais pas le modifier." : "Your role can read the stock but not change it."}
    </p>
  );
}

/** A bin: choose from the list, or scan / type its label. Inactive bins are not offered. */
export function BinPicker({ label, bins, value, onChange, hubId, includeInactive = false }: { label: string; bins: StockBin[]; value: string; onChange: (binId: string) => void; hubId?: string; includeInactive?: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const options = bins.filter((b) => includeInactive || b.active);
  const scanned = async (raw: string) => {
    const c = classifyScan(raw);
    const code = c.kind === "bin" ? c.value : cleanScan(raw);
    const hit = options.find((b) => b.code.toLowerCase() === code.toLowerCase());
    if (hit) {
      onChange(hit.id);
      return { text: fr ? `Emplacement ${hit.code}` : `Bin ${hit.code}` };
    }
    try {
      const l = await stockApi.lookup({ code, ...(hubId ? { hubId } : {}) });
      if (l.bin && options.some((b) => b.id === l.bin!.id)) {
        onChange(l.bin.id);
        return { text: fr ? `Emplacement ${l.bin.code}` : `Bin ${l.bin.code}` };
      }
    } catch {
      /* fall through to the message below */
    }
    return { text: fr ? `Aucun emplacement « ${code} ».` : `No bin "${code}".`, error: true };
  };
  return (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">{fr ? "Choisir un emplacement…" : "Choose a bin…"}</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
              {b.label ? ` · ${b.label}` : ""} ({b.units})
            </option>
          ))}
        </select>
        <CameraButton title={fr ? "Scanner un emplacement" : "Scan a bin"} hint={fr ? "Cadrez l'étiquette de l'emplacement." : "Point at the bin label."} onCode={scanned} />
      </span>
    </Field>
  );
}

/**
 * A product: scan or type a SKU label, a name, or part of an id, and pick the match; pick the option when it has some.
 * `value` is the chosen product with its option, or null.
 */
export function ProductPicker({
  label,
  value,
  onChange,
  hubId,
}: {
  label: string;
  value: { product: ProductMatch; variant: string } | null;
  onChange: (v: { product: ProductMatch; variant: string } | null) => void;
  hubId?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);

  const search = useCallback(
    async (raw: string): Promise<ProductMatch[]> => {
      const code = cleanScan(raw);
      if (code.length < 2) {
        setMatches([]);
        setNote(null);
        return [];
      }
      const my = ++seq.current;
      setSearching(true);
      try {
        const r = await stockApi.lookup({ code, ...(hubId ? { hubId } : {}) });
        if (my !== seq.current) return [];
        setMatches(r.products);
        setNote(r.products.length ? null : fr ? "Aucun produit trouvé." : "No product found.");
        return r.products;
      } catch (e) {
        if (my === seq.current) setNote(errorMessage(e));
        return [];
      } finally {
        if (my === seq.current) setSearching(false);
      }
    },
    [hubId, fr],
  );

  useEffect(() => {
    if (value) return;
    const t = setTimeout(() => void search(text), 250);
    return () => clearTimeout(t);
  }, [text, value, search]);

  const pick = (p: ProductMatch) => {
    onChange({ product: p, variant: p.variants[0] ?? "Default" });
    setMatches([]);
    setText("");
  };

  const scanned = async (raw: string) => {
    const c = classifyScan(raw);
    const list = await search(c.kind === "sku" ? c.value : raw);
    const exact = c.kind === "sku" ? list.filter((p) => p.sku.toLowerCase() === c.value.toLowerCase()) : list;
    if (exact.length === 1) {
      pick(exact[0]);
      return { text: pickText(fr, exact[0].name, exact[0].nameFr) };
    }
    return { text: list.length ? (fr ? "Plusieurs produits : choisissez dans la liste." : "Several products: pick from the list.") : fr ? "Aucun produit trouvé." : "No product found.", error: !list.length };
  };

  if (value) {
    return (
      <Field label={label}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">{pickText(fr, value.product.name, value.product.nameFr)}</span>
            <span className="ml-2 text-xs text-slate-500">{value.product.sku}</span>
          </span>
          {value.product.variants.length > 1 && (
            <select aria-label={fr ? "Option" : "Option"} value={value.variant} onChange={(e) => onChange({ product: value.product, variant: e.target.value })} className="input-premium max-w-full px-3 py-2 text-sm">
              {value.product.variants.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => onChange(null)} className="rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            {fr ? "Changer" : "Change"}
          </button>
        </span>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className={inputCls} placeholder={fr ? "Scanner ou saisir SKU / nom" : "Scan or type SKU / name"} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <CameraButton title={fr ? "Scanner un produit" : "Scan a product"} hint={fr ? "Cadrez l'étiquette SKU du produit." : "Point at the product's SKU label."} onCode={scanned} />
      </span>
      {searching && <span className="mt-1 block text-xs text-slate-400">{fr ? "Recherche…" : "Searching…"}</span>}
      {note && !matches.length && <span className="mt-1 block text-xs text-slate-500">{note}</span>}
      {matches.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-white text-sm shadow-sm">
          {matches.map((p) => (
            <li key={p.productId}>
              <button type="button" onClick={() => pick(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50">
                <span className="min-w-0 truncate">{pickText(fr, p.name, p.nameFr)}</span>
                <span className="shrink-0 text-xs text-slate-500">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

/** "Rack A-01 · 4" chips for the bins a SKU sits in. */
export function BinChips({ bins }: { bins: { binId: string; code: string; qty: number }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {bins.map((b) => (
        <span key={b.binId} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {b.code} <span className="text-slate-500">× {b.qty}</span>
        </span>
      ))}
    </span>
  );
}
