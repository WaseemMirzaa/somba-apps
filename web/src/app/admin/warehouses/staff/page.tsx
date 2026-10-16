"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { SecretBox } from "@/components/admin/copy-box";
import { ErrorNote } from "@/components/admin/modal";
import { NoticeBar } from "@/components/admin/demo-badge";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { errMsg, useServerList, type StaffRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

export default function AdminWarehouseStaffPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  // Real accounts: every `warehouse_staff` user the server knows about.
  const { items, reload, error: loadError } = useServerList<StaffRow>("roles:staff");
  const staff = useMemo(() => items.filter((u) => u.role === "warehouse_staff"), [items]);
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
        role: "warehouse_staff",
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setSecret({ email: res.email, password: res.tempPassword });
      setForm({ name: "", email: "", phone: "" });
      setShowCreate(false);
      toast(fr ? "Compte entrepôt créé" : "Warehouse account created", "success");
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
        subtitle={fr ? "Vrais comptes serveur (rôle « warehouse_staff »)" : "Real server accounts (role “warehouse_staff”)"}
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
              {fr ? "Ajouter un employé" : "Add employee"}
            </Button>
          </div>
        }
      />

      {loadError && <NoticeBar tone="warn">{loadError}</NoticeBar>}
      <NoticeBar>
        {fr
          ? "La création de comptes est réservée au super administrateur. Le compte est créé avec un mot de passe temporaire affiché une seule fois. L'affectation à un hub n'existe pas encore côté serveur."
          : "Only the super admin can create accounts. The account is created with a temporary password shown once. Assignment to a specific hub does not exist on the server yet."}
      </NoticeBar>

      {secret && <SecretBox email={secret.email} secret={secret.password} fr={fr} onDismiss={() => setSecret(null)} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Users className="h-8 w-8 text-[var(--primary)]" />
            <div>
              <p className="text-2xl font-bold">{staff.length}</p>
              <p className="text-sm text-slate-500">{fr ? "Comptes entrepôt" : "Warehouse accounts"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-emerald-600">{staff.filter((s) => s.active !== false).length}</p>
            <p className="text-sm text-slate-500">{fr ? "Actifs" : "Active"}</p>
          </CardContent>
        </Card>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="font-semibold">{fr ? "Nouvel employé d'entrepôt" : "New warehouse employee"}</h3>
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
            emptyMessage={fr ? "Aucun compte entrepôt" : "No warehouse accounts yet"}
            columns={[
              { key: "name", label: fr ? "Nom" : "Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => <span>{row.phone ? String(row.phone) : "—"}</span> },
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
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        {fr
          ? "Pour changer le rôle d'un compte, utilisez la page Rôles."
          : "To change an account's role, use the Roles page."}
      </p>
    </div>
  );
}
