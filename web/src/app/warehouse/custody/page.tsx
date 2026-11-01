"use client";

import { ArrowDownToLine, Boxes, ArrowUpFromLine } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LegCard } from "@/components/warehouse/leg-card";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { OpsError, OpsLoading } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useOpsBase } from "@/lib/ops-path";
import type { Custody } from "@/lib/logistics";
import { fmtDateTime, isHubBound } from "@/lib/logistics";
import { useHubScope, waitingForText, type DeskTask } from "@/lib/warehouse";
import { useOpsQuery } from "@/lib/warehouse-live";

/** The parcels in this warehouse's custody: on their way in, on the shelves, on their way out (`logistics:custody`). */
export default function WarehouseCustodyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const { hubId, isAdmin } = useHubScope();
  const needsPick = isAdmin && !hubId;
  const q = useOpsQuery<Custody | null>("logistics:custody", {
    initial: null,
    body: hubId ? { hubId } : {},
    push: ["task:updated", "hub:updated"],
    enabled: !needsPick,
  });
  const data = q.data;

  // The custody lists carry no desk flags: derive them from the list the leg is in (the server still decides).
  const flagsFor = (t: DeskTask, mode: "in" | "hand" | "out") => ({
    assign: false,
    scanIn: mode === "in" && isHubBound(t.kind) && t.status !== "delivered" && t.status !== "failed",
    scanOut: mode === "out" && t.status === "assigned",
  });

  const section = (title: string, hint: string, rows: DeskTask[], mode: "in" | "hand" | "out") => (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-slate-900">
          {title} <span className="text-slate-400">({rows.length})</span>
        </h2>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">{fr ? "Rien ici." : "Nothing here."}</p>
      ) : (
        rows.map((t) => (
          <div key={t.id} className="space-y-1">
            <LegCard task={{ ...t, desk: t.desk ?? flagsFor(t, mode) }} onChanged={() => void q.reload()} />
            {mode === "hand" && (
              <p className="px-1 text-xs text-slate-500">
                {fr ? "Au dépôt depuis " : "On the shelf since "}
                {fmtDateTime((t as unknown as { since?: string }).since, fr)} · {waitingForText((t as unknown as { waitingFor?: string }).waitingFor, fr)}
              </p>
            )}
          </div>
        ))
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Colis en garde" : "Parcels in custody"}
        subtitle={fr ? "Ce que l'entrepôt attend, garde et fait partir." : "What the warehouse expects, holds and sends out."}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Colis en garde" : "Custody" }]}
      />
      <HubScopeBar />
      {needsPick ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {fr ? "Choisissez un entrepôt ci-dessus pour voir ses colis en garde." : "Pick a warehouse above to see its parcels in custody."}
        </p>
      ) : q.error ? (
        <OpsError message={q.error} onRetry={() => void q.reload()} />
      ) : !data ? (
        <OpsLoading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title={fr ? "En route vers l'entrepôt" : "Inbound"} value={data.inbound.length} icon={ArrowDownToLine} />
            <StatCard title={fr ? "En stock à l'entrepôt" : "On hand"} value={data.onHand.length} icon={Boxes} />
            <StatCard title={fr ? "En route vers la sortie" : "Outbound"} value={data.outbound.length} icon={ArrowUpFromLine} />
          </div>
          {section(fr ? "Entrants" : "Inbound", fr ? "Colis attendus : à scanner à l'arrivée." : "Parcels on their way here: scan them in on arrival.", data.inbound as DeskTask[], "in")}
          {section(fr ? "En stock" : "On hand", fr ? "Colis scannés, en attente du prochain trajet." : "Scanned in and waiting for the next leg.", data.onHand as DeskTask[], "hand")}
          {section(fr ? "Sortants" : "Outbound", fr ? "Trajets qui partent de cet entrepôt." : "Legs leaving this warehouse.", data.outbound as DeskTask[], "out")}
        </>
      )}
    </div>
  );
}
