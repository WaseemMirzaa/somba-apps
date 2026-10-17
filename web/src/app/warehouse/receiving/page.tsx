"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ScanInput } from "@/components/warehouse/scan-input";
import { useReceiveParcel } from "@/components/warehouse/use-receive";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { STAGE_LABEL, stageVariant, useWarehouseData, type Parcel, type ParcelStage } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

const STATUS_OPTIONS = [
  { value: "inbound", label: STAGE_LABEL.inbound.en, labelFr: STAGE_LABEL.inbound.fr },
  { value: "received", label: STAGE_LABEL.received.en, labelFr: STAGE_LABEL.received.fr },
];

export default function WarehouseReceivingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse");
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";
  const { parcels } = useWarehouseData();
  const { receive, busyId } = useReceiveParcel();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  // Receiving works the not-yet-handed-over queue: waiting to be scanned in, or scanned in and waiting for a rider.
  const queue = useMemo(
    () => parcels.filter((p) => p.status === "inbound" || p.status === "received"),
    [parcels],
  );
  const filtered = useMemo(
    () =>
      applyListFilters(queue, filters, {
        searchFields: ["id", "orderId", "seller", "barcode"],
        statusField: "status",
      }),
    [queue, filters],
  );

  return (
    <WarehouseListPage
      paged
      title={t("receiving")}
      subtitle={fr ? "Scannez chaque colis à son arrivée au hub" : "Scan each parcel in as it arrives at the hub"}
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("receiving") }]}
      actions={<ScanInput parcels={parcels} onFound={(p) => router.push(ops(`/parcels/${p.id}`))} autoFocus />}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID colis, commande, vendeur…" : "Parcel ID, order, seller…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
          <Link href={ops(`/parcels/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "ID commande" : "Order ID" },
        { key: "seller", label: fr ? "Vendeur" : "Seller" },
        { key: "pickupAddress", label: fr ? "Adresse de collecte" : "Pickup address" },
        { key: "itemsCount", label: fr ? "Articles" : "Items" },
        { key: "receivedAt", label: fr ? "Reçu le" : "Received at", render: (row) => shortDate(row.receivedAt ? String(row.receivedAt) : null, locale) },
        { key: "status", label: t("status"), render: (row) => {
          const s = String(row.status) as ParcelStage;
          return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
        }},
        { key: "actions", label: t("action"), render: (row) => {
          const p = row as unknown as Parcel;
          return p.status === "inbound" ? (
            <button
              disabled={busyId === p.taskId}
              onClick={() => void receive(p)}
              className="text-xs text-emerald-600 hover:underline disabled:opacity-50"
            >
              {busyId === p.taskId ? "…" : t("receive")}
            </button>
          ) : (
            <span className="text-xs text-slate-400">{fr ? "En attente d'un livreur" : "Waiting for a rider"}</span>
          );
        }},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
