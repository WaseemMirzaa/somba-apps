"use client";

import { useCallback, useEffect, useState } from "react";
import { CameraButton } from "@/components/warehouse/camera-scanner";
import { BinPicker, BusyButton, Field, ProductPicker, ReadOnlyNote, inputCls, useAct } from "@/components/warehouse/stock/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocale } from "@/context/locale-context";
import { stockApi, useStockAccess, useStockQuery, type ProductMatch, type StockBin } from "@/lib/stock";
import { OUT_REASON_LIST, REASON_TEXT, classifyScan, makeRef, wholeUnits, wording } from "@/lib/stock-codes";

type Picked = { product: ProductMatch; variant: string } | null;

/** The bins that hold the chosen product option, with how many (what a move or a stock-out can take from). */
function useHoldings(picked: Picked, hubId: string | undefined, bump: number) {
  const [holdings, setHoldings] = useState<{ binId: string; code: string; qty: number }[]>([]);
  const load = useCallback(async () => {
    if (!picked) return setHoldings([]);
    try {
      const r = await stockApi.onHand({ productId: picked.product.productId, ...(hubId ? { hubId } : {}), limit: 100 });
      setHoldings(r.rows.find((x) => x.variant === picked.variant)?.bins ?? []);
    } catch {
      setHoldings([]);
    }
  }, [picked, hubId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, bump]);
  return holdings;
}

export function MoveOutTab() {
  const access = useStockAccess();
  const bins = useStockQuery<StockBin[]>("stock:bins", {}, []);
  return (
    <div className="space-y-5">
      <ReadOnlyNote why={access.readOnlyWhy} />
      <MoveCard bins={bins.data} />
      <OutCard />
    </div>
  );
}

