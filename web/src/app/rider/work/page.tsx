"use client";

import Link from "next/link";
import { Activity, CheckCircle, Info, Percent, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { useLocale } from "@/context/locale-context";
import { LEG_KIND, pickL } from "@/lib/logistics";
import { useRiderData } from "@/lib/rider";

/**
 * "My work": the rider's workload, computed by the server (`rider:workStats`). Riders are salaried, so there is no money
 * on this page.
 */
export default function RiderWorkPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { stats, mine, loading, error } = useRiderData();
  const delivered = mine.filter((x) => x.status === "delivered");

  return (
    <div className="space-y-6">
      <PageHeader title={t("myWork")} subtitle={fr ? "Calculé par le serveur à partir de vos tâches" : "Calculated by the server from your tasks"} />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!stats ? (
        <p className="text-center text-sm text-slate-500">{loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune donnée." : "No data.")}</p>
      ) : (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-5 text-white">
            <p className="text-sm opacity-90">{t("myWork")}</p>
            <p data-testid="work-today" className="mt-1 font-[family-name:var(--font-display)] text-4xl font-bold">{stats.completedToday}</p>
            <p className="text-sm font-medium">{fr ? "tâches terminées aujourd'hui" : "tasks completed today"}</p>
            <p data-testid="work-week-all" className="mt-1 text-xs opacity-85">
              {fr ? `${stats.completedLast7Days} cette semaine · ${stats.completed} au total` : `${stats.completedLast7Days} this week · ${stats.completed} all time`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard title={fr ? "Terminées" : "Completed"} value={stats.completed} icon={CheckCircle} />
            <StatCard title={fr ? "En cours" : "In progress"} value={stats.active} icon={Activity} />
            <StatCard title={fr ? "Échouées" : "Failed"} value={stats.failed} icon={XCircle} />
            <StatCard title={fr ? "Taux de réussite" : "Success rate"} value={stats.successRate == null ? "—" : `${stats.successRate}%`} icon={Percent} />
          </div>
          {stats.byKind.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Terminées par type" : "Completed by type"}</h2>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {stats.byKind.map((k) => (
                    <li key={k.kind} className="flex items-center justify-between py-2">
                      <span>{pickL(LEG_KIND[k.kind], fr)}</span>
                      <span className="font-semibold text-slate-900">{k.count}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <p data-testid="work-salary-note" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {fr
              ? "Vous êtes salarié de KOMORIKO. Ces chiffres montrent votre travail, pas votre paie."
              : "You are paid a salary by KOMORIKO. These numbers show your work, not your pay."}
          </p>
        </>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Tâches terminées" : "Completed tasks"}</h2>
          {delivered.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucune tâche terminée pour l'instant." : "No completed tasks yet."}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {delivered.map((d) => (
                <li key={d.id}>
                  <Link href={`/rider/tasks/${d.id}`} className="flex items-center justify-between py-3 text-sm">
                    <span>
                      <span className="font-medium text-slate-900">{d.orderId}</span>
                      <span className="block text-xs text-slate-500">{d.customer}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
