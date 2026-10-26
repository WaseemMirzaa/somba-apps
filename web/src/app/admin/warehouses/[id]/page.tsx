"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, Pencil, Power } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { HubFormModal } from "@/components/admin/hub-form";
import { HomeWarehouseDialog } from "@/components/admin/home-warehouse-dialog";
import { CoverageEditor, CoverageList, GapsPanel, useHubCoverage } from "@/components/admin/coverage-editor";
import { CoverageMap } from "@/components/geo/coverage-map";
import { areaName, chainFromTree, chainText, useFootprint } from "@/lib/areas";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { canManageHubs, errMsg, useRole, useServerList, type StaffRow } from "@/lib/admin-live";
import { useSocketQuery, type HubRow, type WarehouseStats } from "@/lib/admin-stats";
import { LEG_KIND_SHORT, TIER_LABEL, pickL, type Custody, type LegKind } from "@/lib/logistics";
import { socketClient } from "@/lib/realtime/socket-client";
import { countryName } from "@/lib/countries";

const FULFILLMENT_LINKS = [
  { href: "/admin/fulfillment/desk", label: "Warehouse desk", labelFr: "Bureau de l'entrepôt" },
  { href: "/admin/fulfillment/deliveries", label: "Deliveries", labelFr: "Livraisons" },
  { href: "/admin/fulfillment/runs", label: "Transfer runs", labelFr: "Tournées de transfert" },
  { href: "/admin/fulfillment/returns", label: "Returns", labelFr: "Retours" },
  { href: "/admin/fulfillment/riders", label: "Riders", labelFr: "Livreurs" },
  { href: "/admin/fulfillment/exceptions", label: "Exceptions", labelFr: "Exceptions" },
  { href: "/admin/fulfillment/analytics", label: "Analytics", labelFr: "Analytique" },
];

interface HubRider {
  id: string;
  name: string;
  phone: string | null;
  hubId: string | null;
  activeTasks: number;
}

