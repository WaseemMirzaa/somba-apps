"use client";

import { useCallback, useEffect, useState } from "react";
import { BinPicker, BusyButton, Field, ProductPicker, ReadOnlyNote, inputCls, useAct } from "@/components/warehouse/stock/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocale } from "@/context/locale-context";
import { stockApi, useStockAccess, useStockQuery, type CountResult, type ProductMatch, type StockBin } from "@/lib/stock";
import { countLines, makeRef, signed, varianceOf } from "@/lib/stock-codes";
import { pickText } from "@/lib/i18n-fields";
import { cn } from "@/lib/utils";

interface Row {
  productId: string;
  variant: string;
  sku: string;
  name: string;
  nameFr: string;
  expected: number;
  counted: string;
}

/**
 * Cycle count of one bin: the sheet lists what the system expects, the counter types what is really there, the variance
 * is shown as they type, and the count is applied to the bin and written to the ledger (one line per product, even with no
 * variance). Supervisors and managers only: it changes stock with no document behind it.
 */
export function CountTab() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useStockAccess();
  const { run, busy } = useAct();
  const bins = useStockQuery<StockBin[]>("stock:bins", {}, []);
  const [binId, setBinId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState(() => makeRef("cnt"));
  const [added, setAdded] = useState<{ product: ProductMatch; variant: string } | null>(null);
  const [result, setResult] = useState<(CountResult & { sheet: Row[] }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!binId) return setRows([]);
    try {
      const r = await stockApi.onHand({ binId, ...(access.hubId ? { hubId: access.hubId } : {}), limit: 500 });
      setRows(
        r.rows.map((x) => ({
          productId: x.productId,
          variant: x.variant,
          sku: x.sku,
          name: x.name,
          nameFr: x.nameFr,
          expected: x.bins.find((b) => b.binId === binId)?.qty ?? 0,
          counted: "",
        })),
      );
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Request failed.");
    }
  }, [binId, access.hubId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setResult(null);
    setRef(makeRef("cnt"));
  }, [load]);

  const addFound = (v: { product: ProductMatch; variant: string } | null) => {
    setAdded(null);
    if (!v) return;
    setRows((cur) =>
      cur.some((r) => r.productId === v.product.productId && r.variant === v.variant)
        ? cur
        : [...cur, { productId: v.product.productId, variant: v.variant, sku: v.product.sku, name: v.product.name, nameFr: v.product.nameFr, expected: 0, counted: "" }],
    );
  };

  const send = countLines(rows);
  const bin = bins.data.find((b) => b.id === binId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!binId || send.length === 0) return;
    const done = await run(
      () => stockApi.count({ binId, ...(access.hubId ? { hubId: access.hubId } : {}), lines: send, note: note.trim() || undefined, clientRef: ref }),
      (r) => (r.totalVariance === 0 ? (fr ? "Comptage enregistré : aucun écart" : "Count recorded: no variance") : fr ? `Comptage enregistré : écart ${signed(r.totalVariance)}` : `Count recorded: variance ${signed(r.totalVariance)}`),
    );
    if (done) {
      setResult({ ...done, sheet: rows });
      setNote("");
      setRef(makeRef("cnt"));
      await load();
    }
  }

  return (
    <div className="space-y-5">
      <ReadOnlyNote why={access.readOnlyWhy} />
      {!access.canOversee && !access.readOnlyWhy && (
        <p role="status" className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-800">
          {fr ? "Seuls les superviseurs et les responsables peuvent enregistrer un comptage." : "Only supervisors and managers can record a count."}
        </p>
      )}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{fr ? "Inventaire d'un emplacement" : "Count a bin"}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {fr ? "Comptez ce qui se trouve vraiment dans l'emplacement. Laissez vide une ligne que vous ne comptez pas." : "Count what is really in the bin. Leave a line blank to skip it."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" data-testid="count-form">
            <div className="max-w-md">
              <BinPicker label={fr ? "Emplacement" : "Bin"} bins={bins.data} value={binId} onChange={setBinId} hubId={access.hubId} includeInactive />
            </div>
            {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
            {binId && (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{fr ? "Produit" : "Product"}</th>
                        <th className="px-3 py-2">{fr ? "Attendu" : "Expected"}</th>
                        <th className="px-3 py-2">{fr ? "Compté" : "Counted"}</th>
                        <th className="px-3 py-2">{fr ? "Écart" : "Variance"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                            {fr ? `Le système ne connaît aucun stock dans ${bin?.code ?? "cet emplacement"}. Ajoutez ce que vous y trouvez ci-dessous.` : `The system knows of no stock in ${bin?.code ?? "this bin"}. Add what you find below.`}
                          </td>
                        </tr>
                      )}
                      {rows.map((r, i) => {
                        const v = varianceOf(r.expected, r.counted);
                        return (
                          <tr key={`${r.productId}|${r.variant}`} className="border-t border-[var(--border)]">
                            <td className="px-3 py-2">
                              {pickText(fr, r.name, r.nameFr)}
                              {r.variant !== "Default" && <span className="ml-2 text-xs text-slate-500">{r.variant}</span>}
                              <span className="ml-2 text-xs text-slate-400">{r.sku}</span>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{r.expected}</td>
                            <td className="px-3 py-2">
                              <input
                                inputMode="numeric"
                                value={r.counted}
                                onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, counted: e.target.value } : x)))}
                                className="input-premium w-24 px-2 py-1.5 text-sm"
                                aria-label={fr ? `Quantité comptée : ${r.name}` : `Counted quantity: ${r.name}`}
                              />
                            </td>
                            <td className={cn("px-3 py-2 font-semibold tabular-nums", v === null ? "text-slate-300" : v === 0 ? "text-emerald-600" : "text-red-600")}>{v === null ? "—" : signed(v)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ProductPicker label={fr ? "Autre chose dans l'emplacement ?" : "Found something else in the bin?"} value={added} onChange={(v) => (v ? addFound(v) : setAdded(null))} hubId={access.hubId} />
                <Field label={fr ? "Note (facultatif)" : "Note (optional)"}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputCls} />
                </Field>
                <BusyButton busy={busy} disabled={!access.canOversee || send.length === 0}>
                  {fr ? "Enregistrer le comptage" : "Record the count"}
                </BusyButton>
              </>
            )}
          </form>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? `Résultat du comptage · ${result.binCode}` : `Count result · ${result.binCode}`}</h2>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--border)] text-sm" data-testid="count-result">
              {result.lines.map((l) => {
                const r = result.sheet.find((x) => x.productId === l.productId && x.variant === l.variant);
                return (
                  <li key={l.ledgerId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{r ? pickText(fr, r.name, r.nameFr) : l.productId}</span>
                    <span className="tabular-nums text-slate-600">
                      {fr ? `attendu ${l.expected}, compté ${l.counted}` : `expected ${l.expected}, counted ${l.counted}`}{" "}
                      <span className={cn("font-semibold", l.variance === 0 ? "text-emerald-600" : "text-red-600")}>({signed(l.variance)})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
