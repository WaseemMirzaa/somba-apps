"use client";

import Link from "next/link";
import { Bike, CheckCircle, DollarSign, Warehouse, Banknote } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RiderGpsPanel } from "@/components/warehouse/rider-gps-panel";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { RiderRunCard } from "@/components/warehouse/rider-run-card";
import { useLocale } from "@/context/locale-context";
import { useRiderAssignment, useRiderData } from "@/lib/rider";
import { looseTasks } from "@/lib/rider-runs";
import { useRiderRuns } from "@/lib/rider-runs-live";
import { formatCurrency } from "@/lib/utils";

function Kpi({ title, value, icon: Icon }: { title: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 break-words font-[family-name:var(--font-display)] text-xl leading-tight font-bold text-slate-900">{value}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <Icon className="h-4 w-4 text-emerald-600" />
        </div>
      </div>
    </div>
  );
}

export default function RiderDashboardPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { riderProfile, getActiveRiderTasks, mine, earnings, error, loading } = useRiderData();
  const rr = useRiderRuns(mine);
  const assignment = useRiderAssignment();
  // A transfer run is one card; its parcels are not listed again as tasks of their own.
  const activeTasks = looseTasks(getActiveRiderTasks(), rr.runs);
  const activeCount = activeTasks.length + rr.activeRuns.length;

  return (
    <div className="space-y-6">
      <PageHeader title={riderProfile.name} subtitle={t("welcome")} />

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <RiderGpsPanel />

      <div className="grid grid-cols-2 gap-3">
        <Kpi title={t("activeTasks")} value={String(activeCount)} icon={Bike} />
        <Kpi title={fr ? "Mon entrepôt" : "My warehouse"} value={assignment.data?.hub?.name ?? "—"} icon={Warehouse} />
        <Kpi title={fr ? "Tâches terminées" : "Tasks done"} value={String(earnings?.delivered ?? 0)} icon={CheckCircle} />
        <Kpi title={t("earnings")} value={formatCurrency(earnings?.earningsUsd ?? 0, locale)} icon={DollarSign} />
        <Kpi title={fr ? "COD encaissé" : "COD collected"} value={formatCurrency(earnings?.codCollectedUsd ?? 0, locale)} icon={Banknote} />
      </div>

      <p className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        {fr
          ? "Votre entrepôt vous assigne vos tâches : vous n'avez rien à accepter. Une notification vous prévient à chaque nouvelle tâche."
          : "Your warehouse assigns your tasks: there is nothing to accept. A notification tells you about each new task."}
      </p>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{fr ? "Mes tâches en cours" : "My current tasks"}</h2>
          <Link href="/rider/tasks" className="text-sm text-emerald-600 hover:underline">
            {fr ? "Toutes les tâches" : "All tasks"}
          </Link>
        </div>
        {activeCount === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune tâche en cours." : "No active tasks.")}
          </p>
        ) : (
          <div className="space-y-3">
            {rr.activeRuns.map((run) => (
              <RiderRunCard key={run.id} run={run} parcels={rr.parcelsOf(run)} onRoad={rr.onRoad(run)} onMarkOnRoad={rr.markOnRoad} />
            ))}
            {activeTasks.map((task) => (
              <RiderTaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
