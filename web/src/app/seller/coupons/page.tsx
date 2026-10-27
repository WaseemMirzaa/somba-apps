"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess } from "@/lib/seller";
import { localDateTime } from "@/lib/dates";
import { useNow } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { couponActions, useCoupons, usePlanPerks, type SellerCoupon } from "@/lib/seller-promo";
import { formatCurrency } from "@/lib/utils";

interface Form {
  code: string;
  type: "percent" | "fixed";
  value: string;
  minOrder: string;
  maxUses: string;
  perUserLimit: string;
  expiresAt: string;
  isPublic: boolean;
  description: string;
}

const EMPTY: Form = { code: "", type: "percent", value: "", minOrder: "", maxUses: "", perUserLimit: "", expiresAt: "", isPublic: true, description: "" };

/** An ISO instant as the `datetime-local` input wants it (viewer's time zone). */
function toInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SellerCouponsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;
  const coupons = useCoupons();
  const { perks } = usePlanPerks();
  const gated = perks.coupons === false;
  const now = useNow(15_000);

  const [editing, setEditing] = useState<SellerCoupon | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SellerCoupon | null>(null);

  const rows = useMemo(() => [...(coupons.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [coupons.data]);

  function open(c: SellerCoupon | "new") {
    setError(null);
    setEditing(c);
    setForm(
      c === "new"
        ? EMPTY
        : {
            code: c.code,
            type: c.type,
            value: String(c.value),
            minOrder: c.minOrder ? String(c.minOrder) : "",
            maxUses: c.maxUses ? String(c.maxUses) : "",
            perUserLimit: c.perUserLimit ? String(c.perUserLimit) : "",
            expiresAt: toInput(c.expiresAt),
            isPublic: c.isPublic,
            description: c.description ?? "",
          },
    );
  }

  const value = Number(form.value);
  const problems: string[] = [];
  const isNew = editing === "new";
  if (isNew && !/^[A-Za-z0-9_-]{3,40}$/.test(form.code.trim())) problems.push(fr ? "Le code fait 3 à 40 caractères : lettres, chiffres, - ou _." : "The code is 3 to 40 characters: letters, digits, - or _.");
  if (form.type === "percent" && !(Number.isFinite(value) && value >= 1 && value <= 90)) problems.push(fr ? "Une remise en % va de 1 à 90." : "A percentage goes from 1 to 90.");
  if (form.type === "fixed" && !(Number.isFinite(value) && value > 0 && value <= 500)) problems.push(fr ? "Un montant fixe va de 0,01 $ à 500 $." : "A fixed amount goes from $0.01 to $500.");
  if (form.minOrder && !(Number(form.minOrder) >= 0)) problems.push(fr ? "Le minimum de commande doit être positif." : "The minimum order must be zero or more.");
  if (form.maxUses && !(Number.isInteger(Number(form.maxUses)) && Number(form.maxUses) >= 1)) problems.push(fr ? "Le nombre d'utilisations est un entier d'au moins 1." : "Total uses is a whole number, 1 or more.");
  if (form.perUserLimit && !(Number.isInteger(Number(form.perUserLimit)) && Number(form.perUserLimit) >= 1)) problems.push(fr ? "La limite par client est un entier d'au moins 1." : "The per-customer limit is a whole number, 1 or more.");
  if (form.expiresAt && !(new Date(form.expiresAt).getTime() > now)) problems.push(fr ? "La date d'expiration doit être dans le futur." : "The expiry date must be in the future.");

  async function save() {
    if (problems.length || busy || !editing) return;
    setBusy(true);
    setError(null);
    try {
      const common = {
        value,
        minOrder: form.minOrder ? Number(form.minOrder) : 0,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        isPublic: form.isPublic,
        description: form.description.trim() || null,
      };
      if (editing === "new") {
        const c = await couponActions.create({ ...common, code: form.code.trim().toUpperCase(), type: form.type });
        coupons.upsertLocal(c);
        toast(fr ? `Coupon ${c.code} créé` : `Coupon ${c.code} created`);
      } else {
        const c = await couponActions.update(editing.id, common);
        coupons.upsertLocal(c);
        toast(fr ? `Coupon ${c.code} modifié` : `Coupon ${c.code} updated`);
      }
      setEditing(null);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: SellerCoupon) {
    try {
      const next = await couponActions.setActive(c.id, !c.active);
      coupons.upsertLocal(next);
      toast(next.active ? (fr ? `Coupon ${c.code} activé` : `Coupon ${c.code} switched on`) : fr ? `Coupon ${c.code} désactivé` : `Coupon ${c.code} switched off`);
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const r = await couponActions.remove(confirmDelete.id);
      if (r.deleted) {
        coupons.removeLocal(confirmDelete.id);
        toast(fr ? `Coupon ${confirmDelete.code} supprimé` : `Coupon ${confirmDelete.code} deleted`);
      } else {
        if (r.coupon) coupons.upsertLocal(r.coupon);
        toast(
          fr
            ? `Coupon ${confirmDelete.code} déjà utilisé : il est désactivé mais conservé pour vos relevés`
            : `Coupon ${confirmDelete.code} was already used: it is switched off but kept for your records`,
          "info",
        );
      }
      setConfirmDelete(null);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const field = "input-premium mt-1 w-full px-3 py-2 text-sm";
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Coupons de la boutique" : "Store coupons"}
        subtitle={fr ? "Codes de réduction sur vos produits : c'est votre boutique qui finance la remise" : "Discount codes on your products: your store pays for the discount"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: "Coupons" }]}
        actions={
          canEdit ? (
            <Button disabled={gated} onClick={() => open("new")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {fr ? "Créer un coupon" : "Create coupon"}
            </Button>
          ) : undefined
        }
      />

      {gated && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            {fr ? "Votre formule actuelle n'inclut pas les coupons de boutique." : "Your current plan does not include store coupons."}
          </span>
          <Link href="/seller/subscribe" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">
            {fr ? "Changer de formule" : "Upgrade your plan"}
          </Link>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {fr
          ? "Un coupon ne remise que les produits de votre boutique. La remise est déduite de vos gains, la commission est calculée après remise. Un coupon déjà utilisé ne peut pas être supprimé : il est désactivé."
          : "A coupon only discounts your store's products. The discount comes off your earnings, and commission is charged after it. A coupon that was already used cannot be deleted: it is switched off instead."}
      </p>

      {coupons.error && <LoadError message={coupons.error} onRetry={coupons.reload} />}
      <Card>
        <CardContent className="p-0">
          {coupons.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucun coupon. Créez un code pour attirer vos clients." : "No coupons yet. Create a code to bring your customers in."}
              columns={[
                { key: "code", label: "Code", render: (r) => <span className="font-mono font-semibold text-slate-900">{String(r.code)}</span> },
                { key: "value", label: fr ? "Remise" : "Discount", render: (r) => (r.type === "percent" ? `${r.value}%` : formatCurrency(Number(r.value), locale)) },
                { key: "minOrder", label: fr ? "Commande min." : "Min. order", render: (r) => (Number(r.minOrder) > 0 ? formatCurrency(Number(r.minOrder), locale) : "—") },
                { key: "uses", label: fr ? "Utilisations" : "Uses", render: (r) => `${r.uses}${r.maxUses ? ` / ${r.maxUses}` : ""}` },
                { key: "perUserLimit", label: fr ? "Par client" : "Per customer", render: (r) => (r.perUserLimit ? String(r.perUserLimit) : "—") },
                { key: "expiresAt", label: fr ? "Expire" : "Expires", render: (r) => (r.expiresAt ? localDateTime(String(r.expiresAt)) : fr ? "Jamais" : "Never") },
                { key: "isPublic", label: fr ? "Visibilité" : "Visibility", render: (r) => <Badge variant={r.isPublic ? "info" : "default"}>{r.isPublic ? (fr ? "Public" : "Public") : fr ? "Privé" : "Private"}</Badge> },
                {
                  key: "active",
                  label: fr ? "État" : "State",
                  render: (r) => {
                    const expired = !!r.expiresAt && new Date(String(r.expiresAt)).getTime() < now;
                    return expired ? <Badge variant="default">{fr ? "Expiré" : "Expired"}</Badge> : <Badge variant={r.active ? "success" : "warning"}>{r.active ? (fr ? "Actif" : "Active") : fr ? "Désactivé" : "Off"}</Badge>;
                  },
                },
                {
                  key: "actions",
                  label: fr ? "Action" : "Action",
                  render: (r) =>
                    canEdit ? (
                      <div className="flex flex-wrap gap-3 text-sm">
                        <button type="button" onClick={() => open(r as unknown as SellerCoupon)} className="text-[var(--primary)] hover:underline">{fr ? "Modifier" : "Edit"}</button>
                        <button type="button" onClick={() => void toggle(r as unknown as SellerCoupon)} className="text-slate-600 hover:underline">{r.active ? (fr ? "Désactiver" : "Switch off") : fr ? "Activer" : "Switch on"}</button>
                        <button type="button" onClick={() => setConfirmDelete(r as unknown as SellerCoupon)} className="text-red-600 hover:underline">{fr ? "Supprimer" : "Delete"}</button>
                      </div>
                    ) : null,
                },
              ]}
              data={rows as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => !busy && setEditing(null)}
        title={isNew ? (fr ? "Nouveau coupon" : "New coupon") : fr ? `Modifier ${(editing as SellerCoupon | null)?.code ?? ""}` : `Edit ${(editing as SellerCoupon | null)?.code ?? ""}`}
        footer={
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" disabled={busy || problems.length > 0} onClick={() => void save()}>{busy ? "…" : fr ? "Enregistrer" : "Save"}</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">Code
            <input className={`${field} font-mono uppercase`} value={form.code} disabled={!isNew} maxLength={40} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Type de remise" : "Discount type"}
            <select className={field} value={form.type} disabled={!isNew} onChange={(e) => setForm({ ...form, type: e.target.value as Form["type"] })}>
              <option value="percent">{fr ? "Pourcentage (1 à 90 %)" : "Percentage (1 to 90%)"}</option>
              <option value="fixed">{fr ? "Montant fixe (jusqu'à 500 $)" : "Fixed amount (up to $500)"}</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">{form.type === "percent" ? (fr ? "Remise (%)" : "Discount (%)") : fr ? "Remise ($)" : "Discount ($)"}
            <input className={field} type="number" min="0" step={form.type === "percent" ? "1" : "0.01"} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Commande minimum ($, facultatif)" : "Minimum order ($, optional)"}
            <input className={field} type="number" min="0" step="0.01" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Utilisations totales (facultatif)" : "Total uses (optional)"}
            <input className={field} type="number" min="1" step="1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Utilisations par client (facultatif)" : "Uses per customer (optional)"}
            <input className={field} type="number" min="1" step="1" value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">{fr ? "Date d'expiration (facultatif)" : "Expiry date (optional)"}
            <input className={field} type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">{fr ? "Description (facultatif)" : "Description (optional)"}
            <input className={field} value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
            <span>
              {fr ? "Afficher ce coupon sur la page de ma boutique" : "Show this coupon on my store page"}
              <span className="block text-xs text-slate-500">{fr ? "Décoché, le code reste valable mais vous le donnez vous-même." : "Unticked, the code still works but you hand it out yourself."}</span>
            </span>
          </label>
        </div>
        {form.code !== "" || form.value !== "" ? problems.length > 0 && <ul className="space-y-0.5 text-xs text-red-600">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
        <ErrorNote message={error} />
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => !busy && setConfirmDelete(null)}
        title={fr ? "Supprimer ce coupon ?" : "Delete this coupon?"}
        footer={
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDelete(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? "…" : fr ? "Supprimer" : "Delete"}</Button>
          </>
        }
      >
        <p className="text-slate-600">
          {fr
            ? `Le code ${confirmDelete?.code ?? ""} ne fonctionnera plus. S'il a déjà servi, il sera seulement désactivé.`
            : `The code ${confirmDelete?.code ?? ""} will stop working. If it was already used it is only switched off.`}
        </p>
      </Modal>
    </div>
  );
}
