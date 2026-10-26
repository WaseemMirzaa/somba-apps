"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CheckSquare, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { AreaTree } from "@/components/geo/area-tree";
import { useToast } from "@/context/toast-context";
import { useRealtime } from "@/context/realtime-context";
import { errMsg } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { areaName, flattenTree, levelLabel, useCoverageMap, useFootprint, useGeoVersion, type Area, type AreaNode, type CoverageArea } from "@/lib/areas";
import { formatCurrency } from "@/lib/utils";
import { socketClient } from "@/lib/realtime/socket-client";

interface Conflict {
  area: Area;
  hubId: string;
  hubName: string;
}
interface AssignReply {
  assigned: Area[];
  conflicts: Conflict[];
}

/** The areas of one warehouse with their flat-fee overrides (`hubs:coverage`), re-read whenever coverage changes. */
export function useHubCoverage(hubId: string | null | undefined, enabled = true) {
  const rt = useRealtime();
  const version = useGeoVersion();
  const [state, setState] = useState<{ hubId: string; areas: CoverageArea[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const connected = rt.status === "connected";
  useEffect(() => {
    if (!hubId || !enabled || !connected) return;
    let alive = true;
    socketClient
      .request<{ hubId: string; areas: CoverageArea[] }>("hubs:coverage", { hubId })
      .then((r) => {
        if (!alive) return;
        setState({ hubId, areas: r.areas ?? [] });
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [hubId, enabled, connected, version, bump]);
  const areas = state && state.hubId === hubId ? state.areas : null;
  return { areas, error, loading: enabled && !!hubId && !areas && !error, reload: useCallback(() => setBump((n) => n + 1), []) };
}

/** Pairs of directly assigned areas where one sits inside the other and the owners differ: the inner one wins. */
export function useOverlaps(hubId: string | null | undefined) {
  const cov = useCoverageMap();
  const footprint = useFootprint();
  return useMemo(() => {
    const nodes = new Map(flattenTree(footprint.root).map((n) => [n.id, n as AreaNode]));
    const direct = cov.rows.filter((r) => r.direct).map((r) => ({ entry: r, node: nodes.get(r.areaId) })).filter((x): x is { entry: typeof x.entry; node: AreaNode } => !!x.node);
    const pairs: { inner: (typeof direct)[number]; outer: (typeof direct)[number] }[] = [];
    for (const outer of direct) {
      for (const inner of direct) {
        if (inner === outer || inner.entry.hubId === outer.entry.hubId) continue;
        if (inner.node.path.startsWith(`${outer.node.path}/`)) pairs.push({ inner, outer });
      }
    }
    return pairs.filter((p) => !hubId || p.inner.entry.hubId === hubId || p.outer.entry.hubId === hubId);
  }, [cov.rows, footprint.root, hubId]);
}

/**
 * The coverage editor: a tree of areas with a checkbox each. Checking an area gives it to this warehouse; an area
 * another warehouse owns shows the owner and a "Move here" action with a confirmation; unchecking removes it. Areas
 * inside a covered parent show as covered, and a more specific assignment always wins. An optional flat delivery fee can
 * be set on any assigned area.
 */
export function CoverageEditor({ hub, fr, mayManage }: { hub: HubRow; fr: boolean; mayManage: boolean }) {
  const { toast } = useToast();
  const cov = useCoverageMap();
  const mine = useHubCoverage(hub.id);
  const footprint = useFootprint();
  const overlaps = useOverlaps(hub.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [move, setMove] = useState<Conflict | null>(null);
  const [unassign, setUnassign] = useState<Area | null>(null);
  const [fee, setFee] = useState<{ area: Area; value: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const feeBy = useMemo(() => new Map((mine.areas ?? []).map((a) => [a.id, a.feeOverrideUsd])), [mine.areas]);
  const nodes = useMemo(() => new Map(flattenTree(footprint.root).map((n) => [n.code, n as Area])), [footprint.root]);

  /** The nearest ancestor that is assigned on its own (what an inherited area is covered through). */
  const viaAncestor = (a: Area): { area: Area; hubName: string } | null => {
    const codes = a.path.split("/").slice(0, -1).reverse();
    for (const c of codes) {
      const anc = nodes.get(c);
      const e = anc ? cov.byArea.get(anc.id) : undefined;
      if (anc && e?.direct) return { area: anc, hubName: e.hubName };
    }
    return null;
  };

  const refresh = () => {
    cov.reload();
    mine.reload();
  };

  async function assign(area: Area, opts: { move?: boolean } = {}) {
    setBusyId(area.id);
    setActionError(null);
    try {
      const res = await socketClient.request<AssignReply>("hubs:assign", { hubId: hub.id, areaIds: [area.id], ...(opts.move ? { move: true } : {}) });
      if (res.conflicts?.length && !opts.move) {
        // Somebody owns it (the page was stale): ask before taking it.
        setMove(res.conflicts[0]);
        return;
      }
      const name = areaName(area, fr);
      toast(
        opts.move
          ? fr ? `« ${name} » déplacée vers ${hub.name}` : `"${name}" moved to ${hub.name}`
          : fr ? `« ${name} » assignée à ${hub.name}` : `"${name}" assigned to ${hub.name}`,
        "success",
      );
      setMove(null);
      refresh();
    } catch (e) {
      setActionError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function doUnassign(area: Area) {
    setBusyId(area.id);
    setActionError(null);
    try {
      await socketClient.request<{ removed: number }>("hubs:unassign", { hubId: hub.id, areaIds: [area.id] });
      toast(fr ? `« ${areaName(area, true)} » retirée de ${hub.name}` : `"${areaName(area, false)}" removed from ${hub.name}`, "success");
      setUnassign(null);
      refresh();
    } catch (e) {
      setActionError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function saveFee(area: Area, value: number | null) {
    setBusyId(area.id);
    setActionError(null);
    try {
      await socketClient.request<AssignReply>("hubs:assign", { hubId: hub.id, areaIds: [area.id], feeOverrideUsd: value });
      toast(value == null ? (fr ? "Tarif fixe retiré" : "Flat fee cleared") : fr ? "Tarif fixe enregistré" : "Flat fee saved", "success");
      setFee(null);
      refresh();
    } catch (e) {
      setActionError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  const renderRow = (a: Area) => {
    const e = cov.byArea.get(a.id);
    const isMine = !!e && e.hubId === hub.id;
    const directMine = isMine && e.direct;
    const inheritedMine = isMine && !e.direct;
    const directOther = !!e && e.direct && e.hubId !== hub.id;
    const inheritedOther = !!e && !e.direct && e.hubId !== hub.id;
    const via = inheritedMine || inheritedOther ? viaAncestor(a) : null;
    const busy = busyId === a.id;
    const flat = feeBy.get(a.id) ?? null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5" data-testid="coverage-row" data-code={a.code}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--primary)]"
          checked={isMine}
          disabled={!mayManage || busy || inheritedMine || directOther}
          onChange={() => (directMine ? setUnassign(a) : void assign(a))}
          aria-label={`${fr ? "Couvrir" : "Cover"} ${areaName(a, fr)}`}
          data-testid="coverage-check"
        />
        <span className={`text-sm ${isMine ? "font-semibold text-slate-900" : "text-slate-700"}`}>{areaName(a, fr)}</span>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{levelLabel(a.level, fr)}</span>
        {directMine && <Badge variant="success">{fr ? "Assignée" : "Assigned"}</Badge>}
        {inheritedMine && (
          <Badge variant="info">{via ? (fr ? `Couverte via ${areaName(via.area, true)}` : `Covered via ${areaName(via.area, false)}`) : fr ? "Couverte par une zone parente" : "Covered by a parent area"}</Badge>
        )}
        {directOther && (
          <>
            <Badge variant="warning" className="max-w-[18rem] truncate" >{fr ? `Couverte par ${e.hubName}` : `Covered by ${e.hubName}`}</Badge>
            {mayManage && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMove({ area: a, hubId: e.hubId, hubName: e.hubName })} data-testid="coverage-move">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {fr ? "Déplacer ici" : "Move here"}
              </Button>
            )}
          </>
        )}
        {inheritedOther && (
          <span className="text-xs text-slate-500">
            {fr ? "Actuellement via" : "Currently via"} {e.hubName}
            {via ? ` (${areaName(via.area, fr)})` : ""} · {fr ? "cochez pour que cet entrepôt prenne le relais ici" : "check to let this warehouse take over here"}
          </span>
        )}
        {directMine && (
          <>
            {flat != null && (
              <Badge variant="purple" >
                {fr ? "Tarif fixe" : "Flat fee"} {formatCurrency(flat, fr ? "fr" : "en")}
              </Badge>
            )}
            {mayManage && (
              <button type="button" className="text-xs font-medium text-[var(--primary)] hover:underline" onClick={() => setFee({ area: a, value: flat != null ? String(flat) : "" })} data-testid="coverage-fee">
                {flat != null ? (fr ? "Modifier le tarif fixe" : "Edit flat fee") : fr ? "Tarif fixe…" : "Flat fee…"}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  if (cov.error) return <SectionError message={cov.error} onRetry={cov.reload} />;

  const feeNumber = fee ? Number(fee.value.replace(",", ".")) : NaN;
  const feeValid = fee ? fee.value.trim() === "" || (Number.isFinite(feeNumber) && feeNumber >= 0 && feeNumber <= 500) : false;

  return (
    <div className="space-y-4" data-testid="coverage-editor">
      <p className="text-xs text-slate-500">
        {fr
          ? "Cochez les zones que cet entrepôt dessert : une province, une ville, un district, une commune ou un quartier. Une zone n'a qu'un seul entrepôt ; l'affectation la plus précise l'emporte."
          : "Check the areas this warehouse serves: a province, city, district, commune or neighbourhood. An area has one owner; the most specific assignment wins."}
      </p>

      {actionError && <ErrorNote message={actionError} />}

      {overlaps.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="coverage-overlaps">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {fr ? "Chevauchements (la zone la plus précise l'emporte)" : "Overlaps (the more specific area wins)"}
          </p>
          <ul className="list-disc space-y-0.5 pl-6 text-xs">
            {overlaps.map((p) => (
              <li key={`${p.inner.entry.areaId}-${p.outer.entry.areaId}`}>
                {fr
                  ? `${areaName(p.inner.node, true)} (${p.inner.entry.hubName}) est dans ${areaName(p.outer.node, true)} (${p.outer.entry.hubName}) : ${p.inner.entry.hubName} dessert ${areaName(p.inner.node, true)}, ${p.outer.entry.hubName} le reste.`
                  : `${areaName(p.inner.node, false)} (${p.inner.entry.hubName}) sits inside ${areaName(p.outer.node, false)} (${p.outer.entry.hubName}): ${p.inner.entry.hubName} serves ${areaName(p.inner.node, false)}, ${p.outer.entry.hubName} serves the rest.`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cov.loading || mine.loading ? (
        <SectionLoading />
      ) : (
        <AreaTree fr={fr} renderRow={renderRow} className="max-h-[60vh] overflow-y-auto pr-1" />
      )}
      {mine.error && <p className="text-xs text-amber-700">{mine.error}</p>}

      {/* Move coverage from another warehouse: always confirmed. */}
      <Modal
        open={!!move}
        onClose={() => !busyId && setMove(null)}
        title={fr ? "Déplacer cette zone ?" : "Move this area?"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setMove(null)} disabled={!!busyId}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" onClick={() => move && void assign(move.area, { move: true })} disabled={!!busyId} data-testid="coverage-move-confirm">
              {busyId ? "…" : fr ? "Déplacer ici" : "Move here"}
            </Button>
          </>
        }
      >
        {move && (
          <>
            <p>
              {fr
                ? <>« <strong>{areaName(move.area, true)}</strong> » est couverte par <strong>{move.hubName}</strong>. La déplacer vers <strong>{hub.name}</strong> ?</>
                : <>&ldquo;<strong>{areaName(move.area, false)}</strong>&rdquo; is covered by <strong>{move.hubName}</strong>. Move it to <strong>{hub.name}</strong>?</>}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-slate-500">
              <li>{fr ? "Les nouvelles commandes de cette zone passent par " : "New orders in this area go through "}{hub.name}.</li>
              <li>{fr ? "Les commandes déjà en cours gardent leurs trajets : rien n'est rerouté." : "Orders already in progress keep their legs: nothing is rerouted."}</li>
              <li>{fr ? "L'entrepôt d'origine des vendeurs de cette zone est recalculé." : "The origin warehouse of the sellers in this area is recomputed."}</li>
            </ul>
            <ErrorNote message={actionError} />
          </>
        )}
      </Modal>

      {/* Remove coverage. */}
      <Modal
        open={!!unassign}
        onClose={() => !busyId && setUnassign(null)}
        title={fr ? "Retirer cette zone ?" : "Remove this area?"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setUnassign(null)} disabled={!!busyId}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => unassign && void doUnassign(unassign)} disabled={!!busyId} data-testid="coverage-unassign-confirm">
              {busyId ? "…" : fr ? "Retirer" : "Remove"}
            </Button>
          </>
        }
      >
        {unassign && (
          <>
            <p>
              {fr ? <>Retirer « <strong>{areaName(unassign, true)}</strong> » de <strong>{hub.name}</strong> ?</> : <>Remove &ldquo;<strong>{areaName(unassign, false)}</strong>&rdquo; from <strong>{hub.name}</strong>?</>}
            </p>
            <p className="text-slate-500">
              {fr
                ? "Si aucune zone parente n'est couverte, elle devient « bientôt » : les commandes vers cette zone sont refusées. Les commandes en cours ne changent pas."
                : "If no parent area is covered, it becomes “coming soon”: orders to this area are refused. Orders in progress are not affected."}
            </p>
          </>
        )}
      </Modal>

      {/* Optional flat delivery fee for an assigned area. */}
      <Modal
        open={!!fee}
        onClose={() => !busyId && setFee(null)}
        title={fr ? "Tarif de livraison fixe" : "Flat delivery fee"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setFee(null)} disabled={!!busyId}>{fr ? "Annuler" : "Cancel"}</Button>
            {fee && feeBy.get(fee.area.id) != null && (
              <Button variant="reject" size="sm" onClick={() => void saveFee(fee.area, null)} disabled={!!busyId}>{fr ? "Retirer le tarif" : "Clear the fee"}</Button>
            )}
            <Button size="sm" disabled={!!busyId || !feeValid || !fee?.value.trim()} onClick={() => fee && void saveFee(fee.area, Math.round(feeNumber * 100) / 100)} data-testid="coverage-fee-save">
              {busyId ? "…" : fr ? "Enregistrer" : "Save"}
            </Button>
          </>
        }
      >
        {fee && (
          <>
            <p>
              <strong>{areaName(fee.area, fr)}</strong> · {hub.name}
            </p>
            <p className="text-slate-500">
              {fr
                ? "Optionnel. Remplace le tarif de base + par km pour les livraisons dans cette zone (ex. Maluku, éloignée)."
                : "Optional. Replaces the base + per-km price for deliveries in this area (e.g. remote Maluku)."}
            </p>
            <label className="block text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{fr ? "Tarif fixe (USD)" : "Flat fee (USD)"}</span>
              <input
                className="input-premium mt-1 w-full px-3 py-2 text-sm text-slate-900"
                inputMode="decimal"
                value={fee.value}
                onChange={(e) => setFee({ ...fee, value: e.target.value })}
                aria-invalid={!feeValid}
                data-testid="coverage-fee-input"
              />
              {!feeValid && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{fr ? "Entre 0 et 500 USD." : "Between 0 and 500 USD."}</span>}
            </label>
            <ErrorNote message={actionError} />
          </>
        )}
      </Modal>
    </div>
  );
}

/** The areas this warehouse covers, as a plain list (read-only: warehouse portal, directory). */
export function CoverageList({ areas, fr }: { areas: (Area & { feeOverrideUsd?: number | null })[]; fr: boolean }) {
  if (areas.length === 0) {
    return <EmptyState>{fr ? "Aucune zone couverte pour l'instant." : "No area covered yet."}</EmptyState>;
  }
  return (
    <ul className="divide-y divide-slate-100" data-testid="coverage-list">
      {areas.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-code={a.code}>
          <CheckSquare className="h-4 w-4 text-emerald-600" />
          <span className="font-medium text-slate-900">{areaName(a, fr)}</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{levelLabel(a.level, fr)}</span>
          {a.feeOverrideUsd != null && <Badge variant="purple">{fr ? "Tarif fixe" : "Flat fee"} {formatCurrency(a.feeOverrideUsd, fr ? "fr" : "en")}</Badge>}
          {!a.active && <Badge>{fr ? "Masquée" : "Hidden"}</Badge>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Areas of a partly served city or district that nobody covers (`coverage:gaps`), each with a one-click assignment.
 * Whole provinces and cities that are simply not launched are “coming soon”, not gaps.
 */
export function GapsPanel({ fr, hubs, mayManage, fixedHub }: { fr: boolean; hubs: HubRow[]; mayManage: boolean; fixedHub?: HubRow }) {
  const { toast } = useToast();
  const footprint = useFootprint();
  const rt = useRealtime();
  const version = useGeoVersion();
  const [state, setState] = useState<{ key: string; rows: Area[]; error: string | null } | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const countryId = footprint.countryId;
  const key = `${countryId}:${version}:${bump}`;
  const connected = rt.status === "connected";

  useEffect(() => {
    if (!countryId || !connected) return;
    let alive = true;
    socketClient
      .request<Area[]>("coverage:gaps", { rootId: countryId })
      .then((rows) => alive && setState({ key, rows: Array.isArray(rows) ? rows : [], error: null }))
      .catch((e: Error) => alive && setState({ key, rows: [], error: e.message }));
    return () => {
      alive = false;
    };
  }, [countryId, connected, key]);

  const active = hubs.filter((h) => h.active);
  const current = state?.key === key ? state : null;
  const byCode = useMemo(() => new Map(flattenTree(footprint.root).map((n) => [n.code, n as Area])), [footprint.root]);
  /** "Kinshasa › Mont-Amba": the names above a gap, from its path. */
  const parentNames = (a: Area) =>
    a.path
      .split("/")
      .slice(1, -1)
      .map((c) => byCode.get(c))
      .filter((x): x is Area => !!x)
      .map((x) => areaName(x, fr))
      .join(" › ");

  async function assign(area: Area) {
    const hubId = fixedHub?.id ?? pick[area.id] ?? active[0]?.id;
    if (!hubId) return;
    setBusy(area.id);
    try {
      await socketClient.request<AssignReply>("hubs:assign", { hubId, areaIds: [area.id] });
      const hubName = hubs.find((h) => h.id === hubId)?.name ?? "";
      toast(fr ? `« ${areaName(area, true)} » assignée à ${hubName}` : `"${areaName(area, false)}" assigned to ${hubName}`, "success");
      setBump((n) => n + 1);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!current) return <SectionLoading />;
  if (current.error) return <SectionError message={current.error} onRetry={() => setBump((n) => n + 1)} />;
  if (current.rows.length === 0) {
    return <EmptyState>{fr ? "Aucun trou de couverture : chaque commune d'une ville desservie a un entrepôt." : "No coverage gaps: every commune of a served city has a warehouse."}</EmptyState>;
  }
  return (
    <ul className="divide-y divide-slate-100" data-testid="coverage-gaps">
      {current.rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm" data-code={a.code}>
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="font-medium text-slate-900">{areaName(a, fr)}</span>
          <span className="text-xs text-slate-500">{parentNames(a)}</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{levelLabel(a.level, fr)}</span>
          {mayManage && (
            <span className="ml-auto flex items-center gap-2">
              {!fixedHub && (
                <select
                  className="input-premium px-2 py-1 text-xs"
                  aria-label={fr ? "Entrepôt" : "Warehouse"}
                  value={pick[a.id] ?? active[0]?.id ?? ""}
                  onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}
                >
                  {active.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="secondary" disabled={busy === a.id || (!fixedHub && active.length === 0)} onClick={() => void assign(a)} data-testid="coverage-gap-assign">
                {fixedHub ? (fr ? `Assigner à ${fixedHub.name}` : `Assign to ${fixedHub.name}`) : fr ? "Assigner" : "Assign"}
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
