"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  EXCEPTION_STATUS,
  EXCEPTION_TYPE,
  SEVERITY,
  errorMessage,
  pick,
  severityVariant,
  shortDate,
  useOpsQuery,
  type ExceptionRow,
} from "@/lib/warehouse-live";

const ACTIONS: { to: ExceptionRow["status"]; en: string; fr: string; show: (s: string) => boolean; needsResolution?: boolean }[] = [
  { to: "investigating", en: "Start investigating", fr: "Démarrer l'investigation", show: (s) => s === "open" || s === "escalated" },
  { to: "escalated", en: "Escalate", fr: "Escalader", show: (s) => s === "open" || s === "investigating" },
  { to: "resolved", en: "Mark resolved", fr: "Marquer résolu", show: (s) => s !== "resolved", needsResolution: true },
  { to: "open", en: "Reopen", fr: "Rouvrir", show: (s) => s === "resolved" },
];

export default function WarehouseExceptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const excQ = useOpsQuery<ExceptionRow[]>("exceptions:list", { initial: [] as ExceptionRow[], push: ["exception:updated"] });
  const exc = excQ.data.find((e) => e.id === id || e.reference === id);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!exc) {
    return (
      <div className="p-8 text-center text-slate-500">
        {excQ.loading ? (fr ? "Chargement…" : "Loading…") : excQ.error ?? (fr ? "Exception introuvable" : "Exception not found")}
      </div>
    );
  }

  async function setStatus(to: ExceptionRow["status"], needsResolution?: boolean) {
    if (!exc || busy) return;
    const text = resolution.trim();
    if (needsResolution && !text && !exc.resolution) {
      setError(fr ? "Indiquez la résolution avant de clôturer." : "Write the resolution before closing.");
      return;
    }
    setBusy(to);
    setError(null);
    try {
      const body: Record<string, unknown> = { id: exc.id, status: to };
      if (text) body.resolution = text;
      const saved = await socketClient.request<ExceptionRow>("exceptions:setStatus", body);
      excQ.patch((cur) => cur.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
      setResolution("");
      toast(fr ? "Statut mis à jour" : "Status updated");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const listHref = ops("/exceptions");
  const statusLabel = pick(EXCEPTION_STATUS[exc.status], fr, exc.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.reference}
        subtitle={`${pick(EXCEPTION_TYPE[exc.type], fr, exc.type)} · ${fr ? "gravité" : "severity"} ${pick(SEVERITY[exc.severity], fr, exc.severity).toLowerCase()}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Exceptions" : "Exceptions", href: listHref },
          { label: exc.reference },
        ]}
        actions={<Badge variant={exc.status === "resolved" ? "success" : severityVariant(exc.severity)}>{statusLabel}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title={fr ? "Informations" : "Information"}>
          <InfoGrid items={[
            { label: fr ? "ID incident" : "Incident ID", value: exc.reference },
            { label: "Type", value: pick(EXCEPTION_TYPE[exc.type], fr, exc.type) },
            { label: fr ? "Signalé par" : "Reported by", value: exc.raisedBy ?? "—" },
            { label: fr ? "Créé le" : "Created", value: shortDate(exc.createdAt, locale) },
            { label: fr ? "Mis à jour" : "Updated", value: shortDate(exc.updatedAt, locale) },
            { label: "Hub", value: exc.hub ?? "—" },
            { label: fr ? "Colis" : "Parcel", value: exc.taskId ? <Link href={ops(`/parcels/${exc.taskId}`)} className="text-[var(--primary)] hover:underline">{exc.orderReference ?? (fr ? "Ouvrir le colis" : "Open parcel")}</Link> : "—" },
            { label: fr ? "Commande" : "Order", value: exc.orderReference ?? "—" },
          ]} />
        </DetailSection>

        <DetailSection title={fr ? "Description" : "What happened"}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{exc.notes}</p>
        </DetailSection>

        <DetailSection title={fr ? "Résolution" : "Resolution"} className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-700">{exc.resolution || (fr ? "Pas encore de résolution." : "No resolution yet.")}</p>
          <textarea
            className="w-full rounded-lg border border-indigo-200 p-3 text-sm"
            placeholder={fr ? "Notes de résolution…" : "Resolution notes…"}
            rows={3}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTIONS.filter((a) => a.show(exc.status)).map((a) => (
              <button
                key={a.to}
                disabled={busy !== null}
                onClick={() => void setStatus(a.to, a.needsResolution)}
                className={a.to === "resolved" ? "btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60" : "rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"}
              >
                {busy === a.to ? "…" : fr ? a.fr : a.en}
              </button>
            ))}
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
