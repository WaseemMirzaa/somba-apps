"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NoticeBar } from "@/components/admin/demo-badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "setup", label: "Setup", labelFr: "Configuration" },
  { value: "inactive", label: "Inactive", labelFr: "Inactif" },
];
const WH_STATUS_FR: Record<string, string> = { active: "Actif", setup: "Configuration", inactive: "Inactif" };

export default function AdminWarehousesPage() {
  const { warehouses } = useWarehouseAdmin();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(warehouses, filters, {
        searchFields: ["id", "name", "city", "country", "managerEmail"],
        statusField: "status",
      }),
    [warehouses, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Entrepôts — annuaire des hubs (local)" : "Warehouses — hub directory (local)"}
        subtitle={fr ? "Liste de hubs gardée dans ce navigateur : elle n'est pas enregistrée sur le serveur" : "A list of hubs kept in this browser: it is not stored on the server"}
        breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: fr ? "Entrepôts" : "Warehouses" }]}
        actions={
          <>
            <Link href="/admin/warehouses/staff">
              <Button variant="secondary" size="sm">{fr ? "Personnel d'entrepôt" : "Warehouse Staff"}</Button>
            </Link>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {fr ? "Ajouter un hub" : "Add hub"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Boxes className="h-8 w-8 text-[var(--primary)]" />
            <div>
              <p className="text-2xl font-bold">{warehouses.length}</p>
              <p className="text-sm text-slate-500">{fr ? "Total entrepôts" : "Total warehouses"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-emerald-600">{warehouses.filter((w) => w.status === "active").length}</p>
            <p className="text-sm text-slate-500">{fr ? "Actifs" : "Active"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-amber-600">{warehouses.filter((w) => w.status === "setup").length}</p>
            <p className="text-sm text-slate-500">{fr ? "En configuration" : "In setup"}</p>
          </CardContent>
        </Card>
      </div>

      {showCreate && (
        <CreateWarehouseForm onClose={() => setShowCreate(false)} />
      )}

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "ID d'entrepôt, nom, ville…" : "Warehouse ID, name, city…"}
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID", render: (row) => (
                <Link href={`/admin/warehouses/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
              )},
              { key: "name", label: fr ? "Entrepôt" : "Warehouse" },
              { key: "city", label: fr ? "Ville" : "City" },
              { key: "country", label: fr ? "Pays" : "Country" },
              { key: "staff", label: fr ? "Personnel" : "Staff" },
              { key: "capacity", label: fr ? "Capacité" : "Capacity", render: (row) => Number(row.capacity).toLocaleString() },
              { key: "managerEmail", label: fr ? "Contact responsable" : "Manager contact" },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => (
                <Badge variant={row.status === "active" ? "success" : row.status === "setup" ? "warning" : "default"}>{fr ? (WH_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>
              )},
              { key: "actions", label: fr ? "Action" : "Action", render: (row) => (
                <Link href={`/admin/warehouses/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Gérer" : "Manage"}</Link>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <NoticeBar>
        {fr ? (
          <>
            Cet annuaire est local à ce navigateur et ne crée aucun identifiant de connexion. Pour donner accès au portail entrepôt, créez un vrai compte dans{" "}
            <Link href="/admin/warehouses/staff" className="font-semibold underline">Personnel d&apos;entrepôt</Link>. Suivez l&apos;activité dans{" "}
            <Link href="/admin/fulfillment" className="font-semibold underline">Opérations logistiques</Link>.
          </>
        ) : (
          <>
            This directory is local to this browser and creates no sign-in credentials. To give someone warehouse-portal access, create a real account under{" "}
            <Link href="/admin/warehouses/staff" className="font-semibold underline">Warehouse Staff</Link>. Monitor activity in{" "}
            <Link href="/admin/fulfillment" className="font-semibold underline">Fulfillment Ops</Link>.
          </>
        )}
      </NoticeBar>
    </div>
  );
}

function CreateWarehouseForm({ onClose }: { onClose: () => void }) {
  const { createWarehouse } = useWarehouseAdmin();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [form, setForm] = useState({
    name: "", city: "", country: "France", address: "",
    capacity: 10000, managerName: "", managerEmail: "", portalEmail: "", zones: "Zone A",
  });

  function submit() {
    if (!form.name.trim()) {
      toast(fr ? "Nom requis" : "Name required", "error");
      return;
    }
    createWarehouse({
      ...form,
      zones: form.zones.split(",").map((z) => z.trim()),
    });
    toast(fr ? "Hub ajouté à l'annuaire local" : "Hub added to the local directory");
    onClose();
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h3 className="font-semibold">{fr ? "Nouvel entrepôt" : "New Warehouse"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom de l'entrepôt" : "Warehouse name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Ville" : "City"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Pays" : "Country"} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Capacité" : "Capacity"} type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={fr ? "Adresse" : "Address"} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom du responsable" : "Manager name"} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Contact du responsable" : "Manager contact"} value={form.managerEmail} onChange={(e) => setForm({ ...form, managerEmail: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={fr ? "Zones (séparées par des virgules)" : "Zones (comma-separated)"} value={form.zones} onChange={(e) => setForm({ ...form, zones: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit}>{fr ? "Ajouter à l'annuaire" : "Add to directory"}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>{fr ? "Annuler" : "Cancel"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
