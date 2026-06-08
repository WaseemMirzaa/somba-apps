"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { getExchange } from "@/lib/warehouse-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseExchangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const exc = getExchange(id);

  if (!exc) {
    return <div className="p-8 text-center text-slate-500">Exchange not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.id}
        subtitle={`Order ${exc.orderId} · ${exc.status}`}
        backHref="/warehouse/exchanges"
        actions={
          <>
            <button onClick={() => toast("Exchange approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Approve Exchange</button>
            <button onClick={() => toast("Variant allocated from inventory", "info")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Allocate Variant</button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Exchange Details">
          <InfoGrid items={[
            { label: "Exchange ID", value: exc.id },
            { label: "Order", value: <Link href={`/admin/orders/${exc.orderId}`} className="text-indigo-600 hover:underline">{exc.orderId}</Link> },
            { label: "Customer", value: exc.customer },
            { label: "Old SKU", value: exc.oldSku },
            { label: "New SKU", value: exc.newSku },
            { label: "Price Difference", value: exc.priceDifference > 0 ? `Collect ${formatCurrency(exc.priceDifference, locale)}` : exc.priceDifference < 0 ? `Refund ${formatCurrency(Math.abs(exc.priceDifference), locale)}` : "No difference" },
          ]} />
        </DetailSection>

        <DetailSection title="Workflow">
          <p className="text-sm text-slate-600">Old product returned → Inspection → Allocate new variant → Dispatch</p>
          <div className="mt-4 flex gap-2">
            <Link href="/warehouse/inventory" className="text-sm text-indigo-600 hover:underline">Check Inventory</Link>
            <Link href="/warehouse/dispatch" className="text-sm text-indigo-600 hover:underline">Create Dispatch</Link>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