function FromBin({ holdings, value, onChange }: { holdings: { binId: string; code: string; qty: number }[]; value: string; onChange: (id: string) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const scanned = async (raw: string) => {
    const c = classifyScan(raw);
    const code = (c.kind === "bin" ? c.value : c.value || raw).toLowerCase();
    const hit = holdings.find((h) => h.code.toLowerCase() === code);
    if (hit) {
      onChange(hit.binId);
      return { text: fr ? `Emplacement ${hit.code}` : `Bin ${hit.code}` };
    }
    return { text: fr ? "Ce produit n'est pas dans cet emplacement." : "That product is not in that bin.", error: true };
  };
  return (
    <Field label={fr ? "Depuis l'emplacement" : "From bin"}>
      <span className="flex items-center gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">{holdings.length ? (fr ? "Choisir…" : "Choose…") : fr ? "Choisissez d'abord un produit en stock" : "Pick a product that is in stock first"}</option>
          {holdings.map((h) => (
            <option key={h.binId} value={h.binId}>
              {h.code} ({h.qty})
            </option>
          ))}
        </select>
        <CameraButton title={fr ? "Scanner l'emplacement de départ" : "Scan the source bin"} onCode={scanned} />
      </span>
    </Field>
  );
}

function MoveCard({ bins }: { bins: StockBin[] }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useStockAccess();
  const { run, busy } = useAct();
  const [product, setProduct] = useState<Picked>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [bump, setBump] = useState(0);
  const [ref, setRef] = useState(() => makeRef("mv"));
  const holdings = useHoldings(product, access.hubId, bump);
  const have = holdings.find((h) => h.binId === from)?.qty ?? 0;
  const n = wholeUnits(qty);
  const over = !!n && !!from && n > have;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !n || !from || !to) return;
    const done = await run(
      () => stockApi.move({ productId: product.product.productId, variant: product.variant, qty: n, fromBinId: from, toBinId: to, ...(access.hubId ? { hubId: access.hubId } : {}), clientRef: ref }),
      (r) => (fr ? `${r.qty} déplacé(s) de ${r.fromBinCode} vers ${r.toBinCode}` : `${r.qty} moved from ${r.fromBinCode} to ${r.toBinCode}`),
    );
    if (done) {
      setQty("");
      setRef(makeRef("mv"));
      setBump((b) => b + 1);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{fr ? "Déplacer entre emplacements" : "Move between bins"}</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" data-testid="move-form">
          <ProductPicker label={fr ? "Produit" : "Product"} value={product} onChange={(v) => { setProduct(v); setFrom(""); }} hubId={access.hubId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <FromBin holdings={holdings} value={from} onChange={setFrom} />
            <BinPicker label={fr ? "Vers l'emplacement" : "To bin"} bins={bins.filter((b) => b.id !== from)} value={to} onChange={setTo} hubId={access.hubId} />
            <Field label={fr ? "Quantité" : "Quantity"} hint={from ? (fr ? `${have} disponible(s) ici` : `${have} available here`) : undefined}>
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {over && <p className="text-sm text-red-600">{fr ? `Cet emplacement ne contient que ${have}.` : `That bin holds only ${have}.`}</p>}
          <BusyButton busy={busy} disabled={!access.canWrite || !product || !n || !from || !to || over}>
            {fr ? "Déplacer" : "Move"}
          </BusyButton>
        </form>
      </CardContent>
    </Card>
  );
}

function OutCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useStockAccess();
  const { run, busy } = useAct();
  const [product, setProduct] = useState<Picked>(null);
  const [from, setFrom] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string>("damaged");
  const [note, setNote] = useState("");
  const [bump, setBump] = useState(0);
  const [ref, setRef] = useState(() => makeRef("out"));
  const holdings = useHoldings(product, access.hubId, bump);
  const have = holdings.find((h) => h.binId === from)?.qty ?? 0;
  const n = wholeUnits(qty);
  const over = !!n && !!from && n > have;
  const needNote = reason === "other" && !note.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !n || !from) return;
    const done = await run(
      () => stockApi.out({ productId: product.product.productId, variant: product.variant, qty: n, binId: from, ...(access.hubId ? { hubId: access.hubId } : {}), reason, note: note.trim() || undefined, clientRef: ref }),
      (r) => (fr ? `${r.qty} sorti(s) de ${r.fromBinCode}` : `${r.qty} stocked out of ${r.fromBinCode}`),
    );
    if (done) {
      setQty("");
      setNote("");
      setRef(makeRef("out"));
      setBump((b) => b + 1);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{fr ? "Sortie de stock" : "Stock out"}</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {fr ? "Pour du stock qui quitte l'entrepôt sans expédition : endommagé, perdu, échantillon, repris par le vendeur. L'expédition d'un colis sort le stock automatiquement." : "For stock that leaves with no dispatch: damaged, lost, a sample, taken back by the seller. Dispatching a parcel stocks out by itself."}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" data-testid="out-form">
          <ProductPicker label={fr ? "Produit" : "Product"} value={product} onChange={(v) => { setProduct(v); setFrom(""); }} hubId={access.hubId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <FromBin holdings={holdings} value={from} onChange={setFrom} />
            <Field label={fr ? "Quantité" : "Quantity"} hint={from ? (fr ? `${have} disponible(s) ici` : `${have} available here`) : undefined}>
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
            </Field>
            <Field label={fr ? "Motif" : "Reason"}>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                {OUT_REASON_LIST.map((r) => (
                  <option key={r} value={r}>
                    {wording(REASON_TEXT, r, fr)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={fr ? "Note" : "Note"} hint={reason === "other" ? (fr ? "Obligatoire pour « Autre »." : "Required for “Other”.") : undefined}>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputCls} />
          </Field>
          {over && <p className="text-sm text-red-600">{fr ? `Cet emplacement ne contient que ${have}.` : `That bin holds only ${have}.`}</p>}
          <BusyButton busy={busy} disabled={!access.canWrite || !product || !n || !from || over || needNote}>
            {fr ? "Sortir du stock" : "Stock out"}
          </BusyButton>
        </form>
      </CardContent>
    </Card>
  );
}
