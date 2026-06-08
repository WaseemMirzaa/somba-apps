"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getSellerReturn } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function SellerReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const ret = getSellerReturn(id);

  if (!ret) {
    return <div className="p-8 text-center text-slate-500">Return not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={ret.id} subtitle={`Order ${ret.orderId} · ${ret.reason}`} backHref="/seller/returns" />

      <DetailGrid>
        <DetailGridSection title="Overview">
          <InfoGrid items={[
            { label: "Return ID", value: ret.id },
            { label: "Order", value: <Link href={`/seller/orders/${ret.orderId}`} className="text-sky-600 hover:underline">{ret.orderId}</Link> },
            { label: "Customer", value: ret.customer },
            { label: "Reason", value: ret.reason },
            { label: "Status", value: ret.status },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Product">
          <InfoGrid items={[
            { label: "Product", value: <Link href={`/seller/products/${ret.productId}`} className="text-sky-600 hover:underline">{ret.product}</Link> },
            { label: "Variant", value: ret.variant },
            { label: "Quantity", value: ret.qty },
          ]} />
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
            { label: "Warehouse Notes", value: ret.inspection.warehouseNotes },
            { label: "Photos", value: `${ret.inspection.photos} attached` },
            { label: "Condition", value: ret.inspection.condition },
          ]} />
          <Link href="/warehouse/returns" className="mt-4 inline-block text-sm text-sky-600 hover:underline">Warehouse Return Queue →</Link>
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={ret.timeline} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
