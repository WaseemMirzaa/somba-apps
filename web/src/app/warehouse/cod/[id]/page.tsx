"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { getCodReconciliation } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseCodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const cod = getCodReconciliation(id);

  if (!cod) {
    return <div className="p-8 text-center text-slate-500">COD record not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={cod.id}
        subtitle={`${cod.rider} · ${cod.shift} shift`}
        backHref="/warehouse/cod"
        actions={
          cod.status === "investigating" ? (
            <>
              <button onClick={() => toast("COD reconciliation approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Approve</button>
              <Link href={`/warehouse/exceptions/${cod.exceptionId ?? "INC-003"}`} className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white">Investigate</Link>
            </>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">Approved</span>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Rider">
          <InfoGrid items={[
            { label: "Rider", value: <Link href={`/warehouse/riders/${cod.riderId}`} className="text-indigo-600 hover:underline">{cod.rider}</Link> },
            { label: "Shift", value: cod.shift },
            { label: "Vehicle", value: cod.vehicle },
          ]} />
        </DetailSection>

        <DetailSection title="Settlement">
          <InfoGrid items={[
            { label: "Expected", value: formatCurrency(cod.expected, locale) },
            { label: "Collected", value: formatCurrency(cod.collected, locale) },
            { label: "Difference", value: <span className={cod.difference !== 0 ? "text-red-600" : "text-emerald-600"}>{formatCurrency(cod.difference, locale)}</span> },
          ]} />
        </DetailSection>
      </div>

      <DetailSection title="Orders">
        <DataTable
          columns={[
            { key: "orderId", label: "Order ID", render: (row) => (
              <Link href={`/admin/orders/${row.orderId}`} className="text-indigo-600 hover:underline">{String(row.orderId)}</Link>
            )},
            { key: "codAmount", label: "COD Amount", render: (row) => formatCurrency(row.codAmount as number, locale) },
            { key: "collected", label: "Collected", render: (row) => formatCurrency(row.collected as number, locale) },
          ]}
          data={cod.orders as unknown as Record<string, unknown>[]}
        />
      </DetailSection>
    </div>
  );
}
