"use client";

import { PageHeader } from "@/components/ui/page-header";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { RiderRunCard } from "@/components/warehouse/rider-run-card";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";
import { looseTasks } from "@/lib/rider-runs";
import { useRiderRuns } from "@/lib/rider-runs-live";

export default function RiderHistoryPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { mine, loading } = useRiderData();
  const rr = useRiderRuns(mine);
  // The runs that are over (handed over, every parcel scanned in, or closed) stand for their parcels.
  const finished = looseTasks(mine, rr.runs).filter((t) => t.status === "delivered" || t.status === "failed");
  const count = finished.length + rr.finishedRuns.length;

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Historique des tâches" : "Task History"} subtitle={`${count} ${fr ? "terminées" : "finished"}`} />
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison terminée." : "Nothing finished yet.")}
        </p>
      ) : (
        <div className="space-y-3">
          {rr.finishedRuns.map((run) => (
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
