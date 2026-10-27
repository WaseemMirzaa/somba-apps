"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useDeskQueue, useWarehouseData } from "@/lib/warehouse";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { formatCurrency } from "@/lib/utils";

export default function WarehouseRidersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { riders, ridersError } = useWarehouseData();
  const queue = useDeskQueue({ status: "all" });
  const parcels = queue.tasks;
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo(
    () =>
      riders.map((r) => {
        const mine = parcels.filter((p) => p.riderId === r.id);
        const delivered = mine.filter((p) => p.status === "delivered");
        return {
          ...r,
          delivered: delivered.length,
          failed: mine.filter((p) => p.status === "failed").length,
          cod: delivered.reduce((s, p) => s + p.codAmountUsd, 0),
        };
      }),
    [riders, parcels],
  );
  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["name", "phone"] }),
    [rows, filters],
  );

  return (
    <WarehouseListPage
      title={fr ? "Livreurs" : "Riders"}
      subtitle={
        fr
          ? "Livreurs actifs de cet entrepôt avec leurs trajets en cours."
          : "Active riders of this warehouse with their live legs."
      }
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("riders") }]}
      filters={
        <div className="space-y-3">
          <HubScopeBar />
          {ridersError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ridersError}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            searchPlaceholder={fr ? "Nom ou téléphone…" : "Name or phone…"}
            showDateFilters={false}
            showStatusFilter={false}
          />
        </div>
      }
      columns={[
        { key: "name", label: fr ? "Nom du livreur" : "Rider Name", render: (row) => (
          <Link href={ops(`/riders/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => row.phone ? (
          <a href={`tel:${String(row.phone).replace(/\s/g, "")}`} className="text-[var(--primary)] hover:underline">{String(row.phone)}</a>
        ) : "—" },
        { key: "activeTasks", label: fr ? "Trajets actifs" : "Active legs", render: (row) => (
          <Badge variant={Number(row.activeTasks) > 0 ? "info" : "default"}>{String(row.activeTasks)}</Badge>
        )},
        { key: "delivered", label: fr ? "Livrées" : "Delivered" },
        { key: "failed", label: fr ? "Échouées" : "Failed" },
        { key: "cod", label: fr ? "COD encaissé" : "COD collected", render: (row) => formatCurrency(Number(row.cod), locale) },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/riders/${row.id}`)} className="text-xs text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
