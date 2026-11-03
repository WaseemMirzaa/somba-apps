"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { OpsError } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { LEG_KIND, pickL } from "@/lib/logistics";
import { useHubScope } from "@/lib/warehouse";
import { formatMinutes } from "@/lib/warehouse-live";
import { useLegAnalytics } from "@/lib/warehouse-ops";
import { defaultRange, hoursText, pctText, rangeProblem } from "@/lib/warehouse-ops-format";

/**
 * Delivery performance for a period: the on-time rate against the warehouse's delivery-time target, the average time per leg,
 * and what each rider completed and failed. Counts and times only: riders are salaried, nothing here shows pay.
 */
export function OpsPerformance() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { canManage, isAdmin } = useHubScope();
  const [range, setRange] = useState(() => defaultRange());
  const [draft, setDraft] = useState(range);
  const problem = rangeProblem(draft.from, draft.to, fr);
  const q = useLegAnalytics(range, canManage || isAdmin);
  const an = q.data;
  const num = (n: number) => n.toLocaleString(fr ? "fr-FR" : "en-US");

  const legRows = useMemo(
    () =>
      (an?.legs ?? []).map((l) => ({
        kind: pickL(LEG_KIND[l.kind as keyof typeof LEG_KIND], fr) || l.kind,
        completed: l.completed,
        failed: l.failed,
        avg: hoursText(l.avgHours, fr),
        transit: l.avgTransitMinutes == null ? "—" : formatMinutes(l.avgTransitMinutes, fr),
      })),
    [an, fr],
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{fr ? "Performance des livraisons" : "Delivery performance"}</h2>
        <p className="text-xs text-slate-500">
          {fr
            ? "Taux de livraison à l'heure, durée moyenne par trajet et résultats par livreur sur la période (jours UTC). Uniquement des nombres et des durées."
            : "On-time rate, average time per leg and each rider's results over the period (UTC days). Counts and times only."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) setRange({ ...draft });
          }}
        >
          <label className="text-xs font-medium text-slate-600">
            {fr ? "Du" : "From"}
            <input type="date" className="input-premium mt-1 block px-3 py-2 text-sm" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            {fr ? "Au" : "To"}
            <input type="date" className="input-premium mt-1 block px-3 py-2 text-sm" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </label>
          <button type="submit" disabled={!!problem} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {fr ? "Appliquer" : "Apply"}
          </button>
          <button type="button" className="px-2 py-2 text-sm text-slate-600 hover:text-slate-900" onClick={() => { const r = defaultRange(); setDraft(r); setRange(r); }}>
            {fr ? "30 derniers jours" : "Last 30 days"}
          </button>
        </form>
        {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
        {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title={fr ? "Livrées à l'heure" : "Delivered on time"} value={an ? pctText(an.onTime.ratePct) : "…"} icon={CheckCircle2} />
          <StatCard title={fr ? "Livraisons terminées" : "Deliveries completed"} value={an ? num(an.onTime.deliveries) : "…"} icon={Clock} />
          <StatCard title={fr ? "Échecs (livreurs)" : "Failed (riders)"} value={an ? num(an.totals.failed) : "…"} icon={XCircle} />
        </div>
        {an && (
          <p className="-mt-2 text-xs text-slate-500">
            {fr
              ? `${an.onTime.onTime} à l'heure, ${an.onTime.late} en retard${an.targetHours != null ? ` · objectif : ${an.targetHours} h entre l'ouverture du trajet à l'entrepôt et la remise au client` : " · chaque entrepôt est mesuré sur son propre objectif"}. ${an.totals.voided > 0 ? `${an.totals.voided} trajet${an.totals.voided > 1 ? "s" : ""} clos par le système ou le personnel ne comptent pas comme échecs.` : ""}`
              : `${an.onTime.onTime} on time, ${an.onTime.late} late${an.targetHours != null ? ` · target: ${an.targetHours} h from the leg opening at the warehouse to hand-over` : " · each warehouse is measured against its own target"}. ${an.totals.voided > 0 ? `${an.totals.voided} leg${an.totals.voided > 1 ? "s" : ""} closed by the system or staff do not count as failures.` : ""}`}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Durée moyenne par trajet" : "Average time per leg"}</h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <DataTable
                emptyMessage={fr ? "Aucun trajet terminé sur la période." : "No legs finished in this period."}
                columns={[
                  { key: "kind", label: fr ? "Trajet" : "Leg" },
                  { key: "completed", label: fr ? "Terminés" : "Done" },
                  { key: "failed", label: fr ? "Échecs" : "Failed" },
                  { key: "avg", label: fr ? "Ouverture → fin" : "Open → done" },
                  { key: "transit", label: fr ? "Ramassage → remise" : "Pickup → hand-over" },
                ]}
                data={legRows as unknown as Record<string, unknown>[]}
              />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Livreurs" : "Riders"}</h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <DataTable
                emptyMessage={fr ? "Aucun trajet confié à un livreur sur la période." : "No rider finished a leg in this period."}
                columns={[
                  { key: "name", label: fr ? "Livreur" : "Rider", render: (row) => <span className="font-medium text-slate-900">{String(row.name)}</span> },
                  { key: "completed", label: fr ? "Terminés" : "Completed" },
                  { key: "failed", label: fr ? "Échecs" : "Failed", render: (row) => <Badge variant={Number(row.failed) > 0 ? "warning" : "default"}>{String(row.failed)}</Badge> },
                  { key: "successRatePct", label: fr ? "Taux de réussite" : "Success rate", render: (row) => pctText(row.successRatePct as number | null) },
                ]}
                data={(an?.riders ?? []) as unknown as Record<string, unknown>[]}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
