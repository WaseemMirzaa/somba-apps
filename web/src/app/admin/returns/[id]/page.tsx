"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getReturn } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const ret = getReturn(id);

  if (!ret) return <div className="p-8 text-center text-slate-500">Return not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={ret.id} subtitle={ret.orderId} backHref="/admin/returns" actions={<Badge variant="warning">{ret.status.replace("_", " ")}</Badge>} />
      <DetailGrid>
        <DetailGridSection title="Return">
          <InfoGrid items={[
            { label: "Order", value: <Link href={`/admin/orders/${ret.orderId}`} className="text-blue-600 hover:underline">{ret.orderId}</Link> },
            { label: "Customer", value: <Link href={`/admin/customers/${ret.customerId}`} className="text-blue-600 hover:underline">{ret.customer}</Link> },
            { label: "Product", value: ret.product },
            { label: "Reason", value: ret.reason },
            { label: "Refund", value: formatCurrency(ret.refund.amount, locale) },
          ]} />
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => toast("Return approved")}>Approve Refund</Button>
            <Link href={`/admin/fulfillment/returns/${ret.id}`} className="rounded-lg border px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">Warehouse view →</Link>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
