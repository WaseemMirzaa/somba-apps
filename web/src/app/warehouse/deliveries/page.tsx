"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { deliveryEntities } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";

export default function WarehouseDeliveriesPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();

  return (
    <WarehouseListPage
      title="Active Deliveries"
      subtitle="List View — Order ID, Customer, Rider, Status, ETA"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("deliveries") }]}
      columns={[
        { key: "orderId", label: "Order ID", render: (row) => (
          <Link href={`/warehouse/deliveries/${row.id}`} className="font-medium text-indigo-600 hover:underline">{String(row.orderId)}</Link>
        )},
        { key: "customer", label: "Customer" },
        { key: "rider", label: "Rider", render: (row) => (
          <Link href={`/warehouse/riders/${row.riderId}`} className="text-indigo-600 hover:underline">{String(row.rider)}</Link>
        )},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "delivered" ? "success" : "info"}>{String(row.status).replace("_", " ")}</Badge>
        )},
        { key: "eta", label: "ETA" },
        { key: "codAmount", label: "COD", render: (row) => Number(row.codAmount) > 0 ? formatCurrency(row.codAmount as number, locale) : "—" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/warehouse/deliveries/${row.id}`} className="text-indigo-600 hover:underline">{t("track")}</Link>
            <button onClick={() => toast(`Delivery ${row.orderId} escalated`, "info")} className="text-slate-500 hover:underline">Escalate</button>
          </div>
        )},
      ]}
      data={deliveryEntities as unknown as Record<string, unknown>[]}
    />
  );
}
