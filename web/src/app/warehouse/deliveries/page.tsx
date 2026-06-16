"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { deliveryEntities } from "@/lib/warehouse-entities";

const STATUS_OPTIONS = [
  { value: "in_transit", label: "In transit", labelFr: "En transit" },
  { value: "out_for_delivery", label: "Out for delivery", labelFr: "En livraison" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
];

// Delivery status values originate from the shared (non-owned) entities layer.
const STATUS_FR: Record<string, string> = {
  in_transit: "En transit",
  out_for_delivery: "En livraison",
  delivered: "Livré",
};

export default function WarehouseDeliveriesPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(deliveryEntities, filters, {
        searchFields: ["id", "orderId", "customer", "rider"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <WarehouseListPage
      title={fr ? "Livraisons actives" : "Active Deliveries"}
      subtitle={fr ? "Vue liste — ID commande, Client, Livreur, Statut, ETA" : "List View — Order ID, Customer, Rider, Status, ETA"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("deliveries") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID commande, client, livreur…" : "Order ID, customer, rider…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "orderId", label: fr ? "ID commande" : "Order ID", render: (row) => (
          <Link href={`/warehouse/deliveries/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.orderId)}</Link>
        )},
        { key: "customer", label: fr ? "Client" : "Customer" },
        { key: "rider", label: fr ? "Livreur" : "Rider", render: (row) => (
          <Link href={`/warehouse/riders/${row.riderId}`} className="text-[var(--primary)] hover:underline">{String(row.rider)}</Link>
        )},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "delivered" ? "success" : "info"}>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status).replace("_", " ")}</Badge>
        )},
        { key: "eta", label: "ETA" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/warehouse/deliveries/${row.id}`} className="text-[var(--primary)] hover:underline">{t("track")}</Link>
            <button onClick={() => toast(fr ? `Livraison ${row.orderId} escaladée` : `Delivery ${row.orderId} escalated`, "info")} className="text-slate-500 hover:underline">{fr ? "Escalader" : "Escalate"}</button>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
