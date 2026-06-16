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

export default function WarehouseInboundPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : "Warehouse";
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
      title={`${t("inbound")} Queue`}
      subtitle="List View — Parcel ID, Order ID, Seller, Pickup Rider, Arrival, Items, Weight, Status"
      breadcrumbs={[{ label: homeLabel, href: homeHref }, { label: t("inbound") }]}
      actions={
        <BarcodeScanner
          label="Scan Barcode"
          onScan={(code) => {
            toast(`Scanned: ${code}`);
            router.push(ops("/parcels/PCL-001"));
          }}
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
          <Link href={ops(`/parcels/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: "Order ID" },
        { key: "seller", label: "Seller" },
        { key: "pickupRider", label: "Pickup Rider" },
        { key: "arrival", label: "Arrival Time" },
        { key: "itemsCount", label: "Items" },
        { key: "weight", label: "Weight" },
        { key: "status", label: t("status"), render: (row) => <Badge variant="warning">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={ops(`/parcels/${row.id}`)} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <button onClick={() => toast(`Received ${row.id}`)} className="text-emerald-600">{t("receive")}</button>
            <Link href={ops(`/parcels/${row.id}`)} className="text-amber-600">Inspect</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
