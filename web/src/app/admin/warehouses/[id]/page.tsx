"use client";

import { localDay } from "@/lib/dates";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pencil, Power } from "lucide-react";
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
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { canManageHubs, errMsg, useRole, useServerList, type StaffRow, type ZoneSetting } from "@/lib/admin-live";
import { useSocketQuery, type HubRow, type WarehouseStats } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";
import { countryName } from "@/lib/countries";

const FULFILLMENT_LINKS = [
  { href: "/admin/fulfillment/inbound", label: "Inbound Queue", labelFr: "File d'attente entrante" },
  { href: "/admin/fulfillment/sorting", label: "Sorting", labelFr: "Tri" },
  { href: "/admin/fulfillment/dispatch", label: "Dispatch", labelFr: "Expédition" },
  { href: "/admin/fulfillment/deliveries", label: "Deliveries", labelFr: "Livraisons" },
  { href: "/admin/fulfillment/returns", label: "Returns", labelFr: "Retours" },
  { href: "/admin/fulfillment/inventory", label: "Inventory", labelFr: "Inventaire" },
  { href: "/admin/fulfillment/riders", label: "Riders", labelFr: "Livreurs" },
  { href: "/admin/fulfillment/exceptions", label: "Exceptions", labelFr: "Exceptions" },
];

interface TransferRow {
  id: string;
  reference: string;
  fromHub: string;
  toHub: string;
  sku: string;
  productName: string | null;
  qty: number;
  status: string;
  createdAt: string;
}

interface HubRider {
  id: string;
  name: string;
  phone: string | null;
  hubId: string | null;
  preferredZones: string[];
  activeTasks: number;
}

