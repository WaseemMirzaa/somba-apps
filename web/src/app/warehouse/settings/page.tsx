"use client";

import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseSettingsPage() {
  const { t } = useLocale();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle="Working Hours · Zones · Dispatch Rules · Batch Size · Auto Assignment"
        breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: t("settings") }]}
      />

      <DetailSection title="Working Hours">
        <InfoGrid items={[
          { label: "Open", value: "06:00" },
          { label: "Close", value: "22:00" },
          { label: "Timezone", value: "Africa/Kinshasa" },
        ]} />
      </DetailSection>

      <DetailSection title="Zones">
        <InfoGrid items={[
          { label: "Zone A", value: "Gombe, Centre-Ville" },
          { label: "Zone B", value: "Limete, Matete" },
          { label: "Zone C", value: "Bandal, Kintambo" },
        ]} />
      </DetailSection>

      <DetailSection title="Dispatch Rules">
        <InfoGrid items={[
          { label: "Max Batch Size", value: "15 parcels" },
          { label: "Auto Assignment", value: "Enabled" },
          { label: "Route Optimization", value: "Enabled" },
        ]} />
      </DetailSection>

      <div className="flex gap-3">
        <button onClick={() => toast("Warehouse settings saved")} className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white">Save</button>
        <button onClick={() => toast("Settings reset to defaults", "info")} className="rounded-lg border border-indigo-200 px-6 py-2 text-sm font-medium text-slate-600 hover:bg-indigo-50">Reset</button>
      </div>
    </div>
  );
}
