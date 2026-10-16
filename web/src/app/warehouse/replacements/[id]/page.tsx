"use client";

import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { StatusButtons } from "@/components/warehouse/status-buttons";
import { REPLACEMENT_NEXT, REPLACEMENT_STATUS, pick, shortDate, useOpsQuery, type ReplacementRow } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { useLocale } from "@/context/locale-context";

const FLOW = ["requested", "approved", "received", "allocated", "dispatched"] as const;

export default function WarehouseReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useOpsQuery<ReplacementRow[]>("replacements:list", { initial: [] as ReplacementRow[], push: ["replacement:updated"] });
  const rep = q.data.find((r) => r.id === id || r.reference === id);

  if (!rep) {
    return (
      <div className="p-8 text-center text-slate-500">
        {q.loading ? (fr ? "Chargement…" : "Loading…") : q.error ?? (fr ? "Remplacement introuvable" : "Replacement not found")}
      </div>
    );
  }

  const statusLabel = pick(REPLACEMENT_STATUS[rep.status], fr, rep.status);
  const idx = FLOW.indexOf(rep.status as (typeof FLOW)[number]);
  const listHref = ops("/replacements");
  const next = REPLACEMENT_NEXT[rep.status] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.reference}
        subtitle={`${shortDate(rep.createdAt, locale)} · ${statusLabel} · ${rep.orderReference}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Remplacements" : "Replacements", href: listHref },
          { label: rep.reference },
        ]}
        actions={<Badge variant={rep.status === "dispatched" ? "success" : rep.status === "rejected" ? "danger" : "warning"}>{statusLabel}</Badge>}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white p-3 text-xs">
        {FLOW.map((s, i) => {
          const reached = rep.status !== "rejected" && idx >= i;
          return (
            <span key={s} className="flex items-center gap-2">
              <span className={reached ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white" : "flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500"}>{i + 1}</span>
              <span className={reached ? "font-medium text-slate-800" : "text-slate-400"}>{pick(REPLACEMENT_STATUS[s], fr)}</span>
              {i < FLOW.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          );
        })}
        {rep.status === "rejected" && <Badge variant="danger">{pick(REPLACEMENT_STATUS.rejected, fr)}</Badge>}
      </div>

      {rep.reason && (
        <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-700">{fr ? "Motif du remplacement" : "Replacement reason"}</p>
              <p className="mt-1 text-lg font-bold text-red-950">{rep.reason}</p>
              {rep.condition && <p className="mt-1 text-sm text-red-900/80">{fr ? "État : " : "Condition: "}{rep.condition}</p>}
            </div>
          </div>
        </div>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Dossier" : "Case"}>
          <InfoGrid items={[
            { label: fr ? "ID dossier" : "Case ID", value: rep.reference },
            { label: fr ? "Commande" : "Order", value: rep.orderReference },
            { label: fr ? "Client" : "Customer", value: rep.customerName },
            { label: fr ? "Demandé le" : "Requested", value: shortDate(rep.createdAt, locale) },
            { label: fr ? "Mis à jour" : "Updated", value: shortDate(rep.updatedAt, locale) },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Article" : "Item"}>
          <InfoGrid items={[
            { label: fr ? "Produit" : "Product", value: rep.productName },
            { label: "SKU", value: rep.sku },
            { label: fr ? "Expédition" : "Dispatch", value: rep.dispatchStatus ?? "—" },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Faire avancer le dossier" : "Move the case along"}>
          <StatusButtons<ReplacementRow>
            event="replacements:setStatus"
            id={rep.id}
            next={next}
            labels={REPLACEMENT_STATUS}
            onSaved={(row) => q.patch((cur) => cur.map((r) => (r.id === row.id ? { ...r, ...row } : r)))}
          />
          {next.length === 0 && <p className="text-sm text-slate-500">{fr ? "Aucune étape suivante." : "No further steps."}</p>}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
