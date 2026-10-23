"use client";

import { localDateTime } from "@/lib/dates";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { ErrorNote } from "@/components/admin/modal";
import { CampaignDetailModal, CampaignPhaseBadge, CampaignScopeLine } from "@/components/admin/campaign-detail";
import { SectionError } from "@/components/admin/query-state";
import { Tag, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList, type CampaignRow, type PromoRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

const statusVariant: Record<string, "warning" | "success" | "danger" | "info" | "default"> = {
  pending: "warning",
  active: "success",
  scheduled: "info",
  rejected: "danger",
  ended: "default",
  draft: "default",
};
const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  active: "Active",
  scheduled: "Planifiée",
  rejected: "Rejetée",
  ended: "Terminée",
  draft: "Brouillon",
};

const EMPTY_PROMO = { code: "", type: "percent", value: "", minOrder: "", maxUses: "", perUserLimit: "", expiresAt: "", isPublic: true, description: "" };

export default function AdminPromotionsPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const { items: campaigns, setItems: setCampaigns, error: campErr, reload: reloadCampaigns, loading: campLoading } = useServerList<CampaignRow>("campaigns:list", { pushEvents: ["campaign:updated"] });
  const { items: promos, setItems: setPromos, reload: reloadPromos, error: promoErr, loading: promoLoading } = useServerList<PromoRow>("promos:list", { pushEvents: ["promo:updated"] });
  const [tab, setTab] = useState("campaigns");
  const [filter, setFilter] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = campaigns.find((c) => c.id === detailId) ?? null;
  const [form, setForm] = useState(EMPTY_PROMO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pending = campaigns.filter((c) => c.status === "pending").length;
  const approved = campaigns.filter((c) => c.status === "active" || c.status === "scheduled").length;
  const rejected = campaigns.filter((c) => c.status === "rejected").length;
  const shown = filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter);

  async function decide(c: CampaignRow, status: "active" | "rejected") {
    setBusyId(c.id);
    try {
      const updated = await socketClient.request<CampaignRow>("campaigns:setStatus", { id: c.id, status });
      setCampaigns((cur) => cur.map((x) => (x.id === c.id ? { ...x, ...updated } : x)));
      toast(status === "active" ? (fr ? "Campagne approuvée" : "Campaign approved") : fr ? "Campagne rejetée" : "Campaign rejected", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function setPromoActive(p: PromoRow, active: boolean) {
    setBusyId(p.id);
    try {
      const updated = await socketClient.request<Partial<PromoRow> | null>("promos:setActive", { id: p.id, active });
      setPromos((cur) => cur.map((x) => (x.id === p.id ? { ...x, ...(updated && typeof updated === "object" ? updated : {}), active } : x)));
      toast(
        active ? (fr ? "Code promo réactivé" : "Promo code resumed") : fr ? "Code promo mis en pause" : "Promo code paused",
        "success",
      );
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function createPromo() {
    setSaving(true);
    setFormError(null);
    try {
      await socketClient.request("promos:create", {
        code: form.code.trim(),
        type: form.type,
        value: form.value === "" ? undefined : Number(form.value),
        ...(form.minOrder !== "" ? { minOrder: Number(form.minOrder) } : {}),
        ...(form.maxUses !== "" ? { maxUses: Number(form.maxUses) } : {}),
        ...(form.perUserLimit !== "" ? { perUserLimit: Number(form.perUserLimit) } : {}),
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
        isPublic: form.isPublic,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
      setForm(EMPTY_PROMO);
      await reloadPromos();
      toast(fr ? "Code promo créé" : "Promo code created", "success");
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Promotions" : "Promotions"}
        subtitle={fr ? "Codes promo de la plateforme et demandes de campagne des vendeurs" : "Platform promo codes and seller campaign requests"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Promotions" : "Promotions" }]}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "campaigns", label: `${fr ? "Demandes de campagne" : "Campaign requests"} (${pending})` },
          { id: "codes", label: `${fr ? "Codes promo" : "Promo codes"} (${promos.length})` },
        ]}
      />

      {tab === "campaigns" && (
        <>
          {campErr && <SectionError message={campErr} onRetry={reloadCampaigns} />}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title={fr ? "En attente" : "Pending"} value={pending} icon={Clock} />
            <StatCard title={fr ? "Approuvées" : "Approved"} value={approved} icon={CheckCircle2} />
            <StatCard title={fr ? "Rejetées" : "Rejected"} value={rejected} icon={XCircle} />
          </div>
          <Tabs
            active={filter}
            onChange={setFilter}
            tabs={[
              { id: "pending", label: fr ? "En attente" : "Pending" },
              { id: "active", label: fr ? "Actives" : "Active" },
              { id: "rejected", label: fr ? "Rejetées" : "Rejected" },
              { id: "all", label: fr ? "Toutes" : "All" },
            ]}
          />
          <div className="card-premium overflow-hidden">
            <DataTable
              data={shown as unknown as Record<string, unknown>[]}
              emptyMessage={campLoading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucune campagne" : "No campaigns"}
              columns={[
                {
                  key: "name",
                  label: fr ? "Campagne" : "Campaign",
                  render: (row) => {
                    const c = row as unknown as CampaignRow;
                    return (
                      <div>
                        <p className="font-semibold text-slate-900">{fr ? c.nameFr || c.name : c.name}</p>
                        <p className="text-xs text-slate-400">{c.sellerName ?? "—"} · {c.reference}</p>
                      </div>
                    );
                  },
                },
                { key: "discount", label: fr ? "Remise" : "Discount", render: (row) => <span className="font-semibold">{Number(row.discount)}%</span> },
                { key: "productCount", label: fr ? "Produits concernés" : "Products covered", render: (row) => <span className="text-xs text-slate-600"><CampaignScopeLine campaign={row as unknown as CampaignRow} /></span> },
                { key: "budgetUsd", label: "Budget", render: (row) => formatCurrency(Number(row.budgetUsd), locale) },
                { key: "startDate", label: fr ? "Période" : "Window", render: (row) => <span className="text-xs text-slate-500">{String(row.startDate ?? "—")} → {String(row.endDate ?? "—")}</span> },
                { key: "status", label: fr ? "Statut" : "Status", render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={statusVariant[String(row.status)] ?? "default"}>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge>
                    <CampaignPhaseBadge campaign={row as unknown as CampaignRow} />
                  </div>
                ) },
                {
                  key: "actions",
                  label: "",
                  render: (row) => {
                    const c = row as unknown as CampaignRow;
                    return (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setDetailId(c.id)} className="text-sm font-medium text-[var(--primary)] hover:underline">{fr ? "Détails" : "Details"}</button>
                        {c.status === "pending" && (<>
                        <button disabled={busyId === c.id} onClick={() => decide(c, "active")} className="text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50">{fr ? "Approuver" : "Approve"}</button>
                        <button disabled={busyId === c.id} onClick={() => decide(c, "rejected")} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50">{fr ? "Rejeter" : "Reject"}</button>
                        </>)}
                      </div>
                    );
                  },
                },
              ]}
            />
          </div>
        </>
      )}

      <CampaignDetailModal campaign={detail} onClose={() => setDetailId(null)} />

      {tab === "codes" && (
        <>
          {promoErr && <SectionError message={promoErr} onRetry={reloadPromos} />}
          <div className="card-premium space-y-4 p-6">
            <h3 className="flex items-center gap-2 font-semibold"><Tag className="h-4 w-4 text-[var(--primary)]" />{fr ? "Nouveau code promo" : "New promo code"}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input className="input-premium px-4 py-2 text-sm uppercase" placeholder={fr ? "Code (ex. BIENVENUE10)" : "Code (e.g. WELCOME10)"} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <select className="input-premium px-4 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percent">{fr ? "Pourcentage (%)" : "Percent (%)"}</option>
                <option value="fixed">{fr ? "Montant fixe ($)" : "Fixed amount ($)"}</option>
              </select>
              <input className="input-premium px-4 py-2 text-sm" inputMode="decimal" placeholder={form.type === "percent" ? (fr ? "Valeur (1 à 90)" : "Value (1 to 90)") : fr ? "Valeur ($)" : "Value ($)"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm" inputMode="decimal" placeholder={fr ? "Commande min. ($, optionnel)" : "Min order ($, optional)"} value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm" inputMode="numeric" placeholder={fr ? "Utilisations max. (optionnel)" : "Max uses (optional)"} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm" inputMode="numeric" placeholder={fr ? "Limite par client (optionnel)" : "Per-customer limit (optional)"} value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
              <div>
                <input type="datetime-local" className="input-premium w-full px-4 py-2 text-sm" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} aria-label={fr ? "Expire le" : "Expires"} />
                <p className="mt-1 text-xs text-slate-400">{fr ? "Expiration (optionnel)" : "Expiry (optional)"}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
                {fr ? "Visible dans l'écran Coupons" : "Listed in the Coupons screen"}
              </label>
              <input className="input-premium px-4 py-2 text-sm sm:col-span-2 lg:col-span-4" placeholder={fr ? "Description (optionnel)" : "Description (optional)"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <ErrorNote message={formError} />
            <Button onClick={createPromo} disabled={saving}>{saving ? "…" : fr ? "Créer le code" : "Create code"}</Button>
          </div>

          <div className="card-premium overflow-hidden">
            <DataTable
              data={promos as unknown as Record<string, unknown>[]}
              emptyMessage={promoLoading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucun code promo" : "No promo codes yet"}
              columns={[
                { key: "code", label: "Code", render: (row) => <span className="font-mono font-semibold text-slate-900">{String(row.code)}</span> },
                { key: "value", label: fr ? "Remise" : "Discount", render: (row) => <span>{row.type === "percent" ? `${row.value}%` : formatCurrency(Number(row.value), locale)}</span> },
                { key: "minOrder", label: fr ? "Min." : "Min order", render: (row) => (Number(row.minOrder) > 0 ? formatCurrency(Number(row.minOrder), locale) : "—") },
                { key: "maxUses", label: fr ? "Limites" : "Limits", render: (row) => <span className="text-xs text-slate-500">{row.maxUses != null ? `${row.maxUses} ${fr ? "total" : "total"}` : fr ? "illimité" : "unlimited"}{row.perUserLimit != null ? ` · ${row.perUserLimit}/${fr ? "client" : "customer"}` : ""}</span> },
                { key: "expiresAt", label: fr ? "Expire" : "Expires", render: (row) => <span className="text-xs text-slate-500">{row.expiresAt ? localDateTime(String(row.expiresAt)) : "—"}</span> },
                { key: "isPublic", label: fr ? "Visibilité" : "Visibility", render: (row) => <Badge variant={row.isPublic ? "info" : "default"}>{row.isPublic ? (fr ? "Public" : "Public") : fr ? "Privé" : "Private"}</Badge> },
                { key: "active", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={row.active ? "success" : "default"}>{row.active ? (fr ? "Actif" : "Active") : fr ? "En pause" : "Paused"}</Badge> },
                {
                  key: "actions",
                  label: "",
                  render: (row) => {
                    const p = row as unknown as PromoRow;
                    return (
                      <Button
                        size="sm"
                        variant={p.active ? "reject" : "approve"}
                        disabled={busyId === p.id}
                        onClick={() => setPromoActive(p, !p.active)}
                      >
                        {p.active ? (fr ? "Mettre en pause" : "Pause") : fr ? "Reprendre" : "Resume"}
                      </Button>
                    );
                  },
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
