"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LEG_KIND, LEG_STATUS, endpointName, legStatusVariant, pickL } from "@/lib/logistics";
import { isOpenLeg, parcelCode, useDeskQueue, useWarehouseData } from "@/lib/warehouse";
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
  const { riders, ridersLoading } = useWarehouseData();
  const parcels = useDeskQueue({ status: "all" }).tasks;
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
  const active = mine.filter(isOpenLeg);
  const delivered = mine.filter((p) => p.status === "delivered");
  const failed = mine.filter((p) => p.status === "failed");
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
                <span className="font-medium">{String(row.reference)}</span>
              )},
              { key: "count", label: fr ? "Colis" : "Parcels" },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge>{pick(BATCH_STATUS[String(row.status)], fr, String(row.status))}</Badge> },
            ]}
            data={batches.map((b) => ({ ...b, count: batchTaskIds(b).length })) as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Trajets de ce livreur" : "This rider's legs"} span={3}>
          <DataTable
            emptyMessage={fr ? "Aucun trajet." : "No legs."}
            columns={[
              { key: "id", label: fr ? "Colis" : "Parcel", render: (row) => (
                <Link href={ops(`/tasks/${row.id}`)} className="text-[var(--primary)] hover:underline">{parcelCode(row as never)}</Link>
              )},
              { key: "orderReference", label: fr ? "Commande" : "Order" },
              { key: "kind", label: fr ? "Type" : "Type", render: (row) => pickL(LEG_KIND[row.kind as keyof typeof LEG_KIND], fr) },
              { key: "route", label: fr ? "Trajet" : "Route", render: (row) => `${endpointName(row.from as never, fr)} → ${endpointName(row.to as never, fr)}` },
              { key: "attempts", label: fr ? "Tentatives" : "Attempts" },
              { key: "status", label: t("status"), render: (row) => (
                <Badge variant={legStatusVariant(String(row.status))}>{pickL(LEG_STATUS[row.status as keyof typeof LEG_STATUS], fr)}</Badge>
              )},
            ]}
            data={mine as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
