"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getSellerReplacement } from "@/lib/seller-entities";

export default function SellerReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const rep = getSellerReplacement(id);

  if (!rep) {
    return <div className="p-8 text-center text-slate-500">Replacement not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={rep.id} subtitle={`Order ${rep.orderId} · ${rep.status}`} backHref="/seller/replacements" />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Overview">
          <InfoGrid items={[
            { label: "Replacement ID", value: rep.id },
            { label: "Order", value: <Link href={`/seller/orders/${rep.orderId}`} className="text-sky-600 hover:underline">{rep.orderId}</Link> },
            { label: "Customer", value: rep.customer },
          ]} />
        </DetailSection>

        <DetailSection title="Returned Product">
          <InfoGrid items={[
            { label: "SKU", value: rep.returnedProduct.sku },
            { label: "Condition", value: rep.returnedProduct.condition },
            { label: "Inspection", value: rep.returnedProduct.inspection },
          ]} />
        </DetailSection>

        <DetailSection title="New Product">
          <InfoGrid items={[
            { label: "Replacement SKU", value: rep.newProduct.sku },
            { label: "Allocated", value: rep.newProduct.allocated ? "Yes" : "No" },
            { label: "Dispatch Status", value: rep.newProduct.dispatchStatus },
          ]} />
          <Link href="/seller/inventory" className="mt-4 inline-block text-sm text-sky-600 hover:underline">Check Inventory →</Link>
        </DetailSection>

        <DetailSection title="Timeline">
          <ActivityTimeline events={rep.timeline} />
        </DetailSection>
      </div>
    </div>
  );
}
