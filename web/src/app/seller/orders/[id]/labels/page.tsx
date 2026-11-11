"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ParcelQr } from "@/components/parcel/parcel-qr";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import {
  DEFAULT_PAPER,
  PAPERS,
  PAPER_ORDER,
  PAPER_STORAGE_KEY,
  PRINT_ROOT_CLASS,
  boxText,
  boxesPhrase,
  orderedLabels,
  pageCount,
  paperCss,
  readPaper,
  type PaperId,
  type ParcelLabelPack,
} from "@/lib/parcel-labels";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

// The remembered paper: localStorage inside try/catch (blocked storage falls back to this page's memory).
const paperListeners = new Set<() => void>();
let memoryPaper: PaperId = DEFAULT_PAPER;

function subscribePaper(cb: () => void) {
  paperListeners.add(cb);
  return () => {
    paperListeners.delete(cb);
  };
}

function currentPaper(): PaperId {
  try {
    const raw = window.localStorage.getItem(PAPER_STORAGE_KEY);
    return raw === null ? memoryPaper : readPaper(raw);
  } catch {
    return memoryPaper;
  }
}

function rememberPaper(p: PaperId) {
  memoryPaper = p;
  try {
    window.localStorage.setItem(PAPER_STORAGE_KEY, p);
  } catch {
    /* not remembered across visits: the choice still applies while this page is open */
  }
  paperListeners.forEach((cb) => cb());
}

export default function SellerParcelLabelsPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { getSellerOrder, sellerLabels, load } = useSellerData();
  const order = getSellerOrder(id);
  // The orders arrive after the page opens: the labels are asked for with the server's order id, never with the reference in the address.
  const orderId = order?.orderId ?? null;
  const [pack, setPack] = useState<ParcelLabelPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const userRetry = useRef(false);
  const paper = useSyncExternalStore(subscribePaper, currentPaper, () => DEFAULT_PAPER);

  const api = useRef({ sellerLabels, toast });
  useEffect(() => {
    api.current = { sellerLabels, toast };
  });

  // Reads the labels when the page opens and on every Retry (a failed Retry also toasts the server's message).
  useEffect(() => {
    if (!orderId) return;
    let live = true;
    api.current.sellerLabels(orderId).then(
      (p) => {
        if (!live) return;
        setPack(p);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (!live) return;
        const msg = errMessage(e);
        setError(msg);
        setLoading(false);
        if (userRetry.current) api.current.toast(msg, "error");
        userRetry.current = false;
      },
    );
    return () => {
      live = false;
    };
  }, [orderId, attempt]);

  function retry() {
    userRetry.current = true;
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  const back = `/seller/orders/${encodeURIComponent(id)}`;
  const labels = pack ? orderedLabels(pack.labels) : [];

  function print() {
    try {
      window.print();
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  if (!order) return <MissingRecord load={load} label="Order not found" labelFr="Commande introuvable" />;

  return (
    <div className="space-y-6">
      <style>{paperCss(paper)}</style>
      <PageHeader
        title={fr ? "Étiquettes du colis" : "Parcel labels"}
        subtitle={order ? order.id : undefined}
        backHref={back}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={back} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">{fr ? "Retour à la commande" : "Back to the order"}</Link>
            <button type="button" onClick={print} disabled={loading || labels.length === 0} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {fr ? "Imprimer" : "Print"}
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3" role="group" aria-label={fr ? "Format du papier" : "Paper"}>
        <span className="text-sm text-slate-700">{fr ? "Papier" : "Paper"}</span>
        {PAPER_ORDER.map((p) => (
          <label key={p} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${paper === p ? "border-[var(--primary)] bg-blue-50 text-[var(--primary)]" : "border-slate-200 text-slate-700"}`}>
            <input type="radio" name="paper" className="sr-only" checked={paper === p} onChange={() => rememberPaper(p)} />
            {fr ? PAPERS[p].labelFr : PAPERS[p].label}
          </label>
        ))}
        {labels.length > 0 && (
          <span className="text-xs text-slate-500">
            {boxesPhrase(labels.length, fr)} · {pageCount(paper, labels.length)} {fr ? "page(s)" : "page(s)"}
          </span>
        )}
      </div>
      {paper === "a6" && (
        <p className="text-xs text-slate-500">
          {fr ? "Dans la fenêtre d'impression, choisissez le papier 100 x 150 mm et des marges nulles si elles ne sont pas appliquées." : "In the print dialog, pick 100 x 150 mm paper and no margins if they are not applied."}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500" role="status">{fr ? "Chargement des étiquettes…" : "Loading the labels…"}</p>}

      {!loading && error && (
        <div className="space-y-3 rounded-lg bg-red-50 p-4" data-testid="labels-error">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={retry} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700">{fr ? "Réessayer" : "Retry"}</button>
        </div>
      )}

      {!loading && !error && labels.length === 0 && (
        <p className="text-sm text-slate-500">{fr ? "Aucune étiquette pour cette commande." : "There are no labels for this order."}</p>
      )}

      {labels.length > 0 && (
        <div className={PRINT_ROOT_CLASS} data-testid="label-sheet" data-paper={paper}>
          {labels.map((l) => (
            <article
              key={l.code}
              className="parcel-label flex flex-col items-center justify-between rounded-md border border-slate-300 bg-white p-[5mm] text-center text-black"
            >
              <p className="text-[5mm] font-bold tracking-[0.3em]">KOMORIKO</p>
              <ParcelQr code={l.code} boxNo={l.boxNo} boxCount={l.boxCount} fr={fr} className="h-[66mm] w-[66mm]" />
              <p className="font-mono text-[7mm] font-bold leading-none tracking-wide">{l.code}</p>
              <p className="text-[8mm] font-bold leading-none">{boxText(l.boxNo, l.boxCount, fr)}</p>
              <div className="space-y-[1mm] text-[4mm] leading-tight">
                <p><span className="text-slate-600">{fr ? "Commande" : "Order"}</span> <strong>{l.orderReference}</strong></p>
                {l.storeName && <p>{l.storeName}</p>}
                {l.destinationArea && <p><span className="text-slate-600">{fr ? "Destination" : "To"}</span> <strong>{l.destinationArea}</strong></p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