export default function AdminWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { locale } = useLocale();
  const role = useRole();
  const fr = locale === "fr";
  const mayManage = canManageHubs(role);
  const hubs = useServerList<HubRow>("hubs:list");
  const reloadHubs = hubs.reload;
  const wh = useSocketQuery<WarehouseStats>("analytics:warehouse", { hubId: id });
  const custody = useSocketQuery<Custody>("logistics:custody", { hubId: id });
  const riders = useSocketQuery<HubRider[]>("warehouse:riders", { hubId: id });
  const people = useServerList<StaffRow>("hubs:people", { body: { hubId: id } });
  const reloadPeople = people.reload;
  const [editingPerson, setEditingPerson] = useState<StaffRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The hub, or its riders / staff, changed: ask again.
  useEffect(() => {
    const sock = socketClient.current;
    const h = () => {
      void reloadHubs();
      void reloadPeople();
    };
    sock?.on("hub:updated", h);
    // Coverage changed (here or elsewhere): the covered-areas figures must follow.
    sock?.on("coverage:updated", h);
    return () => {
      sock?.off("hub:updated", h);
      sock?.off("coverage:updated", h);
    };
  }, [reloadHubs, reloadPeople]);

  const hub = hubs.items.find((h) => h.id === id) ?? null;
  const footprint = useFootprint();
  const coverage = useHubCoverage(id, !mayManage);
  const w = wh.data;
  const mine = w?.byHub.find((h) => h.hubId === id);
  const hubStaff = people.items.filter((u) => u.role === "warehouse_staff");
  const kindRows = useMemo(
    () => Object.entries(w?.byKind ?? {}).filter(([, n]) => n > 0) as [LegKind, number][],
    [w],
  );

  async function toggleActive() {
    if (!hub) return;
    setBusy(true);
    setToggleError(null);
    try {
      const saved = await socketClient.request<HubRow>("hubs:setActive", { id: hub.id, active: !hub.active });
      hubs.setItems((cur) => cur.map((h) => (h.id === saved.id ? { ...h, ...saved } : h)));
      toast(saved.active ? (fr ? "Hub activé" : "Hub activated") : fr ? "Hub désactivé" : "Hub deactivated", "success");
      setToggleOpen(false);
    } catch (e) {
      setToggleError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (hubs.loading && !hubs.error) return <SectionLoading className="min-h-[40vh]" />;
  if (hubs.error) return <SectionError message={hubs.error} onRetry={hubs.reload} />;
  if (!hub) {
    return (
      <div className="space-y-4 p-8 text-center text-slate-500">
        <p>{fr ? "Hub introuvable" : "Hub not found"}</p>
        <Link href="/admin/warehouses" className="text-sm font-semibold text-[var(--primary)] hover:underline">
          {fr ? "Retour à l'annuaire" : "Back to the directory"}
        </Link>
      </div>
    );
  }
  const placed = hub.lat != null && hub.lng != null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={hub.name}
        subtitle={[hub.city, countryName(hub.country, fr)].filter(Boolean).join(", ")}
        backHref="/admin/warehouses"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: fr ? "Entrepôts" : "Warehouses", href: "/admin/warehouses" },
          { label: hub.name },
        ]}
        actions={
          <>
            <Badge variant={hub.active ? "success" : "default"}>{hub.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive"}</Badge>
            {mayManage && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />{fr ? "Modifier" : "Edit"}
                </Button>
                <Button size="sm" variant={hub.active ? "danger" : "primary"} onClick={() => { setToggleError(null); setToggleOpen(true); }}>
                  <Power className="h-3.5 w-3.5" />{hub.active ? (fr ? "Désactiver" : "Deactivate") : fr ? "Activer" : "Activate"}
                </Button>
              </>
            )}
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Détails du hub" : "Hub details"}>
          <InfoGrid
            items={[
              { label: fr ? "Emplacement" : "Location", value: hub.area ? chainText(chainFromTree(hub.area, footprint.root).length ? chainFromTree(hub.area, footprint.root) : [hub.area], fr, { skipLevels: ["district"] }) || areaName(hub.area, fr) : hub.city },
              { label: fr ? "Zones couvertes" : "Areas covered", value: hub.coverage ? hub.coverage.length : "—" },
              { label: fr ? "Adresse" : "Address", value: hub.address ?? "—", full: true },
              { label: fr ? "Capacité (colis)" : "Capacity (parcels)", value: hub.capacity.toLocaleString() },
              { label: fr ? "Livreurs actifs" : "Active riders", value: hub.activeRiders ?? 0 },
              { label: fr ? "Personnel" : "Staff", value: hub.staffCount ?? 0 },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Position sur la carte" : "Position on the map"}>
          {placed ? (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-slate-700">{hub.lat!.toFixed(5)}, {hub.lng!.toFixed(5)}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${hub.lat},${hub.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />{fr ? "Ouvrir dans Google Maps" : "Open in Google Maps"}
              </a>
              <p className="text-xs text-slate-500">
                {fr ? "La position sert à la carte de couverture et au calcul de la distance et des frais de livraison ; ce sont les zones couvertes qui choisissent l'entrepôt." : "The position drives the coverage map and the distance and delivery fee; the covered areas are what choose the warehouse."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Badge variant="warning">{fr ? "Hors carte : absent de la carte de couverture" : "Not on the map: missing from the coverage map"}</Badge>
              {mayManage && <p className="text-xs text-slate-500">{fr ? "Modifiez le hub pour le placer sur la carte." : "Edit the hub to place it on the map."}</p>}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Zones couvertes" : "Coverage"} span={3}>
          {mayManage ? (
            <CoverageEditor hub={hub} fr={fr} mayManage={mayManage} />
          ) : coverage.error ? (
            <SectionError message={coverage.error} onRetry={coverage.reload} />
          ) : (
            <CoverageList areas={coverage.areas ?? hub.coverage ?? []} fr={fr} />
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Carte de la couverture" : "Coverage map"} span={3}>
          <CoverageMap fr={fr} hubs={hubs.items} highlightHubId={hub.id} height={360} />
        </DetailGridSection>

        {mayManage && (
          <DetailGridSection title={fr ? "Trous de couverture" : "Coverage gaps"} span={3}>
            <p className="mb-3 text-xs text-slate-500">
              {fr ? "Zones d'une ville desservie qu'aucun entrepôt ne couvre. Vous pouvez les assigner à cet entrepôt." : "Areas inside a served city that no warehouse covers. You can assign them to this warehouse."}
            </p>
            <GapsPanel fr={fr} hubs={hubs.items} mayManage={mayManage} fixedHub={hub} />
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Activité (30 jours)" : "Activity (30 days)"}>
          {wh.error ? (
            <SectionError message={wh.error} onRetry={wh.reload} />
          ) : !w ? (
            <SectionLoading />
          ) : (
            <InfoGrid
              items={[
                { label: fr ? "Trajets gérés" : "Legs managed", value: mine?.parcels ?? 0 },
                { label: fr ? "Livrés" : "Delivered", value: mine?.delivered ?? 0 },
                { label: fr ? "Échecs" : "Failed", value: mine?.failed ?? 0 },
                { label: fr ? "Non assignés" : "Unassigned", value: w.unassigned },
                { label: fr ? "En transit" : "In transit", value: w.inTransit },
                { label: fr ? "Ouverts > 24 h" : "Open > 24 h", value: w.agedOver24h },
              ]}
            />
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Colis en garde" : "Parcels in custody"} span={2}>
          {custody.error ? (
            <SectionError message={custody.error} onRetry={custody.reload} />
          ) : !custody.data ? (
            <SectionLoading />
          ) : (
            <div className="space-y-3">
              <InfoGrid
                columns={3}
                items={[
                  { label: fr ? "À recevoir" : "Inbound", value: custody.data.inbound.length },
                  { label: fr ? "En stock à l'entrepôt" : "On hand", value: custody.data.onHand.length },
                  { label: fr ? "À sortir" : "Outbound", value: custody.data.outbound.length },
                ]}
              />
              {kindRows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {kindRows.map(([k, n]) => (
                    <Badge key={k} variant="info">{pickL(LEG_KIND_SHORT[k], fr, k)}: {n}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livreurs de cet entrepôt" : "Riders at this warehouse"} span={3}>
          <p className="mb-3 text-xs text-slate-500">
            {fr ? "Le personnel de l'entrepôt leur assigne chaque trajet ; ils ne peuvent pas en accepter eux-mêmes." : "Warehouse staff assign every leg to them; riders cannot accept tasks themselves."}
          </p>
          {riders.error ? (
            <SectionError message={riders.error} onRetry={riders.reload} />
          ) : !riders.data ? (
            <SectionLoading />
          ) : riders.data.length === 0 ? (
            <EmptyState>{fr ? "Aucun livreur rattaché. Un hub sans livreur n'est jamais choisi pour une commande." : "No riders yet. A hub without riders is never chosen for an order."}</EmptyState>
          ) : (
            <DataTable
              columns={[
                { key: "name", label: fr ? "Nom" : "Name" },
                { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => (row.phone ? String(row.phone) : "—") },
                { key: "activeTasks", label: fr ? "Tâches en cours" : "Active tasks" },
              ]}
              data={riders.data as unknown as Record<string, unknown>[]}
            />
          )}
        </DetailGridSection>

        {(role === "admin" || role === "admin_operations") && (
          <DetailGridSection title={fr ? "Employés de cet entrepôt" : "Staff at this warehouse"} span={3}>
            {people.error ? (
              <SectionError message={people.error} onRetry={people.reload} />
            ) : people.loading ? (
              <SectionLoading />
            ) : hubStaff.length === 0 ? (
              <EmptyState>{fr ? "Aucun employé rattaché." : "No staff tied to this warehouse yet."}</EmptyState>
            ) : (
              <DataTable
                columns={[
                  { key: "name", label: fr ? "Nom" : "Name" },
                  { key: "email", label: "Email" },
                  {
                    key: "warehouseTier",
                    label: fr ? "Niveau" : "Tier",
                    render: (row) => {
                      const t = row.warehouseTier as keyof typeof TIER_LABEL | null;
                      return t ? <Badge variant={t === "manager" ? "purple" : t === "supervisor" ? "info" : "default"}>{pickL(TIER_LABEL[t], fr)}</Badge> : "—";
                    },
                  },
                  {
                    key: "actions",
                    label: "",
                    render: (row) =>
                      role === "admin" ? (
                        <button className="text-sm font-medium text-[var(--primary)] hover:underline" onClick={() => setEditingPerson(row as unknown as StaffRow)}>
                          {fr ? "Entrepôt et niveau" : "Warehouse and tier"}
                        </button>
                      ) : null,
                  },
                ]}
                data={hubStaff as unknown as Record<string, unknown>[]}
              />
            )}
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Opérations logistiques (vue admin)" : "Fulfillment Operations (Admin View)"} span={3}>
          <p className="mb-4 text-sm text-slate-600">{fr ? "Accédez à toutes les données du portail entrepôt depuis l'admin." : "Access all warehouse portal data from admin."}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {FULFILLMENT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                {fr ? link.labelFr : link.label} →
              </Link>
            ))}
          </div>
          <NavLinkButton href="/admin/fulfillment" className="mt-4">
            {fr ? "Ouvrir le tableau de bord logistique" : "Open Fulfillment Dashboard"} →
          </NavLinkButton>
        </DetailGridSection>
      </DetailGrid>

      <HomeWarehouseDialog user={editingPerson} hubs={hubs.items} fr={fr} onClose={() => setEditingPerson(null)} onSaved={() => void people.reload()} />

      <HubFormModal
        open={editOpen}
        hub={hub}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => hubs.setItems((cur) => cur.map((h) => (h.id === saved.id ? { ...h, ...saved } : h)))}
      />

      <Modal
        open={toggleOpen}
        onClose={() => !busy && setToggleOpen(false)}
        title={hub.active ? (fr ? "Désactiver ce hub ?" : "Deactivate this hub?") : fr ? "Activer ce hub ?" : "Activate this hub?"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setToggleOpen(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant={hub.active ? "danger" : "primary"} size="sm" onClick={toggleActive} disabled={busy}>
              {busy ? "…" : hub.active ? (fr ? "Désactiver" : "Deactivate") : fr ? "Activer" : "Activate"}
            </Button>
          </>
        }
      >
        <p className="text-slate-500">
          {hub.active
            ? fr ? "Un hub désactivé ne dessert plus ses zones tant qu'un autre entrepôt actif ne couvre pas une zone parente. Le dernier hub actif ne peut pas être désactivé." : "A deactivated hub no longer serves its areas unless another active warehouse covers a parent area. The last active hub cannot be deactivated."
            : fr ? "Le hub dessert de nouveau les zones qu'il couvre." : "The hub serves the areas it covers again."}
        </p>
        <ErrorNote message={toggleError} />
      </Modal>
    </div>
  );
}
