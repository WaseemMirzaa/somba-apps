"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bike, Plus, Users, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { SecretBox } from "@/components/admin/copy-box";
import { HomeWarehouseDialog } from "@/components/admin/home-warehouse-dialog";
import { ErrorNote } from "@/components/admin/modal";
import { NoticeBar } from "@/components/admin/notice-bar";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { errMsg, useServerList, type StaffRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketQuery, type HubRow } from "@/lib/admin-stats";

export default function AdminWarehouseStaffPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  // Real accounts: every warehouse employee and rider the server knows about.
  const { items, reload, error: loadError, loading } = useServerList<StaffRow>("roles:staff");
  const hubs = useServerList<HubRow>("warehouse:hubs", { pushEvents: ["hub:updated"] });
  const hubName = useMemo(() => new Map(hubs.items.map((h) => [h.id, h.name])), [hubs.items]);
  // Zone id → name, for riders' preferred zones.
  const settings = useSocketQuery<Record<string, string>>("settings:get");
  const zoneName = useMemo(() => {
    try {
      const zones = JSON.parse(settings.data?.deliveryZones ?? "[]") as { id: string; name: string; nameFr?: string }[];
      return new Map(zones.map((z) => [z.id, fr ? z.nameFr || z.name : z.name]));
    } catch {
      return new Map<string, string>();
    }
  }, [settings.data, fr]);
  const [tab, setTab] = useState<"warehouse_staff" | "rider">("warehouse_staff");
  const staff = useMemo(() => items.filter((u) => u.role === tab), [items, tab]);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () => applyListFilters(staff, filters, { searchFields: ["name", "email", "phone"] }),
    [staff, filters],
  );

  async function create() {
    if (!form.name.trim() || !form.email.trim()) {
      setFormError(fr ? "Nom et e-mail requis." : "Name and email are required.");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const res = await socketClient.request<{ id: string; email: string; tempPassword: string }>("roles:createStaff", {
        role: tab,
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setSecret({ email: res.email, password: res.tempPassword });
      setForm({ name: "", email: "", phone: "" });
      setShowCreate(false);
      toast(tab === "rider" ? (fr ? "Compte livreur créé" : "Rider account created") : fr ? "Compte entrepôt créé" : "Warehouse account created", "success");
      void reload();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Personnel d'entrepôt" : "Warehouse Staff"}
        subtitle={fr ? "Employés d'entrepôt et livreurs, et l'entrepôt où chacun travaille" : "Warehouse employees and riders, and the warehouse each one works at"}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: fr ? "Entrepôts" : "Warehouses", href: "/admin/warehouses" },
          { label: fr ? "Personnel" : "Staff" },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/warehouses">
              <Button variant="secondary" size="sm">{fr ? "Annuaire des hubs" : "Hub directory"}</Button>
            </Link>
            <Button size="sm" onClick={() => setShowCreate((s) => !s)}>
              <Plus className="h-4 w-4" />
              {tab === "rider" ? (fr ? "Ajouter un livreur" : "Add rider") : fr ? "Ajouter un employé" : "Add employee"}
            </Button>
          </div>
        }
      />

      {loadError && <SectionError message={loadError} onRetry={reload} />}
      {loading && !loadError && <SectionLoading />}
      <NoticeBar>
        {fr
          ? "Chacun travaille dans un entrepôt : un livreur ne voit et ne reçoit que les livraisons des zones de son entrepôt, ses zones préférées en premier ; un employé ne voit que les colis de son entrepôt. Sans entrepôt, la personne voit tout. Seul le super administrateur crée les comptes (mot de passe temporaire affiché une seule fois)."
          : "Everyone works at one warehouse: a rider only sees and is told about deliveries in their warehouse's zones, preferred zones first, and an employee only sees their warehouse's parcels. With no warehouse, the person sees everything. Only the super admin creates accounts (the temporary password is shown once)."}
      </NoticeBar>

      {secret && <SecretBox email={secret.email} secret={secret.password} fr={fr} onDismiss={() => setSecret(null)} />}

      <Tabs
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "warehouse_staff", label: fr ? "Employés d'entrepôt" : "Warehouse staff" },
          { id: "rider", label: fr ? "Livreurs" : "Riders" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            {tab === "rider" ? <Bike className="h-8 w-8 text-[var(--primary)]" /> : <Users className="h-8 w-8 text-[var(--primary)]" />}
            <div>
              <p className="text-2xl font-bold">{staff.length}</p>
              <p className="text-sm text-slate-500">{tab === "rider" ? (fr ? "Comptes livreur" : "Rider accounts") : fr ? "Comptes entrepôt" : "Warehouse accounts"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-emerald-600">{staff.filter((s) => s.active !== false).length}</p>
            <p className="text-sm text-slate-500">{fr ? "Actifs" : "Active"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Warehouse className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{staff.filter((s) => !s.hubId).length}</p>
              <p className="text-sm text-slate-500">{fr ? "Sans entrepôt" : "No warehouse"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="font-semibold">{tab === "rider" ? (fr ? "Nouveau livreur" : "New rider") : fr ? "Nouvel employé d'entrepôt" : "New warehouse employee"}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom complet" : "Full name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Téléphone" : "Phone"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <ErrorNote message={formError} />
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={creating}>{creating ? "…" : fr ? "Créer le compte" : "Create account"}</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>{fr ? "Annuler" : "Cancel"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ListFilters
        values={filters}
        onChange={setFilters}
        searchPlaceholder={fr ? "Nom, e-mail, téléphone…" : "Name, email, phone…"}
        showDateFilters={false}
        showStatusFilter={false}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={tab === "rider" ? (fr ? "Aucun livreur" : "No riders yet") : fr ? "Aucun compte entrepôt" : "No warehouse accounts yet"}
            columns={[
              { key: "name", label: fr ? "Nom" : "Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => <span>{row.phone ? String(row.phone) : "—"}</span> },
              {
                key: "hubId",
                label: fr ? "Entrepôt" : "Warehouse",
                render: (row) =>
                  row.hubId ? (
                    <span className="font-medium text-slate-800">{hubName.get(String(row.hubId)) ?? (fr ? "Entrepôt inconnu" : "Unknown warehouse")}</span>
                  ) : (
                    <Badge variant="warning">{fr ? "Tous" : "Any"}</Badge>
                  ),
              },
              ...(tab === "rider"
                ? [
                    {
                      key: "preferredZones",
                      label: fr ? "Zones préférées" : "Preferred zones",
                      render: (row: Record<string, unknown>) => {
                        const z = (row.preferredZones as string[] | undefined) ?? [];
                        return z.length ? <span className="text-xs text-slate-600">{z.map((id) => zoneName.get(id) ?? id).join(", ")}</span> : <span className="text-slate-400">—</span>;
                      },
                    },
                  ]
                : []),
              {
                key: "active",
                label: fr ? "Statut" : "Status",
                render: (row) =>
                  row.active === undefined ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <Badge variant={row.active ? "success" : "default"}>{row.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive"}</Badge>
                  ),
              },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <button className="text-sm font-medium text-[var(--primary)] hover:underline" onClick={() => setEditing(row as unknown as StaffRow)}>
                    {fr ? "Choisir l'entrepôt" : "Set warehouse"}
                  </button>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <HomeWarehouseDialog user={editing} hubs={hubs.items} fr={fr} onClose={() => setEditing(null)} onSaved={() => void reload()} />

      <p className="text-xs text-slate-400">
        {fr
          ? "Pour changer le rôle d'un compte, utilisez la page Rôles."
          : "To change an account's role, use the Roles page."}
      </p>
    </div>
  );
}
