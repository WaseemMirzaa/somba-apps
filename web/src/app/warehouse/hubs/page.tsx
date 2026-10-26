"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { CoverageList, useHubCoverage } from "@/components/admin/coverage-editor";
import { CoverageMap } from "@/components/geo/coverage-map";
import { areaName, chainFromTree, chainText, useFootprint } from "@/lib/areas";
import { OpsError } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useOpsBase } from "@/lib/ops-path";
import { socketClient } from "@/lib/realtime/socket-client";
import { countryName } from "@/lib/countries";
import { TIER_LABEL, pickL, useHubs, type Hub, type WarehouseTier } from "@/lib/logistics";
import { useHubScope } from "@/lib/warehouse";
import { errorMessage, useOpsQuery } from "@/lib/warehouse-live";

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  hubId: string | null;
  warehouseTier: WarehouseTier | null;
}

/** My warehouse: its record (a manager edits it), its people and their tiers (a manager sets them). Admins see all hubs. */
export default function WarehouseHubPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const { toast } = useToast();
  const { effectiveHubId, hubId, isAdmin, canManage } = useHubScope();
  const { hubs, byId, loading, error, reload } = useHubs();
  const hub: Hub | undefined = effectiveHubId ? byId.get(effectiveHubId) : undefined;
  // What this warehouse covers: managers read it (with flat fees) from `hubs:coverage`, everyone else from the directory.
  const footprint = useFootprint();
  const covQ = useHubCoverage(effectiveHubId, canManage);
  const coveredAreas = covQ.areas ?? hub?.coverage ?? [];
  const where = hub?.area ? chainText(chainFromTree(hub.area, footprint.root).length ? chainFromTree(hub.area, footprint.root) : [hub.area], fr, { skipLevels: ["district"] }) || areaName(hub.area, fr) : null;

  const peopleQ = useOpsQuery<Person[]>("hubs:people", {
    initial: [] as Person[],
    body: hubId ? { hubId } : {},
    push: ["hub:updated"],
    enabled: canManage && (!isAdmin || !!hubId),
  });

  const [form, setForm] = useState({ name: "", address: "", capacity: "", lat: "", lng: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!hub) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({ name: hub.name, address: hub.address ?? "", capacity: String(hub.capacity ?? ""), lat: hub.lat == null ? "" : String(hub.lat), lng: hub.lng == null ? "" : String(hub.lng) });
  }, [hub]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!hub || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      await socketClient.request("hubs:update", {
        id: hub.id,
        name: form.name.trim(),
        address: form.address.trim(),
        ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
        lat: form.lat === "" ? null : Number(form.lat),
        lng: form.lng === "" ? null : Number(form.lng),
      });
      toast(fr ? "Entrepôt enregistré" : "Warehouse saved");
      void reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setTier(userId: string, tier: WarehouseTier) {
    try {
      await socketClient.request("hubs:setTier", { userId, tier });
      toast(fr ? "Niveau mis à jour" : "Tier updated");
      void peopleQ.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const crumbs = [{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Mon entrepôt" : "My warehouse" }];

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Mon entrepôt" : "My warehouse"}
        subtitle={fr ? "La fiche de l'entrepôt, son équipe et les niveaux d'accès" : "The warehouse record, its team and access tiers"}
        breadcrumbs={crumbs}
      />
      <HubScopeBar />
      {error && <OpsError message={error} onRetry={() => void reload()} />}

      {hub && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{hub.name}</h2>
            <p className="text-xs text-slate-500">
              {hub.city}
              {hub.country ? ` · ${countryName(hub.country, fr, true)}` : ""} · {hub.activeRiders ?? 0} {fr ? "livreurs actifs" : "active riders"} · {hub.staffCount ?? 0} {fr ? "membres" : "staff"}
            </p>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  {fr ? "Nom" : "Name"}
                  <input className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  {fr ? "Capacité (colis)" : "Capacity (parcels)"}
                  <input type="number" min={0} className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                  {fr ? "Adresse" : "Address"}
                  <input className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  {fr ? "Latitude" : "Latitude"}
                  <input className="input-premium mt-1 w-full px-3 py-2 text-sm" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  {fr ? "Longitude" : "Longitude"}
                  <input className="input-premium mt-1 w-full px-3 py-2 text-sm" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
                </label>
                {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{formError}</p>}
                <div className="sm:col-span-2">
                  <button type="submit" disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                    {busy ? "…" : fr ? "Enregistrer" : "Save"}
                  </button>
                  <p className="mt-2 text-xs text-slate-400">
                    {fr ? "Changer la position déplace l'entrepôt sur la carte et modifie les distances de livraison ; les zones couvertes ne changent pas." : "Changing the position moves the warehouse on the map and changes delivery distances; the covered areas do not change."}
                  </p>
                </div>
              </form>
            ) : (
              <p className="text-sm text-slate-600">
                {hub.address ?? "—"} {fr ? "· Seuls les responsables modifient la fiche." : "· Only managers edit the record."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {hub && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Zones couvertes" : "Coverage"}</h2>
            <p className="text-xs text-slate-500" data-testid="hub-where">
              {where ? `${fr ? "Emplacement" : "Location"} : ${where} · ` : ""}
              {fr ? `${coveredAreas.length} zone(s) desservie(s) par cet entrepôt. Les modifications se font côté administration.` : `${coveredAreas.length} area(s) served by this warehouse. Changes are made by the administrators.`}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {covQ.error && !hub.coverage ? <OpsError message={covQ.error} onRetry={covQ.reload} /> : <CoverageList areas={coveredAreas} fr={fr} />}
            <CoverageMap fr={fr} hubs={hubs} highlightHubId={hub.id} height={320} />
          </CardContent>
        </Card>
      )}

      {canManage && (!isAdmin || hubId) && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Équipe et niveaux" : "Team and tiers"}</h2>
            <p className="text-xs text-slate-500">
              {fr ? "Opérateur : scanne. Superviseur : assigne aussi les livreurs. Responsable : gère aussi l'entrepôt." : "Operator: scans. Supervisor: also assigns riders. Manager: also runs the warehouse."}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {peopleQ.error && <div className="p-4"><OpsError message={peopleQ.error} onRetry={() => void peopleQ.reload()} /></div>}
            <DataTable
              emptyMessage={peopleQ.loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Personne." : "Nobody."}
              columns={[
                { key: "name", label: fr ? "Nom" : "Name" },
                { key: "email", label: "E-mail" },
                { key: "role", label: fr ? "Rôle" : "Role", render: (row) => (row.role === "rider" ? (fr ? "Livreur" : "Rider") : fr ? "Personnel" : "Staff") },
                { key: "warehouseTier", label: fr ? "Niveau" : "Tier", render: (row) =>
                  row.role !== "warehouse_staff" ? "—" : (
                    <select
                      aria-label={fr ? "Niveau" : "Tier"}
                      className="input-premium px-2 py-1 text-xs"
                      value={String(row.warehouseTier ?? "operator")}
                      onChange={(e) => void setTier(String(row.id), e.target.value as WarehouseTier)}
                    >
                      {(["operator", "supervisor", ...(isAdmin ? ["manager"] : [])] as WarehouseTier[]).map((tt) => (
                        <option key={tt} value={tt}>{pickL(TIER_LABEL[tt], fr)}</option>
                      ))}
                      {!isAdmin && row.warehouseTier === "manager" && <option value="manager">{pickL(TIER_LABEL.manager, fr)}</option>}
                    </select>
                  ) },
                { key: "active", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={row.active ? "success" : "warning"}>{row.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive"}</Badge> },
              ]}
              data={peopleQ.data as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucun entrepôt enregistré." : "No warehouses registered."}
              columns={[
                { key: "name", label: fr ? "Nom" : "Name" },
                { key: "city", label: fr ? "Ville" : "City" },
                { key: "address", label: fr ? "Adresse" : "Address", render: (row) => String(row.address ?? "—") },
                { key: "activeRiders", label: fr ? "Livreurs" : "Riders" },
                { key: "active", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={row.active === false ? "warning" : "success"}>{row.active === false ? (fr ? "Inactif" : "Inactive") : fr ? "Actif" : "Active"}</Badge> },
              ]}
              data={hubs as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
