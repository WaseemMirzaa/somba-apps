"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function AdminWarehousesPage() {
  const { warehouses } = useWarehouseAdmin();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Entrepôts" : "Warehouses"}
        subtitle={fr ? "Créer des centres de traitement et émettre des identifiants de portail pour les responsables d'entrepôt" : "Create fulfillment centers and issue portal credentials for warehouse managers"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Entrepôts" : "Warehouses" }]}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {fr ? "Créer un entrepôt" : "Create Warehouse"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Boxes className="h-8 w-8 text-blue-600" />
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

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID", render: (row) => (
                <Link href={`/admin/warehouses/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "name", label: fr ? "Entrepôt" : "Warehouse" },
              { key: "city", label: fr ? "Ville" : "City" },
              { key: "country", label: fr ? "Pays" : "Country" },
              { key: "staff", label: fr ? "Personnel" : "Staff" },
              { key: "capacity", label: fr ? "Capacité" : "Capacity", render: (row) => Number(row.capacity).toLocaleString() },
              { key: "portalEmail", label: fr ? "Accès portail" : "Portal Login" },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => (
                <Badge variant={row.status === "active" ? "success" : row.status === "setup" ? "warning" : "default"}>{String(row.status)}</Badge>
              )},
              { key: "actions", label: fr ? "Action" : "Action", render: (row) => (
                <Link href={`/admin/warehouses/${row.id}`} className="text-sm text-blue-600 hover:underline">{fr ? "Gérer" : "Manage"}</Link>
              )},
            ]}
            data={warehouses as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-slate-600">
            {fr
              ? <>Les responsables d'entrepôt se connectent avec l'e-mail et le mot de passe que vous émettez ici. Ils n'ont accès qu'au <strong>Portail entrepôt</strong> — pas à l'Admin, au Vendeur ou à d'autres portails. En tant qu'admin, utilisez <Link href="/admin/fulfillment" className="text-blue-600 hover:underline">Logistique</Link> pour surveiller toute l'activité des entrepôts.</>
              : <>Warehouse managers log in with the portal email and password you issue here. They only see the <strong>Warehouse portal</strong> — not Admin, Seller, or other portals. As admin, use <Link href="/admin/fulfillment" className="text-blue-600 hover:underline">Fulfillment Ops</Link> to monitor all warehouse activity.</>
            }
          </p>
        </CardContent>
      </Card>
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
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null);

  function submit() {
    if (!form.name || !form.portalEmail) {
      toast(fr ? "Nom et e-mail portail requis" : "Name and portal email required", "error");
      return;
    }
    const { record, password } = createWarehouse({
      ...form,
      zones: form.zones.split(",").map((z) => z.trim()),
    });
    setCreated({ id: record.id, password });
    toast(fr ? "Entrepôt créé — identifiants générés" : "Warehouse created — credentials generated");
  }

  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-semibold text-emerald-700">{fr ? "Entrepôt créé — Identifiants portail" : "Warehouse Created — Portal Credentials"}</h3>
          <p className="text-sm text-slate-600">{fr ? "Partagez ces identifiants avec le responsable d'entrepôt. Il peut se connecter sur /login." : "Share these credentials with the warehouse manager. They can log in at /login."}</p>
          <div className="rounded-lg bg-slate-50 p-4 font-mono text-sm">
            <p>{fr ? "ID entrepôt" : "Warehouse ID"}: {created.id}</p>
            <p>{fr ? "E-mail portail" : "Portal Email"}: {form.portalEmail}</p>
            <p>{fr ? "Mot de passe temporaire" : "Temp Password"}: {created.password}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/warehouses/${created.id}`}><Button size="sm">{fr ? "Voir l'entrepôt" : "View Warehouse"}</Button></Link>
            <Button variant="ghost" size="sm" onClick={onClose}>{fr ? "Fermer" : "Close"}</Button>
          </div>
        </CardContent>
      </Card>
    );
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
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "E-mail du responsable" : "Manager email"} value={form.managerEmail} onChange={(e) => setForm({ ...form, managerEmail: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={fr ? "E-mail portail (ex. entrepot.ville@somba.com)" : "Portal login email (e.g. warehouse.city@somba.com)"} value={form.portalEmail} onChange={(e) => setForm({ ...form, portalEmail: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={fr ? "Zones (séparées par des virgules)" : "Zones (comma-separated)"} value={form.zones} onChange={(e) => setForm({ ...form, zones: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit}>{fr ? "Créer et générer les identifiants" : "Create & Generate Credentials"}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>{fr ? "Annuler" : "Cancel"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
