"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useLocale } from "@/context/locale-context";
import { L, statusLabel } from "@/lib/locale-helpers";

export default function WarehouseHubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { getWarehouse } = useWarehouseAdmin();
  const warehouse = getWarehouse(id);

  if (!warehouse) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={`${warehouse.city}, ${warehouse.country}`}
        backHref="/warehouse/hubs"
        actions={<Badge variant={warehouse.status === "active" ? "success" : "warning"}>{statusLabel(locale, warehouse.status)}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title={t("hubDetail")}>
          <InfoGrid items={[
            { label: t("reference"), value: warehouse.id },
            { label: t("address"), value: warehouse.address, full: true },
            { label: L(locale, "Capacity", "Capacité"), value: warehouse.capacity.toLocaleString() },
            { label: L(locale, "Staff", "Personnel"), value: warehouse.staff },
            { label: L(locale, "Manager", "Responsable"), value: warehouse.managerName },
            { label: L(locale, "Zones", "Zones"), value: warehouse.zones.join(" · "), full: true },
          ]} />
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/warehouse/inbound" className="text-indigo-600 hover:underline">{t("inboundQueue")} →</Link>
            <Link href="/warehouse/dispatch" className="text-indigo-600 hover:underline">{t("dispatch")} →</Link>
            <Link href={`/admin/warehouses/${warehouse.id}`} className="text-indigo-600 hover:underline">{L(locale, "Admin warehouse view", "Vue admin entrepôt")} →</Link>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
