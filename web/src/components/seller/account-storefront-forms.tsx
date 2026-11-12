"use client";

import { useEffect, useState } from "react";
import { Palmtree, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { sellerRequest, useLiveQuery } from "@/lib/seller-api";
import { POLICY_KEYS, POLICY_MAX, POLICY_MIN, effectivePolicy, policyPatch, policyStatusLabel, policyTextInvalid, revisionKeys, POLICY_FIELD_LABEL, type MyPolicy, type PolicyKey, type PolicyTemplate } from "@/lib/store-policy";
import { Badge } from "@/components/ui/badge";

const fieldClass = "input-premium w-full px-4 py-2 text-sm";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const plusYearIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 365);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function fmtDate(iso: string, fr: boolean): string {
  return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
}

/** Vacation mode: the store stops taking new orders until the date (it reopens by itself), or reopens now. */
export function VacationForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore } = useSellerData();
  const access = useSellerAccess();
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = access.can("storefront") && !access.suspended;
  const away = !!seller?.onVacation && !!seller.vacationUntil;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the stored date in the picker
    setDate(seller?.vacationUntil ? seller.vacationUntil.slice(0, 10) : "");
  }, [seller?.vacationUntil]);

  const invalid = date !== "" && (date < todayIso() || date > plusYearIso());

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      await updateStore({ vacationUntil: next });
      toast(next ? (fr ? "Mode vacances activé" : "Vacation mode on") : fr ? "Boutique rouverte" : "Store reopened");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {away && seller?.vacationUntil && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="vacation-banner">
          <Palmtree className="h-4 w-4 shrink-0" />
          {fr
            ? `En vacances jusqu'au ${fmtDate(seller.vacationUntil, true)} : votre boutique ne prend pas de nouvelles commandes.`
            : `On vacation until ${fmtDate(seller.vacationUntil, false)}: your store is not taking new orders.`}
        </p>
      )}
      <p className="text-sm text-slate-500">
        {fr
          ? "Pendant vos vacances, les clients voient vos produits mais ne peuvent pas les commander. Les commandes déjà passées continuent. La boutique rouvre toute seule à la date choisie."
          : "While you are away shoppers still see your products but cannot order them. Orders already placed carry on. The store reopens by itself on the date you choose."}
      </p>
      <div className="max-w-xs">
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Retour le (dernier jour fermé)" : "Back on (last closed day)"}</label>
        <input type="date" className={fieldClass} value={date} min={todayIso()} max={plusYearIso()} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} aria-label={fr ? "Date de retour" : "Return date"} />
        {invalid && (
          <p className="mt-1 text-xs text-red-600">
            {fr ? "Choisissez une date à partir d'aujourd'hui et dans l'année." : "Choose a date from today, within one year."}
          </p>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save(date)} disabled={busy || !date || invalid || (away && date === seller?.vacationUntil?.slice(0, 10))}>
            {away ? (fr ? "Changer la date" : "Change the date") : fr ? "Activer le mode vacances" : "Turn on vacation mode"}
          </Button>
          {(away || !!seller?.vacationUntil) && (
            <Button variant="secondary" onClick={() => void save(null)} disabled={busy}>
              {fr ? "Rouvrir maintenant" : "Reopen now"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Handling time: days the store needs to hand a parcel over; added to every delivery estimate. */
export function HandlingForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore } = useSellerData();
  const access = useSellerAccess();
  const [days, setDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = access.can("storefront") && !access.suspended;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the stored value
    setDays(String(seller?.handlingDays ?? 0));
  }, [seller?.handlingDays]);

  const n = Number(days);
  const ok = days.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 14;

  async function save() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await updateStore({ handlingDays: n });
      toast(fr ? "Délai de traitement enregistré" : "Handling time saved");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fr
          ? "Jours dont votre boutique a besoin pour traiter un colis, quel que soit le produit. Ils s'ajoutent au délai de préparation de chaque produit et à celui de l'itinéraire dans la livraison annoncée aux clients."
          : "How many days you need to get a parcel ready. It is added to the delivery estimate shoppers see."}
      </p>
      <div className="max-w-[10rem]">
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Jours (0 à 14)" : "Days (0 to 14)"}</label>
        <input type="number" min={0} max={14} step={1} className={fieldClass} value={days} onChange={(e) => setDays(e.target.value)} disabled={!canEdit} aria-label={fr ? "Délai de traitement en jours" : "Handling time in days"} />
        {!ok && <p className="mt-1 text-xs text-red-600">{fr ? "Un nombre entier de jours de 0 à 14." : "A whole number of days from 0 to 14."}</p>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {canEdit && (
        <Button onClick={() => void save()} disabled={busy || !ok || n === (seller?.handlingDays ?? 0)}>
          {fr ? "Enregistrer" : "Save"}
        </Button>
      )}
    </div>
  );
}

