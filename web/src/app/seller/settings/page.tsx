"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { GoalProgress } from "@/components/charts/dashboard-charts";
import { useSellerData } from "@/lib/seller";
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
          ? "Créez et modifiez les objectifs mensuels affichés sur votre tableau de bord."
          : "Create and edit the monthly goals shown on your dashboard."}
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
  const { toast } = useToast();
  const fr = locale === "fr";
  const { storeSettings, updateStore } = useSellerData();

  const permissions: { en: string; fr: string }[] = [
    { en: "Products", fr: "Produits" },
    { en: "Orders", fr: "Commandes" },
    { en: "Finance", fr: "Finance" },
    { en: "Analytics", fr: "Analyses" },
    { en: "Support", fr: "Support" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings")} subtitle={fr ? "Profil de la boutique, informations sur l'entreprise, équipe et permissions" : "Store profile, business info, team & permissions"} breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("settings") }]} />

      <DetailGrid>
        <DetailGridSection title={fr ? "Profil de la boutique" : "Store Profile"} span={2}>
          <InfoGrid items={[
            { label: fr ? "Nom de la boutique" : "Store Name", value: storeSettings.storeName },
            { label: fr ? "Description" : "Description", value: fr ? storeSettings.descriptionFr : storeSettings.description, full: true },
          ]} />
          <div className="mt-4 flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed border-sky-200 text-sm text-slate-400">
            {fr ? "Téléversement logo et bannière (démo)" : "Logo & Banner upload (mock)"}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Entreprise" : "Business"}>
          <InfoGrid items={[
            { label: fr ? "Nom de l'entreprise" : "Business Name", value: storeSettings.businessName },
            { label: fr ? "Numéro fiscal" : "Tax ID", value: storeSettings.taxId },
            { label: fr ? "Téléphone" : "Phone", value: storeSettings.phone },
            { label: fr ? "E-mail" : "Email", value: storeSettings.email },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Objectifs mensuels" : "Monthly Goals"} span={3}>
          <MonthlyGoalsEditor />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Permissions de rôle" : "Role Permissions"} span={2}>
          <div className="space-y-3 text-sm">
            {permissions.map((perm) => (
              <div key={perm.en} className="flex items-center justify-between rounded-lg border border-sky-50 p-3">
                <span>{fr ? perm.fr : perm.en}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-sky-300" />
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Membres de l'équipe" : "Team Members"} span={3}>
          <DataTable
            columns={[
              { key: "name", label: fr ? "Nom" : "Name" },
              { key: "role", label: fr ? "Rôle" : "Role", render: (row) => (fr ? String(row.roleFr ?? row.role) : String(row.role)) },
              { key: "email", label: fr ? "E-mail" : "Email" },
              { key: "status", label: t("status"), render: (row) => <Badge variant="success">{fr ? (String(row.status) === "active" ? "Actif" : String(row.status)) : String(row.status)}</Badge> },
            ]}
            data={storeSettings.teamMembers as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>

      <button onClick={async () => { await updateStore({ name: storeSettings.storeName }); toast(fr ? "Paramètres enregistrés avec succès" : "Settings saved successfully"); }} className="btn-primary rounded-lg px-6 py-2 text-sm font-medium">{fr ? "Enregistrer les paramètres" : "Save Settings"}</button>
    </div>
  );
}
