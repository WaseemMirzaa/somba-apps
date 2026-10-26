"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { OpsError, OpsLoading } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errorMessage, shortDate } from "@/lib/warehouse-live";
import {
  CONDITION_LABEL,
  RETURN_CATEGORY_LABEL,
  RETURN_PHASE_LABEL,
  RETURN_PHASE_VARIANT,
  RETURN_STAGE_LABEL,
  assetUrl,
  returnPhase,
  useReturn,
  useReturns,
  type GradeInput,
} from "@/lib/warehouse-returns";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { pickL } from "@/lib/logistics";
import { formatCurrency } from "@/lib/utils";
import { variantDisplay } from "@/lib/i18n-fields";
import type { Dispute } from "@/lib/realtime/types";
import { resolutionText } from "@/lib/i18n-fields";

type Row = { condition: GradeInput["condition"]; restockQty: number };

export default function WarehouseReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useReturn(id);
  const { grade, markReceived } = useReturns();
  const ret: Dispute | null = q.data;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // One editable row per returned item (default: resellable, all units back on the shelf).
  useEffect(() => {
    if (!ret?.items) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows((cur) => {
      const next: Record<string, Row> = {};
      for (const it of ret.items ?? []) next[it.id] = cur[it.id] ?? { condition: it.condition ?? "resellable", restockQty: it.condition ? it.restockedQty : it.qty };
      return next;
    });
  }, [ret?.items]);

  if (!ret) {
    return q.loading ? <OpsLoading /> : <div className="p-8 text-center text-slate-500">{q.error ? <OpsError message={q.error} onRetry={() => void q.reload()} /> : fr ? "Retour introuvable" : "Return not found"}</div>;
  }

  const phase = returnPhase(ret);
  const phaseLabel = pickL(RETURN_PHASE_LABEL[phase], fr);
  const received = !!ret.receivedAt || ret.stage === "received" || phase === "graded" || phase === "refunded";
  const canGrade = received && !ret.gradedAt && (ret.items?.length ?? 0) > 0;
  const needsManualReceive = ret.status === "open" && ret.stage === "approved" && !ret.pickupTaskId;
  const stageText = pickL(RETURN_STAGE_LABEL[ret.stage ?? "closed"], fr, ret.stage ?? "");

  async function submitGrades() {
    if (!ret || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const grades: GradeInput[] = (ret.items ?? []).map((it) => {
        const r = rows[it.id] ?? { condition: "resellable" as const, restockQty: it.qty };
        return { itemId: it.id, condition: r.condition, ...(r.condition === "resellable" ? { restockQty: r.restockQty } : {}) };
      });
      await grade(ret.id, grades, note);
      toast(fr ? "Articles évalués" : "Items graded");
      void q.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function receiveByHand() {
    if (!ret || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await markReceived(ret.id, false);
      toast(fr ? "Articles marqués comme reçus" : "Goods marked as received");
      void q.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${ret.orderReference} · ${phaseLabel}`}
        backHref={ops("/returns")}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: t("returns"), href: ops("/returns") },
          { label: ret.reference },
        ]}
        actions={<Badge variant={RETURN_PHASE_VARIANT[phase]}>{phaseLabel}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid
            items={[
              { label: fr ? "ID retour" : "Return ID", value: ret.reference },
              { label: fr ? "Commande" : "Order", value: ret.orderReference },
              { label: t("customer"), value: ret.customerName },
              { label: fr ? "Demandé le" : "Requested", value: shortDate(ret.createdAt, locale) },
              { label: fr ? "Étape" : "Stage", value: stageText },
              { label: fr ? "Catégorie" : "Category", value: ret.category ? pickL(RETURN_CATEGORY_LABEL[ret.category], fr, ret.category) : "—" },
              { label: fr ? "Articles reçus le" : "Goods received", value: ret.receivedAt ? shortDate(ret.receivedAt, locale) : "—" },
              { label: fr ? "Évalués le" : "Graded", value: ret.gradedAt ? shortDate(ret.gradedAt, locale) : "—" },
              { label: fr ? "Motif" : "Reason", value: ret.reason, full: true },
              ...(ret.refundUsd ? [{ label: fr ? "Remboursé" : "Refunded", value: formatCurrency(Number(ret.refundUsd), locale) }] : []),
              ...(ret.resolution ? [{ label: fr ? "Résolution" : "Resolution", value: resolutionText(ret, fr), full: true }] : []),
            ]}
          />
          {ret.pickupTaskId && (
            <Link href={ops(`/tasks/${ret.pickupTaskId}`)} className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline">
              {fr ? "Voir le trajet de collecte (scan à l'arrivée au bureau) →" : "Open the pickup leg (scan it in on the desk) →"}
            </Link>
          )}
          {needsManualReceive && (
            <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p>{fr ? "Aucun trajet de collecte n'a pu être créé : confirmez ici l'arrivée des articles." : "No pickup leg could be created: confirm here that the goods arrived."}</p>
              <button onClick={() => void receiveByHand()} disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                {busy ? "…" : fr ? "Marquer les articles reçus" : "Mark goods received"}
              </button>
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Photos du client" : "Customer photos"} span={2}>
          {(ret.attachments?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucune photo jointe." : "No photos attached."}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {ret.attachments!.map((u) => (
                <a key={u} href={assetUrl(u)} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(u)} alt={fr ? "Photo du retour" : "Return photo"} className="h-28 w-28 rounded-lg border border-[var(--border)] object-cover" />
                </a>
              ))}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles retournés" : "Returned items"} span={3}>
          {(ret.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucune ligne (retour de toute la commande)." : "No item lines (whole-order return)."}</p>
          ) : (
            <div className="space-y-3">
              {ret.items!.map((it) => {
                const r = rows[it.id] ?? { condition: "resellable" as const, restockQty: it.qty };
                return (
                  <div key={it.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{fr && it.productNameFr ? it.productNameFr : it.productName}</p>
                      <p className="text-xs text-slate-500">
                        {variantDisplay(it.variant ?? "", fr ? it.variantFr ?? null : null, fr)} · {fr ? "Qté" : "Qty"} {it.qty} · {formatCurrency(it.refundUsd, locale)}
                      </p>
                    </div>
                    {canGrade ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={fr ? "État" : "Condition"}
                          className="input-premium px-3 py-2 text-sm"
                          value={r.condition}
                          onChange={(e) => setRows((cur) => ({ ...cur, [it.id]: { ...r, condition: e.target.value as Row["condition"], restockQty: e.target.value === "resellable" ? it.qty : 0 } }))}
                        >
                          {Object.entries(CONDITION_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{fr ? l.fr : l.en}</option>
                          ))}
                        </select>
                        {r.condition === "resellable" && (
                          <label className="flex items-center gap-1.5 text-xs text-slate-600">
                            {fr ? "Remis en rayon" : "Put back"}
                            <input
                              type="number"
                              min={0}
                              max={it.qty}
                              className="input-premium w-20 px-2 py-1.5 text-sm"
                              value={r.restockQty}
                              onChange={(e) => setRows((cur) => ({ ...cur, [it.id]: { ...r, restockQty: Math.max(0, Math.min(it.qty, Number(e.target.value) || 0)) } }))}
                            />
                            / {it.qty}
                          </label>
                        )}
                      </div>
                    ) : it.condition ? (
                      <div className="text-right text-sm">
                        <Badge variant={it.condition === "resellable" ? "success" : "danger"}>{pickL(CONDITION_LABEL[it.condition], fr)}</Badge>
                        <p className="mt-1 text-xs text-slate-500">{fr ? "Remis en rayon" : "Put back"}: {it.restockedQty} / {it.qty}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{fr ? "Pas encore reçu" : "Not received yet"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {canGrade && (
            <div className="mt-4 space-y-3">
              <textarea className="input-premium w-full px-4 py-2 text-sm" rows={2} maxLength={300} placeholder={fr ? "Note (facultatif)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
              {actionError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
              <button onClick={() => void submitGrades()} disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                {busy ? "…" : fr ? "Enregistrer l'évaluation" : "Save grading"}
              </button>
              <p className="text-xs text-slate-400">
                {fr ? "Seuls les articles revendables retournent en rayon. Le remboursement ne dépend pas de l'évaluation." : "Only resellable goods go back on the shelf. The refund does not wait for grading."}
              </p>
            </div>
          )}
          {!canGrade && actionError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
          {!received && ret.status === "open" && (
            <p className="mt-3 text-sm text-slate-500">
              {fr ? "L'évaluation est possible une fois le colis scanné à l'arrivée au bureau." : "Grading opens once the parcel has been scanned in on the desk."}
            </p>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
