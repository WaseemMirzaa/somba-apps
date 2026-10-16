"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { AssignParcelButton } from "@/components/warehouse/assign-parcel-button";
import { STAGE_LABEL, stageVariant, useWarehouseData, type Parcel, type ParcelStage } from "@/lib/warehouse";
import { BATCH_STATUS, batchTaskIds, pick, shortDate, useOpsQuery, type BatchRow } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { useLocale } from "@/context/locale-context";

export default function WarehouseBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const { parcels, riders } = useWarehouseData();
  const batchesQ = useOpsQuery<BatchRow[]>("warehouse:batches", { initial: [] as BatchRow[], push: ["batch:updated"] });
  const batch = batchesQ.data.find((b) => b.id === id || b.reference === id);

  if (!batch) {
    return (
      <div className="p-8 text-center text-slate-500">
        {batchesQ.loading ? (fr ? "Chargement…" : "Loading…") : batchesQ.error ?? (fr ? "Lot introuvable" : "Batch not found")}
      </div>
    );
  }

  const taskIds = batchTaskIds(batch);
  const rows = taskIds.map((tid) => parcels.find((p) => p.taskId === tid)).filter((p): p is Parcel => !!p);
  const missing = taskIds.length - rows.length;
  const delivered = rows.filter((p) => p.status === "delivered").length;
  const failed = rows.filter((p) => p.status === "exception").length;
  const rider = riders.find((r) => r.id === batch.riderId);
  const statusLabel = pick(BATCH_STATUS[batch.status], fr, batch.status);
  const listHref = ops("/dispatch");

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.reference}
        subtitle={`${taskIds.length} ${fr ? "colis" : "parcels"} · ${statusLabel}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Expédition" : "Dispatch", href: listHref },
          { label: batch.reference },
        ]}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Lot" : "Batch"}>
          <InfoGrid items={[
            { label: fr ? "Référence" : "Reference", value: batch.reference },
            { label: fr ? "Statut" : "Status", value: statusLabel },
            { label: fr ? "Colis" : "Parcels", value: taskIds.length },
            { label: fr ? "Livrés" : "Delivered", value: `${delivered} / ${taskIds.length}` },
            { label: fr ? "Échoués" : "Failed", value: failed },
            { label: fr ? "Créé le" : "Created", value: shortDate(batch.createdAt, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livreur" : "Rider"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: batch.riderName ?? rider?.name ?? "—" },
            {
              label: fr ? "Téléphone" : "Phone",
              value: rider?.phone ? <a href={`tel:${rider.phone.replace(/\s/g, "")}`} className="text-[var(--primary)] hover:underline">{rider.phone}</a> : "—",
            },
            { label: fr ? "Livraisons actives" : "Active deliveries", value: rider?.activeTasks ?? "—" },
          ]} />
          {batch.riderId && (
            <p className="mt-4">
              <Link href={ops(`/riders/${batch.riderId}`)} className="text-sm text-[var(--primary)] hover:underline">
                {fr ? "Ouvrir le livreur →" : "Open rider →"}
              </Link>
            </p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Remarque" : "Note"}>
          <p className="text-sm text-slate-600">
            {fr
              ? "Le lot est expédié dès sa création : les colis sont attribués au livreur, qui les collecte et les livre dans l'application. Pour changer de livreur, rouvrez chaque colis avant sa collecte."
              : "A batch is dispatched as soon as it is created: its parcels are assigned to the rider, who picks up and delivers them in the app. To change rider, re-assign each parcel before it is picked up."}
          </p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Colis dans le lot" : "Parcels in Batch"} span={3}>
          {missing > 0 && (
            <p className="mb-3 text-xs text-amber-700">
              {fr ? `${missing} colis du lot ne figurent plus dans la liste en direct (anciens).` : `${missing} parcel(s) of this batch are no longer in the live list (older than the latest 200).`}
            </p>
          )}
          <DataTable
            emptyMessage={fr ? "Aucun colis." : "No parcels."}
            columns={[
              { key: "id", label: fr ? "ID colis" : "Parcel ID", render: (row) => (
                <Link href={ops(`/parcels/${row.id}`)} className="text-[var(--primary)] hover:underline">{String(row.id)}</Link>
              )},
              { key: "orderId", label: fr ? "ID commande" : "Order ID" },
              { key: "customer", label: t("customer") },
              { key: "customerAddress", label: fr ? "Adresse" : "Address" },
              { key: "rider", label: fr ? "Livreur" : "Rider" },
              { key: "status", label: t("status"), render: (row) => {
                const s = String(row.status) as ParcelStage;
                return <Badge variant={stageVariant(s)}>{fr ? STAGE_LABEL[s].fr : STAGE_LABEL[s].en}</Badge>;
              }},
              { key: "actions", label: fr ? "Action" : "Action", render: (row) => {
                const p = row as unknown as Parcel;
                return p.status === "sorting" || p.status === "received" || p.status === "inbound" ? (
                  <AssignParcelButton parcel={p} className="text-xs text-[var(--primary)] hover:underline" label={fr ? "Changer de livreur" : "Change rider"} />
                ) : (
                  <Link href={ops(`/parcels/${p.id}`)} className="text-xs text-[var(--primary)] hover:underline">{fr ? "Ouvrir" : "Open"}</Link>
                );
              }},
            ]}
            data={rows as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
