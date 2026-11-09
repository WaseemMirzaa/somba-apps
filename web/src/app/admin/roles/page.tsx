"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SecretBox } from "@/components/admin/copy-box";
import { StaffAccountActions } from "@/components/admin/staff-account-actions";
import { NoticeBar } from "@/components/admin/notice-bar";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { HomeWarehouseDialog, HubTierFields, needsHubText } from "@/components/admin/home-warehouse-dialog";
import type { HubRow } from "@/lib/admin-stats";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { errMsg, useRole, useServerList, type StaffRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { errMessage } from "@/lib/seller-labels";
import { TIER_LABEL, type WarehouseTier } from "@/lib/logistics";

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
  "Deliveries, GPS, work stats": "Livraisons, GPS, statistiques",
};

/** Admin accounts the super admin switches off and on here (riders and warehouse staff: Warehouses > Staff). */
const ADMIN_FAMILY = ["admin", "admin_operations", "admin_finance", "admin_support", "admin_marketing", "admin_moderation"];

const CREATABLE = ["rider", "warehouse_staff", "admin_operations", "admin_finance", "admin_support", "admin_marketing", "admin_moderation"];

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const rt = useRealtime();
  const role = useRole();
  const fr = locale === "fr";
  const isSuper = role === "admin";
  const [defs, setDefs] = useState<RoleDef[]>([]);
  const { items: staff, setItems: setStaff, reload, error: staffError, loading } = useServerList<StaffRow>("roles:staff", { enabled: isSuper });
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "admin_support", hubId: "", tier: "operator" as WarehouseTier });
  const [hubError, setHubError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<{ user: StaffRow; role: "rider" | "warehouse_staff" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const hubs = useServerList<HubRow>("hubs:list", { enabled: isSuper });
  const hubName = useMemo(() => new Map(hubs.items.map((h) => [h.id, h.name])), [hubs.items]);
  const [placing, setPlacing] = useState<StaffRow | null>(null);
  // Super admin switches off another staff member's two-factor authentication (confirmed first, audited by the server).
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Super admin switches an admin account off or back on (staff:setActive; confirmed first, audited by the server).
  const [switching, setSwitching] = useState<StaffRow | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

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
    const needsHub = form.role === "rider" || form.role === "warehouse_staff";
    if (needsHub && !form.hubId) {
      setHubError(needsHubText(fr));
      return;
    }
    setHubError(null);
    setCreating(true);
    setFormError(null);
    try {
      const res = await socketClient.request<{ id: string; email: string; role: string; tempPassword: string }>("roles:createStaff", {
        ...(needsHub ? { hubId: form.hubId } : {}),
        ...(form.role === "warehouse_staff" ? { warehouseTier: form.tier } : {}),
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setSecret({ email: res.email, password: res.tempPassword });
      setForm({ name: "", email: "", phone: "", role: form.role, hubId: form.hubId, tier: "operator" });
      toast(fr ? "Compte créé" : "Account created", "success");
      void reload();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setCreating(false);
    }
  }

  async function resetTwoFactor() {
    if (!resetting) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await socketClient.request("auth:2fa:reset", { userId: resetting.id });
      toast(fr ? `Authentification à deux facteurs de ${resetting.name} réinitialisée` : `Two-factor authentication reset for ${resetting.name}`, "success");
      setResetting(null);
      await reload();
    } catch (e) {
      const msg = errMessage(e);
      setResetError(msg);
      toast(msg, "error");
    } finally {
      setResetBusy(false);
    }
  }

  async function setActive() {
    if (!switching) return;
    const next = !switching.active;
    setSwitchBusy(true);
    setSwitchError(null);
    try {
      await socketClient.request("staff:setActive", { userId: switching.id, active: next });
      toast(
        next
          ? fr ? `Compte de ${switching.name} réactivé` : `${switching.name}'s account restored`
          : fr ? `Compte de ${switching.name} suspendu` : `${switching.name}'s account suspended`,
        "success",
      );
      setSwitching(null);
      await reload();
    } catch (e) {
      const msg = errMessage(e);
      setSwitchError(msg);
      toast(msg, "error");
    } finally {
      setSwitchBusy(false);
    }
  }

  async function changeRole(u: StaffRow, next: string) {
    if (next === u.role) return;
    // A rider / warehouse employee must belong to a warehouse: ask for it first (the role and warehouse are saved together).
    if ((next === "rider" || next === "warehouse_staff") && !u.hubId) {
      setPromoting({ user: u, role: next });
      return;
    }
    setSavingId(u.id);
    try {
      await socketClient.request("roles:setRole", { id: u.id, role: next, ...((next === "rider" || next === "warehouse_staff") && u.hubId ? { hubId: u.hubId } : {}) });
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
        {(form.role === "rider" || form.role === "warehouse_staff") && (
          <HubTierFields hubs={hubs.items} hubId={form.hubId} onHub={(id) => { setForm({ ...form, hubId: id }); setHubError(null); }} tier={form.tier} onTier={(t) => setForm({ ...form, tier: t })} showTier={form.role === "warehouse_staff"} fr={fr} error={hubError} />
        )}
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
              render: (row) => {
                if (row.active === undefined) return <span className="text-slate-400">—</span>;
                const u = row as unknown as StaffRow;
                const canSwitch = ADMIN_FAMILY.includes(u.role) && u.id !== rt.user?.id;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={u.active ? "success" : "danger"}>{u.active ? (fr ? "Actif" : "Active") : fr ? "Inactif" : "Inactive"}</Badge>
                    {canSwitch && (
                      <Button size="sm" variant="secondary" onClick={() => { setSwitchError(null); setSwitching(u); }}>
                        {u.active ? (fr ? "Suspendre" : "Suspend") : fr ? "Réactiver" : "Restore"}
                      </Button>
                    )}
                  </div>
                );
              },
            },
            {
              key: "twofaEnabled",
              label: fr ? "2FA" : "2FA",
              render: (row) => {
                const u = row as unknown as StaffRow;
                const self = u.id === rt.user?.id;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={u.twofaEnabled ? "success" : "default"}>{u.twofaEnabled ? (fr ? "Activée" : "On") : fr ? "Désactivée" : "Off"}</Badge>
                    {u.twofaEnabled && !self && (
                      <Button size="sm" variant="secondary" onClick={() => { setResetError(null); setResetting(u); }}>
                        {fr ? "Réinitialiser" : "Reset"}
                      </Button>
                    )}
                  </div>
                );
              },
            },
            {
              key: "account",
              label: fr ? "Compte" : "Account",
              render: (row) => (
                <div className="flex flex-wrap items-center gap-2">
                  <StaffAccountActions person={row as unknown as StaffRow} selfId={rt.user?.id} onEmailChanged={(id, email) => setStaff((cur) => cur.map((x) => (x.id === id ? { ...x, email } : x)))} />
                </div>
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
                    {u.role === "warehouse_staff" && u.warehouseTier ? ` · ${fr ? TIER_LABEL[u.warehouseTier].fr : TIER_LABEL[u.warehouseTier].en}` : ""}
                  </button>
                );
              },
            },
          ]}
        />
      </div>
      <Modal
        open={!!resetting}
        onClose={() => { if (!resetBusy) setResetting(null); }}
        title={fr ? "Réinitialiser l'authentification à deux facteurs ?" : "Reset two-factor authentication?"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setResetting(null)} disabled={resetBusy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => void resetTwoFactor()} disabled={resetBusy}>{resetBusy ? "…" : fr ? "Réinitialiser" : "Reset"}</Button>
          </>
        }
      >
        <p>
          {resetting
            ? fr
              ? `Cela désactive l'authentification à deux facteurs de ${resetting.name} et la déconnecte partout. La personne devra la configurer de nouveau (tout de suite si la plateforme l'exige). L'action est inscrite au journal d'audit.`
              : `This turns off two-factor authentication for ${resetting.name} and signs them out everywhere. They must set it up again (at once if the platform requires it). The action is recorded in the audit log.`
            : ""}
        </p>
        <ErrorNote message={resetError} />
      </Modal>
      <Modal
        open={!!switching}
        onClose={() => { if (!switchBusy) setSwitching(null); }}
        title={
          switching?.active
            ? fr ? "Suspendre ce compte administrateur ?" : "Suspend this admin account?"
            : fr ? "Réactiver ce compte administrateur ?" : "Restore this admin account?"
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSwitching(null)} disabled={switchBusy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant={switching?.active ? "danger" : "primary"} size="sm" onClick={() => void setActive()} disabled={switchBusy}>
              {switchBusy ? "…" : switching?.active ? (fr ? "Suspendre" : "Suspend") : fr ? "Réactiver" : "Restore"}
            </Button>
          </>
        }
      >
        <p>
          {switching
            ? switching.active
              ? fr
                ? `${switching.name} est déconnecté(e) partout aussitôt et ne peut plus se connecter tant que le compte est suspendu. Son rôle ne change pas. L'action est inscrite au journal d'audit.`
                : `${switching.name} is signed out everywhere at once and cannot sign in while the account is suspended. Their role does not change. The action is recorded in the audit log.`
              : fr
                ? `${switching.name} peut de nouveau se connecter, avec le même rôle. L'action est inscrite au journal d'audit.`
                : `${switching.name} can sign in again, with the same role. The action is recorded in the audit log.`
            : ""}
        </p>
        <ErrorNote message={switchError} />
      </Modal>
      <HomeWarehouseDialog user={placing} hubs={hubs.items} fr={fr} onClose={() => setPlacing(null)} onSaved={() => void reload()} />
      <HomeWarehouseDialog user={promoting?.user ?? null} nextRole={promoting?.role} hubs={hubs.items} fr={fr} onClose={() => setPromoting(null)} onSaved={() => void reload()} />
    </div>
  );
}
