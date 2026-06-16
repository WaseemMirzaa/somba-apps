"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useLocale } from "@/context/locale-context";

/** Warehouse staff see their assigned hub only — creation is admin-only at /admin/warehouses */
export default function WarehouseHubPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { persona } = useAuth();
  const { getWarehouse } = useWarehouseAdmin();
  const warehouse = persona.warehouseId ? getWarehouse(persona.warehouseId) : undefined;

  if (!warehouse) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Aucun entrepôt assigné à votre compte" : "No warehouse assigned to your account"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Mon entrepôt" : "My Warehouse"} subtitle={warehouse.name} breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: "Hub" }]} />

      <div className="card-premium p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{warehouse.name}</h3>
            <p className="text-sm text-slate-500">{warehouse.city}, {warehouse.country}</p>
          </div>
          <Badge variant="primary">{warehouse.id}</Badge>
        </div>
        <DetailSection title={fr ? "Détails" : "Details"} className="mt-6 border-0 p-0 shadow-none">
          <InfoGrid items={[
            { label: fr ? "Adresse" : "Address", value: warehouse.address, full: true },
            { label: fr ? "Capacité" : "Capacity", value: warehouse.capacity.toLocaleString() },
            { label: fr ? "Personnel" : "Staff", value: warehouse.staff },
            { label: "Zones", value: warehouse.zones.join(" · "), full: true },
            { label: fr ? "Responsable" : "Manager", value: warehouse.managerName },
          ]} />
        </DetailSection>
        <p className="mt-4 text-xs text-slate-500">{fr ? "La configuration et les identifiants de l'entrepôt sont gérés par l'Admin de la plateforme." : "Warehouse setup and credentials are managed by platform Admin."}</p>
      </div>
    </div>
  );
}
