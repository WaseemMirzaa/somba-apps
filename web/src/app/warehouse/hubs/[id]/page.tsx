"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";

export default function WarehouseHubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getWarehouse } = useWarehouseAdmin();
  const warehouse = getWarehouse(id);

  if (!warehouse) return <div className="p-8 text-center text-slate-500">Hub not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={`${warehouse.city}, ${warehouse.country}`}
        backHref="/warehouse/hubs"
        actions={<Badge variant={warehouse.status === "active" ? "success" : "warning"}>{warehouse.status}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title="Hub details">
          <InfoGrid items={[
            { label: "ID", value: warehouse.id },
            { label: "Address", value: warehouse.address, full: true },
            { label: "Capacity", value: warehouse.capacity.toLocaleString() },
            { label: "Staff", value: warehouse.staff },
            { label: "Manager", value: warehouse.managerName },
            { label: "Zones", value: warehouse.zones.join(" · "), full: true },
          ]} />
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/warehouse/inbound" className="text-indigo-600 hover:underline">Inbound queue →</Link>
            <Link href="/warehouse/dispatch" className="text-indigo-600 hover:underline">Dispatch →</Link>
            <Link href={`/admin/warehouses/${warehouse.id}`} className="text-indigo-600 hover:underline">Admin warehouse view →</Link>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
