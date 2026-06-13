"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getReplacement } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const rep = getReplacement(id);
  const [allocated, setAllocated] = useState(rep?.newProduct?.allocated ?? false);

  if (!rep) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Remplacement introuvable" : "Replacement not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.id}
        subtitle={`Order ${rep.orderId} · ${rep.status}`}
        backHref="/warehouse/replacements"
        actions={
          <>
            <button onClick={() => { setAllocated(true); toast(fr ? "Inventaire alloué pour le remplacement" : "Inventory allocated for replacement"); }} disabled={allocated} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{allocated ? (fr ? "Inventaire alloué ✓" : "Inventory Allocated ✓") : (fr ? "Allouer l'inventaire" : "Allocate Inventory")}</button>
            <button onClick={() => { if (!allocated) { toast(fr ? "Allouez d'abord l'inventaire" : "Allocate inventory first", "error"); return; } toast(fr ? "Lot d'expédition créé" : "Dispatch batch created"); router.push("/warehouse/dispatch/BATCH-001"); }} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{fr ? "Créer une expédition" : "Create Dispatch"}</button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Overview">
          <InfoGrid items={[
            { label: "Replacement ID", value: rep.id },
            { label: "Order", value: <Link href={`/admin/orders/${rep.orderId}`} className="text-indigo-600 hover:underline">{rep.orderId}</Link> },
            { label: "Customer", value: <Link href={`/admin/customers/${rep.customerId}`} className="text-indigo-600 hover:underline">{rep.customer}</Link> },
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
            { label: fr ? "SKU de remplacement" : "Replacement SKU", value: rep.newProduct.sku },
            { label: fr ? "Alloué" : "Allocated", value: allocated ? (fr ? "Oui" : "Yes") : (fr ? "Non" : "No") },
            { label: fr ? "Statut d'expédition" : "Dispatch Status", value: rep.newProduct.dispatchStatus },
          ]} />
          <Link href="/warehouse/inventory" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">→ Check Inventory</Link>
        </DetailSection>

        <DetailSection title="Timeline">
          <ActivityTimeline events={rep.timeline} />
        </DetailSection>
      </div>
    </div>
  );
}
