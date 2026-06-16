"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { inboundParcels } from "@/lib/warehouse-entities";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "received", label: "Received", labelFr: "Reçu" },
  { value: "sorting", label: "Sorting", labelFr: "Tri" },
  { value: "ready", label: "Ready", labelFr: "Prêt" },
];

// Parcel status values originate from the shared (non-owned) entities layer.
const STATUS_FR: Record<string, string> = {
  inbound: "Entrant",
  pending: "En attente",
  received: "Reçu",
  sorting: "Tri",
  ready: "Prêt",
  dispatched: "Expédié",
};

export default function WarehouseInboundPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse");
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(inboundParcels, filters, {
        searchFields: ["id", "orderId", "seller", "pickupRider"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <WarehouseListPage
      title={`${t("inbound")} ${fr ? "File" : "Queue"}`}
      subtitle={fr ? "Vue liste — ID colis, ID commande, Vendeur, Livreur de ramassage, Arrivée, Articles, Poids, Statut" : "List View — Parcel ID, Order ID, Seller, Pickup Rider, Arrival, Items, Weight, Status"}
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("inbound") }]}
      actions={
        <BarcodeScanner
          label={fr ? "Scanner le code-barres" : "Scan Barcode"}
          onScan={(code) => {
            toast(fr ? `Scanné : ${code}` : `Scanned: ${code}`);
            router.push(ops("/parcels/PCL-001"));
          }}
        />
      }
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
        { key: "pickupRider", label: fr ? "Livreur de ramassage" : "Pickup Rider" },
        { key: "arrival", label: fr ? "Heure d'arrivée" : "Arrival Time" },
        { key: "itemsCount", label: fr ? "Articles" : "Items" },
        { key: "weight", label: fr ? "Poids" : "Weight" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={ops(`/parcels/${row.id}`)} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <button onClick={() => toast(fr ? `${row.id} reçu` : `Received ${row.id}`)} className="text-emerald-600">{t("receive")}</button>
            <Link href={ops(`/parcels/${row.id}`)} className="text-amber-600">{fr ? "Inspecter" : "Inspect"}</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
