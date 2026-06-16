"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { riderEntities, type RiderEntity } from "@/lib/warehouse-entities";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "offline", label: "Offline", labelFr: "Hors ligne" },
];

export default function WarehouseRidersPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [assignRider, setAssignRider] = useState<RiderEntity | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const filtered = useMemo(
    () =>
      applyListFilters(riderEntities, filters, {
        searchFields: ["name", "zone", "location", "phone"],
        statusField: "status",
      }),
    [filters]
  );

  return (
    <>
    <WarehouseListPage
      title="Rider Assignments"
      subtitle="List View — Rider Name, Zone, Active Deliveries, Location, Performance Score"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("riders") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Rider name, zone, location…"
          showDateFilters={false}
        />
      }
      columns={[
        { key: "name", label: "Rider Name", render: (row) => (
          <Link href={`/warehouse/riders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "zone", label: "Zone" },
        { key: "activeDeliveries", label: "Active Deliveries" },
        { key: "location", label: "Current Location" },
        { key: "performanceScore", label: "Performance", render: (row) => (
          <span className="font-medium text-emerald-600">{String(row.performanceScore)}%</span>
        )},
        { key: "status", label: t("status"), render: (row) => <Badge variant="success">{String(row.status)}</Badge> },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <Link href={`/warehouse/riders/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            <button
              onClick={() => {
                const rider = riderEntities.find((r) => r.id === row.id);
                if (rider) {
                  setAssignRider(rider);
                  setShowAssignModal(true);
                }
              }}
              className="text-[var(--primary)] hover:underline"
            >
              {t("assign")}
            </button>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />

    <AssignRiderModal
      open={showAssignModal}
      title="Assign rider to batch"
      subtitle={assignRider ? `Selected: ${assignRider.name}` : undefined}
      selectedRiderId={assignRider?.id ?? null}
      onClose={() => {
        setShowAssignModal(false);
        setAssignRider(null);
      }}
      onConfirm={(rider) => {
        toast(`${rider.name} assigned to next ready batch`);
        setShowAssignModal(false);
        setAssignRider(null);
      }}
    />
    </>
  );
}
