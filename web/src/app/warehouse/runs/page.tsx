"use client";

import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { RunCard } from "@/components/warehouse/run-card";
import { OpsError, OpsLoading } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useOpsBase } from "@/lib/ops-path";
import { legItemsText, type RunProposal } from "@/lib/logistics";
import { parcelCode, shortId, useHubScope } from "@/lib/warehouse";
import { errorMessage } from "@/lib/warehouse-live";
import { runActions, useParcelLookup, useRunProposals, useRuns } from "@/lib/warehouse-runs";
import { cn } from "@/lib/utils";

type Tab = "out" | "in";

/**
 * Transfer runs (UC-11): the transfer legs waiting at this warehouse are grouped per next warehouse into a run with one
 * driver; the receiving warehouse scans the run in. Supervisors and managers create, assign and dispatch; every member of
 * the receiving warehouse can receive.
 */
export default function WarehouseRunsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const base = useOpsBase();
  const { canAssign, isAdmin, hubId, effectiveHubId } = useHubScope();
  const [tab, setTab] = useState<Tab>("out");
  const [showClosed, setShowClosed] = useState(false);
  const out = useRuns("out", { includeClosed: showClosed });
  const incoming = useRuns("in", { includeClosed: showClosed });
  const proposals = useRunProposals();
  const parcels = useParcelLookup();
  const [creating, setCreating] = useState<RunProposal | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const reloadAll = () => {
    void out.reload();
    void incoming.reload();
    void proposals.reload();
    void parcels.reload();
  };

  function openCreate(p: RunProposal) {
    setCreating(p);
    setPick(new Set(p.taskIds));
    setCreateError(null);
  }

  async function createRun() {
    if (!creating || pick.size === 0) return;
    setBusy(true);
    setCreateError(null);
    try {
      const run = await runActions.create(creating.toHubId, [...pick], hubId);
      toast(fr ? `Tournée ${run.reference} créée : ${run.count} colis vers ${run.toHubName}` : `Run ${run.reference} created: ${run.count} parcels to ${run.toHubName}`, "success");
      setCreating(null);
      reloadAll();
    } catch (e) {
      setCreateError(errorMessage(e));
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const needsHub = isAdmin && !effectiveHubId;
  const list = tab === "out" ? out : incoming;
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "out", label: fr ? "Au départ" : "Leaving", count: out.data.filter((r) => r.status !== "closed").length },
    { id: "in", label: fr ? "À l'arrivée" : "Arriving", count: incoming.data.filter((r) => r.status === "dispatched" || r.status === "arrived").length },
  ];
  const waitingParcels = proposals.data.reduce((n, p) => n + p.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Tournées de transfert" : "Transfer runs"}
        subtitle={fr ? "Un voyage, plusieurs colis : regroupez les transferts qui partent vers le même entrepôt, confiez-les à un chauffeur, puis scannez-les à l'arrivée" : "One trip, many parcels: group the transfers leaving for the same warehouse, give them one driver, then scan them in on arrival"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Tournées" : "Runs" }]}
      />
      <HubScopeBar />

      {needsHub ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note">
          {fr ? "Choisissez un entrepôt ci-dessus pour voir ses tournées." : "Pick a warehouse above to see its runs."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`runs-tab-${t.id}`} className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all", tab === t.id ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                  {t.label} <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-700">{t.count}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              {fr ? "Afficher les tournées clôturées" : "Show closed runs"}
            </label>
          </div>

          {tab === "out" && (
            <Card>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">{fr ? "Colis en attente de départ" : "Parcels waiting to leave"}</h2>
                  <Badge variant={waitingParcels ? "warning" : "default"}>{waitingParcels}</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {fr ? "Transferts prêts à partir, regroupés par entrepôt suivant. Créez une tournée pour tous, ou choisissez les colis." : "Transfers ready to leave, grouped by the next warehouse. Create a run for all of them, or pick the parcels."}
                </p>
                {proposals.error ? (
                  <OpsError message={proposals.error} onRetry={() => void proposals.reload()} />
                ) : proposals.loading ? (
                  <OpsLoading />
                ) : proposals.data.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">{fr ? "Aucun colis n'attend de partir pour un autre entrepôt." : "No parcel is waiting to leave for another warehouse."}</p>
                ) : (
                  <ul className="divide-y divide-slate-100" data-testid="run-proposals">
                    {proposals.data.map((p) => (
                      <li key={p.toHubId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                          <ArrowRight className="h-4 w-4 text-slate-400" />
                          {p.toHubName}
                        </span>
                        <Badge variant="info">{p.count} {fr ? "colis" : p.count === 1 ? "parcel" : "parcels"}</Badge>
                        {canAssign && (
                          <Button size="sm" className="ml-auto" onClick={() => openCreate(p)} data-testid="run-create">
                            <Plus className="h-3.5 w-3.5" />
                            {fr ? "Créer une tournée" : "Create run"}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!canAssign && <p className="text-xs text-slate-500">{fr ? "Seuls les superviseurs et les responsables créent et font partir les tournées." : "Only supervisors and managers create and dispatch runs."}</p>}
              </CardContent>
            </Card>
          )}

          {list.error ? (
            <OpsError message={list.error} onRetry={() => void list.reload()} />
          ) : list.loading ? (
            <OpsLoading />
          ) : list.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400" data-testid="runs-empty">
              {tab === "out" ? (fr ? "Aucune tournée au départ." : "No run is leaving.") : fr ? "Aucune tournée en route vers cet entrepôt." : "No run is on its way to this warehouse."}
            </p>
          ) : (
            <div className="space-y-4">
              {[...list.data]
                .sort((a, b) => `${a.fromHubId}|${a.toHubId}`.localeCompare(`${b.fromHubId}|${b.toHubId}`) || a.reference.localeCompare(b.reference))
                .map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  direction={tab}
                  tasks={parcels.byId}
                  proposals={proposals.data}
                  siblings={list.data.filter((s) => s.id !== run.id && s.fromHubId === run.fromHubId && s.toHubId === run.toHubId && s.status !== "closed")}
                  canAssign={canAssign}
                  onChanged={reloadAll}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!creating}
        onClose={() => !busy && setCreating(null)}
        title={creating ? (fr ? `Tournée vers ${creating.toHubName}` : `Run to ${creating.toHubName}`) : ""}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreating(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" onClick={() => void createRun()} disabled={busy || pick.size === 0} data-testid="run-create-confirm">
              {busy ? "…" : fr ? `Créer (${pick.size} colis)` : `Create (${pick.size} parcels)`}
            </Button>
          </>
        }
      >
        {creating && (
          <>
            <p className="text-slate-500">{fr ? "Décochez les colis à laisser pour une autre tournée." : "Untick the parcels to leave for another run."}</p>
            <ul className="divide-y divide-slate-100">
              {creating.taskIds.map((id) => {
                const t = parcels.byId.get(id);
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--primary)]"
                      checked={pick.has(id)}
                      onChange={() => setPick((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                      aria-label={t ? parcelCode(t) : id}
                    />
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{t ? parcelCode(t) : `PKG-${shortId(id)}`}</span>
                    {t && <span className="font-medium text-slate-800">{t.orderReference}</span>}
                    {t && <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{legItemsText(t.items, fr)}</span>}
                  </li>
                );
              })}
            </ul>
            <ErrorNote message={createError} />
          </>
        )}
      </Modal>
    </div>
  );
}
