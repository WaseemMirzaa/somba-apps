"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { STAGE_LABEL, STAGE_OPTIONS, buildParcels, stageVariant, useWarehouseData, type LiveTask, type ParcelStage } from "@/lib/warehouse";
import { shortDate, useOpsQuery } from "@/lib/warehouse-live";

const MIN_AGE = [
  { value: "0", en: "All open parcels", fr: "Tous les colis ouverts" },
  { value: "24", en: "Older than 24 h", fr: "Plus de 24 h" },
  { value: "48", en: "Older than 48 h", fr: "Plus de 48 h" },
  { value: "72", en: "Older than 72 h", fr: "Plus de 72 h" },
];

function ageLabel(hours: number, fr: boolean) {
  if (hours < 48) return `${Math.round(hours)} h`;
  const d = Math.floor(hours / 24);
  return fr ? `${d} j` : `${d} d`;
}

export default function WarehouseAgedPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const ops = useOpsPath();
  const base = useOpsBase();
  const { riders } = useWarehouseData();
  const agedQ = useOpsQuery<LiveTask[]>("warehouse:aged", { initial: [] as LiveTask[], push: ["delivery:updated"] });
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [minAge, setMinAge] = useState("24");

  const parcels = useMemo(
    () => buildParcels(agedQ.data, rt.orders, rt.products, riders),
    [agedQ.data, rt.orders, rt.products, riders],
  );
  const filtered = useMemo(() => {
    const min = Number(minAge);
    return applyListFilters(
      parcels.filter((p) => p.ageHours >= min),
      filters,
      { searchFields: ["id", "orderId", "customer", "seller", "zone"], statusField: "status" },
    );
  }, [parcels, filters, minAge]);

  return (
    <WarehouseListPage
      error={agedQ.error}
      onRetry={() => void agedQ.reload()}
      title={fr ? "Colis bloqués / anciens" : "Aged / Stuck Parcels"}
      subtitle={
        fr
          ? `${filtered.length} colis ouverts non livrés, les plus anciens d'abord`
          : `${filtered.length} open, undelivered parcels, oldest first`
      }
      breadcrumbs={[
        { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
        { label: fr ? "Colis bloqués" : "Aged Parcels" },
      ]}
      actions={
        <select
          aria-label={fr ? "Âge minimum" : "Minimum age"}
          className="input-premium px-3 py-2 text-sm"
          value={minAge}
          onChange={(e) => setMinAge(e.target.value)}
        >
          {MIN_AGE.map((o) => (
            <option key={o.value} value={o.value}>{fr ? o.fr : o.en}</option>
          ))}
        </select>
      }
      filters={
        <div className="space-y-3">
          {agedQ.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{agedQ.error}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={STAGE_OPTIONS.filter((o) => o.value !== "delivered" && o.value !== "exception")}
            searchPlaceholder={fr ? "ID colis, commande, client, vendeur…" : "Parcel ID, order, customer, seller…"}
            showDateFilters={false}
          />
        </div>
      }
      columns={[
        { key: "id", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
          <Link href={ops(`/aged/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "N° commande" : "Order ID" },
        { key: "customer", label: t("customer") },
        { key: "seller", label: fr ? "Vendeur" : "Seller" },
        { key: "status", label: t("status"), render: (row) => {
          const s = String(row.status) as ParcelStage;
          return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
        }},
        { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "ageHours", label: fr ? "Âge" : "Age", render: (row) => (
          <Badge variant={Number(row.ageHours) >= 48 ? "danger" : "warning"}>{ageLabel(Number(row.ageHours), fr)}</Badge>
        )},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/aged/${row.id}`)} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
