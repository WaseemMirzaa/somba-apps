"use client";

import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { useLocale } from "@/context/locale-context";
import { useRiderData } from "@/lib/rider";

/** Open work grouped by the delivery zone the server stamped on each task. */
export default function RiderZonePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { riderTasks, loading } = useRiderData();
  const open = riderTasks.filter((t) => t.status !== "delivered" && t.status !== "failed");

  const groups = new Map<string, typeof open>();
  for (const task of open) {
    groups.set(task.zone, [...(groups.get(task.zone) ?? []), task]);
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title={fr ? "Ma zone" : "My Zone"}
        subtitle={fr ? "Livraisons ouvertes, regroupées par zone" : "Open deliveries grouped by zone"}
      />

      {groups.size === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison ouverte." : "No open deliveries.")}
        </p>
      ) : (
        [...groups.entries()].map(([zone, tasks]) => (
          <Card key={zone}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/10">
                  <MapPin className="h-5 w-5 text-[var(--primary)]" />
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{zone}</p>
                  <p className="text-xs text-slate-500">{tasks.length} {fr ? "livraison(s)" : "delivery(ies)"}</p>
                </div>
              </div>
              {tasks.map((task) => (
                <RiderTaskCard key={task.id} task={task} />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
