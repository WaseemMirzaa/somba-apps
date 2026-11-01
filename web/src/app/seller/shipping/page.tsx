"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { SHIPPING_STEP_OPTIONS, legKindLabel, shippingStepLabel, shippingStepVariant, useSellerShipments } from "@/lib/seller-orders";


export default function SellerShippingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { shipments } = useSellerShipments();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(
        shipments.map((s) => ({ ...s, rider: s.riderFirstName ?? "—", city: s.customer.city })),
        filters,
        {
          searchFields: ["id", "orderId", "rider", "city"],
          dateField: (item) => String(item.createdDate),
          statusField: "status",
        }
      ),
    [shipments, filters]
  );

  return (
    <SellerListPage
      title={t("shipping")}
      subtitle={
        fr
          ? "Suivi réel de chaque colis : livreur d'enlèvement, entrepôts, transfert et livraison"
          : "Real tracking of each parcel: pickup rider, warehouses, transfer and delivery"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("shipping") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={SHIPPING_STEP_OPTIONS}
          searchPlaceholder={fr ? "N° expédition, commande…" : "Shipment ID, order…"}
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
        { key: "city", label: fr ? "Ville" : "City" },
        {
          key: "currentLeg",
          label: fr ? "Étape en cours" : "Current leg",
          render: (row) => (row.currentLeg ? legKindLabel(String(row.currentLeg), fr) : "—"),
        },
        {
          key: "status",
          label: t("status"),
          render: (row) => (
            <Badge variant={shippingStepVariant(String(row.status))}>
              {shippingStepLabel(String(row.status), fr)}
            </Badge>
          ),
        },
        { key: "createdDate", label: t("date") },
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
