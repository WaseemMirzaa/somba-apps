"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { DataTable } from "@/components/ui/data-table";
import { getBatch } from "@/lib/entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { L, mapTimelineEvents, statusLabel } from "@/lib/locale-helpers";

export default function WarehouseBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const batch = getBatch(id);
  const [status, setStatus] = useState(batch?.status ?? "ready");
  const [rider, setRider] = useState(batch?.rider ?? "");
  const suggestedRiders = ["Jean Mukendi (nearest, online)", "Patrick Lumumba (Zone B)", "David Tshisekedi (busy)"];

  if (!batch) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.id}
        subtitle={`${batch.zone} · ${batch.parcelCount} ${L(locale, "parcels", "colis")} · ${statusLabel(locale, status)}`}
        backHref="/warehouse/dispatch"
        breadcrumbs={[
          { label: t("warehouseBreadcrumb"), href: "/warehouse" },
          { label: t("dispatch"), href: "/warehouse/dispatch" },
          { label: batch.id },
        ]}
        actions={
          status === "ready" ? (
            <button onClick={() => { setStatus("dispatched"); toast(L(locale, `Batch ${batch.id} dispatched`, `Lot ${batch.id} expédié`)); router.push("/warehouse/deliveries"); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">{t("dispatch")}</button>
          ) : null
        }
      />

      <DetailGrid>
        <DetailGridSection title={t("batchDetail")}>
          <InfoGrid items={[
            { label: L(locale, "Batch ID", "ID lot"), value: batch.id },
            { label: t("zone"), value: batch.zone },
            { label: t("parcel"), value: batch.parcelCount },
            { label: t("status"), value: statusLabel(locale, status) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={L(locale, "Rider Assignment", "Assignation livreur")}>
          <p className="mb-2 text-xs text-indigo-600">{L(locale, "Auto-suggested", "Suggestion auto")}: {suggestedRiders[0]}</p>
          <select className="input-premium mb-3 w-full px-3 py-2 text-sm" value={rider || batch.rider} onChange={(e) => setRider(e.target.value)}>
            {suggestedRiders.map((r) => <option key={r} value={r.split(" ")[0]}>{r}</option>)}
          </select>
          <button onClick={() => toast(L(locale, `Auto-assigned ${suggestedRiders[0].split(" ")[0]}`, `Assigné auto ${suggestedRiders[0].split(" ")[0]}`))} className="text-sm text-indigo-600 hover:underline">{L(locale, "Auto-assign nearest rider", "Assigner le livreur le plus proche")}</button>
          <InfoGrid items={[
            { label: t("name"), value: rider || batch.rider },
            { label: t("phone"), value: batch.riderPhone },
            { label: L(locale, "Vehicle", "Véhicule"), value: batch.vehicle },
            { label: L(locale, "Performance", "Performance"), value: "94%" },
          ]} />
          <div className="mt-4 flex gap-3">
            <Link href={`/warehouse/riders/${batch.riderId}`} className="text-sm text-indigo-600 hover:underline">{L(locale, "Open Rider", "Ouvrir livreur")} →</Link>
            <a href={`tel:${batch.riderPhone}`} className="text-sm text-slate-500 hover:text-indigo-600">{L(locale, "Call Rider", "Appeler livreur")}</a>
          </div>
        </DetailGridSection>

        <DetailGridSection title={L(locale, "Route", "Itinéraire")}>
          <InfoGrid items={[
            { label: L(locale, "Stops", "Arrêts"), value: batch.stops },
            { label: L(locale, "Distance", "Distance"), value: batch.distance },
            { label: "ETA", value: batch.eta },
          ]} />
          <div className="mt-4 flex h-32 items-center justify-center rounded-lg bg-blue-50 text-sm text-slate-500">
            {t("liveMapMock")}
          </div>
        </DetailGridSection>

        <DetailGridSection title={L(locale, "Parcels in Batch", "Colis dans le lot")} span={3}>
          <DataTable
            columns={[
              { key: "parcelId", label: L(locale, "Parcel ID", "ID colis"), render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-indigo-600 hover:underline">{String(row.parcelId)}</Link>
              )},
              { key: "orderId", label: t("orderId") },
              { key: "customer", label: t("customer") },
              { key: "actions", label: t("action"), render: (row) => (
                <Link href={`/warehouse/parcels/${row.parcelId}`} className="text-xs text-indigo-600 hover:underline">{t("open")}</Link>
              )},
            ]}
            data={batch.parcels as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>

        <DetailGridSection title={t("timeline")} span={3}>
          <ActivityTimeline events={mapTimelineEvents(locale, batch.timeline)} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
