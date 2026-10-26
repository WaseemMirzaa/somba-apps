"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ArrowLeftRight, Pencil, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NoticeBar } from "@/components/admin/notice-bar";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { LaneFormModal } from "@/components/admin/lane-form";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { LanesMap } from "@/components/geo/lanes-map";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { canManageHubs, errMsg, useRole, useServerList } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { formatTransit, type Lane, type RoutePreview } from "@/lib/logistics";
import { socketClient } from "@/lib/realtime/socket-client";
import { usePublicSettings } from "@/lib/shop-live";
import { formatCurrency } from "@/lib/utils";
import { useOpsQuery } from "@/lib/warehouse-live";

/** A lane as one row: both directions of a two-way lane collapse into "A ↔ B". */
interface LaneRow {
  key: string;
  lane: Lane;
  /** Every `lanes` row this line stands for (remove deletes all of them). */
  ids: string[];
  twoWay: boolean;
}

function collapse(lanes: Lane[]): LaneRow[] {
  const byPair = new Map<string, Lane>();
  for (const l of lanes) byPair.set(`${l.fromHubId}|${l.toHubId}`, l);
  const seen = new Set<string>();
  const rows: LaneRow[] = [];
  for (const l of lanes) {
    if (seen.has(l.id)) continue;
    const back = byPair.get(`${l.toHubId}|${l.fromHubId}`);
    const same = !!back && back.transitHours === l.transitHours && (back.costUsd ?? null) === (l.costUsd ?? null) && back.active === l.active;
    seen.add(l.id);
    if (back && same) seen.add(back.id);
    rows.push({ key: l.id, lane: back && same ? { ...l, bidirectional: true } : l, ids: back && same ? [l.id, back.id] : [l.id], twoWay: !!back && same });
  }
  return rows;
}

