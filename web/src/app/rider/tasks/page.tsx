"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { riderTasks } from "@/lib/rider-entities";

const STATUS_OPTIONS = [
  { value: "assigned", label: "Assigned", labelFr: "Assigné" },
  { value: "picked_up", label: "Picked up", labelFr: "Collecté" },
  { value: "in_transit", label: "In transit", labelFr: "En transit" },
  { value: "delivered", label: "Delivered", labelFr: "Livré" },
];

// Display labels for the task type enum (logic uses the raw value).
const TYPE_FR: Record<string, string> = {
  delivery: "Livraison",
  pickup: "Collecte",
  return: "Retour",
  cod: "Paiement à la livraison",
};

export default function RiderTasksPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(riderTasks, filters, {
        searchFields: ["id", "customer", "address", "type"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("activeTasks")} />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "N° tâche, client, adresse…" : "Task ID, customer, address…"}
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "id",
                label: fr ? "Tâche" : "Task",
                render: (row) => (
                  <Link href={`/rider/tasks/${row.id}`} className="font-medium text-emerald-600 hover:underline">
                    {String(row.id)}
                  </Link>
                ),
              },
              {
                key: "type",
                label: "Type",
                render: (row) => (
                  <Badge variant="primary">
                    {fr ? TYPE_FR[String(row.type)] ?? String(row.type) : String(row.type)}
                  </Badge>
                ),
              },
              { key: "customer", label: fr ? "Client" : "Customer" },
              { key: "address", label: fr ? "Adresse" : "Address" },
              { key: "distance", label: "Distance" },
              { key: "items", label: fr ? "Articles" : "Items" },
              { key: "eta", label: "ETA" },
              {
                key: "status",
                label: t("status"),
                render: (row) => {
                  const opt = STATUS_OPTIONS.find((o) => o.value === String(row.status));
                  return <Badge>{opt ? (fr ? opt.labelFr : opt.label) : String(row.status).replace("_", " ")}</Badge>;
                },
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link href={`/rider/tasks/${row.id}`} className="text-xs font-medium text-emerald-600 hover:underline">
                    {t("view")}
                  </Link>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
