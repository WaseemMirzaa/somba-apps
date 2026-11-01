"use client";

import { useEffect, useState } from "react";
import { Palmtree, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";

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
      toast(fr ? "Délai de préparation enregistré" : "Handling time saved");
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
          ? "Nombre de jours dont vous avez besoin pour préparer un colis. Il s'ajoute au délai de livraison annoncé aux clients."
          : "How many days you need to get a parcel ready. It is added to the delivery estimate shoppers see."}
      </p>
      <div className="max-w-[10rem]">
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Jours (0 à 14)" : "Days (0 to 14)"}</label>
        <input type="number" min={0} max={14} step={1} className={fieldClass} value={days} onChange={(e) => setDays(e.target.value)} disabled={!canEdit} aria-label={fr ? "Délai de préparation en jours" : "Handling time in days"} />
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

type PolicyKey = "returnsPolicy" | "returnsPolicyFr" | "shippingPolicy" | "shippingPolicyFr";
const POLICY_KEYS: PolicyKey[] = ["returnsPolicy", "returnsPolicyFr", "shippingPolicy", "shippingPolicyFr"];

/** Returns and shipping policies in English and French. Write one language: the other is translated automatically. */
export function PoliciesForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { seller, updateStore, refresh } = useSellerData();
  const access = useSellerAccess();
  const [draft, setDraft] = useState<Record<PolicyKey, string>>({ returnsPolicy: "", returnsPolicyFr: "", shippingPolicy: "", shippingPolicyFr: "" });
  // What the seller typed in this session (a language that is filled but was never typed is the translation).
  const [typed, setTyped] = useState<Partial<Record<PolicyKey, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = access.can("storefront") && !access.suspended;

  useEffect(() => {
    if (!seller) return;
    /* eslint-disable react-hooks/set-state-in-effect -- show the stored policies */
    setDraft({
      returnsPolicy: seller.returnsPolicy ?? "",
      returnsPolicyFr: seller.returnsPolicyFr ?? "",
      shippingPolicy: seller.shippingPolicy ?? "",
      shippingPolicyFr: seller.shippingPolicyFr ?? "",
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [seller?.returnsPolicy, seller?.returnsPolicyFr, seller?.shippingPolicy, seller?.shippingPolicyFr]); // eslint-disable-line react-hooks/exhaustive-deps

  const stored = (k: PolicyKey) => (seller?.[k] as string | null | undefined) ?? "";
  const bad = (k: PolicyKey) => draft[k].trim() !== "" && (draft[k].trim().length < 10 || draft[k].trim().length > 2000);
  const changed = POLICY_KEYS.filter((k) => draft[k].trim() !== stored(k).trim());
  const invalid = POLICY_KEYS.some(bad);

  async function save() {
    if (changed.length === 0 || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, string | null> = {};
      for (const k of changed) patch[k] = draft[k].trim() === "" ? null : draft[k].trim();
      await updateStore(patch);
      setTyped({});
      toast(fr ? "Politiques enregistrées" : "Policies saved");
      // The other language is translated a moment after the save: read the store again to show it.
      setTimeout(() => void refresh(), 2500);
      setTimeout(() => void refresh(), 7000);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  function box(k: PolicyKey, label: string) {
    // A language that has text but that the seller never wrote in this session, while the other language was written, is machine text.
    const machine = !typed[k] && stored(k).trim() !== "" && Boolean((seller as { machineTranslated?: string[] } | null)?.machineTranslated?.includes(k));
    return (
      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
          <span>{label}</span>
          <span className={bad(k) ? "text-red-600" : "text-slate-400"}>{draft[k].trim().length}/2000</span>
        </label>
        <textarea
          className={fieldClass}
          rows={5}
          value={draft[k]}
          maxLength={2000}
          disabled={!canEdit}
          onChange={(e) => {
            setDraft((d) => ({ ...d, [k]: e.target.value }));
            setTyped((t) => ({ ...t, [k]: true }));
          }}
          aria-label={label}
        />
        {bad(k) && <p className="mt-1 text-xs text-red-600">{fr ? "10 à 2000 caractères, ou laissez vide." : "10 to 2000 characters, or leave empty."}</p>}
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
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        {fr
          ? "Affichées aux clients sur votre boutique. Rédigez une seule langue : laissez l'autre vide et nous la traduisons automatiquement."
          : "Shown to shoppers on your store. Write one language: leave the other empty and we translate it automatically."}
      </p>
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
          {fr ? "Enregistrer les politiques" : "Save policies"}
        </Button>
      )}
    </div>
  );
}
