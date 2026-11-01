"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { RiderGpsPanel } from "@/components/warehouse/rider-gps-panel";
import { RiderTaskCard, RIDER_STATUS_LABEL } from "@/components/warehouse/rider-task-card";
import { RiderRunCard } from "@/components/warehouse/rider-run-card";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { LEG_KIND, pickL } from "@/lib/logistics";
import { RIDER_KIND_ORDER, useRiderData, type RiderTaskStatus } from "@/lib/rider";
import { isActiveRun, looseTasks, runBadge, runBadgeText, runTaskStatus, runWord } from "@/lib/rider-runs";
import { useRiderRuns } from "@/lib/rider-runs-live";

const STATUS_OPTIONS = (["assigned", "picked_up", "in_transit", "delivered", "failed"] as RiderTaskStatus[]).map((v) => ({
  value: v,
  label: RIDER_STATUS_LABEL[v].en,
  labelFr: RIDER_STATUS_LABEL[v].fr,
}));

/**
 * Everything assigned to me, grouped by what it is: customer deliveries, warehouse pickups, transfers, returns.
 * The parcels of a transfer run are not tasks of their own: the run is one card (UC-11) that lists them.
 */
export default function RiderTasksPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { mine, error, loading } = useRiderData();
  const rr = useRiderRuns(mine);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const loose = useMemo(() => looseTasks(mine, rr.runs), [mine, rr.runs]);
  const filtered = useMemo(
    () =>
      applyListFilters(
        loose.map((m) => ({ ...m, kindText: pickL(LEG_KIND[m.kind], fr) })),
        filters,
        { searchFields: ["id", "orderId", "customer", "address", "kindText", "fromName", "toName"], statusField: "status" },
      ),
    [filters, loose, fr],
  );
  // Runs answer the same search and status filter as the tasks: a run reads like the task it replaces (assigned, picked up, on the way, done).
  const runs = useMemo(
    () =>
      applyListFilters(
        rr.runs.map((r) => {
          const badge = runBadge(r, rr.onRoad(r));
          return { run: r, active: isActiveRun(r), taskStatus: runTaskStatus(badge), parcelRefs: rr.parcelsOf(r).map((p) => p.orderId).join(" "), words: `${runBadgeText(badge, fr)} ${runWord("kind_run", fr)}` };
        }),
        filters,
        { searchFields: [(x) => x.run.reference, (x) => x.run.fromHubName ?? "", (x) => x.run.toHubName ?? "", "parcelRefs", "words"], statusField: "taskStatus" },
      ).sort((a, b) => Number(!a.active) - Number(!b.active)),
    [rr, filters, fr],
  );
  const isDone = (x: { status: string }) => x.status === "delivered" || x.status === "failed";
  // Open work first, then what is finished; newest first inside each.
  const groups = RIDER_KIND_ORDER.map((k) => ({
    kind: k,
    tasks: filtered.filter((x) => x.kind === k).sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || +new Date(b.createdAt) - +new Date(a.createdAt)),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("activeTasks")}
        subtitle={fr ? "Votre entrepôt vous assigne vos tâches. Rien à accepter." : "Your warehouse assigns your tasks. Nothing to accept."}
      />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <RiderGpsPanel />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Commande, client, adresse…" : "Order, customer, address…"}
        showDateFilters={false}
      />

      {runs.length > 0 && (
        <section className="space-y-3" data-testid="rider-runs">
          <h2 className="font-semibold text-slate-900">
            {fr ? "Tournées de transfert" : "Transfer runs"} <span className="text-slate-400">({runs.length})</span>
          </h2>
          {runs.map(({ run }) => (
            <RiderRunCard key={run.id} run={run} parcels={rr.parcelsOf(run)} onRoad={rr.onRoad(run)} onMarkOnRoad={rr.markOnRoad} />
          ))}
        </section>
      )}

      {groups.length === 0 && runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          {loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucune tâche pour le moment." : "No tasks right now."}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.kind} className="space-y-3">
            <h2 className="font-semibold text-slate-900">
              {pickL(LEG_KIND[g.kind], fr)} <span className="text-slate-400">({g.tasks.length})</span>
            </h2>
            {g.tasks.map((task) => (
              <RiderTaskCard key={task.id} task={task} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
