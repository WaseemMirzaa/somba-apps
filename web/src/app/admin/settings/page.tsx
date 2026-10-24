"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { NoticeBar } from "@/components/admin/notice-bar";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useMarket } from "@/context/market-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { PlansEditor } from "@/components/admin/plans-editor";
import { TranslationsStatusPanel } from "@/components/admin/translations-status-panel";
import { errMsg, type ZoneSetting } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

type Values = Record<string, string>;

interface TextField {
  key: string;
  kind: "text";
  label: string;
  labelFr: string;
  hint: string;
  hintFr: string;
  inputMode?: "decimal" | "numeric" | "text";
}
interface ToggleField {
  key: string;
  kind: "toggle";
  label: string;
  labelFr: string;
  hint: string;
  hintFr: string;
}
type Field = TextField | ToggleField;

const GROUPS: { title: string; titleFr: string; fields: Field[] }[] = [
  {
    title: "Pricing and commission",
    titleFr: "Prix et commission",
    fields: [
      { key: "fxRate", kind: "text", label: "FX rate (1 USD = ? CDF)", labelFr: "Taux de change (1 USD = ? CDF)", hint: "Used to show prices in CDF. Shoppers see it immediately.", hintFr: "Sert à afficher les prix en CDF. Visible immédiatement.", inputMode: "decimal" },
      { key: "commissionPct", kind: "text", label: "Platform commission (%)", labelFr: "Commission de la plateforme (%)", hint: "Between 0 and 60. Applies to new orders; past orders keep the rate stored when they were placed.", hintFr: "Entre 0 et 60. S'applique aux nouvelles commandes ; les commandes passées gardent le taux enregistré à leur création.", inputMode: "decimal" },
    ],
  },
  {
    title: "Payouts",
    titleFr: "Versements",
    fields: [
      { key: "minPayoutUsd", kind: "text", label: "Minimum payout (USD)", labelFr: "Versement minimum (USD)", hint: "Sellers cannot request less.", hintFr: "Les vendeurs ne peuvent pas demander moins.", inputMode: "decimal" },
      { key: "payoutClearanceHours", kind: "text", label: "Clearance hours", labelFr: "Heures de compensation", hint: "Whole hours (0 to 720) before earnings become withdrawable.", hintFr: "Heures entières (0 à 720) avant que les gains soient retirables.", inputMode: "numeric" },
    ],
  },
  {
    title: "Checkout and delivery",
    titleFr: "Paiement et livraison",
    fields: [
      { key: "codEnabled", kind: "toggle", label: "Cash on delivery", labelFr: "Paiement à la livraison", hint: "When off, shoppers cannot choose COD.", hintFr: "Désactivé : le paiement à la livraison n'est plus proposé." },
      { key: "codCapUsd", kind: "text", label: "COD cap (USD)", labelFr: "Plafond COD (USD)", hint: "COD orders above this amount raise a fraud alert.", hintFr: "Les commandes COD au-dessus de ce montant déclenchent une alerte fraude.", inputMode: "decimal" },
      { key: "requireDeliveryCode", kind: "toggle", label: "Require customer delivery code", labelFr: "Exiger le code de livraison client", hint: "Riders must enter the customer's 4-digit code to complete a delivery.", hintFr: "Les livreurs doivent saisir le code à 4 chiffres du client." },
      { key: "requireVerifiedForCheckout", kind: "toggle", label: "Require a verified phone or email to check out", labelFr: "Exiger un téléphone ou e-mail vérifié pour commander", hint: "On: orders and wallet top-ups need a verified phone or email. Turn it off until SMTP or SMS verification is configured, or customers cannot verify and cannot check out.", hintFr: "Activé : commandes et recharges exigent un téléphone ou e-mail vérifié. Désactivez tant que l'e-mail (SMTP) ou le SMS n'est pas configuré, sinon les clients ne peuvent ni vérifier ni commander." },
      { key: "hubAddress", kind: "text", label: "Hub address", labelFr: "Adresse du hub", hint: "Where parcels are brought (shown to sellers/riders).", hintFr: "Où les colis sont déposés (affiché aux vendeurs/livreurs).", inputMode: "text" },
    ],
  },
  {
    title: "Catalogue",
    titleFr: "Catalogue",
    fields: [
      { key: "productModeration", kind: "toggle", label: "Moderate new seller products", labelFr: "Modérer les nouveaux produits vendeurs", hint: "On: new listings wait for approval. Off: they go live at once.", hintFr: "Activé : les nouvelles annonces attendent une approbation. Désactivé : publication immédiate." },
    ],
  },
];

