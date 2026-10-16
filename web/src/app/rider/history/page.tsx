"use client";

import { PageHeader } from "@/components/ui/page-header";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";

export default function RiderHistoryPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { mine, loading } = useRiderData();
  const finished = mine.filter((t) => t.status === "delivered" || t.status === "failed");

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Historique des tâches" : "Task History"} subtitle={`${finished.length} ${fr ? "terminées" : "finished"}`} />
      {finished.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison terminée." : "Nothing finished yet.")}
        </p>
      ) : (
        <div className="space-y-3">
          {finished.map((task) => (
            <RiderTaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
