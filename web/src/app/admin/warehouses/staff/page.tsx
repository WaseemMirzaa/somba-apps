"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users, Pencil, UserX, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useWarehouseStaff } from "@/context/warehouse-staff-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import {
  WAREHOUSE_STAFF_ROLE_LABELS,
  warehouseStaffPersonaId,
  type WarehouseStaffMember,
  type WarehouseStaffRole,
  type WarehouseStaffStatus,
} from "@/lib/admin-entities";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "inactive", label: "Inactive", labelFr: "Inactif" },
];

const ROLE_OPTIONS: { value: WarehouseStaffRole; label: string; labelFr: string }[] = [
  { value: "operator", label: "Operator", labelFr: "Opérateur" },
  { value: "manager", label: "Manager", labelFr: "Responsable" },
  { value: "supervisor", label: "Supervisor", labelFr: "Superviseur" },
];

const ROLE_LABELS_FR: Record<WarehouseStaffRole, string> = {
  operator: "Opérateur",
  manager: "Responsable",
  supervisor: "Superviseur",
};

export default function AdminWarehouseStaffPage() {
  const { staff, toggleStaffStatus } = useWarehouseStaff();
  const { warehouses } = useWarehouseAdmin();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<WarehouseStaffMember | null>(null);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const warehouseMap = useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, w.name])),
    [warehouses]
  );

  const filtered = useMemo(
    () =>
      applyListFilters(staff, filters, {
        searchFields: ["id", "name", "email", "phone", "warehouseId"],
        statusField: "status",
      }),
    [staff, filters]
  );

  const activeCount = staff.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Personnel d'entrepôt" : "Warehouse Staff"}
        subtitle={fr ? "Créez des comptes opérateur, superviseur et responsable pour les centres de distribution" : "Create operator, supervisor, and manager accounts for fulfillment hubs"}
        breadcrumbs={[
          { label: fr ? "Admin" : "Admin", href: "/admin" },
          { label: fr ? "Entrepôts" : "Warehouses", href: "/admin/warehouses" },
          { label: fr ? "Personnel" : "Staff" },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/warehouses">
              <Button variant="secondary" size="sm">{fr ? "Tous les entrepôts" : "All Warehouses"}</Button>
            </Link>
            <Button size="sm" onClick={() => { setEditing(null); setShowCreate(true); }}>
              <Plus className="h-4 w-4" />
              {fr ? "Ajouter un employé" : "Add Employee"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Users className="h-8 w-8 text-[var(--primary)]" />
            <div>
              <p className="text-2xl font-bold">{staff.length}</p>
              <p className="text-sm text-slate-500">{fr ? "Total employés" : "Total employees"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
            <p className="text-sm text-slate-500">{fr ? "Actifs" : "Active"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-slate-600">{staff.length - activeCount}</p>
            <p className="text-sm text-slate-500">{fr ? "Désactivés" : "Disabled"}</p>
          </CardContent>
        </Card>
      </div>

      {(showCreate || editing) && (
        <StaffForm
          member={editing}
          warehouses={warehouses}
          onClose={() => { setShowCreate(false); setEditing(null); }}
        />
      )}

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Nom, e-mail, ID d'entrepôt…" : "Name, email, warehouse ID…"}
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID", render: (row) => (
                <span className="font-mono text-xs">{String(row.id)}</span>
              )},
              { key: "name", label: fr ? "Nom" : "Name" },
              { key: "email", label: fr ? "E-mail" : "Email" },
              { key: "phone", label: fr ? "Téléphone" : "Phone" },
              {
                key: "role",
                label: fr ? "Rôle" : "Role",
                render: (row) => (
                  <Badge variant="default">
                    {fr ? ROLE_LABELS_FR[row.role as WarehouseStaffRole] : WAREHOUSE_STAFF_ROLE_LABELS[row.role as WarehouseStaffRole]}
                  </Badge>
                ),
              },
              {
                key: "warehouseId",
                label: fr ? "Entrepôt" : "Warehouse",
                render: (row) => warehouseMap[String(row.warehouseId)] ?? String(row.warehouseId),
              },
              {
                key: "status",
                label: fr ? "Statut" : "Status",
                render: (row) => (
                  <Badge variant={row.status === "active" ? "success" : "default"}>
                    {fr ? (row.status === "active" ? "Actif" : "Inactif") : String(row.status)}
                  </Badge>
                ),
              },
              {
                key: "login",
                label: fr ? "ID de connexion" : "Login ID",
                render: (row) => (
                  <span className="font-mono text-xs text-slate-500">
                    {warehouseStaffPersonaId(String(row.id))}
                  </span>
                ),
              },
              {
                key: "actions",
                label: fr ? "Actions" : "Actions",
                render: (row) => {
                  const member = row as unknown as WarehouseStaffMember;
                  return (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
                        onClick={() => { setShowCreate(false); setEditing(member); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {fr ? "Modifier" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
                        onClick={() => {
                          toggleStaffStatus(member.id);
                          toast(
                            member.status === "active" ? (fr ? "Employé désactivé" : "Employee disabled") : (fr ? "Employé réactivé" : "Employee re-enabled"),
                            member.status === "active" ? "error" : "success"
                          );
                        }}
                      >
                        {member.status === "active" ? (
                          <><UserX className="h-3.5 w-3.5" /> {fr ? "Désactiver" : "Disable"}</>
                        ) : (
                          <><UserCheck className="h-3.5 w-3.5" /> {fr ? "Activer" : "Enable"}</>
                        )}
                      </button>
                    </div>
                  );
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-slate-600">
            {fr ? (
              <>
                Le personnel d&apos;entrepôt actif apparaît sur la <NavLinkButton href="/login">page de connexion</NavLinkButton> sous
                l&apos;onglet de rôle <strong>Entrepôt</strong>. Il ne peut accéder qu&apos;au portail entrepôt de son centre assigné.
              </>
            ) : (
              <>
                Active warehouse staff appear on the <NavLinkButton href="/login">login page</NavLinkButton> under
                the <strong>Warehouse</strong> role tab. They can only access the warehouse portal for their assigned hub.
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StaffForm({
  member,
  warehouses,
  onClose,
}: {
  member: WarehouseStaffMember | null;
  warehouses: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { createStaff, updateStaff } = useWarehouseStaff();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [form, setForm] = useState({
    name: member?.name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: (member?.role ?? "operator") as WarehouseStaffRole,
    warehouseId: member?.warehouseId ?? warehouses[0]?.id ?? "",
    status: (member?.status ?? "active") as WarehouseStaffStatus,
  });

  function submit() {
    if (!form.name || !form.email || !form.warehouseId) {
      toast(fr ? "Le nom, l'e-mail et l'entrepôt sont requis" : "Name, email, and warehouse are required", "error");
      return;
    }
    if (member) {
      updateStaff(member.id, form);
      toast(fr ? "Employé mis à jour" : "Employee updated");
    } else {
      const created = createStaff(form);
      toast(fr ? `Employé créé — connectez-vous en tant que ${warehouseStaffPersonaId(created.id)} sur /login` : `Employee created — login as ${warehouseStaffPersonaId(created.id)} on /login`);
    }
    onClose();
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h3 className="font-semibold">{member ? (fr ? "Modifier l'employé" : "Edit Employee") : (fr ? "Nouvel employé d'entrepôt" : "New Warehouse Employee")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="input-premium px-4 py-2 text-sm"
            placeholder={fr ? "Nom complet" : "Full name"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input-premium px-4 py-2 text-sm"
            placeholder={fr ? "E-mail" : "Email"}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="input-premium px-4 py-2 text-sm"
            placeholder={fr ? "Téléphone" : "Phone"}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <select
            className="input-premium px-4 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as WarehouseStaffRole })}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{fr ? r.labelFr : r.label}</option>
            ))}
          </select>
          <select
            className="input-premium px-4 py-2 text-sm sm:col-span-2"
            value={form.warehouseId}
            onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.id})</option>
            ))}
          </select>
          <select
            className="input-premium px-4 py-2 text-sm"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as WarehouseStaffStatus })}
          >
            <option value="active">{fr ? "Actif" : "Active"}</option>
            <option value="inactive">{fr ? "Inactif" : "Inactive"}</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit}>{member ? (fr ? "Enregistrer les modifications" : "Save Changes") : (fr ? "Créer l'employé" : "Create Employee")}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>{fr ? "Annuler" : "Cancel"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
