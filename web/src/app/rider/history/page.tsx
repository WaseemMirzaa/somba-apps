"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { RiderRunCard } from "@/components/warehouse/rider-run-card";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";
import { looseTasks } from "@/lib/rider-runs";
import { useRiderRuns } from "@/lib/rider-runs-live";
import { EMPTY_HISTORY_FILTER, filterFinishedRuns, filterFinishedTasks, isFiltering } from "@/lib/rider-history";

export default function RiderHistoryPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { mine, loading } = useRiderData();
  const rr = useRiderRuns(mine);
  // The runs that are over (handed over, every parcel scanned in, or closed) stand for their parcels.
  const allFinished = looseTasks(mine, rr.runs).filter((t) => t.status === "delivered" || t.status === "failed");
  const [filter, setFilter] = useState(EMPTY_HISTORY_FILTER);
  const filtering = isFiltering(filter);
  const finished = useMemo(() => filterFinishedTasks(allFinished, filter), [allFinished, filter]);
  const finishedRuns = useMemo(() => filterFinishedRuns(rr.finishedRuns, (run) => rr.parcelsOf(run).map((p) => p.orderId), filter), [rr, filter]);
  const total = allFinished.length + rr.finishedRuns.length;
  const count = finished.length + finishedRuns.length;
  const input = "input-premium w-full px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Historique des tâches" : "Task History"} subtitle={`${filtering ? `${count} / ${total}` : count} ${fr ? "terminées" : "finished"}`} />
      {total > 0 && (
        <div className="space-y-2" data-testid="history-filters">
          <input
            className={input}
            type="search"
            autoComplete="off"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder={fr ? "Rechercher par référence de commande" : "Search by order reference"}
            aria-label={fr ? "Rechercher par référence de commande" : "Search by order reference"}
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-600">
              {fr ? "Du" : "From"}
              <input className={`${input} mt-1`} type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              {fr ? "Au" : "To"}
              <input className={`${input} mt-1`} type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
            </label>
            {filtering && (
              <button type="button" onClick={() => setFilter(EMPTY_HISTORY_FILTER)} className="pb-2 text-sm text-emerald-700 hover:underline">
                {fr ? "Effacer" : "Clear"}
              </button>
            )}
          </div>
        </div>
      )}
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {loading ? (fr ? "Chargement…" : "Loading…") : filtering ? (fr ? "Aucune tâche terminée ne correspond." : "No finished task matches.") : fr ? "Aucune livraison terminée." : "Nothing finished yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {finishedRuns.map((run) => (
            <RiderRunCard key={run.id} run={run} parcels={rr.parcelsOf(run)} onRoad={rr.onRoad(run)} onMarkOnRoad={rr.markOnRoad} />
          ))}
          {finished.map((task) => (
            <RiderTaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
