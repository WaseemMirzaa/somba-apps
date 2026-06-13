"use client";

import { StatCard } from "@/components/ui/stat-card";
import { DetailSection } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { Package, Send, RotateCcw, Clock } from "lucide-react";
import { warehouseDashboardStats } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";

export default function WarehouseAnalyticsPage() {
  const { t } = useLocale();
  const s = warehouseDashboardStats;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("analytics")}
        subtitle="Inbound Volume · Dispatch Volume · Return Volume · Aged Parcels · SLAs"
        breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("analytics") }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Inbound Volume" value={s.receivedToday} icon={Package} trend="Receive SLA: 98%" />
        <StatCard title="Dispatch Volume" value={s.dispatchedToday} icon={Send} trend="Dispatch SLA: 94%" />
        <StatCard title="Return Volume" value={s.pendingReturns} icon={RotateCcw} trend="Return SLA: 91%" />
        <StatCard title="Aged Parcels" value={s.agedParcels} icon={Clock} trend="> 48h in warehouse" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="KPIs">
          <div className="space-y-3 text-sm">
            {[
              { label: "Receive SLA", value: "98%", color: "text-emerald-600" },
              { label: "Sorting SLA", value: "96%", color: "text-emerald-600" },
              { label: "Dispatch SLA", value: "94%", color: "text-amber-600" },
              { label: "Return SLA", value: "91%", color: "text-amber-600" },
              { label: "Aged Parcels", value: s.agedParcels, color: "text-red-600" },
            ].map((kpi) => (
              <div key={kpi.label} className="flex justify-between border-b border-indigo-50 pb-2">
                <span className="text-slate-600">{kpi.label}</span>
                <span className={`font-semibold ${kpi.color}`}>{kpi.value}</span>
              </div>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="Volume Trends">
          <div className="flex h-48 items-center justify-center rounded-lg bg-indigo-50 text-sm text-slate-500">
            Chart preview (mock) — daily inbound vs dispatch
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
