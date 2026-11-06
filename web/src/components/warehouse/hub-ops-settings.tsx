"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InfoGrid } from "@/components/ui/info-grid";
import { OpsError } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { cn } from "@/lib/utils";
import { useHubScope } from "@/lib/warehouse";
import { errorMessage, shortDate } from "@/lib/warehouse-live";
import { saveHubOpsSettings, useHubOpsSettings } from "@/lib/warehouse-ops";
import { COMMON_TIMEZONES, WEEKDAYS, formProblem, formToPatch, settingsToForm, type HubOpsForm } from "@/lib/warehouse-ops-format";

/**
 * How this warehouse runs its floor: working hours, batch size, auto-assignment and the aged-parcel ages. The manager of the
 * warehouse and operations admins edit it (the server decides and audits); everyone else on the warehouse team reads it.
 * Riders are salaried and never accept or refuse a task, so auto-assignment simply gives the task to a rider.
 */
export function HubOpsSettingsCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { hubId } = useHubScope();
  const q = useHubOpsSettings();
  const s = q.data;
  const [form, setForm] = useState<HubOpsForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Follow the server: a first load, a save, or another manager's change replaces the form.
  const key = s ? JSON.stringify([s.hubId, s.updatedAt, s.workStart, s.workEnd, s.workDays, s.timezone, s.batchSize, s.autoAssign, s.agedLevels, s.deliveryTargetHours]) : "";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setForm(settingsToForm(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const title = fr ? "Fonctionnement de l'entrepôt" : "How the warehouse runs";

  if (q.needsHub) {
    return (
      <Card>
        <CardHeader><h2 className="font-semibold text-slate-900">{title}</h2></CardHeader>
        <CardContent><p className="text-sm text-slate-500">{fr ? "Choisissez un entrepôt ci-dessus pour voir et modifier ses réglages." : "Choose a warehouse above to see and change its settings."}</p></CardContent>
      </Card>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s || !form || busy) return;
    const bad = formProblem(form, fr);
    setProblem(bad);
    if (bad) {
      toast(bad, "error");
      return;
    }
    const patch = formToPatch(form, s);
    if (Object.keys(patch).length === 0) {
      toast(fr ? "Aucun changement à enregistrer" : "Nothing to save", "info");
      return;
    }
    setBusy(true);
    try {
      await saveHubOpsSettings(hubId, patch);
      setProblem(null);
      toast(fr ? "Réglages de l'entrepôt enregistrés" : "Warehouse settings saved");
      void q.reload();
    } catch (err) {
      const m = errorMessage(err);
      setProblem(m);
      toast(m, "error");
    } finally {
      setBusy(false);
    }
  }

  const dayName = (id: number) => WEEKDAYS.find((d) => d.id === id)?.[fr ? "fr" : "en"] ?? String(id);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {s && <Badge variant={s.openNow ? "success" : "default"}>{s.openNow ? (fr ? "Ouvert maintenant" : "Open now") : (fr ? "Fermé maintenant" : "Closed now")}</Badge>}
        </div>
        <p className="text-xs text-slate-500">
          {!s
            ? ""
            : s.isDefault
              ? (fr ? "Réglages par défaut : enregistrez pour définir les vôtres." : "Default settings: save to set your own.")
              : (fr ? `Dernier enregistrement par ${s.updatedByName ?? "—"}, ${shortDate(s.updatedAt, locale)}` : `Last saved by ${s.updatedByName ?? "—"}, ${shortDate(s.updatedAt, locale)}`)}
        </p>
      </CardHeader>
      <CardContent>
        {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}
        {!s || !form ? (
          !q.error && <p role="status" className="py-4 text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
        ) : !s.canEdit ? (
          <div className="space-y-3">
            <InfoGrid
              items={[
                { label: fr ? "Heures de travail" : "Working hours", value: `${s.workStart} – ${s.workEnd} (${s.timezone})` },
                { label: fr ? "Jours" : "Days", value: s.workDays.map(dayName).join(", ") },
                { label: fr ? "Taille maximale d'un lot" : "Largest batch", value: s.batchSize },
                { label: fr ? "Attribution automatique" : "Auto-assignment", value: <Badge variant={s.autoAssign ? "success" : "default"}>{s.autoAssign ? (fr ? "Activée" : "On") : (fr ? "Désactivée" : "Off")}</Badge> },
                { label: fr ? "Alertes colis anciens (h)" : "Aged-parcel alerts (h)", value: s.agedLevels.join(" / ") },
                { label: fr ? "Objectif de livraison" : "Delivery-time target", value: `${s.deliveryTargetHours} h` },
              ]}
            />
            <p className="text-xs text-slate-500">{fr ? "Seul le responsable de l'entrepôt (ou un administrateur des opérations) peut les modifier." : "Only the warehouse manager (or an operations admin) can change them."}</p>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-6" noValidate>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Heures de travail" : "Working hours"}</legend>
              <label className="text-xs font-medium text-slate-600">
                {fr ? "Ouverture" : "Opens"}
                <input type="time" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                {fr ? "Fermeture" : "Closes"}
                <input type="time" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} />
              </label>
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-slate-600">{fr ? "Jours de travail" : "Working days"}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = form.workDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setForm({ ...form, workDays: on ? form.workDays.filter((x) => x !== d.id) : [...form.workDays, d.id] })}
                        className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-[var(--border)] text-slate-600 hover:bg-slate-50")}
                      >
                        {fr ? d.fr : d.en}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                {fr ? "Fuseau horaire" : "Time zone"}
                <input list="ops-timezones" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                <datalist id="ops-timezones">{COMMON_TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
              </label>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-slate-800">{fr ? "Lots et attribution" : "Batches and assignment"}</legend>
              <label className="block text-xs font-medium text-slate-600 sm:max-w-xs">
                {fr ? "Taille maximale d'un lot (colis)" : "Largest batch (parcels)"}
                <input inputMode="numeric" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.batchSize} onChange={(e) => setForm({ ...form, batchSize: e.target.value })} />
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-800">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={form.autoAssign} onChange={(e) => setForm({ ...form, autoAssign: e.target.checked })} />
                <span>
                  <span className="font-medium">{fr ? "Attribution automatique" : "Auto-assignment"}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {fr
                      ? "Pendant les heures de travail, chaque nouvelle tâche est confiée au livreur actif le moins occupé de l'entrepôt. Les livreurs n'acceptent ni ne refusent : la tâche arrive directement dans leur liste."
                      : "During working hours, each new task goes to the least busy active rider of the warehouse. Riders do not accept or refuse: the task lands straight in their list."}
                  </span>
                </span>
              </label>
              <label className="block text-xs font-medium text-slate-600 sm:max-w-xs">
                {fr ? "Règle" : "Rule"}
                <select className="input-premium mt-1 w-full px-3 py-2 text-sm" value="least_busy" disabled aria-label={fr ? "Règle d'attribution" : "Assignment rule"}>
                  <option value="least_busy">{fr ? "Livreur le moins occupé" : "Least busy rider"}</option>
                </select>
              </label>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-slate-800">{fr ? "Colis anciens" : "Aged parcels"}</legend>
              <p className="mb-3 text-xs text-slate-500">
                {fr
                  ? "Un trajet encore ouvert après ces durées alerte les superviseurs (niveaux 1 et 2). Le niveau 3, le dernier, remonte au responsable et aux administrateurs."
                  : "A leg still open after these ages alerts the supervisors (levels 1 and 2). Level 3, the last, escalates to the manager and the admins."}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {([0, 1, 2] as const).map((i) => (
                  <label key={i} className="text-xs font-medium text-slate-600">
                    {fr ? `Niveau ${i + 1} (heures)` : `Level ${i + 1} (hours)`}
                    <input
                      inputMode="numeric"
                      className="input-premium mt-1 w-full px-3 py-2 text-sm"
                      value={form.agedLevels[i]}
                      onChange={(e) => {
                        const next = [...form.agedLevels] as HubOpsForm["agedLevels"];
                        next[i] = e.target.value;
                        setForm({ ...form, agedLevels: next });
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-slate-800">{fr ? "Objectif de livraison" : "Delivery-time target"}</legend>
              <label className="block text-xs font-medium text-slate-600 sm:max-w-xs">
                {fr ? "Heures entre l'ouverture du trajet à l'entrepôt et la remise au client" : "Hours from the leg opening at the warehouse to hand-over"}
                <input inputMode="decimal" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.deliveryTargetHours} onChange={(e) => setForm({ ...form, deliveryTargetHours: e.target.value })} />
              </label>
              <p className="mt-1 text-xs text-slate-500">{fr ? "Sert au taux de livraison à l'heure dans les analyses." : "Used for the on-time rate in the analytics."}</p>
            </fieldset>

            {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
            <div>
              <button type="submit" disabled={busy} className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60">
                {busy ? "…" : fr ? "Enregistrer" : "Save"}
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
