"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SecretBox } from "@/components/admin/copy-box";
import { NoticeBar } from "@/components/admin/notice-bar";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { ErrorNote } from "@/components/admin/modal";
import { HomeWarehouseDialog } from "@/components/admin/home-warehouse-dialog";
import type { HubRow } from "@/lib/admin-stats";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { errMsg, useRole, useServerList, type StaffRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

interface RoleDef {
  key: string;
  label: string;
  scope: string;
}

const ROLE_NAMES_FR: Record<string, string> = {
  admin: "Super administrateur",
  admin_operations: "Opérations",
  admin_finance: "Finance",
  admin_support: "Assistance",
  admin_marketing: "Marketing",
  admin_moderation: "Modération",
  warehouse_staff: "Entrepôt",
  rider: "Livreur",
};

/** The server describes each role's scope in English only; known descriptions are shown in French. */
const ROLE_SCOPE_FR: Record<string, string> = {
  "Full access": "Accès total",
  "Orders, fulfilment, riders": "Commandes, logistique, livreurs",
  "Payments, payouts, refunds": "Paiements, versements, remboursements",
  "Tickets, disputes": "Tickets, litiges",
  "Promos, CMS, broadcasts": "Promotions, CMS, diffusions",
  "Sellers, products, reviews": "Vendeurs, produits, avis",
  "Hubs, parcels, inventory": "Hubs, colis, inventaire",
  "Deliveries, GPS, earnings": "Livraisons, GPS, gains",
};

const CREATABLE = ["rider", "warehouse_staff", "admin_operations", "admin_finance", "admin_support", "admin_marketing", "admin_moderation"];

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const rt = useRealtime();
  const role = useRole();
  const fr = locale === "fr";
  const isSuper = role === "admin";
  const [defs, setDefs] = useState<RoleDef[]>([]);
  const { items: staff, reload, error: staffError, loading } = useServerList<StaffRow>("roles:staff", { enabled: isSuper });
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "admin_support" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const hubs = useServerList<HubRow>("warehouse:hubs", { enabled: isSuper, pushEvents: ["hub:updated"] });
  const hubName = useMemo(() => new Map(hubs.items.map((h) => [h.id, h.name])), [hubs.items]);
  const [placing, setPlacing] = useState<StaffRow | null>(null);

  const roleName = (key: string) => {
    const d = defs.find((x) => x.key === key);
    return fr ? (ROLE_NAMES_FR[key] ?? d?.label ?? key) : (d?.label ?? key);
  };

  useEffect(() => {
    if (rt.status !== "connected") return;
    socketClient.request<RoleDef[]>("roles:defs").then(setDefs).catch(() => setDefs([]));
  }, [rt.status]);

  // Another admin changed a role: refresh the list.
  useEffect(() => {
    if (!isSuper || rt.status !== "connected") return;
    const s = socketClient.current;
    if (!s) return;
    const h = () => void reload();
    s.on("roles:updated", h);
    return () => {
      s.off("roles:updated", h);
    };
  }, [isSuper, rt.status, reload]);

  async function createStaff() {
    if (!form.name.trim() || !form.email.trim()) {
      setFormError(fr ? "Nom et e-mail requis." : "Name and email are required.");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const res = await socketClient.request<{ id: string; email: string; role: string; tempPassword: string }>("roles:createStaff", {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setSecret({ email: res.email, password: res.tempPassword });
      setForm({ name: "", email: "", phone: "", role: form.role });
      toast(fr ? "Compte créé" : "Account created", "success");
      void reload();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(u: StaffRow, next: string) {
    if (next === u.role) return;
    setSavingId(u.id);
    try {
      await socketClient.request("roles:setRole", { id: u.id, role: next });
      toast(fr ? `Rôle de ${u.name} : ${roleName(next)}` : `${u.name} is now ${roleName(next)}`, "success");
      await reload();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSavingId(null);
    }
  }

  if (!isSuper) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={fr ? "Rôles et autorisations" : "Roles & Permissions"}
          breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Rôles" : "Roles" }]}
        />
        <NoticeBar tone="warn">{fr ? "Réservé au super administrateur." : "Super admin only."}</NoticeBar>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Rôles et autorisations" : "Roles & Permissions"}
        subtitle={fr ? "Comptes du personnel en direct — attribution des rôles et création de comptes" : "Live staff accounts — assign roles and create accounts"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Rôles" : "Roles" }]}
      />

      <div className="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
        {defs.map((d) => (
          <Card key={d.key}>
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-900">{roleName(d.key)}</h3>
              <p className="mt-1 text-xs text-slate-500">{fr ? (ROLE_SCOPE_FR[d.scope] ?? d.scope) : d.scope}</p>
              <Badge variant="default" className="mt-3">{staff.filter((u) => u.role === d.key).length} {fr ? "compte(s)" : "account(s)"}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        {fr
          ? "Les rôles sont fixes côté serveur : leurs droits ne se modifient pas ici, on attribue seulement un rôle à un compte."
          : "Roles are fixed on the server: their rights are not edited here, you only assign a role to an account."}
      </p>

      {secret && <SecretBox email={secret.email} secret={secret.password} fr={fr} onDismiss={() => setSecret(null)} />}

      <div className="card-premium space-y-4 p-6">
        <h3 className="font-semibold">{fr ? "Créer un compte personnel / livreur" : "Create staff / rider account"}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom complet" : "Full name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Téléphone (optionnel)" : "Phone (optional)"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className="input-premium px-4 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {CREATABLE.map((r) => (
              <option key={r} value={r}>{roleName(r)}</option>
            ))}
          </select>
        </div>
        <ErrorNote message={formError} />
        <Button onClick={createStaff} disabled={creating}>{creating ? "…" : fr ? "Créer le compte" : "Create account"}</Button>
      </div>

      <div className="card-premium overflow-hidden">
        {staffError && <div className="p-4"><SectionError message={staffError} onRetry={reload} /></div>}
        {loading && !staffError && isSuper && <SectionLoading />}
        <DataTable
          emptyMessage={fr ? "Aucun compte" : "No staff accounts"}
          data={staff as unknown as Record<string, unknown>[]}
          columns={[
            { key: "name", label: fr ? "Nom" : "Name", render: (row) => <span className="font-medium text-slate-900">{String(row.name)}</span> },
            { key: "email", label: "Email" },
            { key: "phone", label: fr ? "Téléphone" : "Phone", render: (row) => <span>{row.phone ? String(row.phone) : "—"}</span> },
            {
              key: "role",
              label: fr ? "Rôle" : "Role",
              render: (row) => {
                const u = row as unknown as StaffRow;
                const self = u.id === rt.user?.id;
                return (
                  <select
                    className="input-premium px-3 py-1.5 text-sm"
                    value={u.role}
                    disabled={self || savingId === u.id}
                    title={self ? (fr ? "Vous ne pouvez pas changer votre propre rôle" : "You cannot change your own role") : undefined}
                    onChange={(e) => changeRole(u, e.target.value)}
                  >
                    {defs.map((d) => (
                      <option key={d.key} value={d.key}>{roleName(d.key)}</option>
                    ))}
                  </select>
                );
              },
            },
            {
              key: "active",
              label: fr ? "Actif" : "Active",
              render: (row) =>
                row.active === undefined ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <Badge variant={row.active ? "success" : "danger"}>{row.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive"}</Badge>
                ),
            },
            {
              key: "hubId",
              label: fr ? "Entrepôt" : "Warehouse",
              render: (row) => {
                const u = row as unknown as StaffRow;
                // Only riders and warehouse staff work at a warehouse.
                if (u.role !== "rider" && u.role !== "warehouse_staff") return <span className="text-slate-300">—</span>;
                return (
                  <button className="text-sm font-medium text-[var(--primary)] hover:underline" onClick={() => setPlacing(u)}>
                    {u.hubId ? (hubName.get(u.hubId) ?? (fr ? "Entrepôt inconnu" : "Unknown warehouse")) : fr ? "Choisir…" : "Set…"}
                  </button>
                );
              },
            },
          ]}
        />
      </div>
      <HomeWarehouseDialog user={placing} hubs={hubs.items} fr={fr} onClose={() => setPlacing(null)} onSaved={() => void reload()} />
    </div>
  );
}
