"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { warehouseDashboardStats } from "@/lib/warehouse-entities";
import { defaultOperators, type WarehouseOperator } from "@/lib/warehouses-admin";

const FULFILLMENT_LINKS = [
  { href: "/admin/fulfillment/inbound", label: "Inbound Queue" },
  { href: "/admin/fulfillment/sorting", label: "Sorting" },
  { href: "/admin/fulfillment/dispatch", label: "Dispatch" },
  { href: "/admin/fulfillment/deliveries", label: "Deliveries" },
  { href: "/admin/fulfillment/returns", label: "Returns" },
  { href: "/admin/fulfillment/inventory", label: "Inventory" },
  { href: "/admin/fulfillment/riders", label: "Riders" },
  { href: "/admin/fulfillment/cod", label: "COD" },
  { href: "/admin/fulfillment/exceptions", label: "Exceptions" },
];

export default function AdminWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getWarehouse, getCredential, resetCredentials, updateWarehouse, deactivateWarehouse } = useWarehouseAdmin();
  const { toast } = useToast();
  const warehouse = getWarehouse(id);
  const [password, setPassword] = useState(getCredential(id) ?? "—");
  const [showPassword, setShowPassword] = useState(false);
  const stats = warehouseDashboardStats;
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [operators, setOperators] = useState<WarehouseOperator[]>(() =>
    warehouse ? warehouse.operators ?? defaultOperators(warehouse) : []
  );
  const [showAddOp, setShowAddOp] = useState(false);
  const [newOp, setNewOp] = useState({ name: "", email: "", role: "Inbound" });

  function addOperator() {
    if (!newOp.name.trim() || !newOp.email.trim()) {
      toast(fr ? "Nom et e-mail requis" : "Name and email required", "error");
      return;
    }
    setOperators((ops) => [
      ...ops,
      { id: `${id}-OP${ops.length + 1}`, name: newOp.name.trim(), email: newOp.email.trim(), role: newOp.role as WarehouseOperator["role"], status: "active" },
    ]);
    setNewOp({ name: "", email: "", role: "Inbound" });
    setShowAddOp(false);
    toast(fr ? "Opérateur ajouté" : "Operator added", "success");
  }
  function toggleOperator(opId: string) {
    setOperators((ops) => ops.map((o) => (o.id === opId ? { ...o, status: o.status === "active" ? "suspended" : "active" } : o)));
  }

  if (!warehouse) {
    return <div className="p-8 text-center text-slate-500">Warehouse not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={`${warehouse.city}, ${warehouse.country} · ${warehouse.id}`}
        backHref="/admin/warehouses"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Warehouses", href: "/admin/warehouses" },
          { label: warehouse.name },
        ]}
        actions={
          <>
            <Badge variant={warehouse.status === "active" ? "success" : "warning"}>{warehouse.status}</Badge>
            {warehouse.status !== "active" && (
              <Button size="sm" onClick={() => { updateWarehouse(id, { status: "active" }); toast("Warehouse activated"); }}>Activate</Button>
            )}
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title="Warehouse Details">
          <InfoGrid items={[
            { label: "ID", value: warehouse.id },
            { label: "Address", value: warehouse.address, full: true },
            { label: "Capacity", value: warehouse.capacity.toLocaleString() },
            { label: "Staff", value: warehouse.staff },
            { label: "Created", value: warehouse.createdAt },
            { label: "Zones", value: warehouse.zones.join(" · "), full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Manager">
          <InfoGrid items={[
            { label: "Name", value: warehouse.managerName },
            { label: "Email", value: warehouse.managerEmail },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Portal Credentials" span={2}>
          <InfoGrid items={[
            { label: "Login Email", value: warehouse.portalEmail },
            { label: "Password", value: showPassword ? password : "••••••••" },
          ]} />
          <p className="mt-2 text-xs text-slate-500">Warehouse managers use these at /login — they cannot access Admin or Seller portals.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? "Hide" : "Show"} Password
            </Button>
            <Button size="sm" onClick={() => { const p = resetCredentials(id); setPassword(p); setShowPassword(true); toast("New password generated"); }}>
              Reset Password
            </Button>
            <Button size="sm" variant="danger" onClick={() => { deactivateWarehouse(id); toast("Warehouse deactivated", "error"); }}>
              Deactivate
            </Button>
          </div>
        </DetailGridSection>

        <DetailGridSection title={`${fr ? "Opérateurs" : "Operators"} (${operators.length})`} span={3}>
          <p className="mb-3 text-sm text-slate-600">
            {fr ? "Gérez les comptes opérateurs liés à cet entrepôt et à cette ville." : "Manage operator accounts tied to this warehouse and city."}
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">{fr ? "Nom" : "Name"}</th>
                  <th className="px-4 py-2.5">{fr ? "E-mail" : "Email"}</th>
                  <th className="px-4 py-2.5">{fr ? "Rôle" : "Role"}</th>
                  <th className="px-4 py-2.5">{fr ? "Statut" : "Status"}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {operators.map((op) => (
                  <tr key={op.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{op.name}</td>
                    <td className="px-4 py-3 text-slate-500">{op.email}</td>
                    <td className="px-4 py-3"><Badge variant="info">{op.role}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={op.status === "active" ? "success" : "warning"}>{op.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {op.role !== "Manager" && (
                        <button onClick={() => toggleOperator(op.id)} className="text-sm font-medium text-[var(--primary)] hover:underline">
                          {op.status === "active" ? (fr ? "Suspendre" : "Suspend") : fr ? "Activer" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            {showAddOp ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <input className="input-premium px-3 py-2 text-sm" placeholder={fr ? "Nom" : "Name"} value={newOp.name} onChange={(e) => setNewOp({ ...newOp, name: e.target.value })} />
                <input className="input-premium px-3 py-2 text-sm" placeholder={fr ? "E-mail" : "Email"} value={newOp.email} onChange={(e) => setNewOp({ ...newOp, email: e.target.value })} />
                <select className="input-premium px-3 py-2 text-sm" value={newOp.role} onChange={(e) => setNewOp({ ...newOp, role: e.target.value })}>
                  <option value="Inbound">Inbound</option>
                  <option value="Sorting">Sorting</option>
                  <option value="Dispatch">Dispatch</option>
                </select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addOperator}>{fr ? "Ajouter" : "Add"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddOp(false)}>{fr ? "Annuler" : "Cancel"}</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setShowAddOp(true)}>
                {fr ? "+ Ajouter un opérateur" : "+ Add operator"}
              </Button>
            )}
          </div>
        </DetailGridSection>

        <DetailGridSection title="Today's Activity" span={3}>
          <InfoGrid columns={4} items={[
            { label: "Received", value: stats.receivedToday },
            { label: "Dispatched", value: stats.dispatchedToday },
            { label: "Active Batches", value: stats.activeBatches },
            { label: "Pending Returns", value: stats.pendingReturns },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Fulfillment Operations (Admin View)" span={3}>
          <p className="mb-4 text-sm text-slate-600">Access all warehouse portal data from admin — no need to switch to the warehouse tab.</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {FULFILLMENT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                {link.label} →
              </Link>
            ))}
          </div>
          <Link href="/admin/fulfillment" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
            Open Fulfillment Dashboard →
          </Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
