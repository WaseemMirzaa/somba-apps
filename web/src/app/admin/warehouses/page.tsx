"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";

export default function AdminWarehousesPage() {
  const { t, locale } = useLocale();
  const { warehouses } = useWarehouseAdmin();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("warehouses")}
        subtitle={t("warehouseManagement")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("warehouses") }]}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("create")} {t("warehouses")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Boxes className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{warehouses.length}</p>
              <p className="text-sm text-slate-500">{t("warehouses")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-emerald-600">{warehouses.filter((w) => w.status === "active").length}</p>
            <p className="text-sm text-slate-500">{t("active")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-bold text-amber-600">{warehouses.filter((w) => w.status === "setup").length}</p>
            <p className="text-sm text-slate-500">{statusLabel(locale, "setup")}</p>
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
              { key: "id", label: t("idCol"), render: (row) => (
                <Link href={`/admin/warehouses/${row.id}`} className="font-medium text-blue-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "name", label: t("warehouses") },
              { key: "city", label: t("city") },
              { key: "country", label: t("country") },
              { key: "staff", label: t("staff") },
              { key: "capacity", label: t("capacity"), render: (row) => Number(row.capacity).toLocaleString() },
              { key: "portalEmail", label: t("email") },
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={row.status === "active" ? "success" : row.status === "setup" ? "warning" : "default"}>{statusLabel(locale, String(row.status))}</Badge>
              )},
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/admin/warehouses/${row.id}`} className="text-sm text-blue-600 hover:underline">{t("view")}</Link>
              )},
            ]}
            data={warehouses as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-slate-600">
            Warehouse managers log in with the portal email and password you issue here.
            They only see the <strong>{t("warehousePortal")}</strong> — not Admin, Seller, or other portals.
            As admin, use <Link href="/admin/fulfillment" className="text-blue-600 hover:underline">{t("fulfillmentOps")}</Link> to monitor all warehouse activity.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateWarehouseForm({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const { createWarehouse } = useWarehouseAdmin();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", city: "", country: "France", address: "",
    capacity: 10000, managerName: "", managerEmail: "", portalEmail: "", zones: "Zone A",
  });
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null);

  function submit() {
    if (!form.name || !form.portalEmail) {
      toast(`${t("name")} & ${t("email")} required`, "error");
      return;
    }
    const { record, password } = createWarehouse({
      ...form,
      zones: form.zones.split(",").map((z) => z.trim()),
    });
    setCreated({ id: record.id, password });
    toast(t("create"));
  }

  if (created) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="font-semibold text-emerald-700">{t("create")} — {t("warehousePortal")}</h3>
          <p className="text-sm text-slate-600">{t("warehouseCredentialsHelp")}</p>
          <div className="rounded-lg bg-slate-50 p-4 font-mono text-sm">
            <p>ID: {created.id}</p>
            <p>{t("email")}: {form.portalEmail}</p>
            <p>{t("passwordPlaceholder")}: {created.password}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/warehouses/${created.id}`}><Button size="sm">{t("view")}</Button></Link>
            <Button variant="ghost" size="sm" onClick={onClose}>{t("cancel")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h3 className="font-semibold">{t("create")} {t("warehouses")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input-premium px-4 py-2 text-sm" placeholder={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={t("city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={t("country")} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={t("capacity")} type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={t("address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={t("managerName")} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={t("email")} value={form.managerEmail} onChange={(e) => setForm({ ...form, managerEmail: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={t("portalEmail")} value={form.portalEmail} onChange={(e) => setForm({ ...form, portalEmail: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={t("zonesLabel")} value={form.zones} onChange={(e) => setForm({ ...form, zones: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit}>{t("create")}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>{t("cancel")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
