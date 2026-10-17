"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { StoreProfileForm } from "@/components/seller/store-profile-form";
import { PlanSummary } from "@/components/seller/plan-summary";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import {
  GOAL_METRICS,
  useSellerGoals,
  newGoalId,
  type SellerGoal,
  type GoalMetric,
} from "@/context/seller-goals-context";

function MonthlyGoalsEditor() {
  const { goals, saveGoals } = useSellerGoals();
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";

  // Local draft so edits, additions and removals can be reviewed before saving.
  const [draft, setDraft] = useState<SellerGoal[]>(goals);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the draft with the stored goals
    setDraft(goals);
  }, [goals]);

  const update = (id: string, patch: Partial<SellerGoal>) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const invalid = draft.some((g) => !(Number(g.target) > 0));

  function save() {
    if (invalid) return;
    saveGoals(draft.map((g) => ({ ...g, target: Number(g.target) })));
    toast(fr ? "Objectifs enregistrés" : "Goals saved");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fr
          ? "Fixez vos cibles : le tableau de bord les compare à vos chiffres réels des 30 derniers jours. Les cibles sont enregistrées dans ce navigateur uniquement (pas sur le serveur)."
          : "Set your targets: the dashboard compares them with your real figures for the last 30 days. Targets are saved in this browser only (not on the server)."}
      </p>

      <div className="space-y-3">
        {draft.map((g) => (
          <div key={g.id} className="grid gap-3 rounded-xl border border-sky-100 bg-slate-50/50 p-4 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block text-xs font-medium text-slate-500">
              {fr ? "Indicateur" : "Metric"}
              <select
                value={g.metric}
                onChange={(e) => update(g.id, { metric: e.target.value as GoalMetric })}
                className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {GOAL_METRICS.map((m) => (
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
                value={g.target}
                onChange={(e) => update(g.id, { target: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-slate-900"
              />
              {!(Number(g.target) > 0) && <span className="mt-1 block text-red-600">{fr ? "Saisissez une cible supérieure à 0." : "Enter a target above 0."}</span>}
            </label>
            <button
              type="button"
              onClick={() => setDraft((d) => d.filter((x) => x.id !== g.id))}
              className="inline-flex items-center justify-center gap-1 self-end rounded-lg border border-red-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {fr ? "Supprimer" : "Remove"}
            </button>
          </div>
        ))}
        {draft.length === 0 && (
          <p className="rounded-xl border border-dashed border-sky-200 p-6 text-center text-sm text-slate-500">
            {fr ? "Aucun objectif. Ajoutez-en un ci-dessous." : "No goals yet. Add one below."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDraft((d) => [...d, { id: newGoalId(), metric: "revenue", target: 1000 }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-blue-50"
        >
          <Plus className="h-4 w-4" />
          {fr ? "Ajouter un objectif" : "Add goal"}
        </button>
        <button type="button" onClick={save} disabled={invalid} className="btn-primary rounded-lg px-6 py-2 text-sm font-medium disabled:opacity-50">
          {fr ? "Enregistrer les objectifs" : "Save goals"}
        </button>
      </div>
    </div>
  );
}

export default function SellerSettingsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings")} subtitle={fr ? "Profil de la boutique, offre, adresse de collecte et objectifs" : "Store profile, plan, pickup address and goals"} breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("settings") }]} />

      <DetailGrid>
        <DetailGridSection title={fr ? "Profil de la boutique" : "Store Profile"} span={3}>
          <StoreProfileForm />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Offre et quota d'annonces" : "Plan and listing quota"} span={3}>
          <PlanSummary />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Objectifs" : "Goals"} span={3}>
          <MonthlyGoalsEditor />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
