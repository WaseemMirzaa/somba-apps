"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { getRider } from "@/lib/warehouse-entities";
import { batchEntities } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function WarehouseRiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const rider = getRider(Number(id));

  if (!rider) {
    return <div className="p-8 text-center text-slate-500">Rider not found</div>;
  }

  const batches = batchEntities.filter((b) => b.riderId === rider.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={rider.name}
        subtitle={`${rider.zone} · ${rider.vehicle} · ⭐ ${rider.rating}`}
        backHref="/warehouse/riders"
        breadcrumbs={[
          { label: "Warehouse", href: "/warehouse" },
          { label: "Riders", href: "/warehouse/riders" },
          { label: rider.name },
        ]}
        actions={
          <>
            <a href={`tel:${rider.phone}`} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">Call Rider</a>
            <Badge variant="success">{rider.status}</Badge>
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title="Overview">
          <InfoGrid items={[
            { label: "Name", value: rider.name },
            { label: "Phone", value: rider.phone },
            { label: "Vehicle", value: rider.vehicle },
            { label: "Zone", value: rider.zone },
            { label: "Status", value: rider.status },
            { label: "Location", value: rider.location },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Performance">
          <InfoGrid columns={3} items={[
            { label: "Total Deliveries", value: rider.deliveries },
            { label: "Failed Deliveries", value: rider.failedDeliveries },
            { label: "COD Collections", value: formatCurrency(rider.codCollections, locale) },
            { label: "Rating", value: `⭐ ${rider.rating}` },
            { label: "Performance Score", value: `${rider.performanceScore}%` },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Earnings">
          <InfoGrid columns={3} items={[
            { label: "Daily", value: formatCurrency(rider.earningsDaily, locale) },
            { label: "Weekly", value: formatCurrency(rider.earningsWeekly, locale) },
            { label: "Monthly", value: formatCurrency(rider.earningsMonthly, locale) },
          ]} />
          <Link href="/warehouse/cod" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">→ COD Summary</Link>
        </DetailGridSection>

        <DetailGridSection title="Assigned Batches" span={2}>
          <DataTable
            columns={[
              { key: "id", label: "Batch", render: (row) => (
                <Link href={`/warehouse/dispatch/${row.id}`} className="text-indigo-600 hover:underline">{String(row.id)}</Link>
              )},
              { key: "zone", label: "Zone" },
              { key: "parcelCount", label: "Parcels" },
              { key: "status", label: "Status", render: (row) => <Badge>{String(row.status)}</Badge> },
            ]}
            data={batches as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title="Current Deliveries">
          <Link href="/warehouse/deliveries" className="text-sm text-indigo-600 hover:underline">
            View {rider.activeDeliveries} active deliveries →
          </Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
