"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getReturn } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const ret = getReturn(id);
  const [status, setStatus] = useState(ret?.status ?? "pending");

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">Return not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.id}
        subtitle={`Order ${ret.orderId} · ${ret.reason}`}
        backHref="/warehouse/returns"
        actions={
          status === "pending" ? (
            <>
              <button onClick={() => { setStatus("approved"); toast("Return approved"); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Approve</button>
              <button onClick={() => { setStatus("rejected"); toast("Return rejected", "error"); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Reject</button>
            </>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title="Overview">
          <InfoGrid items={[
            { label: "Return ID", value: ret.id },
            { label: "Order", value: <Link href={`/admin/orders/${ret.orderId}`} className="text-indigo-600 hover:underline">{ret.orderId}</Link> },
            { label: "Customer", value: <Link href={`/admin/customers/${ret.customerId}`} className="text-indigo-600 hover:underline">{ret.customer}</Link> },
            { label: "Reason", value: ret.reason },
            { label: "Status", value: status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Product">
          <div className="flex gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
              <Image src={ret.image} alt={ret.product} fill className="object-cover" sizes="80px" />
            </div>
            <InfoGrid items={[
              { label: "Name", value: <Link href={`/shop/products/${ret.productId}`} className="text-indigo-600 hover:underline">{ret.product}</Link> },
              { label: "Variant", value: ret.variant },
              { label: "Quantity", value: ret.qty },
            ]} />
          </div>
        </DetailGridSection>

        <DetailGridSection title="Refund">
          <InfoGrid items={[
            { label: "Amount", value: formatCurrency(ret.refund.amount, locale) },
            { label: "Method", value: ret.refund.method },
            { label: "Status", value: ret.refund.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Inspection" span={2}>
          <InfoGrid items={[
            { label: "Condition", value: ret.inspection.condition },
            { label: "Photos", value: `${ret.inspection.photos} uploaded` },
            { label: "Notes", value: ret.inspection.notes, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={ret.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
