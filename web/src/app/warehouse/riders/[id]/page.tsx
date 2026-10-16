"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL, stageVariant, useWarehouseData, type ParcelStage } from "@/lib/warehouse";
import { BATCH_STATUS, batchTaskIds, pick, useOpsQuery, type BatchRow } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function WarehouseRiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { riders, parcels, ridersLoading } = useWarehouseData();
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const rider = riders.find((r) => r.id === id);

  if (!rider) {
    return (
      <div className="p-8 text-center text-slate-500">
        {ridersLoading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Livreur introuvable" : "Rider not found")}
      </div>
    );
  }

  const mine = parcels.filter((p) => p.riderId === rider.id);
  const active = mine.filter((p) => p.status !== "delivered" && p.status !== "exception");
  const delivered = mine.filter((p) => p.status === "delivered");
  const failed = mine.filter((p) => p.status === "exception");
  const cod = delivered.reduce((s, p) => s + p.codAmountUsd, 0);
  const batches = batchesQ.data.filter((b) => b.riderId === rider.id);
  const listHref = ops("/riders");

  return (
    <div className="space-y-6">
      <PageHeader
        title={rider.name}
        subtitle={rider.phone ?? undefined}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Livreurs" : "Riders", href: listHref },
          { label: rider.name },
        ]}
        actions={
          rider.phone ? (
            <a
              href={`tel:${rider.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50"
            >
              <Phone className="h-3.5 w-3.5" />
              {fr ? "Appeler livreur" : "Call Rider"}
            </a>
          ) : undefined
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: rider.name },
            { label: fr ? "Téléphone" : "Phone", value: rider.phone ?? "—" },
            { label: fr ? "Livraisons actives" : "Active deliveries", value: active.length },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Performance (liste en direct)" : "Performance (live list)"}>
          <InfoGrid columns={3} items={[
            { label: fr ? "Livrées" : "Delivered", value: delivered.length },
            { label: fr ? "Échouées" : "Failed", value: failed.length },
            { label: fr ? "COD encaissé" : "COD collected", value: formatCurrency(cod, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Lots assignés" : "Assigned Batches"}>
          <DataTable
            emptyMessage={fr ? "Aucun lot." : "No batches."}
            columns={[
              { key: "reference", label: fr ? "Lot" : "Batch", render: (row) => (
                <Link href={ops(`/dispatch/${row.id}`)} className="text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
              )},
              { key: "count", label: fr ? "Colis" : "Parcels" },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge>{pick(BATCH_STATUS[String(row.status)], fr, String(row.status))}</Badge> },
            ]}
            data={batches.map((b) => ({ ...b, count: batchTaskIds(b).length })) as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livraisons de ce livreur" : "This rider's deliveries"} span={3}>
          <DataTable
            emptyMessage={fr ? "Aucune livraison." : "No deliveries."}
            columns={[
              { key: "id", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
                <Link href={ops(`/parcels/${row.id}`)} className="text-[var(--primary)] hover:underline">{String(row.id)}</Link>
              )},
              { key: "orderId", label: fr ? "ID commande" : "Order ID" },
              { key: "customer", label: t("customer") },
              { key: "customerAddress", label: fr ? "Adresse" : "Address" },
              { key: "attempts", label: fr ? "Tentatives" : "Attempts" },
              { key: "status", label: t("status"), render: (row) => {
                const s = String(row.status) as ParcelStage;
                return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
              }},
            ]}
            data={mine as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
