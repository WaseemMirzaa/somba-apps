"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getReplacement } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { L, mapTimelineEvents, statusLabel } from "@/lib/locale-helpers";

export default function WarehouseReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const rep = getReplacement(id);

  if (!rep) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.id}
        subtitle={`${t("order")} ${rep.orderId} · ${statusLabel(locale, rep.status)}`}
        backHref="/warehouse/replacements"
        actions={
          <>
            <button onClick={() => toast(L(locale, "Inventory allocated for replacement", "Inventaire alloué pour remplacement"))} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">{L(locale, "Allocate Inventory", "Allouer inventaire")}</button>
            <button onClick={() => { toast(L(locale, "Dispatch batch created", "Lot d'expédition créé")); router.push("/warehouse/batches/BATCH-002"); }} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{L(locale, "Create Dispatch", "Créer expédition")}</button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={t("overview")}>
          <InfoGrid items={[
            { label: L(locale, "Replacement ID", "ID remplacement"), value: rep.id },
            { label: t("order"), value: <Link href={`/admin/orders/${rep.orderId}`} className="text-indigo-600 hover:underline">{rep.orderId}</Link> },
            { label: t("customer"), value: <Link href={`/admin/customers/${rep.customerId}`} className="text-indigo-600 hover:underline">{rep.customer}</Link> },
          ]} />
        </DetailSection>

        <DetailSection title={L(locale, "Returned Product", "Produit retourné")}>
          <InfoGrid items={[
            { label: "SKU", value: rep.returnedProduct.sku },
            { label: L(locale, "Condition", "État"), value: rep.returnedProduct.condition },
            { label: L(locale, "Inspection", "Inspection"), value: rep.returnedProduct.inspection },
          ]} />
        </DetailSection>

        <DetailSection title={L(locale, "New Product", "Nouveau produit")}>
          <InfoGrid items={[
            { label: L(locale, "Replacement SKU", "SKU remplacement"), value: rep.newProduct.sku },
            { label: L(locale, "Allocated", "Alloué"), value: rep.newProduct.allocated ? L(locale, "Yes", "Oui") : L(locale, "No", "Non") },
            { label: L(locale, "Dispatch Status", "Statut expédition"), value: statusLabel(locale, rep.newProduct.dispatchStatus) },
          ]} />
          <Link href="/warehouse/inventory" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">→ {L(locale, "Check Inventory", "Vérifier inventaire")}</Link>
        </DetailSection>

        <DetailSection title={t("timeline")}>
          <ActivityTimeline events={mapTimelineEvents(locale, rep.timeline)} />
        </DetailSection>
      </div>
    </div>
  );
}
