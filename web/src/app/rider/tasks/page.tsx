"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { RiderGpsPanel } from "@/components/warehouse/rider-gps-panel";
import { RiderTaskCard, RIDER_STATUS_LABEL } from "@/components/warehouse/rider-task-card";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { LEG_KIND, pickL } from "@/lib/logistics";
import { RIDER_KIND_ORDER, useRiderData, type RiderTaskStatus } from "@/lib/rider";

const STATUS_OPTIONS = (["assigned", "picked_up", "in_transit", "delivered", "failed"] as RiderTaskStatus[]).map((v) => ({
  value: v,
  label: RIDER_STATUS_LABEL[v].en,
  labelFr: RIDER_STATUS_LABEL[v].fr,
}));

/** Everything assigned to me, grouped by what it is: customer deliveries, warehouse pickups, transfers, returns. */
export default function RiderTasksPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { mine, error, loading } = useRiderData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(
        mine.map((m) => ({ ...m, kindText: pickL(LEG_KIND[m.kind], fr) })),
        filters,
        { searchFields: ["id", "orderId", "customer", "address", "kindText", "fromName", "toName"], statusField: "status" },
      ),
    [filters, mine, fr],
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

      {groups.length === 0 ? (
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
