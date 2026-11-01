"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { StoreProfileForm } from "@/components/seller/store-profile-form";
import { PlanSummary } from "@/components/seller/plan-summary";
import { ChangePasswordForm, TwoFactorCard } from "@/components/seller/account-security";
import { DeleteAccountCard, LeaveTeamCard, NotificationPrefs, PayoutAccountCard } from "@/components/seller/account-prefs";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { GOAL_METRICS, useSellerGoals, type SellerGoal, type GoalMetric } from "@/context/seller-goals-context";
import { useSellerAccess, useStoreGate } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { TEAM_ROLE_LABEL } from "@/lib/seller-access";

function MonthlyGoalsEditor() {
  const { goals, saveGoals, canEdit } = useSellerGoals();
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [busy, setBusy] = useState(false);

  // Local draft so edits, additions and removals can be reviewed before saving.
  const [draft, setDraft] = useState<SellerGoal[]>(goals);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the draft with the stored goals
    setDraft(goals);
  }, [goals]);

  const update = (id: string, patch: Partial<SellerGoal>) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const maxOf = (m: GoalMetric) => GOAL_METRICS.find((x) => x.value === m)?.max ?? Infinity;
  const invalid = draft.some((g) => !(Number(g.target) > 0) || Number(g.target) > maxOf(g.metric));
  const unused = GOAL_METRICS.filter((m) => !draft.some((g) => g.metric === m.value));

  async function save() {
    if (invalid || busy) return;
    setBusy(true);
    try {
      await saveGoals(draft.map((g) => ({ ...g, target: Number(g.target) })));
      toast(fr ? "Objectifs enregistrés" : "Goals saved");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fr
          ? "Fixez vos cibles : le tableau de bord les compare à vos chiffres réels des 30 derniers jours. Elles sont enregistrées sur votre compte et suivent votre boutique sur tous vos appareils."
          : "Set your targets: the dashboard compares them with your real figures for the last 30 days. They are saved on your account and follow your store on every device."}
      </p>

      <div className="space-y-3">
        {draft.map((g) => (
          <div key={g.id} className="grid gap-3 rounded-xl border border-sky-100 bg-slate-50/50 p-4 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block text-xs font-medium text-slate-500">
              {fr ? "Indicateur" : "Metric"}
              <select
                value={g.metric}
                disabled={!canEdit}
                onChange={(e) => update(g.id, { metric: e.target.value as GoalMetric, id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {GOAL_METRICS.filter((m) => m.value === g.metric || unused.some((u) => u.value === m.value)).map((m) => (
                  <option key={m.value} value={m.value}>{fr ? m.labelFr : m.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-500">
              {fr ? "Cible" : "Target"}
              <input
                type="number"
                min="0"
                step="any"
                disabled={!canEdit}
                value={g.target}
                onChange={(e) => update(g.id, { target: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-slate-900"
              />
              {!(Number(g.target) > 0) && <span className="mt-1 block text-red-600">{fr ? "Saisissez une cible supérieure à 0." : "Enter a target above 0."}</span>}
              {Number(g.target) > maxOf(g.metric) && <span className="mt-1 block text-red-600">{fr ? `Au maximum ${maxOf(g.metric).toLocaleString("fr-FR")}.` : `At most ${maxOf(g.metric).toLocaleString("en-US")}.`}</span>}
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== g.id))}
                className="inline-flex items-center justify-center gap-1 self-end rounded-lg border border-red-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {fr ? "Supprimer" : "Remove"}
              </button>
            )}
          </div>
        ))}
        {draft.length === 0 && (
          <p className="rounded-xl border border-dashed border-sky-200 p-6 text-center text-sm text-slate-500">
            {fr ? "Aucun objectif. Ajoutez-en un ci-dessous." : "No goals yet. Add one below."}
          </p>
        )}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {unused.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft((d) => [...d, { id: unused[0].value, metric: unused[0].value, target: unused[0].value === "rating" ? 4.5 : 100 }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              {fr ? "Ajouter un objectif" : "Add goal"}
            </button>
          )}
          <button type="button" onClick={() => void save()} disabled={invalid || busy} className="btn-primary rounded-lg px-6 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer les objectifs" : "Save goals"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{fr ? "Seuls le propriétaire et les gestionnaires peuvent modifier les objectifs." : "Only the owner and managers can change the goals."}</p>
      )}
    </div>
  );
}

export default function SellerSettingsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const access = useSellerAccess();
  const { seller } = useStoreGate();
  const staff = !access.isOwner;
  const role = TEAM_ROLE_LABEL[access.role];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={fr ? "Boutique, offre, notifications, sécurité, versements et objectifs" : "Store, plan, notifications, security, payouts and goals"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("settings") }]}
      />

      {staff && (
        <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-testid="team-role-note">
          {fr
            ? `Vous travaillez pour « ${seller?.name ?? ""} » avec le rôle ${role.fr}. ${role.descFr}`
            : `You work for "${seller?.name ?? ""}" with the ${role.en} role. ${role.descEn}`}
        </p>
      )}

      <DetailGrid>
        {access.can("storefront") && (
          <DetailGridSection title={fr ? "Profil de la boutique" : "Store Profile"} span={3}>
            <StoreProfileForm />
          </DetailGridSection>
        )}

        {access.can("account") && (
          <DetailGridSection title={fr ? "Offre et quota d'annonces" : "Plan and listing quota"} span={3}>
            <PlanSummary />
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Notifications" : "Notifications"} span={3}>
          <NotificationPrefs />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Mot de passe" : "Password"} span={3}>
          <ChangePasswordForm />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Authentification à deux facteurs" : "Two-factor authentication"} span={3}>
          <TwoFactorCard />
        </DetailGridSection>

        {access.can("payout_account") && (
          <DetailGridSection title={fr ? "Compte de versement" : "Payout account"} span={3}>
            <PayoutAccountCard />
          </DetailGridSection>
        )}

        {access.can("insight") && (
          <DetailGridSection title={fr ? "Objectifs" : "Goals"} span={3}>
            <MonthlyGoalsEditor />
          </DetailGridSection>
        )}

        {staff ? (
          <DetailGridSection title={fr ? "Équipe" : "Team"} span={3}>
            <LeaveTeamCard storeName={seller?.name ?? ""} />
          </DetailGridSection>
        ) : (
          <DetailGridSection title={fr ? "Zone sensible" : "Danger zone"} span={3}>
            <DeleteAccountCard />
          </DetailGridSection>
        )}
      </DetailGrid>
    </div>
  );
}
