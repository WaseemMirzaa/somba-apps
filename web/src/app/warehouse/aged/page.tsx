"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { LEG_KIND, LEG_STATUS, endpointName, legStatusVariant, pickL } from "@/lib/logistics";
import { isOpenLeg, legAgeHours, parcelCode, riderLabel, useDeskQueue, useHubScope } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useAgedSummary } from "@/lib/warehouse-ops";
import { ageText, canReturnLeg, levelOfAge } from "@/lib/warehouse-ops-format";
import { ReturnToSellerDialog } from "@/components/warehouse/return-to-seller-dialog";

/** Until the warehouse's own ages arrive (or for a warehouse that never changed them). */
const DEFAULT_LEVELS: readonly number[] = [24, 48, 72];

const STATUS_OPTIONS = (["unassigned", "assigned", "picked_up", "in_transit"] as const).map((v) => ({ value: v, label: LEG_STATUS[v].en, labelFr: LEG_STATUS[v].fr }));

export default function WarehouseAgedPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useDeskQueue({ status: "open" });
  const { canAssign, isAdmin } = useHubScope();
  // The ages come from the warehouse's own settings (default 24 / 48 / 72 h); the board is for supervisors and above.
  const summaryQ = useAgedSummary(canAssign || isAdmin);
  const levels = summaryQ.data?.levels ?? DEFAULT_LEVELS;
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [minAge, setMinAge] = useState("first");
  const [returning, setReturning] = useState<{ id: string; code: string; orderReference: string } | null>(null);
  const minAgeOptions = [
    { value: "0", en: "All open legs", fr: "Tous les trajets ouverts" },
    { value: "first", en: `Alert level 1 and above (${levels[0]} h)`, fr: `Niveau d'alerte 1 et plus (${levels[0]} h)` },
    { value: "second", en: `Alert level 2 and above (${levels[1]} h)`, fr: `Niveau d'alerte 2 et plus (${levels[1]} h)` },
    { value: "third", en: `Escalated, level 3 (${levels[2]} h)`, fr: `Remonté, niveau 3 (${levels[2]} h)` },
  ];
  const minHours = minAge === "first" ? levels[0] : minAge === "second" ? levels[1] : minAge === "third" ? levels[2] : 0;

  const rows = useMemo(
    () =>
      q.tasks
        .filter(isOpenLeg)
        .map((t) => ({
          ...t,
          code: parcelCode(t),
          ageHours: legAgeHours(t),
          level: levelOfAge(legAgeHours(t), levels),
          alertedAt: summaryQ.data?.byTask[t.id]?.alertedAt ?? null,
          canReturn: (canAssign || isAdmin) && canReturnLeg(t),
          route: `${endpointName(t.from, fr)} → ${endpointName(t.to, fr)}`,
          riderText: riderLabel(t, fr),
        }))
        .sort((a, b) => b.ageHours - a.ageHours),
    [q.tasks, fr, levels, summaryQ.data, canAssign, isAdmin],
  );
  const filtered = useMemo(() => {
    return applyListFilters(rows.filter((p) => p.ageHours >= minHours), filters, {
      searchFields: ["code", "orderReference", "route", "sellerName", "riderText"],
      statusField: "status",
    });
  }, [rows, filters, minHours]);

  return (
    <>
    <WarehouseListPage
      error={q.error}
      onRetry={() => void q.reload()}
      title={fr ? "Colis bloqués / anciens" : "Aged / Stuck Parcels"}
      subtitle={
        fr
          ? `${filtered.length} trajets ouverts, les plus anciens d'abord`
          : `${filtered.length} open legs, oldest first`
      }
      breadcrumbs={[
        { label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
        { label: fr ? "Colis bloqués" : "Aged Parcels" },
      ]}
      actions={
        <select aria-label={fr ? "Âge minimum" : "Minimum age"} className="input-premium px-3 py-2 text-sm" value={minAge} onChange={(e) => setMinAge(e.target.value)}>
          {minAgeOptions.map((o) => (
            <option key={o.value} value={o.value}>{fr ? o.fr : o.en}</option>
          ))}
        </select>
      }
      filters={
        <div className="space-y-3">
          <HubScopeBar />
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={STATUS_OPTIONS}
            searchPlaceholder={fr ? "Colis, commande, vendeur, livreur…" : "Parcel, order, seller, rider…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "code", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
          <Link href={ops(`/tasks/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.code)}</Link>
        )},
        { key: "orderReference", label: fr ? "N° commande" : "Order ID" },
        { key: "kind", label: fr ? "Type" : "Type", render: (row) => pickL(LEG_KIND[row.kind as keyof typeof LEG_KIND], fr) },
        { key: "route", label: fr ? "Trajet" : "Route" },
        { key: "riderText", label: fr ? "Livreur" : "Rider" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={legStatusVariant(String(row.status))}>{pickL(LEG_STATUS[row.status as keyof typeof LEG_STATUS], fr)}</Badge>
        )},
        { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "ageHours", label: fr ? "Âge" : "Age", render: (row) => (
          <Badge variant={Number(row.level) >= 2 ? "danger" : "warning"}>{ageText(Number(row.ageHours), fr)}</Badge>
        )},
        { key: "level", label: fr ? "Alerte" : "Alert", render: (row) => {
          const level = Number(row.level);
          if (level === 0) return <span className="text-slate-400">—</span>;
          return (
            <span title={row.alertedAt ? (fr ? `Alerte envoyée ${shortDate(String(row.alertedAt), locale)}` : `Alert sent ${shortDate(String(row.alertedAt), locale)}`) : undefined}>
              <Badge variant={level >= 3 ? "danger" : level === 2 ? "warning" : "info"}>
                {level >= 3 ? (fr ? "Niveau 3 · remonté" : "Level 3 · escalated") : fr ? `Niveau ${level}` : `Level ${level}`}
              </Badge>
            </span>
          );
        }},
        { key: "actions", label: t("action"), render: (row) => (
          <span className="flex flex-wrap items-center gap-3">
            <Link href={ops(`/tasks/${row.id}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
            {row.canReturn === true && (
              <button type="button" className="text-sm font-medium text-red-600 hover:underline" onClick={() => setReturning({ id: String(row.id), code: String(row.code), orderReference: String(row.orderReference) })}>
                {fr ? "Retourner au vendeur" : "Return to seller"}
              </button>
            )}
          </span>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
    {returning && <ReturnToSellerDialog parcel={returning} onClose={() => setReturning(null)} onDone={() => { void q.reload(); void summaryQ.reload(); }} />}
    </>
  );
}
