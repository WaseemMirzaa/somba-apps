"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

/** One seller subscription plan, as stored in the `sellerPlans` setting. */
export interface PlanDraft {
  id: string;
  name: string;
  nameFr: string;
  /** Empty string = "contact sales" (cannot be bought online). */
  priceUsd: string;
  months: string;
  /** Empty string = unlimited. */
  maxProducts: string;
  popular: boolean;
  features: string;
  featuresFr: string;
}

interface ServerPlan {
  id: string;
  name: string;
  nameFr?: string;
  priceUsd: number | null;
  months: number;
  maxProducts?: number | null;
  features: string[];
  featuresFr?: string[];
  popular?: boolean;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,19}$/;

function toDraft(p: ServerPlan): PlanDraft {
  return {
    id: p.id,
    name: p.name,
    nameFr: p.nameFr ?? "",
    priceUsd: p.priceUsd === null ? "" : String(p.priceUsd),
    months: String(p.months ?? 1),
    maxProducts: p.maxProducts ? String(p.maxProducts) : "",
    popular: !!p.popular,
    features: (p.features ?? []).join("\n"),
    featuresFr: (p.featuresFr ?? []).join("\n"),
  };
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Validate the drafts the same way the server does (api/src/content/plans.ts). Returns one message per problem. */
export function validatePlanDrafts(drafts: PlanDraft[], fr: boolean): string[] {
  const errs: string[] = [];
  if (drafts.length < 1 || drafts.length > 10) errs.push(fr ? "Il faut entre 1 et 10 formules." : "There must be 1 to 10 plans.");
  const seen = new Set<string>();
  drafts.forEach((d, i) => {
    const tag = `#${i + 1} ${d.id || ""}`.trim();
    if (!ID_RE.test(d.id.trim())) errs.push(`${tag}: ${fr ? "identifiant de 2 à 20 caractères (minuscules, chiffres, - ou _)." : "id must be 2-20 characters: lowercase letters, digits, - or _."}`);
    if (seen.has(d.id.trim())) errs.push(`${tag}: ${fr ? "identifiant en double." : "duplicate id."}`);
    seen.add(d.id.trim());
    if (d.name.trim().length < 1 || d.name.trim().length > 60) errs.push(`${tag}: ${fr ? "nom de 1 à 60 caractères." : "name must be 1-60 characters."}`);
    if (d.nameFr.trim().length > 60) errs.push(`${tag}: ${fr ? "nom FR : 60 caractères maximum." : "French name: 60 characters at most."}`);
    if (d.priceUsd.trim() !== "") {
      const p = Number(d.priceUsd);
      if (!Number.isFinite(p) || p < 0 || p > 100000) errs.push(`${tag}: ${fr ? "prix entre 0 et 100000 (vide = nous contacter)." : "price must be 0 to 100000 (empty = contact sales)."}`);
    }
    const m = Number(d.months);
    if (!Number.isInteger(m) || m < 1 || m > 24) errs.push(`${tag}: ${fr ? "durée : entier de 1 à 24 mois." : "length: a whole number of months from 1 to 24."}`);
    if (d.maxProducts.trim() !== "") {
      const q = Number(d.maxProducts);
      if (!Number.isInteger(q) || q < 1 || q > 1_000_000) errs.push(`${tag}: ${fr ? "limite de produits : entier de 1 à 1 000 000 (vide = illimité)." : "product limit: a whole number from 1 to 1,000,000 (empty = unlimited)."}`);
    }
    for (const [label, text] of [["features", d.features], ["featuresFr", d.featuresFr]] as const) {
      const l = lines(text);
      if (l.length > 20 || l.some((x) => x.length > 120)) errs.push(`${tag}: ${label}: ${fr ? "20 lignes maximum, 120 caractères chacune." : "up to 20 lines, 120 characters each."}`);
    }
  });
  return errs;
}

export function draftsToPlans(drafts: PlanDraft[]): ServerPlan[] {
  return drafts.map((d) => ({
    id: d.id.trim(),
    name: d.name.trim(),
    ...(d.nameFr.trim() ? { nameFr: d.nameFr.trim() } : {}),
    priceUsd: d.priceUsd.trim() === "" ? null : Number(d.priceUsd),
    months: Number(d.months),
    ...(d.maxProducts.trim() !== "" ? { maxProducts: Number(d.maxProducts) } : {}),
    features: lines(d.features),
    ...(lines(d.featuresFr).length ? { featuresFr: lines(d.featuresFr) } : {}),
    ...(d.popular ? { popular: true } : {}),
  }));
}

function parseJsonDrafts(text: string, fr: boolean): { drafts?: PlanDraft[]; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { error: `${fr ? "JSON invalide" : "Invalid JSON"}: ${(e as Error).message}` };
  }
  if (!Array.isArray(raw)) return { error: fr ? "Le JSON doit être une liste de formules." : "The JSON must be a list of plans." };
  try {
    return { drafts: (raw as ServerPlan[]).map((p) => toDraft({ ...p, id: String(p?.id ?? ""), name: String(p?.name ?? ""), months: Number(p?.months ?? 1), features: Array.isArray(p?.features) ? p.features.map(String) : [] })) };
  } catch {
    return { error: fr ? "Formules illisibles." : "Unreadable plans." };
  }
}

/**
 * Editor for the `sellerPlans` setting. Loads the saved value (or the server
 * defaults from `sellers:plans`), validates before sending, and saves through
 * `settings:set`. The server's own validation message is shown when it refuses.
 */
