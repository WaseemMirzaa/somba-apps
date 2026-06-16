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
import { warehouseDashboardStats } from "@/lib/warehouse-entities";

const FULFILLMENT_LINKS = [
  { href: "/admin/fulfillment/inbound", label: "Inbound Queue" },
  { href: "/admin/fulfillment/sorting", label: "Sorting" },
  { href: "/admin/fulfillment/dispatch", label: "Dispatch" },
  { href: "/admin/fulfillment/deliveries", label: "Deliveries" },
  { href: "/admin/fulfillment/returns", label: "Returns" },
  { href: "/admin/fulfillment/inventory", label: "Inventory" },
  { href: "/admin/fulfillment/riders", label: "Riders" },
  { href: "/admin/fulfillment/cod", label: "Payments" },
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
          <Link href="/admin/fulfillment" className="mt-4 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
            Open Fulfillment Dashboard →
          </Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