type DraftState = Record<PolicyKey, string>;
const EMPTY_DRAFT: DraftState = { returnsPolicy: "", returnsPolicyFr: "", shippingPolicy: "", shippingPolicyFr: "" };

/**
 * Returns and shipping policies in English and French. A change is a PROPOSAL: KOMORIKO approves it before it goes live
 * (docs/contracts/admin-controls.md §5). The form starts from the pending proposal when there is one, else from the live text.
 * Write one language: the other is translated automatically once it is live.
 */
export function PoliciesForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore } = useSellerData();
  const access = useSellerAccess();
  const mine = useLiveQuery<MyPolicy>("sellers:policy:mine", {}, { pushes: ["seller:policy", "seller:updated"] });
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = access.can("storefront") && !access.suspended;
  const pending = mine.data?.pending ?? null;
  const last = mine.data?.lastDecided ?? null;

  const live = {
    returnsPolicy: seller?.returnsPolicy ?? "",
    returnsPolicyFr: seller?.returnsPolicyFr ?? "",
    shippingPolicy: (seller as { shippingPolicy?: string | null } | null)?.shippingPolicy ?? "",
    shippingPolicyFr: (seller as { shippingPolicyFr?: string | null } | null)?.shippingPolicyFr ?? "",
  };
  // What the form is compared with: the proposal in review (or the live text when nothing is in review).
  const base = effectivePolicy(live, pending);
  const baseKey = POLICY_KEYS.map((k) => base[k]).join("\u0001");

  useEffect(() => {
    if (dirty) return;
    /* eslint-disable react-hooks/set-state-in-effect -- show the stored policies / the proposal in review */
    setDraft(base);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [baseKey, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = policyPatch(draft, base);
  const changed = Object.keys(patch) as PolicyKey[];
  const invalid = POLICY_KEYS.some((k) => policyTextInvalid(draft[k]));

  async function save() {
    if (changed.length === 0 || invalid) return;
    setBusy(true);
    setError(null);
    try {
      await updateStore(patch as Record<string, string | null>);
      setDirty(false);
      await mine.reload();
      toast(fr ? "Proposition envoyée : elle sera en ligne après approbation par KOMORIKO" : "Proposal sent: it goes live once KOMORIKO approves it");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate() {
    setError(null);
    try {
      const tpl = await sellerRequest<PolicyTemplate>("sellers:policy:template", {});
      setDraft((d) => ({ ...d, returnsPolicy: tpl.returnsPolicy.en, returnsPolicyFr: tpl.returnsPolicy.fr }));
      setDirty(true);
      toast(fr ? "Modèle inséré : modifiez-le puis envoyez-le" : "Template inserted: edit it, then submit it");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    }
  }

  function box(k: PolicyKey, label: string) {
    const bad = policyTextInvalid(draft[k]);
    const machine = !dirty && base[k].trim() !== "" && Boolean((seller as { machineTranslated?: string[] } | null)?.machineTranslated?.includes(k));
    return (
      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
          <span>{label}</span>
          <span className={bad ? "text-red-600" : "text-slate-400"}>{draft[k].trim().length}/{POLICY_MAX}</span>
        </label>
        <textarea
          className={fieldClass}
          rows={5}
          value={draft[k]}
          maxLength={POLICY_MAX}
          disabled={!canEdit}
          onChange={(e) => {
            setDraft((d) => ({ ...d, [k]: e.target.value }));
            setDirty(true);
          }}
          aria-label={label}
        />
        {bad && <p className="mt-1 text-xs text-red-600">{fr ? `${POLICY_MIN} à ${POLICY_MAX} caractères, ou laissez vide.` : `${POLICY_MIN} to ${POLICY_MAX} characters, or leave empty.`}</p>}
        {machine && (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <Sparkles className="h-3 w-3" />
            {fr ? "Traduit automatiquement : vous pouvez le modifier." : "Translated automatically: you can edit it."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="policies-form">
      <p className="text-sm text-slate-500">
        {fr
          ? "Affichées aux clients sur votre boutique après approbation par KOMORIKO. Rédigez une seule langue : laissez l'autre vide et nous la traduisons automatiquement."
          : "Shown to shoppers on your store once KOMORIKO approves them. Write one language: leave the other empty and we translate it automatically."}
      </p>

      {pending && (
        <div role="status" data-testid="policy-pending" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">{policyStatusLabel("pending", fr)}</Badge>
            <span>
              {fr
                ? `Envoyée le ${fmtDate(pending.createdAt, fr)}. Votre boutique affiche toujours le texte actuel jusqu'à l'approbation.`
                : `Sent on ${fmtDate(pending.createdAt, fr)}. Your store keeps showing the current text until it is approved.`}
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            {fr ? "Modifiée : " : "Changes: "}
            {revisionKeys(pending).map((k) => POLICY_FIELD_LABEL[k][fr ? "fr" : "en"]).join(", ")}
          </p>
        </div>
      )}
      {!pending && last?.status === "rejected" && (
        <div role="alert" data-testid="policy-rejected" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <Badge variant="danger">{policyStatusLabel("rejected", fr)}</Badge>
          <p className="mt-1">{last.note || (fr ? "KOMORIKO n'a pas approuvé cette modification." : "KOMORIKO did not approve this change.")}</p>
          <p className="mt-1 text-xs">{fr ? "Votre boutique affiche toujours le texte actuel. Corrigez et renvoyez." : "Your store still shows the current text. Edit it and send it again."}</p>
        </div>
      )}
      {!pending && last?.status === "approved" && (
        <p data-testid="policy-approved" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Badge variant="success">{policyStatusLabel("approved", fr)}</Badge>
          {last.decidedAt ? fmtDate(last.decidedAt, fr) : ""}
          {last.note ? ` · ${last.note}` : ""}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => void applyTemplate()}>
            {fr ? "Utiliser le modèle de politique de retour" : "Use the returns-policy template"}
          </Button>
          <span className="text-xs text-slate-500">{fr ? "Remplit la politique de retour en anglais et en français ; modifiez-la avant d'envoyer." : "Fills the returns policy in English and French; edit it before you send it."}</span>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{fr ? "Politique de retour" : "Returns policy"}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {box("returnsPolicy", fr ? "Anglais" : "English")}
          {box("returnsPolicyFr", fr ? "Français" : "French")}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{fr ? "Politique d'expédition" : "Shipping policy"}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {box("shippingPolicy", fr ? "Anglais" : "English")}
          {box("shippingPolicyFr", fr ? "Français" : "French")}
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {canEdit && (
        <Button onClick={() => void save()} disabled={busy || invalid || changed.length === 0}>
          {fr ? "Envoyer pour approbation" : "Submit for approval"}
        </Button>
      )}
    </div>
  );
}
