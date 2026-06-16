"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { agedParcelEntities } from "@/lib/warehouse-entities";

const STATUS_OPTIONS = [
  { value: "inbound", label: "Inbound", labelFr: "Entrant" },
  { value: "received", label: "Received", labelFr: "Reçu" },
  { value: "sorting", label: "Sorting", labelFr: "Tri" },
  { value: "ready", label: "Ready", labelFr: "Prêt" },
];

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusVariant(status: string): "success" | "warning" | "info" | "danger" {
  if (status === "inbound") return "warning";
  if (status === "received") return "info";
  if (status === "sorting") return "warning";
  return "success";
}

function priorityVariant(priority: string): "success" | "warning" | "info" | "danger" {
  if (priority === "high") return "danger";
  if (priority === "low") return "warning";
  return "info";
}

export default function WarehouseAgedPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(agedParcelEntities, filters, {
        searchFields: ["id", "orderId", "customer", "seller", "zone"],
        dateField: "arrivalDate",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <WarehouseListPage
      title={fr ? "Colis bloqués / anciens" : "Aged / Stuck Parcels"}
      subtitle={
        fr
          ? `${filtered.length} colis nécessitent une attention — en attente de réception, tri ou résolution`
          : `${filtered.length} parcels need attention — awaiting receiving, sorting, or resolution`
      }
      breadcrumbs={[
        { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
        { label: fr ? "Colis bloqués" : "Aged Parcels" },
      ]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={
            fr ? "ID colis, commande, client, vendeur…" : "Parcel ID, order, customer, seller…"
          }
        />
      }
      columns={[
        {
          key: "id",
          label: fr ? "ID colis" : "Parcel ID",
          render: (row) => (
            <Link
              href={`/warehouse/aged/${row.id}`}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              {String(row.id)}
            </Link>
          ),
        },
        {
          key: "orderId",
          label: fr ? "N° commande" : "Order ID",
          render: (row) => (
            <Link
              href={`/admin/orders/${row.orderId}`}
              className="text-[var(--primary)] hover:underline"
            >
              {String(row.orderId)}
            </Link>
          ),
        },
        { key: "customer", label: fr ? "Client" : "Customer" },
        { key: "seller", label: fr ? "Vendeur" : "Seller" },
        { key: "zone", label: fr ? "Zone" : "Zone" },
        {
          key: "status",
          label: t("status"),
          render: (row) => (
            <Badge variant={statusVariant(String(row.status))}>
              {formatStatus(String(row.status))}
            </Badge>
          ),
        },
        {
          key: "arrival",
          label: fr ? "Arrivée" : "Arrival",
          render: (row) => {
            const parcel = row as { arrivalDate?: string; arrival?: string };
            return parcel.arrivalDate
              ? `${parcel.arrivalDate} ${parcel.arrival ?? ""}`.trim()
              : String(parcel.arrival ?? "—");
          },
        },
        {
          key: "priority",
          label: fr ? "Priorité" : "Priority",
          render: (row) => (
            <Badge variant={priorityVariant(String(row.priority))}>
              {formatStatus(String(row.priority))}
            </Badge>
          ),
        },
        {
          key: "actions",
          label: t("action"),
          render: (row) => (
            <Link
              href={`/warehouse/aged/${row.id}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              {t("view")}
            </Link>
          ),
        },
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
