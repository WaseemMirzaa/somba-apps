"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { LabelSheet, usePrintReady } from "@/components/parcel/label-sheet";
import { useSellerData } from "@/lib/seller";
import { useSellerOrder } from "@/lib/seller-order-lookup";
import { errMessage } from "@/lib/seller-labels";
import {
  DEFAULT_PAPER,
  PAPERS,
  PAPER_ORDER,
  PAPER_STORAGE_KEY,
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
  // `?group=<id>`: the labels of a whole box set (several same-day orders packed together), not of this order alone.
  const groupId = useSearchParams().get("group");
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { sellerLabels } = useSellerData();
  const { order, load } = useSellerOrder(id);
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
    api.current.sellerLabels(orderId, groupId).then(
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
  }, [orderId, groupId, attempt]);

  function retry() {
    userRetry.current = true;
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  const back = `/seller/orders/${encodeURIComponent(id)}`;
  const labels = useMemo(() => (pack ? orderedLabels(pack.labels) : []), [pack]);
  // Print waits until every QR of the printable sheet has loaded (a QR still drawing would print as a blank square).
  const sheet = usePrintReady(labels);

  function print() {
    try {
      window.print();
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  if (!order) return <MissingRecord load={load} label="Order not found" labelFr="Commande introuvable" />;
  const refs = pack?.orders?.map((o) => o.reference) ?? [];

  return (
    <div className="space-y-6">
      <style>{paperCss(paper)}</style>
      <PageHeader
        title={fr ? "Étiquettes du colis" : "Parcel labels"}
        subtitle={refs.length > 1 ? refs.join(", ") : order.id}
        backHref={back}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={back} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">{fr ? "Retour à la commande" : "Back to the order"}</Link>
            <button type="button" onClick={print} disabled={loading || labels.length === 0 || !sheet.ready} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50" data-testid="print-button">
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

      {labels.length > 0 && !sheet.ready && (
        <p className="text-xs text-slate-500" role="status" data-testid="qr-drawing">{fr ? "Préparation des codes QR…" : "Drawing the QR codes…"}</p>
      )}
      {sheet.failed > 0 && (
        <p role="alert" className="text-xs text-amber-700">{fr ? "Certains codes QR n'ont pas pu être dessinés : le code écrit reste lisible sur l'étiquette." : "Some QR codes could not be drawn: the written code is still readable on the label."}</p>
      )}
      {(pack?.contentsRev ?? 0) > 0 && (
        <p role="note" className="text-xs text-amber-700">{fr ? "Le contenu de ces cartons a changé depuis la première impression : réimprimez les étiquettes." : "The contents of these boxes changed after the first print: print the labels again."}</p>
      )}

      {labels.length > 0 && <LabelSheet labels={labels} paper={paper} fr={fr} onSettled={sheet.onSettled} />}
    </div>
  );
}
