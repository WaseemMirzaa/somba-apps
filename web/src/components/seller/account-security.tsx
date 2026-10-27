"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Download, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrSvg } from "@/components/seller/account-qr";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { authApi } from "@/lib/realtime/auth-api";
import { sellerRequest, useSocketEvent } from "@/lib/seller-api";
import { copyText, downloadText, type TwoFaSetup, type TwoFaStatus } from "@/lib/seller-account";
import { errMessage } from "@/lib/seller-labels";

const fieldClass = "input-premium w-full px-4 py-2 text-sm";

/** Change the password (`me:changePassword`): the server answers with fresh tokens, which replace the stored ones. */
export function ChangePasswordForm() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextOk = next.length >= 8;
  const sameOk = next === again;
  const ready = current.length > 0 && nextOk && sameOk && next !== current;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sellerRequest<{ accessToken?: string; refreshToken?: string; user?: unknown }>("me:changePassword", { current, next });
      if (res?.accessToken && res?.refreshToken) authApi.saveTokens(res as Parameters<typeof authApi.saveTokens>[0]);
      setCurrent("");
      setNext("");
      setAgain("");
      toast(fr ? "Mot de passe modifié" : "Password changed");
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Mot de passe actuel" : "Current password"}</label>
          <input type="password" autoComplete="current-password" className={fieldClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Nouveau mot de passe" : "New password"}</label>
          <input type="password" autoComplete="new-password" className={fieldClass} value={next} onChange={(e) => setNext(e.target.value)} />
          {next !== "" && !nextOk && <p className="mt-1 text-xs text-red-600">{fr ? "8 caractères au minimum." : "At least 8 characters."}</p>}
          {nextOk && next === current && <p className="mt-1 text-xs text-red-600">{fr ? "Choisissez un mot de passe différent de l'actuel." : "Choose a password different from the current one."}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Confirmer le nouveau mot de passe" : "Confirm the new password"}</label>
          <input type="password" autoComplete="new-password" className={fieldClass} value={again} onChange={(e) => setAgain(e.target.value)} />
          {again !== "" && !sameOk && <p className="mt-1 text-xs text-red-600">{fr ? "Les deux mots de passe sont différents." : "The two passwords do not match."}</p>}
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={!ready || busy}>
        {busy ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Changer le mot de passe" : "Change password"}
      </Button>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="recovery-codes">
      <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        {fr ? "Codes de récupération : ils ne seront plus affichés." : "Recovery codes: they will not be shown again."}
      </p>
      <p className="text-xs text-amber-900">
        {fr
          ? "Si vous perdez votre téléphone, chaque code vous permet de vous connecter une seule fois. Conservez-les en lieu sûr."
          : "If you lose your phone, each code lets you sign in once. Keep them somewhere safe."}
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-900 sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-white px-2 py-1.5 text-center">{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={async () => toast((await copyText(text)) ? (fr ? "Codes copiés" : "Codes copied") : fr ? "Copie impossible" : "Could not copy", "info")}
        >
          <Copy className="h-3.5 w-3.5" />
          {fr ? "Copier" : "Copy"}
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={() => downloadText("somba-recovery-codes.txt", `${text}\n`)}>
          <Download className="h-3.5 w-3.5" />
          {fr ? "Télécharger" : "Download"}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {fr ? "J'ai enregistré ces codes en lieu sûr" : "I saved these codes somewhere safe"}
      </label>
      <Button type="button" onClick={onDone} disabled={!saved}>
        {fr ? "Terminer" : "Done"}
      </Button>
    </div>
  );
}

type Step = "idle" | "setup" | "codes" | "disable" | "regen";

/** Two-factor authentication (TOTP): set up with a QR code, recovery codes shown once, turn off or renew with a code. */
export function TwoFactorCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { status: socket } = useRealtime();
  const [status, setStatus] = useState<TwoFaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [setup, setSetup] = useState<TwoFaSetup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await sellerRequest<TwoFaStatus>("auth:2fa:status"));
      setLoadError(null);
    } catch (e) {
      setLoadError(errMessage(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading from the socket is the point of this effect
    if (socket === "connected") void load();
  }, [socket, load]);
  useSocketEvent("seller:updated", () => void load());

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () =>
    run(async () => {
      setSetup(await sellerRequest<TwoFaSetup>("auth:2fa:setup"));
      setCode("");
      setStep("setup");
    });
  const enable = () =>
    run(async () => {
      const r = await sellerRequest<{ enabled: boolean; recoveryCodes: string[] }>("auth:2fa:enable", { code: code.trim() });
      setCodes(r.recoveryCodes ?? []);
      setSetup(null);
      setCode("");
      setStep("codes");
      await load();
      toast(fr ? "Authentification à deux facteurs activée" : "Two-factor authentication turned on");
    });
  const disable = () =>
    run(async () => {
      await sellerRequest("auth:2fa:disable", { code: code.trim() });
      setCode("");
      setStep("idle");
      await load();
      toast(fr ? "Authentification à deux facteurs désactivée" : "Two-factor authentication turned off");
    });
  const regenerate = () =>
    run(async () => {
      const r = await sellerRequest<{ recoveryCodes: string[] }>("auth:2fa:recovery", { code: code.trim() });
      setCodes(r.recoveryCodes ?? []);
      setCode("");
      setStep("codes");
      await load();
      toast(fr ? "Nouveaux codes de récupération générés" : "New recovery codes generated");
    });

  if (loadError) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>;
  if (!status) return <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>;

  const codeInput = (hint: string) => (
    <div className="max-w-xs">
      <label className="mb-1 block text-xs font-medium text-slate-600">{hint}</label>
      <input
        className={`${fieldClass} tracking-widest`}
        inputMode="text"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        aria-label={fr ? "Code de vérification" : "Verification code"}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {status.required && !status.enabled && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="twofa-required">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {fr
            ? "L'authentification à deux facteurs est obligatoire pour les comptes vendeur. Activez-la pour retrouver l'accès aux autres pages."
            : "Two-factor authentication is required for seller accounts. Turn it on to get the other pages back."}
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className={`rounded-xl p-2 ${status.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {status.enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900" data-testid="twofa-state">
            {status.enabled ? (fr ? "Activée" : "On") : fr ? "Désactivée" : "Off"}
          </p>
          <p className="text-xs text-slate-500">
            {status.enabled
              ? fr ? `${status.recoveryRemaining} code(s) de récupération restant(s)` : `${status.recoveryRemaining} recovery code(s) left`
              : fr ? "Ajoute un code à 6 chiffres à chaque connexion." : "Adds a 6-digit code to every sign-in."}
          </p>
        </div>
      </div>

      {step === "idle" && !status.enabled && <Button onClick={() => void startSetup()} disabled={busy}>{fr ? "Configurer" : "Set up"}</Button>}
      {step === "idle" && status.enabled && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setCode(""); setError(null); setStep("regen"); }}>
            {fr ? "Régénérer les codes de récupération" : "Regenerate recovery codes"}
          </Button>
          <Button variant="reject" onClick={() => { setCode(""); setError(null); setStep("disable"); }} disabled={status.required}>
            {fr ? "Désactiver" : "Turn off"}
          </Button>
          {status.required && (
            <p className="w-full text-xs text-slate-500">{fr ? "Obligatoire sur cette plateforme : impossible de la désactiver." : "Required on this platform: it cannot be turned off."}</p>
          )}
        </div>
      )}

      {step === "setup" && setup && (
        <div className="space-y-4 rounded-xl border border-slate-200 p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>{fr ? "Ouvrez une application d'authentification (Google Authenticator, Authy, 1Password…)." : "Open an authenticator app (Google Authenticator, Authy, 1Password…)."}</li>
            <li>{fr ? "Scannez ce code QR, ou saisissez la clé à la main." : "Scan this QR code, or type the key by hand."}</li>
            <li>{fr ? "Saisissez le code à 6 chiffres affiché pour confirmer." : "Enter the 6-digit code it shows to confirm."}</li>
          </ol>
          <div className="flex flex-wrap items-start gap-4">
            <QrSvg text={setup.otpauthUrl} label={fr ? "Code QR pour l'application d'authentification" : "QR code for your authenticator app"} />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-slate-500">{fr ? "Clé de configuration" : "Setup key"}</p>
              <p className="break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-900" data-testid="twofa-secret">{setup.secret}</p>
              <p className="text-xs text-slate-500">{setup.issuer} · {setup.account}</p>
            </div>
          </div>
          {codeInput(fr ? "Code à 6 chiffres" : "6-digit code")}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void enable()} disabled={busy || code.trim().length < 6}>{fr ? "Activer" : "Turn on"}</Button>
            <Button variant="secondary" onClick={() => { setStep("idle"); setSetup(null); setError(null); }} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}

      {step === "codes" && <RecoveryCodes codes={codes} onDone={() => { setCodes([]); setStep("idle"); }} />}

      {(step === "disable" || step === "regen") && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-700">
            {step === "disable"
              ? fr ? "Saisissez un code de votre application (ou un code de récupération) pour désactiver." : "Enter a code from your app (or a recovery code) to turn it off."
              : fr ? "Saisissez un code de votre application pour générer de nouveaux codes de récupération. Les anciens cesseront de fonctionner." : "Enter a code from your app to generate new recovery codes. The old ones stop working."}
          </p>
          {codeInput(fr ? "Code de vérification" : "Verification code")}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button variant={step === "disable" ? "danger" : "primary"} onClick={() => void (step === "disable" ? disable() : regenerate())} disabled={busy || code.trim().length < 6}>
              {step === "disable" ? (fr ? "Désactiver" : "Turn off") : fr ? "Générer" : "Generate"}
            </Button>
            <Button variant="secondary" onClick={() => { setStep("idle"); setError(null); }} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