export function PlansEditor({ saved, onSaved }: { saved: string | undefined; onSaved: (all: Record<string, string>) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<PlanDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const plans = saved ? (JSON.parse(saved) as ServerPlan[]) : await socketClient.request<ServerPlan[]>("sellers:plans");
        if (alive) {
          setDrafts(plans.map(toDraft));
          setDirty(false);
          setLoadError(null);
        }
      } catch (e) {
        if (alive) setLoadError(errMsg(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [saved, attempt]);

  function update(i: number, patch: Partial<PlanDraft>) {
    setDrafts((cur) => (cur ? cur.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) : cur));
    setDirty(true);
  }

  function addPlan() {
    setDrafts((cur) => [...(cur ?? []), { id: "", name: "", nameFr: "", priceUsd: "0", months: "1", maxProducts: "", popular: false, features: "", featuresFr: "" }]);
    setDirty(true);
  }

  function switchMode(toJson: boolean) {
    if (!drafts) return;
    if (toJson) {
      setJsonText(JSON.stringify(draftsToPlans(drafts), null, 2));
      setJsonMode(true);
      setProblems([]);
    } else {
      const r = parseJsonDrafts(jsonText, fr);
      if (r.error || !r.drafts) {
        setProblems([r.error ?? ""]);
        return;
      }
      setDrafts(r.drafts);
      setJsonMode(false);
      setProblems([]);
    }
  }

  async function save() {
    setServerError(null);
    let current = drafts;
    if (jsonMode) {
      const r = parseJsonDrafts(jsonText, fr);
      if (r.error || !r.drafts) {
        setProblems([r.error ?? ""]);
        return;
      }
      current = r.drafts;
    }
    if (!current) return;
    const errs = validatePlanDrafts(current, fr);
    setProblems(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const all = await socketClient.request<Record<string, string>>("settings:set", { key: "sellerPlans", value: JSON.stringify(draftsToPlans(current)) });
      toast(fr ? "Formules enregistrées" : "Plans saved", "success");
      onSaved(all);
      setDirty(false);
    } catch (e) {
      setServerError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <SectionError message={loadError} onRetry={() => setAttempt((a) => a + 1)} />;
  if (!drafts) return <SectionLoading />;

  const input = "input-premium w-full px-3 py-2 text-sm";
  const label = "block text-xs font-medium text-slate-500";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {fr
            ? "Seule la limite de produits est appliquée par le serveur ; les lignes de fonctionnalités sont informatives. Prix vide = « nous contacter » (non achetable en ligne)."
            : "Only the product limit is enforced by the server; feature lines are display text. An empty price means \"contact sales\" (cannot be bought online)."}
        </p>
        <button type="button" onClick={() => switchMode(!jsonMode)} className="text-xs font-semibold text-[var(--primary)] hover:underline">
          {jsonMode ? (fr ? "Éditeur par champs" : "Field editor") : fr ? "Modifier en JSON" : "Edit as JSON"}
        </button>
      </div>

      {jsonMode ? (
        <textarea
          className="input-premium h-80 w-full px-3 py-2 font-mono text-xs"
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setDirty(true); }}
          spellCheck={false}
          aria-label="JSON"
        />
      ) : (
        <div className="space-y-4">
          {drafts.map((d, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{d.name || d.id || `${fr ? "Formule" : "Plan"} ${i + 1}`}</p>
                <button
                  type="button"
                  onClick={() => { setDrafts(drafts.filter((_, idx) => idx !== i)); setDirty(true); }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={fr ? "Supprimer la formule" : "Remove plan"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={label}>{fr ? "Identifiant" : "Id"}<input className={input} value={d.id} onChange={(e) => update(i, { id: e.target.value })} maxLength={20} /></label>
                <label className={label}>{fr ? "Nom" : "Name"}<input className={input} value={d.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={60} /></label>
                <label className={label}>{fr ? "Nom (FR)" : "Name (FR)"}<input className={input} value={d.nameFr} onChange={(e) => update(i, { nameFr: e.target.value })} maxLength={60} /></label>
                <label className={label}>{fr ? "Prix (USD, vide = nous contacter)" : "Price (USD, empty = contact sales)"}<input className={input} inputMode="decimal" value={d.priceUsd} onChange={(e) => update(i, { priceUsd: e.target.value })} /></label>
                <label className={label}>{fr ? "Durée (mois)" : "Length (months)"}<input className={input} inputMode="numeric" value={d.months} onChange={(e) => update(i, { months: e.target.value })} /></label>
                <label className={label}>{fr ? "Limite de produits (vide = illimité)" : "Product limit (empty = unlimited)"}<input className={input} inputMode="numeric" value={d.maxProducts} onChange={(e) => update(i, { maxProducts: e.target.value })} /></label>
                <label className="flex items-center gap-2 pt-5 text-sm text-slate-700">
                  <input type="checkbox" checked={d.popular} onChange={(e) => update(i, { popular: e.target.checked })} />
                  {fr ? "Mise en avant (populaire)" : "Highlight as popular"}
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>{fr ? "Fonctionnalités (une par ligne)" : "Features (one per line)"}<textarea className={`${input} h-24`} value={d.features} onChange={(e) => update(i, { features: e.target.value })} /></label>
                <label className={label}>{fr ? "Fonctionnalités FR (une par ligne)" : "Features FR (one per line)"}<textarea className={`${input} h-24`} value={d.featuresFr} onChange={(e) => update(i, { featuresFr: e.target.value })} /></label>
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={addPlan} disabled={drafts.length >= 10}>
            <Plus className="h-4 w-4" />
            {fr ? "Ajouter une formule" : "Add plan"}
          </Button>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <ErrorNote message={serverError} />

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty}>{saving ? "…" : fr ? "Enregistrer les formules" : "Save plans"}</Button>
        {!dirty && <span className="text-sm text-slate-400">{fr ? "Tout est enregistré" : "Everything is saved"}</span>}
      </div>
    </div>
  );
}
