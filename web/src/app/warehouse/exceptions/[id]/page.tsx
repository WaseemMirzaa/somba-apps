"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getException } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseExceptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const exc = getException(id);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState(fr ? (exc?.resolutionFr ?? "") : (exc?.resolution ?? ""));

  if (!exc) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Exception introuvable" : "Exception not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.id}
        subtitle={fr ? `${exc.typeFr} · gravité ${exc.severityFr}` : `${exc.type} · ${exc.severity} severity`}
        backHref="/warehouse/exceptions"
        actions={<Badge variant={exc.severity === "critical" ? "danger" : "warning"}>{fr ? exc.statusFr : exc.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Informations" : "Information"}>
          <InfoGrid items={[
            { label: fr ? "ID incident" : "Incident ID", value: exc.id },
            { label: fr ? "Type" : "Type", value: fr ? exc.typeFr : exc.type },
            { label: fr ? "Signalé par" : "Reported By", value: fr ? exc.reportedByFr : exc.reportedBy },
            { label: fr ? "Créé le" : "Created", value: exc.createdDate },
            { label: fr ? "Colis" : "Parcel", value: exc.parcelId !== "—" ? <Link href={`/warehouse/parcels/${exc.parcelId}`} className="text-[var(--primary)] hover:underline">{exc.parcelId}</Link> : "—" },
            { label: fr ? "Commande" : "Order", value: <Link href={`/admin/orders/${exc.orderId}`} className="text-[var(--primary)] hover:underline">{exc.orderId}</Link> },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Preuves" : "Evidence"}>
          <InfoGrid items={[
            { label: fr ? "Photos" : "Photos", value: exc.photos > 0 ? `${exc.photos} ${fr ? "jointe(s)" : "attached"}` : (fr ? "Aucune" : "None") },
            { label: fr ? "Notes" : "Notes", value: fr ? exc.notesFr : exc.notes, full: true },
          ]} />
          {exc.photos > 0 && (
            <div className="mt-4 flex gap-2">
              {Array.from({ length: exc.photos }).map((_, i) => (
                <div key={i} className="h-16 w-16 rounded-lg bg-slate-200" />
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title={fr ? "Résolution" : "Resolution"} className="lg:col-span-2">
          <InfoGrid items={[
            { label: fr ? "Personnel assigné" : "Assigned Staff", value: fr ? exc.assignedStaffFr : exc.assignedStaff },
            { label: fr ? "Résolution" : "Resolution", value: resolution || (fr ? exc.resolutionFr : exc.resolution), full: true },
          ]} />
          <textarea
            className="mt-4 w-full rounded-lg border border-indigo-200 p-3 text-sm"
            placeholder={fr ? "Notes d'investigation..." : "Investigation notes..."}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                if (notes.trim()) setResolution(notes);
                toast(fr ? "Résolution mise à jour" : "Resolution updated");
              }}
              className="btn-primary rounded-lg px-4 py-2 text-sm"
            >
              {fr ? "Mettre à jour la résolution" : "Update Resolution"}
            </button>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
