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

export default function WarehouseReceivingPage() {
  const { t } = useLocale();
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
      subtitle="Parcels awaiting inspection"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("receiving") }]}
      actions={
        <BarcodeScanner
          onScan={(code) => { toast(`Scanned: ${code}`); router.push("/warehouse/parcels/PCL-001"); }}
        />
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Parcel ID, order, seller…"
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: "Parcel ID", render: (row) => (
          <Link href={`/warehouse/parcels/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order ID" },
        { key: "seller", label: "Seller" },
        { key: "itemsCount", label: "Items" },
        { key: "weight", label: "Weight" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="info">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <button onClick={() => toast(`Received ${row.id}`)} className="text-xs text-emerald-600">{t("receive")}</button>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
