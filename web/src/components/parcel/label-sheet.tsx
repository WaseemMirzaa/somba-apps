"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ParcelQr } from "@/components/parcel/parcel-qr";
import {
  PREVIEW_ROOT_CLASS,
  PRINT_HOST_CLASS,
  PRINT_ROOT_CLASS,
  boxText,
  isSharedSet,
  labelContents,
  printReady,
  type PaperId,
  type ParcelLabel,
} from "@/lib/parcel-labels";

/**
 * One label: KOMORIKO, the QR, the code, "Box n/N", the store, the destination AREA (never a street or a phone), the orders
 * when several share the boxes, and every product x quantity with its options. The code, QR and box number come first so a
 * long contents list can never push them off the page (the list is cut with "+ N more line(s)").
 */
function LabelCard({ label, fr, onSettled }: { label: ParcelLabel; fr: boolean; onSettled?: (code: string, drawn: boolean) => void }) {
  const { lines, more } = labelContents(label.contents, fr);
  return (
    <article className="parcel-label flex flex-col items-center gap-[1.2mm] rounded-md border border-slate-300 bg-white p-[4mm] text-center text-black" data-testid="parcel-label">
      <p className="text-[4mm] font-bold leading-none tracking-[0.3em]">KOMORIKO</p>
      <ParcelQr code={label.code} boxNo={label.boxNo} boxCount={label.boxCount} fr={fr} className="h-[46mm] w-[46mm]" onSettled={onSettled} />
      <p className="font-mono text-[6.5mm] font-bold leading-none tracking-wide">{label.code}</p>
      <p className="text-[7mm] font-bold leading-none">{boxText(label.boxNo, label.boxCount, fr)}</p>
      <div className="w-full space-y-[0.6mm] text-[3.8mm] leading-tight">
        {label.storeName && <p className="font-semibold">{label.storeName}</p>}
        {label.destinationArea && (
          <p>
            <span className="text-slate-600">{fr ? "Destination" : "To"}</span> <strong>{label.destinationArea}</strong>
          </p>
        )}
        <p className="text-[3.2mm] text-slate-700">
          {isSharedSet(label) ? (label.orderRefs ?? []).join(", ") : label.orderReference}
        </p>
      </div>
      {lines.length > 0 && (
        <ul className="w-full space-y-[0.4mm] border-t border-slate-300 pt-[1.2mm] text-left text-[3.4mm] leading-tight" data-testid="label-contents">
          {lines.map((l) => (
            <li key={l.key} className="break-words">{l.text}</li>
          ))}
          {more && <li className="text-slate-600">{more}</li>}
        </ul>
      )}
    </article>
  );
}

const NO_SUBSCRIBE = () => () => {};
const NONE: ReadonlyMap<string, boolean> = new Map();
let printHost: HTMLElement | null = null;

/** The one host element of the printable copy: a direct child of <body>, created the first time a label page asks (never on the server). */
function getPrintHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!printHost || !printHost.isConnected) {
    printHost = document.createElement("div");
    printHost.className = PRINT_HOST_CLASS;
    document.body.appendChild(printHost);
  }
  return printHost;
}

/**
 * Which QR images of the printable copy have loaded. `onSettled` goes to <LabelSheet>; `ready` is true once EVERY code of `labels` has
 * settled (loaded, or given up on with its written code shown), `failed` counts the ones that could not be drawn. A new set of labels
 * (another box count, a reprint) starts again from nothing.
 */
export function usePrintReady(labels: readonly ParcelLabel[]) {
  const key = useMemo(() => labels.map((l) => l.code).join("|"), [labels]);
  const [state, setState] = useState<{ key: string; map: ReadonlyMap<string, boolean> }>({ key: "", map: NONE });
  const onSettled = useCallback(
    (code: string, drawn: boolean) =>
      setState((cur) => {
        const base = cur.key === key ? cur.map : NONE;
        return base.get(code) === drawn && cur.key === key ? cur : { key, map: new Map(base).set(code, drawn) };
      }),
    [key],
  );
  const known = state.key === key ? state.map : NONE;
  return { onSettled, ready: printReady(labels, new Set(known.keys())), failed: [...known.values()].filter((d) => !d).length };
}

/**
 * The label sheet of a print page: an on-screen preview, plus the PRINTABLE copy rendered into a host that is a direct child of
 * <body> (so the print CSS needs no `:has()`). The printable copy reports every QR through `onSettled` (see {@link usePrintReady}).
 */
export function LabelSheet({ labels, paper, fr, onSettled }: { labels: ParcelLabel[]; paper: PaperId; fr: boolean; onSettled: (code: string, drawn: boolean) => void }) {
  const host = useSyncExternalStore(NO_SUBSCRIBE, getPrintHost, () => null);
  return (
    <>
      <div className={PREVIEW_ROOT_CLASS} data-testid="label-sheet" data-paper={paper}>
        {labels.map((l) => (
          <LabelCard key={l.code} label={l} fr={fr} />
        ))}
      </div>
      {host &&
        createPortal(
          <div className={PRINT_ROOT_CLASS} data-testid="print-sheet" data-paper={paper}>
            {labels.map((l) => (
              <LabelCard key={l.code} label={l} fr={fr} onSettled={onSettled} />
            ))}
          </div>,
          host,
        )}
    </>
  );
}
