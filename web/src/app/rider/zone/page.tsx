"use client";

import { MapPin, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { useLocale } from "@/context/locale-context";
import { useRiderAssignment, useRiderData } from "@/lib/rider";

/** The rider's warehouse and zones, then open work grouped by zone (the rider's own zones first). */
export default function RiderZonePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { riderTasks, loading } = useRiderData();
  const assignment = useRiderAssignment();
  const open = riderTasks.filter((t) => t.status !== "delivered" && t.status !== "failed");
  const mineZones = new Set((assignment.data?.preferredZones ?? []).map((z) => z.id));

  const groups = new Map<string, typeof open>();
  for (const task of open) {
    groups.set(task.zone, [...(groups.get(task.zone) ?? []), task]);
  }
  const isMine = (tasks: typeof open) => tasks.some((t) => t.preferred || (t.zoneId != null && mineZones.has(t.zoneId)));
  const ordered = [...groups.entries()].sort(([, a], [, b]) => Number(isMine(b)) - Number(isMine(a)));

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title={fr ? "Ma zone" : "My Zone"}
        subtitle={fr ? "Votre entrepôt, vos zones et les livraisons ouvertes par zone" : "Your warehouse, your zones and open deliveries by zone"}
      />

      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
            <Warehouse className="h-5 w-5 text-emerald-600" />
          </span>
          <div className="min-w-0 text-sm">
            {assignment.error ? (
              <p className="text-red-600">{assignment.error}</p>
            ) : !assignment.data ? (
              <p className="text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>
            ) : assignment.data.hub ? (
              <>
                <p className="font-semibold text-slate-900">{assignment.data.hub.name}</p>
                <p className="text-xs text-slate-500">
                  {fr ? "Vous voyez les livraisons des zones de cet entrepôt : " : "You see deliveries in this warehouse's zones: "}
                  {assignment.data.hubZones.map((z) => z.name).join(", ") || "—"}
                </p>
                {assignment.data.preferredZones.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {fr ? "Vos zones (en premier) : " : "Your zones (listed first): "}
                    {assignment.data.preferredZones.map((z) => z.name).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-slate-600">{fr ? "Aucun entrepôt attribué : vous voyez les livraisons de tous les entrepôts." : "No warehouse assigned: you see every warehouse's deliveries."}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {groups.size === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          {loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison ouverte." : "No open deliveries.")}
        </p>
      ) : (
        ordered.map(([zone, tasks]) => (
          <Card key={zone}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/10">
                  <MapPin className="h-5 w-5 text-[var(--primary)]" />
                </span>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {zone}
                    {isMine(tasks) && <Badge variant="success">{fr ? "Votre zone" : "Your zone"}</Badge>}
                  </p>
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
