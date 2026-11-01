"use client";

import { Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { TIER_LABEL, pickL, useHubs } from "@/lib/logistics";
import { useHubScope } from "@/lib/warehouse";

/**
 * Which warehouse am I looking at? Staff see their own warehouse and tier; admins (in /admin/fulfillment) pick one
 * warehouse or all of them, and every page below passes it as `hubId`.
 */
export function HubScopeBar() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { isAdmin, picked, setPicked, effectiveHubId, tier } = useHubScope();
  const { hubs, byId } = useHubs();

  if (isAdmin) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm">
        <Warehouse className="h-4 w-4 text-[var(--primary)]" />
        <label htmlFor="ops-hub" className="font-medium text-slate-700">
          {fr ? "Entrepôt" : "Warehouse"}
        </label>
        <select
          id="ops-hub"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="input-premium px-3 py-1.5 text-sm"
        >
          <option value="">{fr ? "Tous les entrepôts" : "All warehouses"}</option>
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} · {h.city}
              {h.active ? "" : fr ? " (inactif)" : " (inactive)"}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">
          {fr ? "Les écrans qui ont besoin d'un entrepôt (stock en garde, analyses) utilisent celui-ci." : "Screens that need one warehouse (custody, analytics) use this one."}
        </span>
      </div>
    );
  }

  const hub = effectiveHubId ? byId.get(effectiveHubId) : undefined;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm">
      <Warehouse className="h-4 w-4 text-[var(--primary)]" />
      <span className="font-medium text-slate-800">{hub ? (hub.name.toLowerCase().includes(hub.city.toLowerCase()) ? hub.name : `${hub.name} · ${hub.city}`) : fr ? "Mon entrepôt" : "My warehouse"}</span>
      {tier && <Badge variant="primary">{pickL(TIER_LABEL[tier], fr)}</Badge>}
    </div>
  );
}
