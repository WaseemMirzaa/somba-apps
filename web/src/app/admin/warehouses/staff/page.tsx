"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users, Pencil, UserX, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useWarehouseStaff } from "@/context/warehouse-staff-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
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

const ROLE_OPTIONS: { value: WarehouseStaffRole; label: string }[] = [
  { value: "operator", label: "Operator" },
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
];

export default function AdminWarehouseStaffPage() {
  const { staff, toggleStaffStatus } = useWarehouseStaff();
  const { warehouses } = useWarehouseAdmin();
  const { toast } = useToast();
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
        title="Warehouse Staff"
        subtitle="Create operator, supervisor, and manager accounts for fulfillment hubs"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Warehouses", href: "/admin/warehouses" },
          { label: "Staff" },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/warehouses">
              <Button variant="secondary" size="sm">All Warehouses</Button>
            </Link>
            <Button size="sm" onClick={() => { setEditing(null); setShowCreate(true); }}>
              <Plus className="h-4 w-4" />
              Add Employee
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
              <p className="text-sm text-slate-500">Total employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
            <p className="text-sm text-slate-500">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-slate-600">{staff.length - activeCount}</p>
            <p className="text-sm text-slate-500">Disabled</p>
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
        searchPlaceholder="Name, email, warehouse ID…"
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "ID", render: (row) => (
                <span className="font-mono text-xs">{String(row.id)}</span>
              )},
              { key: "name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              {
                key: "role",
                label: "Role",
                render: (row) => (
                  <Badge variant="default">
                    {WAREHOUSE_STAFF_ROLE_LABELS[row.role as WarehouseStaffRole]}
                  </Badge>
                ),
              },
              {
                key: "warehouseId",
                label: "Warehouse",
                render: (row) => warehouseMap[String(row.warehouseId)] ?? String(row.warehouseId),
              },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <Badge variant={row.status === "active" ? "success" : "default"}>
                    {String(row.status)}
                  </Badge>
                ),
              },
              {
                key: "login",
                label: "Login ID",
                render: (row) => (
                  <span className="font-mono text-xs text-slate-500">
                    {warehouseStaffPersonaId(String(row.id))}
                  </span>
                ),
              },
              {
                key: "actions",
                label: "Actions",
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
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
                        onClick={() => {
                          toggleStaffStatus(member.id);
                          toast(
                            member.status === "active" ? "Employee disabled" : "Employee re-enabled",
                            member.status === "active" ? "error" : "success"
                          );
                        }}
                      >
                        {member.status === "active" ? (
                          <><UserX className="h-3.5 w-3.5" /> Disable</>
                        ) : (
                          <><UserCheck className="h-3.5 w-3.5" /> Enable</>
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
            Active warehouse staff appear on the <Link href="/login" className="text-[var(--primary)] hover:underline">login page</Link> under
            the <strong>Warehouse</strong> role tab. They can only access the warehouse portal for their assigned hub.
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
      toast("Name, email, and warehouse are required", "error");
      return;
    }
    if (member) {
      updateStaff(member.id, form);
      toast("Employee updated");
    } else {
      const created = createStaff(form);
      toast(`Employee created — login as ${warehouseStaffPersonaId(created.id)} on /login`);
    }
    onClose();
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h3 className="font-semibold">{member ? "Edit Employee" : "New Warehouse Employee"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="input-premium px-4 py-2 text-sm"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input-premium px-4 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="input-premium px-4 py-2 text-sm"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <select
            className="input-premium px-4 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as WarehouseStaffRole })}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
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
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit}>{member ? "Save Changes" : "Create Employee"}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
