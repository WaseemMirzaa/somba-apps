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

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "received", label: "Received", labelFr: "Reçu" },
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

export default function WarehouseReceivingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const data = inboundParcels.slice(0, 5);

  const filtered = useMemo(
    () =>
      applyListFilters(data, filters, {
        searchFields: ["id", "orderId", "seller"],
        statusField: "status",
      }),
    [data, filters]
  );

  return (
    <WarehouseListPage
      title={t("receiving")}
      subtitle={fr ? "Colis en attente d'inspection" : "Parcels awaiting inspection"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("receiving") }]}
      actions={
        <BarcodeScanner
          onScan={(code) => { toast(fr ? `Scanné : ${code}` : `Scanned: ${code}`); router.push("/warehouse/parcels/PCL-001"); }}
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
          <Link href={`/warehouse/parcels/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "ID commande" : "Order ID" },
        { key: "seller", label: fr ? "Vendeur" : "Seller" },
        { key: "itemsCount", label: fr ? "Articles" : "Items" },
        { key: "weight", label: fr ? "Poids" : "Weight" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <button onClick={() => toast(fr ? `${row.id} reçu` : `Received ${row.id}`)} className="text-xs text-emerald-600">{t("receive")}</button>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
