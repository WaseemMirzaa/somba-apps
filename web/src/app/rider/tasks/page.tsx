"use client";

import { useMemo, useState } from "react";
import { Hand } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { RiderGpsPanel } from "@/components/warehouse/rider-gps-panel";
import { RiderTaskCard, RIDER_STATUS_LABEL } from "@/components/warehouse/rider-task-card";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage } from "@/lib/warehouse-live";
import { useRiderData, type RiderTaskStatus } from "@/lib/rider";

const STATUS_OPTIONS = (["assigned", "picked_up", "in_transit", "delivered", "failed"] as RiderTaskStatus[]).map((v) => ({
  value: v,
  label: RIDER_STATUS_LABEL[v].en,
  labelFr: RIDER_STATUS_LABEL[v].fr,
}));

export default function RiderTasksPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { available, mine, error, loading, refresh } = useRiderData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      applyListFilters(mine, filters, {
        searchFields: ["id", "orderId", "customer", "address"],
        statusField: "status",
      }),
    [filters, mine],
  );

  async function accept(taskId: string) {
    setBusyId(taskId);
    setActionError(null);
    try {
      await socketClient.request("delivery:accept", { taskId });
      toast(fr ? "Livraison acceptée" : "Delivery accepted");
      await refresh();
    } catch (e) {
      // e.g. someone else took it first — show the server's sentence and refresh the pool
      setActionError(errorMessage(e));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t("activeTasks")} />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <RiderGpsPanel />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">
            {fr ? "Disponibles" : "Available"} <span className="text-slate-400">({available.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            {fr ? "Livraisons ouvertes que personne n'a encore acceptées. Le premier qui accepte la prend." : "Open deliveries nobody has accepted yet. The first rider to accept gets it."}
          </p>
        </div>
        {actionError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
        {available.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison disponible pour le moment." : "No open deliveries right now.")}
          </p>
        ) : (
          available.map((task) => (
            <RiderTaskCard
              key={task.id}
              task={task}
              action={
                <button
                  onClick={() => void accept(task.id)}
                  disabled={busyId !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Hand className="h-4 w-4" />
                  {busyId === task.id ? "…" : (fr ? "Accepter" : "Accept")}
                </button>
              }
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900">
          {fr ? "Mes livraisons" : "My deliveries"} <span className="text-slate-400">({mine.length})</span>
        </h2>
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "Commande, client, adresse…" : "Order, customer, address…"}
          showDateFilters={false}
        />
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            {fr ? "Aucune livraison." : "No deliveries."}
          </p>
        ) : (
          filtered.map((task) => <RiderTaskCard key={task.id} task={task} />)
        )}
      </section>
    </div>
  );
}
