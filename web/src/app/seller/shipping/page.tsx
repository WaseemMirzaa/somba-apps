"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { shipmentList } from "@/lib/seller-entities";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", labelFr: "En attente" },
  { value: "ready", label: "Ready", labelFr: "Prêt" },
  { value: "picked_up", label: "Picked up", labelFr: "Collecté" },
  { value: "in_transit", label: "In transit", labelFr: "En transit" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
];

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SellerShippingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(
        shipmentList.map((s) => ({
          ...s,
          rider: s.rider.name,
          warehouse: s.warehouse.name,
        })),
        filters,
        {
          searchFields: ["id", "orderId", "rider", "warehouse", "trackingNumber"],
          dateField: (item) => String(item.pickupTime).slice(0, 10),
          statusField: "status",
        }
      ),
    [filters]
  );

  return (
    <SellerListPage
      title={t("shipping")}
      subtitle={
        fr
          ? "Expéditions — ID, commande, livreur, entrepôt, statut, collecte"
          : "Shipments — ID, order, rider, warehouse, status, pickup time"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("shipping") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "N° expédition, commande, livreur…" : "Shipment ID, order, rider…"}
        />
      }
      columns={[
        {
          key: "id",
          label: fr ? "N° expédition" : "Shipment ID",
          render: (row) => (
            <Link href={`/seller/shipping/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">
              {String(row.id)}
            </Link>
          ),
        },
        {
          key: "orderId",
          label: fr ? "Commande" : "Order",
          render: (row) => (
            <Link href={`/seller/orders/${row.orderId}`} className="text-[var(--primary)] hover:underline">
              {String(row.orderId)}
            </Link>
          ),
        },
        { key: "rider", label: fr ? "Livreur" : "Rider" },
        { key: "warehouse", label: fr ? "Entrepôt" : "Warehouse" },
        {
          key: "trackingNumber",
          label: fr ? "N° suivi" : "Tracking #",
          render: (row) => String(row.trackingNumber ?? "—"),
        },
        {
          key: "status",
          label: t("status"),
          render: (row) => (
            <Badge variant={row.status === "delivered" ? "success" : "info"}>
              {formatStatus(String(row.status))}
            </Badge>
          ),
        },
        { key: "pickupTime", label: fr ? "Collecte" : "Pickup Time" },
        {
          key: "actions",
          label: t("action"),
          render: (row) => (
            <Link href={`/seller/shipping/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">
              {t("view")}
            </Link>
          ),
        },
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
