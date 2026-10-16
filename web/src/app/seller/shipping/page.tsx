"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { SHIPPING_STATUS_OPTIONS, shippingStatusLabel, shippingStatusVariant } from "@/lib/seller-labels";


export default function SellerShippingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { shipmentList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(
        shipmentList.map((s) => ({
          ...s,
          rider: s.riderAssigned ? (fr ? "Assigné" : "Assigned") : "—",
        })),
        filters,
        {
          searchFields: ["id", "orderId", "trackingNumber"],
          dateField: (item) => String(item.createdDate),
          statusField: "status",
        }
      ),
    [shipmentList, filters, fr]
  );

  return (
    <SellerListPage
      title={t("shipping")}
      subtitle={
        fr
          ? "Expéditions suivies d'après le statut réel de chaque commande"
          : "Shipments tracked from each order's real status"
      }
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("shipping") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={SHIPPING_STATUS_OPTIONS}
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
        {
          key: "trackingNumber",
          label: fr ? "N° suivi" : "Tracking #",
          render: (row) => String(row.trackingNumber ?? "—"),
        },
        {
          key: "status",
          label: t("status"),
          render: (row) => (
            <Badge variant={shippingStatusVariant(String(row.status))}>
              {shippingStatusLabel(String(row.status), fr)}
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
