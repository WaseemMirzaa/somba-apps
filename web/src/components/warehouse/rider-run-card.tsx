"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ChevronDown, ChevronUp, CircleAlert, Navigation, PackageCheck, PackageOpen, Route, Truck, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { mapsLinkTo } from "@/lib/google-maps";
import type { RiderTask } from "@/lib/rider";
import {
  handoverText,
  runBadge,
  runBadgeText,
  runBadgeVariant,
  runHop,
  runHopText,
  runMissingText,
  runReceivedText,
  runTitleText,
  runWord,
  showsHandover,
  showsReceived,
  type RiderRun,
} from "@/lib/rider-runs";
import { errorMessage } from "@/lib/warehouse-live";

/**
 * One card for a transfer run (UC-11), as the rider app draws it: where it goes and how many parcels, the parcels, "On the
 * road", and the hand-over at the receiving warehouse (its staff scan the run in; the driver has nothing to confirm).
 * The parcels of the run are listed inside it, never again as tasks of their own.
 */
export function RiderRunCard({
  run,
  parcels,
  onRoad,
  onMarkOnRoad,
}: {
  run: RiderRun;
  /** The run's parcels that are in this rider's list. */
  parcels: RiderTask[];
  onRoad: boolean;
  /** `rider:runStatus { runId, status: 'in_transit' }`; rejects with the server's message. */
  onMarkOnRoad: (runId: string) => Promise<void>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = runBadge(run, onRoad);
  const hop = runHop(run, parcels);
  const to = run.toHubName ?? runWord("the_warehouse", fr);
  const handover = showsHandover(run) ? handoverText(run, onRoad, fr) : null;
  // Where the driver heads: the receiving warehouse, from the first parcel (they all go to the same one).
  const destGeo = parcels[0]?.geo ?? null;
  const destAddress = parcels[0]?.to?.address ?? null;
  const canNavigate = run.status === "dispatched" && (!!destGeo || !!destAddress);

  async function markOnRoad() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMarkOnRoad(run.id);
      toast(runWord("done_run_on_road", fr));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-premium p-4" data-testid="rider-run" data-run-id={run.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{run.reference}</span>
        <Badge variant="purple">{runWord("kind_run", fr)}</Badge>
        <span data-testid="run-status">
          <Badge variant={runBadgeVariant(badge)}>{runBadgeText(badge, fr)}</Badge>
        </span>
      </div>

      {hop && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700" data-testid="run-hop">
          <Route className="h-3.5 w-3.5 shrink-0" />
          {runHopText(hop, run.fromHubName, run.toHubName, fr)}
        </p>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-slate-800" data-testid="run-title">
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-400" />
        {runTitleText(run.toHubName, run.count, fr)}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        <Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        {runWord("leg_transfer_from", fr, { name: run.fromHubName ?? runWord("the_warehouse", fr) })}
      </p>
      {showsReceived(run) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500" data-testid="run-received">
          <PackageCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {runReceivedText(run.receivedCount, run.count, fr)}
        </p>
      )}
      {run.missingCount > 0 && (
        <p role="alert" className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" data-testid="run-missing">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {runMissingText(run.missingCount, fr)}
        </p>
      )}

      {parcels.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
            data-testid="run-parcels-toggle"
          >
            <PackageOpen className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="flex-1">{runWord("run_parcels", fr, { n: parcels.length })}</span>
            {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {open && (
            <ul className="mt-1 space-y-1 pl-6" data-testid="run-parcels">
              {parcels.map((p) => (
                <li key={p.id} className="text-sm leading-snug text-slate-700" data-testid="run-parcel">
                  <Link href={`/rider/tasks/${p.id}`} className="hover:underline">
                    <span className="font-semibold text-slate-900">{p.orderId}</span>
                    {` · ${p.legItemsText(fr) !== "—" ? p.legItemsText(fr) : `${p.items} ${fr ? "article(s)" : "item(s)"}`}`}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {run.status === "planned" && (
        <p className="mt-2 text-xs text-slate-500" data-testid="run-wait-load">
          {runWord("run_wait_load", fr)}
        </p>
      )}
      {handover && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900" data-testid="run-handover">
          <Warehouse className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{handover.title}</p>
            {handover.hint && <p className="mt-0.5 text-xs text-slate-500">{handover.hint}</p>}
          </div>
        </div>
      )}

      {canNavigate && (
        <a
          href={destGeo ? mapsLinkTo(destGeo) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destAddress ?? to)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
          data-testid="run-navigate"
        >
          <Navigation className="h-3.5 w-3.5" />
          {runWord("navigate_hub", fr)}
        </a>
      )}

      {run.status === "dispatched" && !onRoad && (
        <button
          type="button"
          onClick={() => void markOnRoad()}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          data-testid="run-on-road"
        >
          <Truck className="h-4 w-4" />
          {busy ? "…" : runWord("act_run_on_road", fr)}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
