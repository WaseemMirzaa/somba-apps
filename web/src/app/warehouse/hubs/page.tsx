"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useOpsBase } from "@/lib/ops-path";
import { useOpsQuery, type HubRow } from "@/lib/warehouse-live";

/** Hub records are read-only here; hubs are set up by the platform admin. */
export default function WarehouseHubPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const hubsQ = useOpsQuery<HubRow[]>("warehouse:hubs", { initial: [] as HubRow[], push: ["hub:updated"] });

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Hubs" : "Hubs"}
        subtitle={fr ? "Hubs enregistrés (lecture seule)" : "Registered hubs (read-only)"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: "Hubs" }]}
      />
      {hubsQ.error && (
        <p role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="flex-1">{hubsQ.error}</span>
          <button type="button" onClick={() => void hubsQ.reload()} className="font-semibold underline">{fr ? "Réessayer" : "Retry"}</button>
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={hubsQ.loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucun hub enregistré." : "No hubs registered.")}
            columns={[
              { key: "name", label: fr ? "Nom" : "Name" },
              { key: "city", label: fr ? "Ville" : "City" },
              { key: "country", label: fr ? "Pays" : "Country", render: (row) => String(row.country ?? "—") },
              { key: "address", label: fr ? "Adresse" : "Address", render: (row) => String(row.address ?? "—") },
              { key: "active", label: fr ? "Statut" : "Status", render: (row) => (
                <Badge variant={row.active === false ? "warning" : "success"}>{row.active === false ? (fr ? "Inactif" : "Inactive") : (fr ? "Actif" : "Active")}</Badge>
              )},
              { key: "capacity", label: fr ? "Capacité (colis)" : "Capacity (parcels)", render: (row) => Number(row.capacity).toLocaleString() },
            ]}
            data={hubsQ.data as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        {fr ? "La configuration des hubs est gérée par l'Admin de la plateforme." : "Hub setup is managed by the platform admin."}
      </p>
    </div>
  );
}
