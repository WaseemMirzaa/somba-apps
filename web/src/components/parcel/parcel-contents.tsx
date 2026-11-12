"use client";

import { Package } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { contentLineText, type ParcelContentLine } from "@/lib/parcel-labels";

/**
 * What is in a leg's boxes: every product x quantity with its size / options, and (when a seller packed several same-day orders
 * together) which order each line belongs to. Used by the checklists, the leg cards, the scan results and the parcel pages, so
 * the person holding a box knows what is in it. Nothing is drawn when the leg carries no labelled box.
 */
export function ParcelContents({
  contents,
  orders,
  compact = false,
  className = "",
}: {
  contents: readonly ParcelContentLine[] | null | undefined;
  orders?: readonly { orderId: string; reference: string }[] | null;
  compact?: boolean;
  className?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const lines = contents ?? [];
  if (lines.length === 0) return null;
  const several = (orders?.length ?? 0) > 1;
  return (
    <div className={`${compact ? "mt-1" : ""} space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 ${className}`} data-testid="parcel-contents">
      <p className="flex items-center gap-1.5 font-semibold text-slate-800">
        <Package className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        {fr ? "Dans les cartons" : "In the boxes"}
        {several && <span className="font-normal text-slate-600">{fr ? `· ${orders!.length} commandes dans le même colis` : `· ${orders!.length} orders packed together`}</span>}
      </p>
      <ul className="space-y-0.5">
        {lines.map((c, i) => (
          <li key={`${i}-${c.orderReference}-${c.name}-${c.variant ?? ""}`} className="flex flex-wrap items-baseline gap-x-2" data-testid="parcel-content-line">
            <span className="min-w-0 break-words">{contentLineText(c, fr)}</span>
            {several && <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{c.orderReference}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
