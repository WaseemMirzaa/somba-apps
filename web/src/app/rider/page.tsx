"use client";

import Link from "next/link";
import { Bike, CheckCircle, DollarSign, Hand, Banknote } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RiderGpsPanel } from "@/components/warehouse/rider-gps-panel";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";
import { formatCurrency } from "@/lib/utils";

function Kpi({ title, value, icon: Icon }: { title: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 truncate font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">{value}</p>
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
  const { riderProfile, getActiveRiderTasks, available, earnings, error, loading } = useRiderData();
  const activeTasks = getActiveRiderTasks();

  return (
    <div className="space-y-6">
      <PageHeader title={riderProfile.name} subtitle={t("welcome")} />

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <RiderGpsPanel />

      <div className="grid grid-cols-2 gap-3">
        <Kpi title={t("activeTasks")} value={String(activeTasks.length)} icon={Bike} />
        <Kpi title={fr ? "Disponibles" : "Available"} value={String(available.length)} icon={Hand} />
        <Kpi title={fr ? "Livrées" : "Delivered"} value={String(earnings?.delivered ?? 0)} icon={CheckCircle} />
        <Kpi title={t("earnings")} value={formatCurrency(earnings?.earningsUsd ?? 0, locale)} icon={DollarSign} />
        <Kpi title={fr ? "COD encaissé" : "COD collected"} value={formatCurrency(earnings?.codCollectedUsd ?? 0, locale)} icon={Banknote} />
      </div>

      {available.length > 0 && (
        <Link
          href="/rider/tasks"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <span>
            <strong>{available.length}</strong> {fr ? "livraison(s) disponible(s) à accepter" : "open delivery(ies) you can accept"}
          </span>
          <span className="font-semibold">{fr ? "Voir →" : "View →"}</span>
        </Link>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{fr ? "Mes livraisons en cours" : "My current deliveries"}</h2>
          <Link href="/rider/tasks" className="text-sm text-emerald-600 hover:underline">
            {fr ? "Toutes les tâches" : "All tasks"}
          </Link>
        </div>
        {activeTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison en cours." : "No active deliveries.")}
          </p>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <RiderTaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