export default function AdminLanesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const role = useRole();
  const mayManage = canManageHubs(role);
  const settings = usePublicSettings();
  const hubs = useServerList<HubRow>("hubs:list");
  const lanesQ = useOpsQuery<Lane[]>("lanes:list", { initial: [] as Lane[], push: ["hub:updated"] });
  const lanes = lanesQ.data;
  const rows = useMemo(() => collapse(lanes), [lanes]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lane | null>(null);
  const [removing, setRemoving] = useState<LaneRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Route preview between any two warehouses.
  const [pFrom, setPFrom] = useState("");
  const [pTo, setPTo] = useState("");
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const hubName = (id: string) => hubs.items.find((h) => h.id === id)?.name ?? lanes.find((l) => l.fromHubId === id)?.fromHubName ?? lanes.find((l) => l.toHubId === id)?.toHubName ?? "—";
  const activeHubs = hubs.items.filter((h) => h.active);

  async function runPreview(from: string, to: string) {
    setPreview(null);
    setPreviewError(null);
    if (!from || !to) return;
    if (from === to) {
      setPreviewError(fr ? "Choisissez deux entrepôts différents." : "Choose two different warehouses.");
      return;
    }
    setPreviewBusy(true);
    try {
      setPreview(await socketClient.request<RoutePreview>("routes:preview", { fromHubId: from, toHubId: to }));
    } catch (e) {
      setPreviewError(errMsg(e));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function doRemove(row: LaneRow) {
    setBusy(true);
    setRemoveError(null);
    try {
      // One call removes both directions of a two-way lane.
      await socketClient.request<{ removed: boolean }>("lanes:remove", { id: row.lane.id, both: row.ids.length > 1 });
      toast(fr ? "Liaison supprimée" : "Lane removed", "success");
      setRemoving(null);
      void lanesQ.reload();
      if (pFrom && pTo) void runPreview(pFrom, pTo);
    } catch (e) {
      setRemoveError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: LaneRow) {
    setBusy(true);
    try {
      await socketClient.request<Lane>("lanes:upsert", {
        id: row.lane.id,
        fromHubId: row.lane.fromHubId,
        toHubId: row.lane.toHubId,
        transitHours: row.lane.transitHours,
        costUsd: row.lane.costUsd,
        active: !row.lane.active,
        bidirectional: row.twoWay,
      });
      toast(row.lane.active ? (fr ? "Liaison désactivée" : "Lane switched off") : fr ? "Liaison activée" : "Lane switched on", "success");
      void lanesQ.reload();
      if (pFrom && pTo) void runPreview(pFrom, pTo);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const feeFor = (hop: { costUsd: number | null }) => hop.costUsd ?? settings.deliveryTransferUsd;
  const previewFee = preview ? preview.hops.reduce((n, h) => n + feeFor(h), 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Liaisons entre entrepôts" : "Warehouse lanes"}
        subtitle={fr ? "Les trajets que les chauffeurs font vraiment entre entrepôts, avec leur temps de transit : l'itinéraire d'un colis est la chaîne de liaisons la plus courte" : "The trips drivers really make between warehouses, with their transit time: a parcel's route is the shortest chain of lanes"}
        backHref="/admin/warehouses"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Entrepôts" : "Warehouses", href: "/admin/warehouses" }, { label: fr ? "Liaisons" : "Lanes" }]}
        actions={
          mayManage && (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="lane-add">
              <Plus className="h-4 w-4" />
              {fr ? "Ajouter une liaison" : "Add lane"}
            </Button>
          )
        }
      />

      {!mayManage && <NoticeBar>{fr ? "Lecture seule : seuls les rôles admin et opérations modifient les liaisons." : "Read-only: only the admin and operations roles edit the lanes."}</NoticeBar>}
      <NoticeBar>
        {fr
          ? "Sans aucune liaison, un colis est transféré directement d'un entrepôt à l'autre (comportement par défaut). Avec des liaisons, il passe par la chaîne la plus courte ; si aucune chaîne ne relie deux entrepôts, le transfert est direct et les admins sont alertés."
          : "With no lanes, a parcel transfers directly from one warehouse to the other (the default). With lanes, it follows the shortest chain; if no chain connects two warehouses, the transfer goes direct and admins are alerted."}
      </NoticeBar>

      {lanesQ.error && <SectionError message={lanesQ.error} onRetry={() => void lanesQ.reload()} />}

      <Card>
        <CardContent className="p-0">
          {lanesQ.loading && !lanesQ.error ? (
            <SectionLoading />
          ) : !lanesQ.error && rows.length === 0 ? (
            <EmptyState>{fr ? "Aucune liaison : les transferts entre entrepôts sont directs." : "No lanes yet: transfers between warehouses are direct."}</EmptyState>
          ) : (
            !lanesQ.error && (
              <DataTable
                emptyMessage={fr ? "Aucune liaison" : "No lanes"}
                columns={[
                  {
                    key: "route",
                    label: fr ? "Liaison" : "Lane",
                    render: (r) => {
                      const row = r as unknown as LaneRow;
                      return (
                        <span className="inline-flex flex-wrap items-center gap-2 font-medium text-slate-800" data-testid="lane-row" data-lane-id={row.lane.id}>
                          {row.lane.fromHubName}
                          {row.twoWay ? <ArrowLeftRight className="h-4 w-4 text-slate-400" aria-label={fr ? "dans les deux sens" : "both directions"} /> : <ArrowRight className="h-4 w-4 text-slate-400" aria-label={fr ? "sens unique" : "one way"} />}
                          {row.lane.toHubName}
                        </span>
                      );
                    },
                  },
                  { key: "transit", label: fr ? "Transit" : "Transit", render: (r) => formatTransit((r as unknown as LaneRow).lane.transitHours, fr) },
                  {
                    key: "cost",
                    label: fr ? "Coût" : "Cost",
                    render: (r) => {
                      const c = (r as unknown as LaneRow).lane.costUsd;
                      return c != null ? formatCurrency(c, locale) : <span className="text-slate-400">{fr ? `Par défaut (${formatCurrency(settings.deliveryTransferUsd, locale)})` : `Default (${formatCurrency(settings.deliveryTransferUsd, locale)})`}</span>;
                    },
                  },
                  {
                    key: "active",
                    label: fr ? "Statut" : "Status",
                    render: (r) => <Badge variant={(r as unknown as LaneRow).lane.active ? "success" : "default"}>{(r as unknown as LaneRow).lane.active ? (fr ? "Active" : "Active") : fr ? "Désactivée" : "Off"}</Badge>,
                  },
                  {
                    key: "actions",
                    label: "",
                    render: (r) => {
                      const row = r as unknown as LaneRow;
                      return mayManage ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => { setEditing(row.lane); setFormOpen(true); }} data-testid="lane-edit">
                            <Pencil className="h-3.5 w-3.5" />{fr ? "Modifier" : "Edit"}
                          </Button>
                          <Button size="sm" variant={row.lane.active ? "reject" : "approve"} disabled={busy} onClick={() => void toggleActive(row)}>
                            {row.lane.active ? (fr ? "Désactiver" : "Switch off") : fr ? "Activer" : "Switch on"}
                          </Button>
                          <Button size="sm" variant="reject" onClick={() => { setRemoving(row); setRemoveError(null); }} data-testid="lane-remove">
                            <Trash2 className="h-3.5 w-3.5" />{fr ? "Supprimer" : "Remove"}
                          </Button>
                        </div>
                      ) : null;
                    },
                  },
                ]}
                data={rows as unknown as Record<string, unknown>[]}
              />
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-slate-900">{fr ? "Carte des liaisons" : "Lanes map"}</h2>
          <p className="text-xs text-slate-500">{fr ? "Un trait par liaison entre les épingles des entrepôts (bleu : active, gris pointillé : désactivée). L'aperçu d'itinéraire s'affiche en orange." : "A line per lane between the warehouse pins (blue: active, dashed grey: off). The route preview shows in orange."}</p>
          <LanesMap fr={fr} hubs={hubs.items} lanes={lanes} route={preview?.hops ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><RouteIcon className="h-4 w-4 text-[var(--primary)]" />{fr ? "Aperçu d'itinéraire" : "Route preview"}</h2>
          <p className="text-xs text-slate-500">{fr ? "Choisissez deux entrepôts : voici la chaîne qu'un colis suivrait aujourd'hui." : "Pick two warehouses: this is the chain a parcel would follow today."}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select className="input-premium px-3 py-2 text-sm" aria-label={fr ? "Entrepôt de départ" : "Starting warehouse"} value={pFrom} onChange={(e) => { setPFrom(e.target.value); void runPreview(e.target.value, pTo); }} data-testid="preview-from">
              <option value="">{fr ? "Départ…" : "From…"}</option>
              {activeHubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <select className="input-premium px-3 py-2 text-sm" aria-label={fr ? "Entrepôt d'arrivée" : "Destination warehouse"} value={pTo} onChange={(e) => { setPTo(e.target.value); void runPreview(pFrom, e.target.value); }} data-testid="preview-to">
              <option value="">{fr ? "Arrivée…" : "To…"}</option>
              {activeHubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={!pFrom || !pTo || previewBusy} onClick={() => void runPreview(pFrom, pTo)}>
              {previewBusy ? "…" : fr ? "Calculer" : "Preview"}
            </Button>
          </div>
          <ErrorNote message={previewError} />
          {preview && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm" data-testid="route-preview">
              {preview.direct && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {lanes.length === 0
                    ? fr ? "Aucune liaison n'existe : transfert direct." : "No lanes exist: a direct transfer."
                    : fr ? "Aucune chaîne de liaisons ne relie ces entrepôts : transfert direct (les admins sont alertés)." : "No chain of lanes connects these warehouses: a direct transfer (admins are alerted)."}
                </p>
              )}
              <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                {preview.hops.length === 0 ? (
                  <span>{hubName(pFrom)} <ArrowRight className="inline h-4 w-4 text-slate-400" /> {hubName(pTo)}</span>
                ) : (
                  <>
                    <span>{hubName(preview.hops[0].fromHubId)}</span>
                    {preview.hops.map((h, i) => (
                      <span key={i} className="inline-flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <span>{hubName(h.toHubId)}</span>
                        <Badge variant="info">{formatTransit(h.transitHours, fr)}</Badge>
                      </span>
                    ))}
                  </>
                )}
              </p>
              <p className="text-xs text-slate-600">
                {preview.hops.length || 1} {fr ? ((preview.hops.length || 1) > 1 ? "étapes" : "étape") : (preview.hops.length || 1) > 1 ? "hops" : "hop"} · {fr ? "transit total" : "total transit"}: <strong>{formatTransit(preview.totalHours, fr)}</strong>
                {preview.hops.length > 0 ? <> · {fr ? "frais de transfert" : "transfer fee"}: <strong>{formatCurrency(previewFee, locale)}</strong></> : null}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <LaneFormModal open={formOpen} lane={editing} hubs={hubs.items} fr={fr} onClose={() => setFormOpen(false)} onSaved={() => { void lanesQ.reload(); if (pFrom && pTo) void runPreview(pFrom, pTo); }} />

      <Modal
        open={!!removing}
        onClose={() => !busy && setRemoving(null)}
        title={fr ? "Supprimer cette liaison ?" : "Remove this lane?"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRemoving(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => removing && void doRemove(removing)} disabled={busy} data-testid="lane-remove-confirm">{busy ? "…" : fr ? "Supprimer" : "Remove"}</Button>
          </>
        }
      >
        {removing && (
          <>
            <p><strong>{removing.lane.fromHubName}</strong> {removing.twoWay ? "↔" : "→"} <strong>{removing.lane.toHubName}</strong> · {formatTransit(removing.lane.transitHours, fr)}</p>
            <p className="text-slate-500">
              {fr
                ? "Les colis déjà en route gardent leur itinéraire. Pour les étapes pas encore créées, l'itinéraire est recalculé au prochain scan d'arrivée."
                : "Parcels already on their way keep their route. For hops not yet created, the route is recomputed at the next scan-in."}
            </p>
            <ErrorNote message={removeError} />
          </>
        )}
      </Modal>
    </div>
  );
}
