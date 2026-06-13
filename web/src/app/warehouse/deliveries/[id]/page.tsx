"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { getDelivery } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const delivery = getDelivery(id);
  const [escalated, setEscalated] = useState(false);

  if (!delivery) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Livraison introuvable" : "Delivery not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={delivery.orderId}
        subtitle={`${delivery.status.replace("_", " ")} · ETA ${delivery.eta}`}
        backHref="/warehouse/deliveries"
        breadcrumbs={[
          { label: "Warehouse", href: "/warehouse" },
          { label: fr ? "Livraisons" : "Deliveries", href: "/warehouse/deliveries" },
          { label: delivery.orderId },
        ]}
        actions={
          <>
            <a href={`tel:${delivery.riderPhone}`} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{fr ? "Appeler le livreur" : "Call Rider"}</a>
            <button onClick={() => { setEscalated(true); toast(fr ? "Livraison transmise au superviseur" : "Delivery escalated to supervisor", "info"); }} disabled={escalated} className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white disabled:opacity-50">{escalated ? (fr ? "Transmise ✓" : "Escalated ✓") : (fr ? "Escalader" : "Escalate")}</button>
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title="Customer">
          <InfoGrid items={[
            { label: "Name", value: delivery.customer },
            { label: "Phone", value: delivery.customerPhone },
            { label: "Address", value: delivery.customerAddress, full: true },
          ]} />
          <Link href={`/admin/customers/${delivery.customerId}`} className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Open Customer →</Link>
        </DetailGridSection>

        <DetailGridSection title="Rider">
          <InfoGrid items={[
            { label: "Name", value: delivery.rider },
            { label: "Phone", value: delivery.riderPhone },
            { label: "Vehicle", value: delivery.vehicle },
          ]} />
          <Link href={`/warehouse/riders/${delivery.riderId}`} className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Open Rider →</Link>
        </DetailGridSection>

        <DetailGridSection title="Order">
          <InfoGrid items={[
            { label: "Order ID", value: <Link href={`/admin/orders/${delivery.orderId}`} className="text-indigo-600 hover:underline">{delivery.orderId}</Link> },
            { label: fr ? "Articles" : "Items", value: delivery.itemsCount },
            { label: fr ? "Paiement" : "Payment", value: fr ? "Prépayé (mobile money)" : "Prepaid (mobile money)" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Live Tracking" span={3}>
          <InfoGrid items={[
            { label: "ETA", value: delivery.eta },
            { label: "Current Stop", value: `${delivery.currentStop} of ${delivery.totalStops}` },
            { label: "Status", value: delivery.status },
          ]} />
          <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-indigo-50 text-sm text-slate-500">
            Live map preview (mock)
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
