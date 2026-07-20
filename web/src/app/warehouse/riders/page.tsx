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
import { useRiderZones } from "@/context/rider-zone-context";
import { type RiderEntity } from "@/lib/warehouse-entities";
import { useWarehouseData } from "@/lib/warehouse";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "offline", label: "Offline", labelFr: "Hors ligne" },
];

const STATUS_FR: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  offline: "Hors ligne",
};

export default function WarehouseRidersPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { zoneOptions, getRiderZone, setRiderZone } = useRiderZones();
  const { riderEntities } = useWarehouseData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [assignRider, setAssignRider] = useState<RiderEntity | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const filtered = useMemo(
    () =>
      applyListFilters(riderEntities, filters, {
        searchFields: ["name", "zone", "location", "phone"],
        statusField: "status",
      }),
    [riderEntities, filters]
  );

  return (
    <>
    <WarehouseListPage
      title={fr ? "Affectations des livreurs" : "Rider Assignments"}
      subtitle={fr ? "Vue liste — Nom du livreur, Zone, Livraisons actives, Lieu, Score de performance" : "List View — Rider Name, Zone, Active Deliveries, Location, Performance Score"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("riders") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "Nom du livreur, zone, lieu…" : "Rider name, zone, location…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "name", label: fr ? "Nom du livreur" : "Rider Name", render: (row) => (
          <Link href={`/warehouse/riders/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
        )},
        { key: "zone", label: t("zone"), render: (row) => (
          <select
            value={getRiderZone(row.id as number)}
            onChange={(e) => {
              setRiderZone(row.id as number, e.target.value);
              toast(fr ? `${row.name} → ${e.target.value}` : `${row.name} → ${e.target.value}`);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        )},
        { key: "activeDeliveries", label: fr ? "Livraisons actives" : "Active Deliveries" },
        { key: "location", label: fr ? "Lieu actuel" : "Current Location" },
        { key: "performanceScore", label: fr ? "Performance" : "Performance", render: (row) => (
          <span className="font-medium text-emerald-600">{String(row.performanceScore)}%</span>
        )},
        { key: "status", label: t("status"), render: (row) => <Badge variant="success">{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
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
      title={fr ? "Assigner un livreur au lot" : "Assign rider to batch"}
      subtitle={assignRider ? (fr ? `Sélectionné : ${assignRider.name}` : `Selected: ${assignRider.name}`) : undefined}
      selectedRiderId={assignRider?.id ?? null}
      onClose={() => {
        setShowAssignModal(false);
        setAssignRider(null);
      }}
      onConfirm={(rider) => {
        toast(fr ? `${rider.name} assigné au prochain lot prêt` : `${rider.name} assigned to next ready batch`);
        setShowAssignModal(false);
        setAssignRider(null);
      }}
    />
    </>
  );
}
