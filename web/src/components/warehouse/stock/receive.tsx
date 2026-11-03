"use client";

import { useMemo, useState } from "react";
import { OpsError } from "@/components/warehouse/ops-state";
import { ScanInput } from "@/components/warehouse/scan-input";
import { BinPicker, BusyButton, Field, ProductPicker, ReadOnlyNote, inputCls, useAct } from "@/components/warehouse/stock/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useLocale } from "@/context/locale-context";
import { stockApi, useStockAccess, useStockQuery, type ParcelLines, type ProductMatch, type StockBin } from "@/lib/stock";
import { RECEIVE_REASON_LIST, REASON_TEXT, makeRef, wholeUnits, wording } from "@/lib/stock-codes";
import { parcelCode, useDeskQueue, type DeskTask } from "@/lib/warehouse";
import { pickText } from "@/lib/i18n-fields";

/** Put a scanned-in parcel away, or enter a receipt by hand. */
export function ReceiveTab() {
  const access = useStockAccess();
  const bins = useStockQuery<StockBin[]>("stock:bins", {}, []);
  return (
    <div className="space-y-5">
      <ReadOnlyNote why={access.readOnlyWhy} />
      {bins.error && <OpsError message={bins.error} onRetry={() => void bins.reload()} />}
      <ParcelReceipt bins={bins.data} />
      <ManualReceipt bins={bins.data} />
    </div>
  );
}

