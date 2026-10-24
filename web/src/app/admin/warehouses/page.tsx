"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Boxes, Power, Pencil, CheckCircle2, PauseCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { NoticeBar } from "@/components/admin/notice-bar";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { HubFormModal } from "@/components/admin/hub-form";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { canManageHubs, errMsg, useRole, useServerList } from "@/lib/admin-live";
import type { HubRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";
import { countryName } from "@/lib/countries";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", labelFr: "Actif" },
  { value: "inactive", label: "Inactive", labelFr: "Inactif" },
];

export default function AdminWarehousesPage() {
  const hubs = useServerList<HubRow>("warehouse:hubs", { pushEvents: ["hub:updated"] });
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
    () => hubs.items.map((h) => ({ ...h, status: h.active ? "active" : "inactive" })).sort((a, b) => a.name.localeCompare(b.name)),
    [hubs.items],
  );
  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["name", "city", "country", "address"], statusField: "status" }),
    [rows, filters],
  );
  const activeCount = rows.filter((h) => h.active).length;
  const totalCapacity = rows.filter((h) => h.active).reduce((s, h) => s + h.capacity, 0);

  async function confirmToggle() {
    if (!toggle) return;
    setBusy(true);
    setToggleError(null);
    try {
      const saved = await socketClient.request<HubRow>("warehouse:setHubActive", { id: toggle.id, active: !toggle.active });
      hubs.setItems((cur) => cur.map((h) => (h.id === saved.id ? saved : h)));
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
        subtitle={fr ? "Les hubs enregistrés sur le serveur ; ils servent aux transferts de stock et aux lots d'expédition" : "Hubs stored on the server; they are used for stock transfers and dispatch batches"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Entrepôts" : "Warehouses" }]}
        actions={
          <>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Total hubs" : "Total hubs"} value={rows.length} icon={Boxes} />
        <StatCard title={fr ? "Actifs" : "Active"} value={activeCount} icon={CheckCircle2} trend={`${totalCapacity.toLocaleString()} ${fr ? "colis de capacité" : "parcels capacity"}`} />
        <StatCard title={fr ? "Inactifs" : "Inactive"} value={rows.length - activeCount} icon={PauseCircle} />
      </div>

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
                  { key: "city", label: fr ? "Ville" : "City" },
                  { key: "country", label: fr ? "Pays" : "Country", render: (row) => countryName(row.country as string | null, fr, true) || "—" },
                  { key: "address", label: fr ? "Adresse" : "Address", render: (row) => String(row.address ?? "—") },
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
                ? fr ? "Un hub désactivé reste dans l'annuaire mais ne peut plus recevoir de transferts de stock. Le dernier hub actif ne peut pas être désactivé." : "A deactivated hub stays in the directory but cannot take new stock transfers. The last active hub cannot be deactivated."
                : fr ? "Le hub pourra de nouveau recevoir des transferts de stock." : "The hub will be able to take stock transfers again."}
            </p>
            <ErrorNote message={toggleError} />
          </>
        )}
      </Modal>
    </div>
  );
}
