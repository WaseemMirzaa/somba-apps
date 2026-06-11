"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
import { warehouseDashboardStats } from "@/lib/warehouse-entities";

export default function AdminWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { getWarehouse, getCredential, resetCredentials, updateWarehouse, deactivateWarehouse } = useWarehouseAdmin();
  const { toast } = useToast();
  const warehouse = getWarehouse(id);
  const [password, setPassword] = useState(getCredential(id) ?? "—");
  const [showPassword, setShowPassword] = useState(false);
  const stats = warehouseDashboardStats;

  const fulfillmentLinks = [
    { href: "/admin/fulfillment/inbound", label: t("inboundQueue") },
    { href: "/admin/fulfillment/sorting", label: t("sortingBoard") },
    { href: "/admin/fulfillment/dispatch", label: t("dispatchQueue") },
    { href: "/admin/fulfillment/deliveries", label: t("deliveries") },
    { href: "/admin/fulfillment/returns", label: t("returnsQueue") },
    { href: "/admin/fulfillment/inventory", label: t("inventory") },
    { href: "/admin/fulfillment/riders", label: t("riders") },
    { href: "/admin/fulfillment/cod", label: t("cod") },
    { href: "/admin/fulfillment/exceptions", label: t("openExceptions") },
  ];

  if (!warehouse) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={`${warehouse.city}, ${warehouse.country} · ${warehouse.id}`}
        backHref="/admin/warehouses"
        breadcrumbs={[
          { label: t("adminBreadcrumb"), href: "/admin" },
          { label: t("warehouses"), href: "/admin/warehouses" },
          { label: warehouse.name },
        ]}
        actions={
          <>
            <Badge variant={warehouse.status === "active" ? "success" : "warning"}>{statusLabel(locale, warehouse.status)}</Badge>
            {warehouse.status !== "active" && (
              <Button size="sm" onClick={() => { updateWarehouse(id, { status: "active" }); toast(t("active")); }}>{t("active")}</Button>
            )}
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title={t("warehouseDetail")}>
          <InfoGrid items={[
            { label: t("idCol"), value: warehouse.id },
            { label: t("address"), value: warehouse.address, full: true },
            { label: t("details"), value: warehouse.capacity.toLocaleString() },
            { label: t("name"), value: warehouse.staff },
            { label: t("date"), value: warehouse.createdAt },
            { label: t("zone"), value: warehouse.zones.join(" · "), full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("managerSection")}>
          <InfoGrid items={[
            { label: t("name"), value: warehouse.managerName },
            { label: t("email"), value: warehouse.managerEmail },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("warehousePortal")} span={2}>
          <InfoGrid items={[
            { label: t("email"), value: warehouse.portalEmail },
            { label: t("passwordPlaceholder"), value: showPassword ? password : "••••••••" },
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

        <DetailGridSection title={t("recentActivity")} span={3}>
          <InfoGrid columns={4} items={[
            { label: t("receivedToday"), value: stats.receivedToday },
            { label: t("dispatchedToday"), value: stats.dispatchedToday },
            { label: t("activeBatches"), value: stats.activeBatches },
            { label: t("returnsPending"), value: stats.pendingReturns },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("fulfillmentOperations")} span={3}>
          <p className="mb-4 text-sm text-slate-600">Access all warehouse portal data from admin — no need to switch to the warehouse tab.</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fulfillmentLinks.map((link) => (
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
            {t("fulfillmentOps")} →
          </Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
