"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useLocale } from "@/context/locale-context";

export default function WarehouseHubsPage() {
  const { t } = useLocale();
  const { persona } = useAuth();
  const { warehouses } = useWarehouseAdmin();
  const assignedId = persona.warehouseId;
  const hubs = assignedId ? warehouses.filter((w) => w.id === assignedId) : warehouses.filter((w) => w.status === "active");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("hubs")}
        subtitle={assignedId ? t("assignedHub") : t("activeHubs")}
        breadcrumbs={[{ label: t("warehouseBreadcrumb"), href: "/warehouse" }, { label: t("hubs") }]}
      />

      <div className="space-y-3">
        {hubs.map((hub) => (
          <Link key={hub.id} href={`/warehouse/hubs/${hub.id}`} className="card-premium block p-5 transition-colors hover:border-indigo-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900">{hub.name}</p>
                <p className="text-sm text-slate-500">{hub.city}, {hub.country}</p>
                <p className="mt-1 text-xs text-slate-400">{hub.zones.join(" · ")}</p>
              </div>
              <Badge variant={hub.status === "active" ? "success" : "warning"}>{hub.id}</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
