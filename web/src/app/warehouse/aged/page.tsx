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
import { isOpenLeg, legAgeHours, parcelCode, riderLabel, useDeskQueue } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";

const MIN_AGE = [
  { value: "0", en: "All open legs", fr: "Tous les trajets ouverts" },
  { value: "24", en: "Older than 24 h", fr: "Plus de 24 h" },
  { value: "48", en: "Older than 48 h", fr: "Plus de 48 h" },
  { value: "72", en: "Older than 72 h", fr: "Plus de 72 h" },
];

const STATUS_OPTIONS = (["unassigned", "assigned", "picked_up", "in_transit"] as const).map((v) => ({ value: v, label: LEG_STATUS[v].en, labelFr: LEG_STATUS[v].fr }));

function ageLabel(hours: number, fr: boolean) {
  if (hours < 48) return `${Math.round(hours)} h`;
  const d = Math.floor(hours / 24);
  return fr ? `${d} j` : `${d} d`;
}

export default function WarehouseAgedPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useDeskQueue({ status: "open" });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [minAge, setMinAge] = useState("24");

  const rows = useMemo(
    () =>
      q.tasks
        .filter(isOpenLeg)
        .map((t) => ({
          ...t,
          code: parcelCode(t),
          ageHours: legAgeHours(t),
          route: `${endpointName(t.from, fr)} → ${endpointName(t.to, fr)}`,
          riderText: riderLabel(t, fr),
        }))
        .sort((a, b) => b.ageHours - a.ageHours),
    [q.tasks, fr],
  );
  const filtered = useMemo(() => {
    const min = Number(minAge);
    return applyListFilters(rows.filter((p) => p.ageHours >= min), filters, {
      searchFields: ["code", "orderReference", "route", "sellerName", "riderText"],
      statusField: "status",
    });
  }, [rows, filters, minAge]);

  return (
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
          {MIN_AGE.map((o) => (
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
          <Badge variant={Number(row.ageHours) >= 48 ? "danger" : "warning"}>{ageLabel(Number(row.ageHours), fr)}</Badge>
        )},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/tasks/${row.id}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
