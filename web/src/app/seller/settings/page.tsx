"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { storeSettings } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerSettingsPage() {
  const { t } = useLocale();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings")} subtitle="Store profile, business info, team & permissions" breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("settings") }]} />

      <DetailGrid>
        <DetailGridSection title="Store Profile" span={2}>
          <InfoGrid items={[
            { label: "Store Name", value: storeSettings.storeName },
            { label: "Description", value: storeSettings.description, full: true },
          ]} />
          <div className="mt-4 flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed border-sky-200 text-sm text-slate-400">
            Logo & Banner upload (mock)
          </div>
        </DetailGridSection>

        <DetailGridSection title="Business">
          <InfoGrid items={[
            { label: "Business Name", value: storeSettings.businessName },
            { label: "Tax ID", value: storeSettings.taxId },
            { label: "Phone", value: storeSettings.phone },
            { label: "Email", value: storeSettings.email },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Role Permissions" span={2}>
          <div className="space-y-3 text-sm">
            {["Products", "Orders", "Finance", "Analytics", "Support"].map((perm) => (
              <div key={perm} className="flex items-center justify-between rounded-lg border border-sky-50 p-3">
                <span>{perm}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-sky-300" />
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title="Team Members" span={3}>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
              { key: "email", label: "Email" },
              { key: "status", label: t("status"), render: (row) => <Badge variant="success">{String(row.status)}</Badge> },
            ]}
            data={storeSettings.teamMembers as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>

      <button onClick={() => toast("Settings saved successfully")} className="btn-primary rounded-lg px-6 py-2 text-sm font-medium">Save Settings</button>
    </div>
  );
}
