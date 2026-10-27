"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Boxes, Power, Pencil, CheckCircle2, MapPinOff, Globe2, Route } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { NoticeBar } from "@/components/admin/notice-bar";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { HubFormModal } from "@/components/admin/hub-form";
import { GapsPanel } from "@/components/admin/coverage-editor";
import { CoverageMap } from "@/components/geo/coverage-map";
import { areaName, chainFromTree, chainText, useFootprint, type Area } from "@/lib/areas";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { canManageHubs, errMsg, useRole, useServerList } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "inactive", label: "Inactive", labelFr: "Inactif" },
];

export default function AdminWarehousesPage() {
  const hubs = useServerList<HubRow>("hubs:list");
  const reloadHubs = hubs.reload;
  // A hub changed (position, active flag, riders): ask again so the rider and staff counts stay right.
  useEffect(() => {
    const sock = socketClient.current;
    const h = () => void reloadHubs();
    sock?.on("hub:updated", h);
    // Coverage moved between warehouses (this tab or another): the coverage column must follow.
    sock?.on("coverage:updated", h);
    return () => {
      sock?.off("hub:updated", h);
      sock?.off("coverage:updated", h);
    };
  }, [reloadHubs]);
  const footprint = useFootprint();
  const { toast } = useToast();
  const { locale } = useLocale();
  const role = useRole();
  const fr = locale === "fr";
  const mayManage = canManageHubs(role);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HubRow | null>(null);
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [toggle, setToggle] = useState<HubRow | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () =>
      hubs.items
        .map((h) => ({
          ...h,
          status: h.active ? "active" : "inactive",
          // Searchable text: where it sits and what it covers (both languages).
          areaText: [h.area?.name, h.area?.nameEn, ...(h.coverage ?? []).flatMap((a) => [a.name, a.nameEn])].filter(Boolean).join(" "),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [hubs.items],
  );
  const locationText = (h: HubRow): string => {
    if (!h.area) return h.city;
    const chain = chainFromTree(h.area, footprint.root);
    return chainText(chain.length ? chain : [h.area], fr, { skipLevels: ["district"] }) || areaName(h.area, fr);
  };
  const coverageText = (list: Area[] | undefined): string => {
    const names = (list ?? []).map((a) => areaName(a, fr));
    return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  };
  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["name", "city", "country", "address", "areaText"], statusField: "status" }),
    [rows, filters],
  );
  const activeCount = rows.filter((h) => h.active).length;
  const totalCapacity = rows.filter((h) => h.active).reduce((s, h) => s + h.capacity, 0);
  const unplaced = rows.filter((h) => h.placed === false || h.lat == null || h.lng == null).length;

  async function confirmToggle() {
    if (!toggle) return;
    setBusy(true);
    setToggleError(null);
    try {
      const saved = await socketClient.request<HubRow>("hubs:setActive", { id: toggle.id, active: !toggle.active });
      hubs.setItems((cur) => cur.map((h) => (h.id === saved.id ? { ...h, ...saved } : h)));
      toast(
        saved.active ? (fr ? "Hub activé" : "Hub activated") : fr ? "Hub désactivé" : "Hub deactivated",
        "success",
      );
      setToggle(null);
    } catch (e) {
      setToggleError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Entrepôts : annuaire des hubs" : "Warehouses: hub directory"}
        subtitle={fr ? "Chaque zone est desservie par un seul entrepôt : créez l'entrepôt, puis assignez-lui les zones qu'il couvre" : "Each area is served by one warehouse: create the warehouse, then assign the areas it covers"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Entrepôts" : "Warehouses" }]}
        actions={
          <>
            <Link href="/admin/warehouses/lanes">
              <Button variant="secondary" size="sm" data-testid="open-lanes"><Route className="h-4 w-4" />{fr ? "Liaisons" : "Lanes"}</Button>
            </Link>
            <Link href="/admin/geography">
              <Button variant="secondary" size="sm"><Globe2 className="h-4 w-4" />{fr ? "Géographie" : "Geography"}</Button>
            </Link>
            <Link href="/admin/warehouses/staff">
              <Button variant="secondary" size="sm">{fr ? "Personnel d'entrepôt" : "Warehouse Staff"}</Button>
            </Link>
            {mayManage && (
              <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" />
                {fr ? "Ajouter un hub" : "Add hub"}
              </Button>
            )}
          </>
        }
      />

      {hubs.error && <SectionError message={hubs.error} onRetry={hubs.reload} />}
      {!mayManage && (
        <NoticeBar>
          {fr ? "Seuls les rôles admin et opérations peuvent créer ou modifier des hubs." : "Only the admin and operations roles can create or edit hubs."}
        </NoticeBar>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={fr ? "Total hubs" : "Total hubs"} value={rows.length} icon={Boxes} />
        <StatCard title={fr ? "Actifs" : "Active"} value={activeCount} icon={CheckCircle2} trend={`${totalCapacity.toLocaleString()} ${fr ? "colis de capacité" : "parcels capacity"}`} />
        <StatCard title={fr ? "Villes desservies" : "Served cities"} value={footprint.ready ? footprint.cities.length : "…"} icon={Globe2} trend={footprint.cities.map((c) => areaName(c, fr)).join(", ") || undefined} />
        <StatCard title={fr ? "Hors carte" : "Not on the map"} value={unplaced} icon={MapPinOff} trend={unplaced ? (fr ? "Absents de la carte de couverture" : "Missing from the coverage map") : undefined} />
      </div>

      <NoticeBar>
        {activeCount <= 1
          ? fr
            ? "Mode entrepôt unique : un seul entrepôt actif dessert toute la zone, donc aucun transfert entre entrepôts. Ajoutez un entrepôt avec une couverture plus précise et les transferts s'activent automatiquement."
            : "Single-warehouse mode: one active warehouse serves the whole area, so parcels never transfer. Add a warehouse with a more specific coverage and transfers switch on automatically."
          : fr
            ? `Mode multi-entrepôts : ${activeCount} entrepôts actifs. Un colis est transféré quand le vendeur et le client sont dans des zones d'entrepôts différents.`
            : `Multi-warehouse mode: ${activeCount} active warehouses. A parcel transfers when the seller and the customer sit in different warehouses' areas.`}
      </NoticeBar>

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Nom, ville, adresse…" : "Name, city, address…"}
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          {hubs.loading && !hubs.error ? (
            <SectionLoading />
          ) : !hubs.error && rows.length === 0 ? (
            <EmptyState>{fr ? "Aucun hub enregistré. Ajoutez le premier." : "No hubs yet. Add the first one."}</EmptyState>
          ) : (
            !hubs.error && (
              <DataTable
                emptyMessage={fr ? "Aucun hub ne correspond aux filtres" : "No hub matches the filters"}
                columns={[
                  { key: "name", label: fr ? "Hub" : "Hub", render: (row) => (
                    <Link href={`/admin/warehouses/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.name)}</Link>
                  )},
                  { key: "location", label: fr ? "Emplacement" : "Location", render: (row) => <span data-testid="hub-location">{locationText(row as unknown as HubRow)}</span> },
                  { key: "coverage", label: fr ? "Zones couvertes" : "Areas covered", render: (row) => {
                    const h = row as unknown as HubRow;
                    const n = h.coverage?.length ?? 0;
                    return n === 0
                      ? <Badge variant={h.active ? "warning" : "default"}>{fr ? "Aucune zone" : "No area yet"}</Badge>
                      : <span data-testid="hub-coverage" title={(h.coverage ?? []).map((a) => areaName(a, fr)).join(", ")}><strong>{n}</strong> · <span className="text-slate-600">{coverageText(h.coverage)}</span></span>;
                  }},
                  { key: "position", label: fr ? "Position" : "Position", render: (row) => {
                    const h = row as unknown as HubRow;
                    return h.lat != null && h.lng != null
                      ? <span className="font-mono text-xs text-slate-600">{h.lat.toFixed(4)}, {h.lng.toFixed(4)}</span>
                      : <Badge variant="warning">{fr ? "Hors carte : jamais choisi" : "Not on the map: never chosen"}</Badge>;
                  }},
                  { key: "activeRiders", label: fr ? "Livreurs" : "Riders", render: (row) => {
                    const h = row as unknown as HubRow;
                    const active = h.activeRiders ?? h.riders ?? 0;
                    return h.riders != null && h.riders !== active ? `${active} / ${h.riders}` : String(active);
                  }},
                  { key: "staffCount", label: fr ? "Personnel" : "Staff", render: (row) => String((row as unknown as HubRow).staffCount ?? (row as unknown as HubRow).staff ?? 0) },
                  { key: "capacity", label: fr ? "Capacité" : "Capacity", render: (row) => Number(row.capacity).toLocaleString() },
                  { key: "status", label: fr ? "Statut" : "Status", render: (row) => (
                    <Badge variant={row.active ? "success" : "default"}>{row.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive"}</Badge>
                  )},
                  { key: "actions", label: "Action", render: (row) => {
                    const h = row as unknown as HubRow;
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/warehouses/${h.id}`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Détails" : "Details"}</Link>
                        {mayManage && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => { setEditing(h); setFormOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />{fr ? "Modifier" : "Edit"}
                            </Button>
                            <Button size="sm" variant={h.active ? "reject" : "approve"} onClick={() => { setToggle(h); setToggleError(null); }}>
                              <Power className="h-3.5 w-3.5" />{h.active ? (fr ? "Désactiver" : "Deactivate") : fr ? "Activer" : "Activate"}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  }},
                ]}
                data={filtered as unknown as Record<string, unknown>[]}
              />
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-slate-900">{fr ? "Carte de la couverture" : "Coverage map"}</h2>
          <p className="text-xs text-slate-500">
            {fr ? "Un point par commune (ou ville), coloré par l'entrepôt qui la dessert. Gris : pas encore desservie." : "A dot per commune (or city), coloured by the warehouse that serves it. Grey: not served yet."}
          </p>
          <CoverageMap fr={fr} hubs={rows} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-slate-900">{fr ? "Trous de couverture" : "Coverage gaps"}</h2>
          <p className="text-xs text-slate-500">
            {fr ? "Zones d'une ville desservie qu'aucun entrepôt ne couvre : les commandes vers ces zones sont refusées." : "Areas inside a served city that no warehouse covers: orders to them are refused."}
          </p>
          <GapsPanel fr={fr} hubs={rows} mayManage={mayManage} />
        </CardContent>
      </Card>

      <NoticeBar>
        {fr ? (
          <>
            Pour donner accès au portail entrepôt, créez un compte dans{" "}
            <Link href="/admin/warehouses/staff" className="font-semibold underline">Personnel d&apos;entrepôt</Link>. Suivez l&apos;activité dans{" "}
            <Link href="/admin/fulfillment" className="font-semibold underline">Opérations logistiques</Link>.
          </>
        ) : (
          <>
            To give someone warehouse-portal access, create an account under{" "}
            <Link href="/admin/warehouses/staff" className="font-semibold underline">Warehouse Staff</Link>. Monitor activity in{" "}
            <Link href="/admin/fulfillment" className="font-semibold underline">Fulfillment Ops</Link>.
          </>
        )}
      </NoticeBar>

      <HubFormModal
        open={formOpen}
        hub={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => hubs.setItems((cur) => (cur.some((h) => h.id === saved.id) ? cur.map((h) => (h.id === saved.id ? saved : h)) : [saved, ...cur]))}
      />

      <Modal
        open={!!toggle}
        onClose={() => !busy && setToggle(null)}
        title={toggle?.active ? (fr ? "Désactiver ce hub ?" : "Deactivate this hub?") : fr ? "Activer ce hub ?" : "Activate this hub?"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setToggle(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant={toggle?.active ? "danger" : "primary"} size="sm" onClick={confirmToggle} disabled={busy}>
              {busy ? "…" : toggle?.active ? (fr ? "Désactiver" : "Deactivate") : fr ? "Activer" : "Activate"}
            </Button>
          </>
        }
      >
        {toggle && (
          <>
            <p>
              <strong>{toggle.name}</strong> · {toggle.city}
            </p>
            <p className="text-slate-500">
              {toggle.active
                ? fr ? "Un hub désactivé reste dans l'annuaire, mais ses zones deviennent « non desservies » tant qu'un autre entrepôt actif ne couvre pas une zone parente. Le dernier hub actif ne peut pas être désactivé." : "A deactivated hub stays in the directory, but its areas count as unserved unless another active warehouse covers a parent area. The last active hub cannot be deactivated."
                : fr ? "Le hub redevient le choix du routage pour les zones qu'il couvre." : "The hub serves the areas it covers again."}
            </p>
            <ErrorNote message={toggleError} />
          </>
        )}
      </Modal>
    </div>
  );
}
