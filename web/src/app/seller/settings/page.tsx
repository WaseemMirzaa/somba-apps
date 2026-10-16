"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { GoalProgress } from "@/components/charts/dashboard-charts";
import { StoreProfileForm } from "@/components/seller/store-profile-form";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import {
  useSellerGoals,
  newGoalId,
  type SellerGoal,
  type GoalMetric,
} from "@/context/seller-goals-context";

const METRIC_OPTIONS: { value: GoalMetric; label: string; labelFr: string }[] = [
  { value: "currency", label: "Currency ($)", labelFr: "Devise ($)" },
  { value: "number", label: "Number", labelFr: "Nombre" },
  { value: "percent", label: "Percent (%)", labelFr: "Pourcentage (%)" },
];

function MonthlyGoalsEditor() {
  const { goals, saveGoals, resetGoals } = useSellerGoals();
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";

  // Local draft so edits, additions and removals can be reviewed before saving.
  const [draft, setDraft] = useState<SellerGoal[]>(goals);
  useEffect(() => {
    setDraft(goals);
  }, [goals]);

  function update(id: string, patch: Partial<SellerGoal>) {
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function removeGoal(id: string) {
    setDraft((d) => d.filter((g) => g.id !== id));
  }
  function addGoal() {
    setDraft((d) => [
      ...d,
      { id: newGoalId(), label: "New goal", labelFr: "Nouvel objectif", metric: "number", current: 0, target: 100 },
    ]);
  }
  function save() {
    const cleaned = draft
      .filter((g) => g.label.trim() || g.labelFr.trim())
      .map((g) => ({
        ...g,
        label: g.label.trim() || g.labelFr.trim(),
        labelFr: g.labelFr.trim() || g.label.trim(),
        current: Number(g.current) || 0,
        target: Number(g.target) || 0,
      }));
    saveGoals(cleaned);
    toast(fr ? "Objectifs enregistrés avec succès" : "Goals saved successfully");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fr
          ? "Objectifs personnels affichés sur votre tableau de bord. Ils sont enregistrés dans ce navigateur uniquement (pas sur le serveur) et les valeurs « actuel » se saisissent à la main."
          : "Personal targets shown on your dashboard. They are saved in this browser only (not on the server) and the “current” values are typed by hand."}
      </p>

      <div className="space-y-4">
        {draft.map((g) => (
          <div key={g.id} className="rounded-xl border border-sky-100 bg-slate-50/50 p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-500">
                  {fr ? "Nom (EN)" : "Label (EN)"}
                  <input
                    value={g.label}
                    onChange={(e) => update(g.id, { label: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-slate-900"
                    placeholder={fr ? "ex. Objectif revenu" : "e.g. Revenue goal"}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  {fr ? "Nom (FR)" : "Label (FR)"}
                  <input
                    value={g.labelFr}
                    onChange={(e) => update(g.id, { labelFr: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-slate-900"
                    placeholder={fr ? "ex. Objectif revenu" : "e.g. Objectif revenu"}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  {fr ? "Type" : "Metric"}
                  <select
                    value={g.metric}
                    onChange={(e) => update(g.id, { metric: e.target.value as GoalMetric })}
                    className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {METRIC_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {fr ? m.labelFr : m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-slate-500">
                    {fr ? "Actuel" : "Current"}
                    <input
                      type="number"
                      value={g.current}
                      onChange={(e) => update(g.id, { current: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    {fr ? "Cible" : "Target"}
                    <input
                      type="number"
                      value={g.target}
                      onChange={(e) => update(g.id, { target: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-sky-200 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:justify-between">
                <GoalProgress
                  label={fr ? g.labelFr || g.label : g.label || g.labelFr}
                  current={g.current}
                  target={g.target}
                  unit={g.metric === "percent" ? "%" : ""}
                  format={g.metric === "currency" ? (n) => formatCurrency(n, locale) : undefined}
                />
                <button
                  type="button"
                  onClick={() => removeGoal(g.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {fr ? "Supprimer" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ))}

        {draft.length === 0 && (
          <p className="rounded-xl border border-dashed border-sky-200 p-6 text-center text-sm text-slate-400">
            {fr ? "Aucun objectif. Ajoutez-en un ci-dessous." : "No goals yet. Add one below."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addGoal}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-blue-50"
        >
          <Plus className="h-4 w-4" />
          {fr ? "Ajouter un objectif" : "Add goal"}
        </button>
        <button
          type="button"
          onClick={save}
          className="btn-primary rounded-lg px-6 py-2 text-sm font-medium"
        >
          {fr ? "Enregistrer les objectifs" : "Save goals"}
        </button>
        <button
          type="button"
          onClick={() => {
            resetGoals();
            toast(fr ? "Objectifs réinitialisés" : "Goals reset to defaults");
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {fr ? "Réinitialiser" : "Reset to defaults"}
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
      <PageHeader title={t("settings")} subtitle={fr ? "Profil de la boutique, adresse de collecte et objectifs" : "Store profile, pickup address and goals"} breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("settings") }]} />

      <DetailGrid>
        <DetailGridSection title={fr ? "Profil de la boutique" : "Store Profile"} span={3}>
          <StoreProfileForm />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Objectifs mensuels" : "Monthly Goals"} span={3}>
          <MonthlyGoalsEditor />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
