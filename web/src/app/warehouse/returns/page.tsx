"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { shortDate } from "@/lib/warehouse-live";
import {
  RETURN_PHASE_LABEL,
  RETURN_PHASE_OPTIONS,
  RETURN_PHASE_VARIANT,
  RETURN_STAGE_LABEL,
  returnItemsText,
  useReturns,
  type ReturnPhase,
} from "@/lib/warehouse-returns";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

export default function WarehouseReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { returns, error, reload } = useReturns();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const rows = useMemo(
    () => returns.map((r) => ({ ...r, itemsText: returnItemsText(r.items, fr), stageText: (RETURN_STAGE_LABEL[r.stage ?? "closed"] ?? { en: r.stage ?? "", fr: r.stage ?? "" })[fr ? "fr" : "en"] })),
    [returns, fr],
  );
  const filtered = useMemo(
    () =>
      applyListFilters(rows, filters, {
        searchFields: ["reference", "orderReference", "customerName", "reason", "itemsText"],
        dateField: "createdAt",
        statusField: "phase",
      }),
    [rows, filters],
  );

  return (
    <WarehouseListPage
      title={t("returns")}
      subtitle={
        fr
          ? "Retours en direct. Le livreur collecte chez le client ; scannez le colis à l'arrivée (bureau), puis évaluez chaque article ici."
          : "Live returns. A rider collects from the customer; scan the parcel in on arrival (desk), then grade each item here."
      }
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("returns") }]}
      error={error}
      onRetry={() => void reload()}
      filters={
        <div className="space-y-3">
          <HubScopeBar />
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={RETURN_PHASE_OPTIONS}
            searchPlaceholder={fr ? "Référence, commande, client, article…" : "Reference, order, customer, item…"}
          />
        </div>
      }
      columns={[
        { key: "reference", label: fr ? "ID retour" : "Return ID", render: (row) => (
          <Link href={ops(`/returns/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
        )},
        { key: "orderReference", label: fr ? "Commande" : "Order" },
        { key: "customerName", label: t("customer") },
        { key: "itemsText", label: fr ? "Articles" : "Items" },
        { key: "createdAt", label: fr ? "Demandé le" : "Requested", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "stageText", label: fr ? "Étape" : "Stage" },
        { key: "phase", label: t("status"), render: (row) => {
          const p = String(row.phase) as ReturnPhase;
          return <Badge variant={RETURN_PHASE_VARIANT[p]}>{fr ? RETURN_PHASE_LABEL[p].fr : RETURN_PHASE_LABEL[p].en}</Badge>;
        }},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={ops(`/returns/${row.id}`)} className="text-xs text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
