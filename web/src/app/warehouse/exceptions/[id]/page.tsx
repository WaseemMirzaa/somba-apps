"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getException } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { L, severityLabel, statusLabel } from "@/lib/locale-helpers";

export default function WarehouseExceptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const exc = getException(id);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState(exc?.resolution ?? "");

  if (!exc) {
    return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.id}
        subtitle={`${exc.type} · ${severityLabel(locale, exc.severity)}`}
        backHref="/warehouse/exceptions"
        actions={<Badge variant={exc.severity === "critical" ? "danger" : "warning"}>{statusLabel(locale, exc.status)}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={L(locale, "Information", "Informations")}>
          <InfoGrid items={[
            { label: L(locale, "Incident ID", "ID incident"), value: exc.id },
            { label: t("type"), value: exc.type },
            { label: L(locale, "Reported By", "Signalé par"), value: exc.reportedBy },
            { label: t("date"), value: exc.createdDate },
            { label: t("parcel"), value: exc.parcelId !== "—" ? <Link href={`/warehouse/parcels/${exc.parcelId}`} className="text-indigo-600 hover:underline">{exc.parcelId}</Link> : "—" },
            { label: t("order"), value: <Link href={`/admin/orders/${exc.orderId}`} className="text-indigo-600 hover:underline">{exc.orderId}</Link> },
          ]} />
        </DetailSection>

        <DetailSection title={L(locale, "Evidence", "Preuves")}>
          <InfoGrid items={[
            { label: L(locale, "Photos", "Photos"), value: exc.photos > 0 ? `${exc.photos} ${L(locale, "attached", "joint(s)")}` : L(locale, "None", "Aucun") },
            { label: t("notes"), value: exc.notes, full: true },
          ]} />
          {exc.photos > 0 && (
            <div className="mt-4 flex gap-2">
              {Array.from({ length: exc.photos }).map((_, i) => (
                <div key={i} className="h-16 w-16 rounded-lg bg-slate-200" />
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title={L(locale, "Resolution", "Résolution")} className="lg:col-span-2">
          <InfoGrid items={[
            { label: L(locale, "Assigned Staff", "Personnel assigné"), value: exc.assignedStaff },
            { label: L(locale, "Resolution", "Résolution"), value: resolution || exc.resolution, full: true },
          ]} />
          <textarea
            className="mt-4 w-full rounded-lg border border-indigo-200 p-3 text-sm"
            placeholder={L(locale, "Investigation notes...", "Notes d'investigation...")}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                if (notes.trim()) setResolution(notes);
                toast(L(locale, "Resolution updated", "Résolution mise à jour"));
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
            >
              {L(locale, "Update Resolution", "Mettre à jour résolution")}
            </button>
            <Link href={`/warehouse/cod/COD-002`} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50">{L(locale, "Related COD Case", "Cas COD associé")}</Link>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