function parseZones(raw: string | undefined): ZoneSetting[] {
  try {
    const v = raw ? (JSON.parse(raw) as ZoneSetting[]) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const TRANSFER_STATUS_FR: Record<string, string> = { requested: "Demandé", in_transit: "En transit", received: "Reçu" };

export default function AdminWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { locale } = useLocale();
  const role = useRole();
  const fr = locale === "fr";
  const mayManage = canManageHubs(role);
  const hubs = useServerList<HubRow>("warehouse:hubs", { pushEvents: ["hub:updated"] });
  const wh = useSocketQuery<WarehouseStats>("analytics:warehouse");
  const transfers = useSocketQuery<TransferRow[]>("warehouse:transfers");
  // Who and what belongs to this warehouse: the zones it delivers, its riders and (super admin) its staff.
  const settings = useSocketQuery<Record<string, string>>("settings:get");
  const riders = useSocketQuery<HubRider[]>("warehouse:riders", { hubId: id });
  const staff = useServerList<StaffRow>("roles:staff", { enabled: role === "admin" });
  const [editingPerson, setEditingPerson] = useState<StaffRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hub = hubs.items.find((h) => h.id === id) ?? null;
  const w = wh.data;
  const today = w?.throughput[w.throughput.length - 1];
  const batches30 = w?.byHub.find((h) => h.hubId === id)?.batches30 ?? 0;
  const zones = useMemo(() => parseZones(settings.data?.deliveryZones), [settings.data]);
  const hubZones = zones.filter((z) => z.hubId === id);
  const zoneName = new Map(zones.map((z) => [z.id, fr ? z.nameFr || z.name : z.name]));
  const hubRiders = (riders.data ?? []).filter((r) => r.hubId === id);
  const hubStaff = staff.items.filter((u) => u.role === "warehouse_staff" && u.hubId === id);
  const hubTransfers = useMemo(
    () => (transfers.data ?? []).filter((t) => hub && [t.fromHub, t.toHub].some((n) => n.trim().toLowerCase() === hub.name.trim().toLowerCase())),
    [transfers.data, hub],
  );

  async function toggleActive() {
    if (!hub) return;
    setBusy(true);
    setToggleError(null);
    try {
      const saved = await socketClient.request<HubRow>("warehouse:setHubActive", { id: hub.id, active: !hub.active });
      hubs.setItems((cur) => cur.map((h) => (h.id === saved.id ? saved : h)));
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
              { label: fr ? "Ville" : "City", value: hub.city },
              { label: fr ? "Pays" : "Country", value: countryName(hub.country, fr) || "—" },
              { label: fr ? "Adresse" : "Address", value: hub.address ?? "—", full: true },
              { label: fr ? "Capacité (colis)" : "Capacity (parcels)", value: hub.capacity.toLocaleString() },
              { label: fr ? "Statut" : "Status", value: hub.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive" },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Activité de ce hub" : "This hub's activity"}>
          {wh.error ? (
            <SectionError message={wh.error} onRetry={wh.reload} />
          ) : !w ? (
            <SectionLoading />
          ) : (
            <InfoGrid
              items={[
                { label: fr ? "Lots d'expédition (30 j)" : "Dispatch batches (30 d)", value: batches30 },
                { label: fr ? "Transferts de stock" : "Stock transfers", value: transfers.data ? hubTransfers.length : "…" },
              ]}
            />
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Zones desservies" : "Zones it delivers"}>
          {settings.error ? (
            <SectionError message={settings.error} onRetry={settings.reload} />
          ) : !settings.data ? (
            <SectionLoading />
          ) : hubZones.length === 0 ? (
            <EmptyState>
              {fr ? "Aucune zone. Rattachez des zones à cet entrepôt sur la page " : "No zones yet. Tie zones to this warehouse on the "}
              <Link href="/admin/zones" className="font-semibold text-[var(--primary)] hover:underline">{fr ? "Zones" : "Zones page"}</Link>.
            </EmptyState>
          ) : (
            <ul className="space-y-1 text-sm">
              {hubZones.map((z) => (
                <li key={z.id} className="flex justify-between gap-3">
                  <span className="font-medium text-slate-800">{fr ? z.nameFr || z.name : z.name}</span>
                  <span className="text-slate-500">{z.city} · ${z.feeUsd}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livreurs de cet entrepôt" : "Riders at this warehouse"} span={2}>
          <p className="mb-3 text-xs text-slate-500">
            {fr
              ? "Ils voient et reçoivent les livraisons des zones de cet entrepôt, leurs zones préférées en premier."
              : "They see and are told about deliveries in this warehouse's zones, their preferred zones first."}
          </p>
          {riders.error ? (
            <SectionError message={riders.error} onRetry={riders.reload} />
          ) : !riders.data ? (
            <SectionLoading />
          ) : hubRiders.length === 0 ? (
            <EmptyState>{fr ? "Aucun livreur rattaché. Choisissez l'entrepôt des livreurs sur la page Personnel." : "No riders yet. Set riders' warehouse on the Staff page."}</EmptyState>
          ) : (
            <DataTable
              columns={[
                { key: "name", label: fr ? "Nom" : "Name" },
                { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => (row.phone ? String(row.phone) : "—") },
                {
                  key: "preferredZones",
                  label: fr ? "Zones préférées" : "Preferred zones",
                  render: (row) => {
                    const z = (row.preferredZones as string[]) ?? [];
                    return z.length ? z.map((x) => zoneName.get(x) ?? x).join(", ") : "—";
                  },
                },
                { key: "activeTasks", label: fr ? "En cours" : "Active jobs" },
              ]}
              data={hubRiders as unknown as Record<string, unknown>[]}
            />
          )}
        </DetailGridSection>

        {role === "admin" && (
          <DetailGridSection title={fr ? "Employés de cet entrepôt" : "Staff at this warehouse"} span={3}>
            {staff.error ? (
              <SectionError message={staff.error} onRetry={staff.reload} />
            ) : staff.loading ? (
              <SectionLoading />
            ) : hubStaff.length === 0 ? (
              <EmptyState>{fr ? "Aucun employé rattaché." : "No staff tied to this warehouse yet."}</EmptyState>
            ) : (
              <DataTable
                columns={[
                  { key: "name", label: fr ? "Nom" : "Name" },
                  { key: "email", label: "Email" },
                  {
                    key: "actions",
                    label: "",
                    render: (row) => (
                      <button className="text-sm font-medium text-[var(--primary)] hover:underline" onClick={() => setEditingPerson(row as unknown as StaffRow)}>
                        {fr ? "Changer d'entrepôt" : "Change warehouse"}
                      </button>
                    ),
                  },
                ]}
                data={hubStaff as unknown as Record<string, unknown>[]}
              />
            )}
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Réseau de colis, aujourd'hui (tous hubs)" : "Parcel network today (all hubs)"} span={2}>
          <p className="mb-3 text-xs text-slate-500">
            {fr ? "Ces chiffres couvrent tout le réseau, tous entrepôts confondus." : "These figures cover the whole network, every warehouse together."}
          </p>
          {wh.error ? (
            <SectionError message={wh.error} onRetry={wh.reload} />
          ) : !w ? (
            <SectionLoading />
          ) : (
            <InfoGrid
              columns={4}
              items={[
                { label: fr ? "Reçus aujourd'hui" : "Received today", value: today?.received ?? 0 },
                { label: fr ? "Enlevés aujourd'hui" : "Picked up today", value: today?.pickedUp ?? 0 },
                { label: fr ? "Livrés aujourd'hui" : "Delivered today", value: today?.delivered ?? 0 },
                { label: fr ? "Non assignés" : "Unassigned", value: w.unassigned },
                { label: fr ? "En transit" : "In transit", value: w.inTransit },
                { label: fr ? "Ouverts > 24 h" : "Open > 24 h", value: w.agedOver24h },
              ]}
            />
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Transferts de stock de ce hub" : "Stock transfers of this hub"} span={3}>
          {transfers.error ? (
            <SectionError message={transfers.error} onRetry={transfers.reload} />
          ) : transfers.loading ? (
            <SectionLoading />
          ) : hubTransfers.length === 0 ? (
            <EmptyState>{fr ? "Aucun transfert pour ce hub." : "No stock transfers for this hub."}</EmptyState>
          ) : (
            <DataTable
              columns={[
                { key: "reference", label: fr ? "Référence" : "Reference" },
                { key: "route", label: fr ? "Trajet" : "Route", render: (row) => `${row.fromHub} → ${row.toHub}` },
                { key: "sku", label: "SKU", render: (row) => `${row.sku}${row.productName ? ` · ${row.productName}` : ""}` },
                { key: "qty", label: fr ? "Qté" : "Qty" },
                { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={row.status === "received" ? "success" : "info"}>{fr ? TRANSFER_STATUS_FR[String(row.status)] ?? String(row.status) : String(row.status).replace(/_/g, " ")}</Badge> },
                { key: "createdAt", label: "Date", render: (row) => localDay(String(row.createdAt)) },
              ]}
              data={hubTransfers as unknown as Record<string, unknown>[]}
            />
          )}
        </DetailGridSection>

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

      <HomeWarehouseDialog user={editingPerson} hubs={hubs.items} fr={fr} onClose={() => setEditingPerson(null)} onSaved={() => void staff.reload()} />

      <HubFormModal
        open={editOpen}
        hub={hub}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => hubs.setItems((cur) => cur.map((h) => (h.id === saved.id ? saved : h)))}
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
            ? fr ? "Un hub désactivé ne peut plus recevoir de transferts de stock. Le dernier hub actif ne peut pas être désactivé." : "A deactivated hub cannot take new stock transfers. The last active hub cannot be deactivated."
            : fr ? "Le hub pourra de nouveau recevoir des transferts de stock." : "The hub will be able to take stock transfers again."}
        </p>
        <ErrorNote message={toggleError} />
      </Modal>
    </div>
  );
}
