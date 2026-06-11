"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getFlashSale } from "@/lib/admin-entities";

export default function AdminFlashSaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sale = getFlashSale(id);

  if (!sale) return <div className="p-8 text-center text-slate-500">Flash sale not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.name}
        subtitle={`${sale.start} → ${sale.end}`}
        backHref="/admin/flash-sales"
        actions={<Badge variant={sale.status === "active" ? "success" : "warning"}>{sale.status}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title="Campaign">
          <InfoGrid items={[
            { label: "Discount", value: `${sale.discount}%` },
            { label: "Products", value: sale.products },
            { label: "Start", value: sale.start },
            { label: "End", value: sale.end },
          ]} />
          <Link href="/shop/deals" className="mt-4 inline-block text-sm text-blue-600 hover:underline">Preview on storefront →</Link>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
