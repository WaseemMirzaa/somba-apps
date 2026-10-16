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
import { STAGE_LABEL, STAGE_OPTIONS, stageVariant, useWarehouseData, type Parcel, type ParcelStage } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

export default function WarehouseInboundPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse");
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";
  const { parcels } = useWarehouseData();
  const { receive, busyId } = useReceiveParcel();
  const [filters, setFilters] = useState({ ...EMPTY_LIST_FILTERS, status: "inbound" });

  const filtered = useMemo(
    () =>
      applyListFilters(parcels, filters, {
        searchFields: ["id", "orderId", "seller", "customer", "pickupAddress", "barcode"],
        statusField: "status",
      }),
    [parcels, filters],
  );

  return (
    <WarehouseListPage
      title={`${t("inbound")} ${fr ? "File" : "Queue"}`}
      subtitle={
        fr
          ? "Colis en attente de réception au hub — scannez ou saisissez le code, puis « Recevoir »"
          : "Parcels waiting to be scanned in at the hub — scan or type the code, then Receive"
      }
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("inbound") }]}
      actions={<ScanInput parcels={parcels} onFound={(p) => router.push(ops(`/parcels/${p.id}`))} autoFocus />}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STAGE_OPTIONS}
          searchPlaceholder={fr ? "ID colis, commande, vendeur, adresse…" : "Parcel ID, order, seller, pickup address…"}
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
        { key: "readyAt", label: fr ? "Vendeur prêt" : "Seller ready", render: (row) => (
          row.readyAt
            ? <Badge variant="success">{shortDate(String(row.readyAt), locale)}</Badge>
            : <span className="text-slate-400">{fr ? "Pas encore" : "Not yet"}</span>
        )},
        { key: "createdAt", label: fr ? "Création" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "itemsCount", label: fr ? "Articles" : "Items" },
        { key: "attempts", label: fr ? "Tentatives" : "Attempts", render: (row) => (
          <span title={row.failureReason ? String(row.failureReason) : undefined}>
            {String(row.attempts)}
            {row.failureReason ? <span className="ml-1 text-xs text-red-600">({String(row.failureReason)})</span> : null}
          </span>
        )},
        { key: "status", label: t("status"), render: (row) => {
          const s = String(row.status) as ParcelStage;
          return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
        }},
        { key: "actions", label: t("action"), render: (row) => {
          const p = row as unknown as Parcel;
          return (
            <div className="flex gap-3 text-xs">
              <Link href={ops(`/parcels/${p.id}`)} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
              {p.status === "inbound" && (
                <button
                  disabled={busyId === p.taskId}
                  onClick={() => void receive(p)}
                  className="text-emerald-600 hover:underline disabled:opacity-50"
                >
                  {busyId === p.taskId ? "…" : t("receive")}
                </button>
              )}
            </div>
          );
        }},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
