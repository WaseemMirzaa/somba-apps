"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sortingParcels as initialParcels } from "@/lib/warehouse-entities";
import type { SortingParcel } from "@/lib/warehouse-entities";

const SORTING_ZONES = ["Zone A", "Zone B", "Zone C"];

const STATUS_OPTIONS = [
  { value: "received", label: "Received", labelFr: "Reçu" },
  { value: "sorting", label: "Sorting", labelFr: "Tri" },
  { value: "ready", label: "Ready", labelFr: "Prêt" },
  { value: "on_hold", label: "On hold", labelFr: "En attente" },
];

// Parcel priority values originate from the shared (non-owned) entities layer.
const PRIORITY_FR: Record<string, string> = {
  high: "Élevée",
  normal: "Normale",
  medium: "Moyenne",
  low: "Faible",
};

export default function WarehouseSortingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [parcels, setParcels] = useState(initialParcels);
  const [assignTarget, setAssignTarget] = useState<SortingParcel | null>(null);
  const [selectedZone, setSelectedZone] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  const filtered = useMemo(
    () =>
      applyListFilters(parcels, filters, {
        searchFields: ["id", "orderId", "customer", "zone", "route"],
        statusField: "status",
      }),
    [parcels, filters]
  );

  function openAssignModal(parcel: SortingParcel) {
    setAssignTarget(parcel);
    setSelectedZone(parcel.zone);
    setConfirmStep(false);
  }

  function closeAssignModal() {
    setAssignTarget(null);
    setSelectedZone("");
    setConfirmStep(false);
  }

  function proceedToConfirm() {
    if (!selectedZone) {
      toast(fr ? "Veuillez sélectionner une zone" : "Please select a zone", "error");
      return;
    }
    setConfirmStep(true);
  }

  function confirmAssignZone() {
    if (!assignTarget || !selectedZone) return;
    setParcels((prev) =>
      prev.map((item) => (item.id === assignTarget.id ? { ...item, zone: selectedZone } : item))
    );
    toast(fr ? `${assignTarget.id} assigné à ${selectedZone}` : `${assignTarget.id} assigned to ${selectedZone}`);
    closeAssignModal();
  }

  return (
    <>
    <WarehouseListPage
      title={fr ? "Table de tri" : "Sorting Board"}
      subtitle={fr ? "Vue liste — ID colis, ID commande, Client, Zone, Priorité, Itinéraire" : "List View — Parcel ID, Order ID, Customer, Zone, Priority, Route"}
      breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("sorting") }]}
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID colis, commande, client, zone…" : "Parcel ID, order, customer, zone…"}
          showDateFilters={false}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
          <Link href={`/warehouse/parcels/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "orderId", label: fr ? "ID commande" : "Order ID" },
        { key: "customer", label: t("customer") },
        { key: "zone", label: t("zone") },
        { key: "priority", label: fr ? "Priorité" : "Priority", render: (row) => (
          <Badge variant={row.priority === "high" ? "danger" : "info"}>{fr ? (PRIORITY_FR[String(row.priority)] ?? String(row.priority)) : String(row.priority)}</Badge>
        )},
        { key: "route", label: fr ? "Itinéraire" : "Route" },
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => openAssignModal(row as unknown as SortingParcel)}
              className="text-[var(--primary)] hover:underline"
            >
              {fr ? "Assigner une zone" : "Assign Zone"}
            </button>
            <button onClick={() => { setParcels((p) => p.map((item) => item.id === row.id ? { ...item, status: "on_hold" } : item)); toast(fr ? `${row.id} mis en attente` : `${row.id} placed on hold`, "info"); }} className="text-slate-500 hover:underline">{fr ? "Attente" : "Hold"}</button>
            <Link href={`/warehouse/parcels/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />

    {assignTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="card-premium w-full max-w-md p-6">
          {!confirmStep ? (
            <>
              <h3 className="text-lg font-semibold text-slate-900">{fr ? "Assigner une zone" : "Assign zone"}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {assignTarget.id} · {assignTarget.orderId} · {assignTarget.customer}
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">{fr ? "Zone actuelle" : "Current zone"}</label>
                  <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">{assignTarget.zone}</p>
                </div>
                <div>
                  <label htmlFor="sorting-zone" className="mb-1.5 block text-xs font-medium text-slate-600">{fr ? "Nouvelle zone" : "New zone"}</label>
                  <select
                    id="sorting-zone"
                    className="input-premium w-full px-3 py-2 text-sm"
                    value={selectedZone}
                    onChange={(e) => setSelectedZone(e.target.value)}
                  >
                    {SORTING_ZONES.map((zone) => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={closeAssignModal} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {fr ? "Annuler" : "Cancel"}
                </button>
                <button
                  onClick={proceedToConfirm}
                  disabled={!selectedZone || selectedZone === assignTarget.zone}
                  className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {fr ? "Continuer" : "Continue"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-slate-900">{fr ? "Confirmer l'assignation de zone" : "Confirm zone assignment"}</h3>
              <p className="mt-3 text-sm text-slate-600">
                {fr ? (
                  <>Assigner le colis <strong>{assignTarget.id}</strong> de{" "}
                  <strong>{assignTarget.zone}</strong> vers <strong>{selectedZone}</strong> ?</>
                ) : (
                  <>Assign parcel <strong>{assignTarget.id}</strong> from{" "}
                  <strong>{assignTarget.zone}</strong> to <strong>{selectedZone}</strong>?</>
                )}
              </p>
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-slate-700">
                <p><span className="text-slate-500">{fr ? "Commande :" : "Order:"}</span> {assignTarget.orderId}</p>
                <p className="mt-1"><span className="text-slate-500">{fr ? "Client :" : "Customer:"}</span> {assignTarget.customer}</p>
                <p className="mt-1"><span className="text-slate-500">{fr ? "Itinéraire :" : "Route:"}</span> {assignTarget.route}</p>
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={() => setConfirmStep(false)} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {fr ? "Retour" : "Back"}
                </button>
                <button
                  onClick={confirmAssignZone}
                  className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-medium"
                >
                  {fr ? "Confirmer l'assignation" : "Confirm assignment"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}
