"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest } from "@/lib/seller-api";
import { NOTIFY_KINDS, NOTIFY_LABEL, type NotifyKind, type PayoutAccount, type Prefs } from "@/lib/seller-account";
import { errMessage } from "@/lib/seller-labels";
import { payoutMethodLabel } from "@/lib/seller-labels";

const fieldClass = "input-premium w-full px-4 py-2 text-sm";

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-[var(--primary)]" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Notification preferences (`me:prefs` / `me:setPrefs`): one switch per kind. A kind that is off still lands in the bell, with no push. */
export function NotificationPrefs() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { status } = useRealtime();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "connected") return;
    let alive = true;
    sellerRequest<Prefs>("me:prefs")
      .then((p) => alive && setPrefs(p))
      .catch((e) => alive && setError(errMessage(e)));
    return () => {
      alive = false;
    };
  }, [status]);

  async function change(key: string, patch: Record<string, unknown>, apply: (p: Prefs) => Prefs) {
    if (!prefs) return;
    const before = prefs;
    setPrefs(apply(prefs)); // optimistic
    setSaving(key);
    try {
      setPrefs(await sellerRequest<Prefs>("me:setPrefs", patch));
      toast(fr ? "Préférences enregistrées" : "Preferences saved");
    } catch (e) {
      setPrefs(before);
      toast(errMessage(e), "error");
    } finally {
      setSaving(null);
    }
  }

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!prefs) return <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>;
  const pushOn = prefs.push !== false;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fr
          ? "Choisissez ce qui vous envoie une alerte push. Une notification désactivée apparaît quand même dans la cloche, sans alerte."
          : "Choose what sends you a push alert. A switched-off kind still shows in the bell, without an alert."}
      </p>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{fr ? "Alertes push" : "Push alerts"}</p>
          <p className="text-xs text-slate-500">{fr ? "Interrupteur général : désactivé, plus aucune alerte." : "Master switch: off means no alert at all."}</p>
        </div>
        <Switch checked={pushOn} disabled={saving === "push"} label={fr ? "Alertes push" : "Push alerts"} onChange={(v) => void change("push", { push: v }, (p) => ({ ...p, push: v }))} />
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {NOTIFY_KINDS.map((k: NotifyKind) => {
          const on = prefs.notify?.[k] !== false;
          const l = NOTIFY_LABEL[k];
          return (
            <li key={k} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{fr ? l.fr : l.en}</p>
                <p className="text-xs text-slate-500">{fr ? l.descFr : l.descEn}</p>
              </div>
              <Switch checked={on} disabled={saving === k || !pushOn} label={fr ? l.fr : l.en} onChange={(v) => void change(k, { notify: { [k]: v } }, (p) => ({ ...p, notify: { ...p.notify, [k]: v } }))} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Where payouts are sent (`sellers:payoutAccount:*`). Only the owner can change it; the account number is shown masked. */
export function PayoutAccountCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { status } = useRealtime();
  const [acct, setAcct] = useState<PayoutAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<"bank" | "mobile_money">("mobile_money");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAcct(await sellerRequest<PayoutAccount>("sellers:payoutAccount:get"));
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading from the socket is the point of this effect
    if (status === "connected") void load();
  }, [status, load]);

  async function save() {
    setBusy(true);
    try {
      setAcct(await sellerRequest<PayoutAccount>("sellers:payoutAccount:set", { method, account: account.trim() }));
      setEditing(false);
      setAccount("");
      toast(fr ? "Compte de versement enregistré" : "Payout account saved");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setBusy(true);
    try {
      setAcct(await sellerRequest<PayoutAccount>("sellers:payoutAccount:set", { clear: true }));
      toast(fr ? "Compte de versement supprimé" : "Payout account removed");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!acct) return <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>;
  const accountOk = account.trim().length >= 4 && account.trim().length <= 100;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {fr
          ? "Les versements de votre équipe (rôle Finance) partent uniquement vers ce compte ou vers le portefeuille Somba. Seul le propriétaire peut le modifier."
          : "Payouts requested by your team (Finance role) only go to this account or to the Somba wallet. Only the owner can change it."}
      </p>
      {acct.set && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{acct.method ? payoutMethodLabel(acct.method, fr) : "—"}</p>
            <p className="font-mono text-sm text-slate-600" data-testid="payout-masked">{acct.masked ?? "••••"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setEditing(true); setMethod(acct.method ?? "mobile_money"); }}>{fr ? "Modifier" : "Change"}</Button>
            <Button variant="reject" size="sm" onClick={() => void clear()} disabled={busy}>{fr ? "Supprimer" : "Remove"}</Button>
          </div>
        </div>
      ) : editing || !acct.set ? (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Mode" : "Method"}</label>
              <select className={fieldClass} aria-label={fr ? "Mode de versement" : "Payout method"} value={method} onChange={(e) => setMethod(e.target.value as "bank" | "mobile_money")}>
                <option value="mobile_money">{payoutMethodLabel("mobile_money", fr)}</option>
                <option value="bank">{payoutMethodLabel("bank", fr)}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{method === "bank" ? (fr ? "IBAN ou numéro de compte" : "IBAN or account number") : fr ? "Numéro mobile money" : "Mobile money number"}</label>
              <input className={fieldClass} aria-label={fr ? "Numéro de compte de versement" : "Payout account number"} value={account} onChange={(e) => setAccount(e.target.value)} maxLength={100} />
              {account !== "" && !accountOk && <p className="mt-1 text-xs text-red-600">{fr ? "4 à 100 caractères." : "4 to 100 characters."}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={busy || !accountOk}>{fr ? "Enregistrer" : "Save"}</Button>
            {editing && <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A team member leaves the store's team (`team:leave`). */
export function LeaveTeamCard({ storeName }: { storeName: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function leave() {
    setBusy(true);
    try {
      await sellerRequest("team:leave");
      toast(fr ? "Vous avez quitté l'équipe" : "You left the team");
      router.replace("/seller");
    } catch (e) {
      toast(errMessage(e), "error");
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {fr ? `Vous travaillez pour « ${storeName} ». En quittant l'équipe, vous perdez l'accès à cette boutique.` : `You work for "${storeName}". Leaving the team removes your access to this store.`}
      </p>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="danger" onClick={() => void leave()} disabled={busy}>{fr ? "Oui, quitter l'équipe" : "Yes, leave the team"}</Button>
          <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
        </div>
      ) : (
        <Button variant="reject" onClick={() => setConfirm(true)}>
          <LogOut className="h-4 w-4" />
          {fr ? "Quitter l'équipe" : "Leave the team"}
        </Button>
      )}
    </div>
  );
}

/** Delete the account (`me:delete {password}`): the server refuses while orders are in flight or earnings are unpaid. */
export function DeleteAccountCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await sellerRequest("me:delete", { password });
      toast(fr ? "Compte supprimé" : "Account deleted");
      logout();
      router.push("/login");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {fr
          ? "Supprime définitivement votre compte et ferme la boutique : annonces retirées, équipe remerciée, conversations effacées. Impossible tant que des commandes sont en cours ou que des gains restent à retirer."
          : "Permanently deletes your account and closes the store: listings taken down, team seats ended, chats erased. Not possible while orders are in progress or earnings are unpaid."}
      </p>
      {!open ? (
        <Button variant="reject" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" />
          {fr ? "Supprimer mon compte" : "Delete my account"}
        </Button>
      ) : (
        <div className="max-w-sm space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-3">
          <label className="block text-xs font-medium text-slate-700">
            {fr ? "Saisissez votre mot de passe pour confirmer" : "Enter your password to confirm"}
            <input type="password" autoComplete="current-password" className={`${fieldClass} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void remove()} disabled={busy || password.length === 0}>{fr ? "Supprimer définitivement" : "Delete for good"}</Button>
            <Button variant="secondary" onClick={() => { setOpen(false); setPassword(""); setError(null); }} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
