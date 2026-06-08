"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { inboundParcels } from "@/lib/warehouse-entities";
import { useOpsPath, useOpsBase } from "@/lib/ops-path";

export default function WarehouseInboundPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const ops = useOpsPath();
  const base = useOpsBase();
  const homeLabel = base.startsWith("/admin") ? "Admin" : "Warehouse";
  const homeHref = base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse";

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
      columns={[
        { key: "id", label: "Parcel ID", render: (row) => (
          <Link href={ops(`/parcels/${row.id}`)} className="font-medium text-indigo-600 hover:underline">{String(row.id)}</Link>
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
            <Link href={ops(`/parcels/${row.id}`)} className="text-indigo-600 hover:underline">{t("view")}</Link>
            <button onClick={() => toast(`Received ${row.id}`)} className="text-emerald-600">{t("receive")}</button>
            <Link href={ops(`/parcels/${row.id}`)} className="text-amber-600">Inspect</Link>
          </div>
        )},
      ]}
      data={inboundParcels as unknown as Record<string, unknown>[]}
    />
  );
}
