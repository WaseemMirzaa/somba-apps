"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoGrid } from "@/components/ui/info-grid";
import { ErrorNote } from "@/components/admin/modal";
import { AreaFields, areaPayload, formFromArea, validateAreaForm, type AreaForm, type AreaFormErrors } from "@/components/admin/area-fields";
import { useToast } from "@/context/toast-context";
import { useRealtime } from "@/context/realtime-context";
import { errMsg } from "@/lib/admin-live";
import { areaName, chainFromTree, geoTree, levelLabel, useGeoVersion, type Area, type AreaChain, type AreaLevel } from "@/lib/areas";
import { socketClient } from "@/lib/realtime/socket-client";

/** Which levels an admin may add under a given level (mirrors the server's rules). */
export const CHILD_LEVELS: Record<AreaLevel, AreaLevel[]> = {
  country: ["province"],
  province: ["city"],
  city: ["district", "commune", "quartier"],
  district: ["commune"],
  commune: ["quartier"],
  quartier: [],
};

interface Stats {
  customers: number;
  sellers: number;
  orders: number;
}

/** Customers, sellers and orders in an area and below it (`geo:stats`), re-read when coverage changes. */
function useAreaStats(areaId: string | null) {
  const rt = useRealtime();
  const version = useGeoVersion();
  const [state, setState] = useState<{ id: string; stats: Stats | null; error: string | null } | null>(null);
  const connected = rt.status === "connected";
  useEffect(() => {
    if (!areaId || !connected) return;
    let alive = true;
    socketClient
      .request<Stats & { areaId: string }>("geo:stats", { areaId })
      .then((s) => alive && setState({ id: areaId, stats: s, error: null }))
      .catch((e: Error) => alive && setState({ id: areaId, stats: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [areaId, connected, version]);
  return state && state.id === areaId ? state : null;
}

/** The names of an area's ancestors, from the cached tree. */
function useBreadcrumb(area: Area): AreaChain {
  const rt = useRealtime();
  const [chain, setChain] = useState<{ id: string; chain: AreaChain } | null>(null);
  const connected = rt.status === "connected";
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    geoTree().then((root) => alive && setChain({ id: area.id, chain: chainFromTree(area, root) })).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [area, connected]);
  return chain && chain.id === area.id ? chain.chain : [];
}

/**
 * One area: names in both languages, Google spellings, aliases, pin, active flag, the warehouse that serves it and
 * how many customers, sellers and orders sit in it. Admins edit it (`geo:update`) or add a commune/quartier under it.
 */
export function AreaDetail({ area, fr, mayEdit, onAdd }: { area: Area; fr: boolean; mayEdit: boolean; onAdd: (parent: Area) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<AreaForm>(() => formFromArea(area));
  const [errors, setErrors] = useState<AreaFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stats = useAreaStats(area.id);
  const crumbs = useBreadcrumb(area);
  const children = CHILD_LEVELS[area.level];

  const baseline = useMemo(() => JSON.stringify(formFromArea(area)), [area]);
  const dirty = JSON.stringify(form) !== baseline;

  // Someone else changed this area (live push) while nothing here was edited: show their values.
  const lastBaseline = useRef(baseline);
  useEffect(() => {
    if (lastBaseline.current === baseline) return;
    const wasClean = JSON.stringify(form) === lastBaseline.current;
    lastBaseline.current = baseline;
    if (wasClean) setForm(formFromArea(area));
  }, [baseline, form, area]);

  async function save() {
    const v = validateAreaForm(form, fr);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length) return;
    setSaving(true);
    try {
      const saved = await socketClient.request<Area>("geo:update", { id: area.id, ...areaPayload(form, "update") });
      setForm(formFromArea(saved));
      toast(fr ? "Zone enregistrée" : "Area saved", "success");
    } catch (e) {
      setServerError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(active: boolean) {
    setSaving(true);
    setServerError(null);
    try {
      await socketClient.request<Area>("geo:update", { id: area.id, active });
      toast(active ? (fr ? "Zone activée" : "Area activated") : fr ? "Zone masquée des sélecteurs" : "Area hidden from the pickers", "success");
    } catch (e) {
      setServerError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="area-detail">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">{areaName(area, fr)}</h2>
          <p className="text-xs text-slate-500">
            {crumbs.filter((c) => c.id !== area.id && c.level !== "country").map((c) => areaName(c, fr)).join(" › ") || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{levelLabel(area.level, fr)}</Badge>
          {area.served ? <Badge variant="success">{fr ? "Desservie" : "Served"}</Badge> : <Badge variant="warning">{fr ? "Bientôt" : "Coming soon"}</Badge>}
          {!area.active && <Badge variant="default">{fr ? "Masquée" : "Hidden"}</Badge>}
        </div>
      </div>

      <InfoGrid
        items={[
          { label: "Code", value: <span className="font-mono text-xs">{area.code}</span> },
          {
            label: fr ? "Entrepôt qui la dessert" : "Serving warehouse",
            value: area.hubId ? (
              <Link href={`/admin/warehouses/${area.hubId}`} className="font-medium text-[var(--primary)] hover:underline" data-testid="area-hub">{area.hubName}</Link>
            ) : (
              <span className="text-slate-500">{fr ? "Aucun" : "None"}</span>
            ),
          },
          { label: fr ? "Sous-zones" : "Sub-areas", value: area.childCount },
          { label: fr ? "Clients" : "Customers", value: stats?.stats ? stats.stats.customers.toLocaleString() : "—" },
          { label: fr ? "Vendeurs" : "Sellers", value: stats?.stats ? stats.stats.sellers.toLocaleString() : "—" },
          { label: fr ? "Commandes" : "Orders", value: stats?.stats ? stats.stats.orders.toLocaleString() : "—" },
        ]}
      />
      {stats?.error && <p className="text-xs text-amber-700">{stats.error}</p>}

      {mayEdit ? (
        <>
          <AreaFields form={form} setForm={setForm} errors={errors} fr={fr} disabled={saving} />
          <ErrorNote message={serverError} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving || !dirty} data-testid="area-save">
              <Save className="h-3.5 w-3.5" />
              {saving ? "…" : fr ? "Enregistrer" : "Save"}
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => { setForm(formFromArea(area)); setErrors({}); }} disabled={saving}>
                {fr ? "Annuler les modifications" : "Discard changes"}
              </Button>
            )}
            <Button size="sm" variant={area.active ? "reject" : "approve"} onClick={() => void setActive(!area.active)} disabled={saving} data-testid="area-toggle-active">
              {area.active ? (fr ? "Masquer des sélecteurs" : "Hide from the pickers") : fr ? "Réactiver" : "Reactivate"}
            </Button>
            {children.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => onAdd(area)} data-testid="area-add">
                <Plus className="h-3.5 w-3.5" />
                {fr ? "Ajouter une sous-zone" : "Add a sub-area"}
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500">{fr ? "Seuls les rôles admin et opérations modifient la géographie." : "Only the admin and operations roles edit the geography."}</p>
      )}
    </div>
  );
}