function ParcelReceipt({ bins }: { bins: StockBin[] }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useStockAccess();
  const { run, busy } = useAct();
  // Parcels already scanned in at this warehouse (delivered = at the warehouse for the legs that end at one).
  const desk = useDeskQueue({ status: "delivered" });
  const [parcel, setParcel] = useState<ParcelLines | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [binId, setBinId] = useState("");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState(() => makeRef("put"));
  const [loadError, setLoadError] = useState<string | null>(null);

  const openId = async (taskId: string) => {
    setLoadError(null);
    try {
      const p = await stockApi.parcel({ taskId, ...(access.hubId ? { hubId: access.hubId } : {}) });
      setParcel(p);
      setQty(Object.fromEntries(p.lines.map((l) => [`${l.productId}|${l.variant}`, String(l.remaining)])));
      setRef(makeRef("put"));
    } catch (e) {
      setParcel(null);
      setLoadError(e instanceof Error ? e.message : "Request failed.");
    }
  };
  const open = (leg: DeskTask) => openId(leg.id);

  const picked = useMemo(
    () =>
      (parcel?.lines ?? [])
        .map((l) => ({ l, n: wholeUnits(qty[`${l.productId}|${l.variant}`] ?? "") ?? 0 }))
        .filter((x) => x.n > 0),
    [parcel, qty],
  );
  const tooMany = picked.some((x) => x.n > x.l.remaining);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parcel) return;
    const done = await run(
      () =>
        stockApi.receiveParcel({
          taskId: parcel.taskId,
          ...(access.hubId ? { hubId: access.hubId } : {}),
          ...(binId ? { binId } : {}),
          lines: picked.map((x) => ({ productId: x.l.productId, variant: x.l.variant, qty: x.n })),
          note: note.trim() || undefined,
          clientRef: ref,
        }),
      (r) => (fr ? `${r.lines.reduce((s, x) => s + x.qty, 0)} unité(s) rangée(s) en stock` : `${r.lines.reduce((s, x) => s + x.qty, 0)} unit(s) put away`),
    );
    if (done) {
      setNote("");
      await openId(parcel.taskId);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{fr ? "Depuis un colis scanné" : "From a scanned parcel"}</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {fr ? "Scannez le colis (il doit déjà être enregistré à l'arrivée sur le bureau), puis rangez son contenu dans un emplacement." : "Scan the parcel (it must already be scanned in at the desk), then put what it carries into a bin."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScanInput legs={desk.tasks} onFound={open} buttonLabel={fr ? "Ouvrir" : "Open"} />
        {loadError && <OpsError message={loadError} />}
        {parcel && (
          <form onSubmit={submit} className="space-y-4" data-testid="parcel-receipt">
            <p className="text-sm text-slate-600">
              <span className="font-semibold">{parcelCode({ id: parcel.taskId })}</span> · {parcel.orderReference}
            </p>
            {!parcel.canReceive && (
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {fr ? "Ce colis n'est pas encore enregistré à l'arrivée dans votre entrepôt, ou il ne contient aucune ligne de produit." : "This parcel is not scanned in at your warehouse yet, or it carries no product lines."}
              </p>
            )}
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{fr ? "Produit" : "Product"}</th>
                    <th className="px-3 py-2">{fr ? "Colis" : "Parcel"}</th>
                    <th className="px-3 py-2">{fr ? "Déjà rangé" : "Already in stock"}</th>
                    <th className="px-3 py-2">{fr ? "À ranger" : "Put away"}</th>
                  </tr>
                </thead>
                <tbody>
                  {parcel.lines.map((l) => {
                    const k = `${l.productId}|${l.variant}`;
                    return (
                      <tr key={k} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2">
                          {pickText(fr, l.name, l.nameFr)}
                          {l.variant !== "Default" && <span className="ml-2 text-xs text-slate-500">{l.variant}</span>}
                          <span className="ml-2 text-xs text-slate-400">{l.sku}</span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{l.qty}</td>
                        <td className="px-3 py-2 tabular-nums">{l.stocked}</td>
                        <td className="px-3 py-2">
                          <input
                            inputMode="numeric"
                            value={qty[k] ?? ""}
                            disabled={l.remaining === 0}
                            onChange={(e) => setQty((q) => ({ ...q, [k]: e.target.value }))}
                            className="input-premium w-24 px-2 py-1.5 text-sm"
                            aria-label={fr ? `Quantité à ranger : ${l.name}` : `Quantity to put away: ${l.name}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <BinPicker label={fr ? "Emplacement (vide = zone de réception)" : "Bin (empty = receiving area)"} bins={bins} value={binId} onChange={setBinId} hubId={access.hubId} />
              <Field label={fr ? "Note (facultatif)" : "Note (optional)"}>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputCls} />
              </Field>
            </div>
            {tooMany && <p className="text-sm text-red-600">{fr ? "Une quantité dépasse ce qui reste à ranger." : "A quantity is more than what is left to put away."}</p>}
            <BusyButton busy={busy} disabled={!access.canWrite || !parcel.canReceive || picked.length === 0 || tooMany}>
              {fr ? "Ranger en stock" : "Put away"}
            </BusyButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ManualReceipt({ bins }: { bins: StockBin[] }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useStockAccess();
  const { run, busy } = useAct();
  const [product, setProduct] = useState<{ product: ProductMatch; variant: string } | null>(null);
  const [qty, setQty] = useState("");
  const [binId, setBinId] = useState("");
  const [reason, setReason] = useState<string>("manual_receipt");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState(() => makeRef("rcv"));
  const n = wholeUnits(qty);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !n) return;
    const done = await run(
      () => stockApi.receive({ productId: product.product.productId, variant: product.variant, qty: n, ...(binId ? { binId } : {}), ...(access.hubId ? { hubId: access.hubId } : {}), reason, note: note.trim() || undefined, clientRef: ref }),
      (r) => (fr ? `${r.qty} reçu(s) dans ${r.toBinCode}` : `${r.qty} received into ${r.toBinCode}`),
    );
    if (done) {
      setProduct(null);
      setQty("");
      setNote("");
      setRef(makeRef("rcv"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{fr ? "Réception manuelle" : "Manual receipt"}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{fr ? "Des unités arrivent sans colis : bon de livraison, dépôt, retour remis au comptoir." : "Units arrive with no parcel: a delivery note, a drop-off, a return handed in."}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" data-testid="manual-receipt">
          <ProductPicker label={fr ? "Produit" : "Product"} value={product} onChange={(v) => { setProduct(v); setRef(makeRef("rcv")); }} hubId={access.hubId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={fr ? "Quantité" : "Quantity"}>
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
            </Field>
            <BinPicker label={fr ? "Emplacement (vide = réception)" : "Bin (empty = receiving)"} bins={bins} value={binId} onChange={setBinId} hubId={access.hubId} />
            <Field label={fr ? "Motif" : "Reason"}>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                {RECEIVE_REASON_LIST.map((r) => (
                  <option key={r} value={r}>
                    {wording(REASON_TEXT, r, fr)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={fr ? "Note (facultatif)" : "Note (optional)"}>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputCls} />
          </Field>
          <BusyButton busy={busy} disabled={!access.canWrite || !product || !n}>
            {fr ? "Enregistrer la réception" : "Record receipt"}
          </BusyButton>
        </form>
      </CardContent>
    </Card>
  );
}