export default function AdminSettingsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { profileId, setProfileId } = useMarket();
  const { toast } = useToast();
  const [saved, setSaved] = useState<Values>({});
  const [draft, setDraft] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const load = useCallback(async () => {
    try {
      const all = await socketClient.request<Values>("settings:get");
      setSaved(all);
      setDraft(all);
      setLoadError(null);
      setLoaded(true);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    if (rt.status === "connected") void load();
  }, [rt.status, load]);

  const dirty = (key: string) => (draft[key] ?? "") !== (saved[key] ?? "");

  async function saveKey(key: string): Promise<boolean> {
    setSavingKey(key);
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
    try {
      const all = await socketClient.request<Values>("settings:set", { key, value: draftRef.current[key] ?? "" });
      setSaved(all);
      setDraft((d) => ({ ...d, [key]: all[key] ?? d[key] }));
      return true;
    } catch (e) {
      setErrors((er) => ({ ...er, [key]: errMsg(e) }));
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function saveOne(key: string) {
    if (await saveKey(key)) toast(fr ? "Paramètre enregistré" : "Setting saved", "success");
  }

  async function saveAll() {
    const keys = GROUPS.flatMap((g) => g.fields.map((f) => f.key)).filter(dirty);
    if (keys.length === 0) {
      toast(fr ? "Aucune modification" : "Nothing to save", "info");
      return;
    }
    let ok = 0;
    for (const k of keys) {
      if (await saveKey(k)) ok += 1;
    }
    const failed = keys.length - ok;
    if (failed === 0) toast(fr ? `${ok} paramètre(s) enregistré(s)` : `${ok} setting(s) saved`, "success");
    else toast(fr ? `${ok} enregistré(s), ${failed} en erreur — voir les champs` : `${ok} saved, ${failed} failed — see the fields`, "error");
  }

  let zones: ZoneSetting[] = [];
  try {
    const parsed = saved.deliveryZones ? (JSON.parse(saved.deliveryZones) as ZoneSetting[]) : [];
    zones = Array.isArray(parsed) ? parsed : [];
  } catch {
    zones = [];
  }

  const anyDirty = GROUPS.some((g) => g.fields.some((f) => dirty(f.key)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={fr ? "Valeurs réelles du serveur — chaque champ s'enregistre seul" : "Live server values — every field saves on its own"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("settings") }]}
      />

      {loadError && <NoticeBar tone="warn">{loadError}</NoticeBar>}
      {!loaded && !loadError && <p className="text-sm text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>}

      {loaded && (
        <>
          {GROUPS.map((g) => (
            <div key={g.title} className="card-premium space-y-4 p-6">
              <h3 className="font-semibold">{fr ? g.titleFr : g.title}</h3>
              <div className="grid gap-5 lg:grid-cols-2">
                {g.fields.map((f) => {
                  const err = errors[f.key];
                  const busy = savingKey === f.key;
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-800">{fr ? f.labelFr : f.label}</label>
                      {f.kind === "toggle" ? (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={draft[f.key] === "true"}
                            onClick={() => setDraft((d) => ({ ...d, [f.key]: d[f.key] === "true" ? "false" : "true" }))}
                            className={`relative h-6 w-11 rounded-full transition-colors ${draft[f.key] === "true" ? "bg-emerald-500" : "bg-slate-300"}`}
                          >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${draft[f.key] === "true" ? "left-[22px]" : "left-0.5"}`} />
                          </button>
                          <span className="text-sm text-slate-600">
                            {draft[f.key] === "true" ? (fr ? "Activé" : "On") : draft[f.key] === "false" ? (fr ? "Désactivé" : "Off") : fr ? "Non défini (défaut serveur)" : "Not set (server default)"}
                          </span>
                          <Button size="sm" variant="secondary" disabled={!dirty(f.key) || busy} onClick={() => saveOne(f.key)}>
                            {busy ? "…" : fr ? "Enregistrer" : "Save"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            className="input-premium w-full px-4 py-2 text-sm"
                            inputMode={f.inputMode}
                            value={draft[f.key] ?? ""}
                            placeholder={fr ? "Non défini (défaut serveur)" : "Not set (server default)"}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                          />
                          <Button size="sm" variant="secondary" disabled={!dirty(f.key) || busy} onClick={() => saveOne(f.key)}>
                            {busy ? "…" : fr ? "Enregistrer" : "Save"}
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-slate-400">{fr ? f.hintFr : f.hint}</p>
                      {err && (
                        <p className="text-xs font-medium text-red-600" role="alert">
                          {err}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="card-premium space-y-3 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{fr ? "Zones de livraison" : "Delivery zones"}</h3>
              <Link href="/admin/zones" className="text-sm font-medium text-[var(--primary)] hover:underline">
                {fr ? "Modifier les zones" : "Edit zones"}
              </Link>
            </div>
            {zones.length === 0 ? (
              <p className="text-sm text-slate-400">{fr ? "Aucune zone enregistrée." : "No zones saved yet."}</p>
            ) : (
              <div className="space-y-2">
                {zones.map((z) => (
                  <div key={z.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{z.name} ({z.city})</span>
                    <span>${z.feeUsd} USD</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-premium space-y-3 p-6">
            <h3 className="font-semibold">{fr ? "Formules d'abonnement vendeur" : "Seller subscription plans"}</h3>
            <PlansEditor saved={saved.sellerPlans} onSaved={(all) => { setSaved(all); setDraft((d) => ({ ...d, sellerPlans: all.sellerPlans ?? d.sellerPlans })); }} />
          </div>

          <TranslationsStatusPanel />

          <div className="card-premium space-y-3 p-6">
            <h3 className="font-semibold">{fr ? "Profil de marché (cet appareil uniquement)" : "Market profile (this browser only)"}</h3>
            <p className="text-xs text-slate-400">
              {fr ? "Change l'affichage dans ce navigateur ; n'est pas enregistré sur le serveur." : "Changes how this browser displays prices; not saved on the server."}
            </p>
            <select className="input-premium w-full max-w-xs px-4 py-2 text-sm" value={profileId} onChange={(e) => setProfileId(e.target.value as "france" | "drc")}>
              <option value="france">France</option>
              <option value="drc">{fr ? "RDC" : "DRC"}</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={saveAll} disabled={!anyDirty || savingKey !== null}>
              {fr ? "Enregistrer toutes les modifications" : "Save all changes"}
            </Button>
            {!anyDirty && <span className="text-sm text-slate-400">{fr ? "Tout est enregistré" : "Everything is saved"}</span>}
          </div>
        </>
      )}
    </div>
  );
}
