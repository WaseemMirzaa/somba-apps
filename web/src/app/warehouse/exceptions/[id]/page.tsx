"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getException } from "@/lib/warehouse-entities";
import { useToast } from "@/context/toast-context";

export default function WarehouseExceptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const exc = getException(id);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState(exc?.resolution ?? "");

  if (!exc) {
    return <div className="p-8 text-center text-slate-500">Exception not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.id}
        subtitle={`${exc.type} · ${exc.severity} severity`}
        backHref="/warehouse/exceptions"
        actions={<Badge variant={exc.severity === "critical" ? "danger" : "warning"}>{exc.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Information">
          <InfoGrid items={[
            { label: "Incident ID", value: exc.id },
            { label: "Type", value: exc.type },
            { label: "Reported By", value: exc.reportedBy },
            { label: "Created", value: exc.createdDate },
            { label: "Parcel", value: exc.parcelId !== "—" ? <Link href={`/warehouse/parcels/${exc.parcelId}`} className="text-[var(--primary)] hover:underline">{exc.parcelId}</Link> : "—" },
            { label: "Order", value: <Link href={`/admin/orders/${exc.orderId}`} className="text-[var(--primary)] hover:underline">{exc.orderId}</Link> },
          ]} />
        </DetailSection>

        <DetailSection title="Evidence">
          <InfoGrid items={[
            { label: "Photos", value: exc.photos > 0 ? `${exc.photos} attached` : "None" },
            { label: "Notes", value: exc.notes, full: true },
          ]} />
          {exc.photos > 0 && (
            <div className="mt-4 flex gap-2">
              {Array.from({ length: exc.photos }).map((_, i) => (
                <div key={i} className="h-16 w-16 rounded-lg bg-slate-200" />
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Resolution" className="lg:col-span-2">
          <InfoGrid items={[
            { label: "Assigned Staff", value: exc.assignedStaff },
            { label: "Resolution", value: resolution || exc.resolution, full: true },
          ]} />
          <textarea
            className="mt-4 w-full rounded-lg border border-indigo-200 p-3 text-sm"
            placeholder="Investigation notes..."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                if (notes.trim()) setResolution(notes);
                toast("Resolution updated");
              }}
              className="btn-primary rounded-lg px-4 py-2 text-sm"
            >
              Update Resolution
            </button>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
