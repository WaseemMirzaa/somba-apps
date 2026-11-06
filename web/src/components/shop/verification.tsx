"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
import { authApi, type SendOutcome } from "@/lib/realtime/auth-api";
import { authErrorText } from "@/lib/auth-errors";
import { socketClient } from "@/lib/realtime/socket-client";
import { usePublicSettings, useVerificationStatus, type VerificationStatus } from "@/lib/shop-live";

/**
 * Shown on checkout, payment and wallet top-up when the platform requires a
 * verified phone or email (`requireVerifiedForCheckout`) and the account has
 * neither. Points to the verification card on the account page.
 */
export function VerificationNotice({
  status,
  serverMessage,
}: {
  status: Pick<VerificationStatus, "reload">;
  /** The server's own refusal text, when an action was already attempted. */
  serverMessage?: string | null;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {fr ? "Vérifiez votre compte pour payer" : "Verify your account to pay"}
          </p>
          <p className="mt-1">
            {fr
              ? "Pour commander ou recharger votre portefeuille, confirmez votre numéro de téléphone ou votre e-mail (Profil > Vérification)."
              : "To place an order or top up your wallet, confirm your phone number or your email address (Profile > Verification)."}
          </p>
          {serverMessage && <p className="mt-1 text-xs text-amber-800">{serverMessage}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/shop/account#verification"
              className="btn-primary inline-flex px-4 py-2 text-sm"
            >
              {fr ? "Vérifier maintenant" : "Verify now"}
            </Link>
            <button
              type="button"
              onClick={() => status.reload()}
              className="rounded-xl border border-amber-400 px-4 py-2 text-sm font-medium hover:bg-amber-100"
            >
              {fr ? "J'ai vérifié, actualiser" : "I have verified, refresh"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const maskPhone = (p?: string | null) => {
  const v = (p ?? "").replace(/\s/g, "");
  return v.length < 7 ? v : `${v.slice(0, 4)}•••${v.slice(-2)}`;
};
const maskEmail = (e?: string | null) => {
  const v = (e ?? "").trim();
  const at = v.indexOf("@");
  return at < 1 ? v : `${v[0]}***${v.slice(at)}`;
};
const clock = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
const COOLDOWN_SECONDS = 30;

/** Counts down from `from` once per second; `start()` restarts it. */
function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: (n = COOLDOWN_SECONDS) => setLeft(n) };
}

/** A line under a channel that says what became of the last send, in plain words. */
function SendStatus({ outcome, channel, fr }: { outcome: SendOutcome | null; channel: "phone" | "email"; fr: boolean }) {
  if (!outcome) return null;
  const phone = channel === "phone";
  if (outcome.sent) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {phone
          ? fr ? `Code envoyé par SMS au ${outcome.to ?? ""}. Il expire dans 10 minutes.` : `Code sent by SMS to ${outcome.to ?? "your phone"}. It expires in 10 minutes.`
          : fr ? `Lien envoyé à ${outcome.to ?? ""}. Il expire dans 24 heures. Ouvrez-le pour confirmer.` : `Link sent to ${outcome.to ?? "your email"}. It expires in 24 hours. Open it to confirm.`}
      </p>
    );
  }
  const off = outcome.reason === "not_configured";
  return (
    <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-semibold">
        {off
          ? phone ? (fr ? "Les SMS ne sont pas encore disponibles." : "Text messages are not available yet.") : (fr ? "L'envoi d'e-mails n'est pas encore disponible." : "E-mail is not available yet.")
          : phone ? (fr ? "Le code n'est pas parti." : "The code did not go out.") : (fr ? "L'e-mail n'est pas parti." : "The e-mail did not go out.")}
      </span>{" "}
      {off
        ? phone ? (fr ? "Confirmez plutôt votre e-mail, ou réessayez plus tard." : "Confirm your email instead, or try again later.") : (fr ? "Confirmez plutôt votre téléphone, ou réessayez plus tard." : "Confirm your phone instead, or try again later.")
        : fr ? "Vérifiez le numéro ou l'adresse puis réessayez dans un instant." : "Check the number or address, then try again in a moment."}
    </p>
  );
}

/** Profile > Verification: confirm the phone by SMS code and/or the email by link. */
export function VerificationCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const status = useVerificationStatus();
  const settings = usePublicSettings();
  // What this server can send (public settings): a channel that is off says so before anyone waits for a code.
  const smsOff = settings.loaded && !settings.smsVerification;
  const mailOff = settings.loaded && !settings.emailVerification;
  const { cartCount } = useShop();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"sms" | "code" | "email" | "number" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsOutcome, setSmsOutcome] = useState<SendOutcome | null>(null);
  const [mailOutcome, setMailOutcome] = useState<SendOutcome | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const smsTimer = useCountdown();
  const mailTimer = useCountdown();

  const phone = rt.user?.phone ?? null;
  const hasPhone = !!phone;

  async function run(kind: "sms" | "code" | "email" | "number", fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      const text = authErrorText(e, fr);
      setError(text);
      toast(text);
    } finally {
      setBusy(null);
    }
  }

  const sendCode = () =>
    run("sms", async () => {
      const res = await authApi.sendPhoneOtp();
      setSmsOutcome(res);
      setCodeSent(res.sent);
      smsTimer.start();
      if (res.sent) toast(fr ? "Code envoyé par SMS" : "Code sent by SMS");
    });
  const verifyCode = () =>
    run("code", async () => {
      if (!/^\d{6}$/.test(code.trim())) throw new Error(fr ? "Le code comporte 6 chiffres." : "The code has 6 digits.");
      await authApi.verifyPhoneOtp(code.trim());
      setCode("");
      setCodeSent(false);
      setSmsOutcome(null);
      status.reload();
      toast(fr ? "Téléphone vérifié" : "Phone verified");
    });
  const sendEmail = () =>
    run("email", async () => {
      const res = await authApi.sendEmailVerification();
      setMailOutcome(res);
      mailTimer.start();
      if (res.sent) toast(fr ? "E-mail de vérification envoyé" : "Verification email sent");
    });
  const saveNumber = () =>
    run("number", async () => {
      const p = newPhone.replace(/[\s().-]/g, "");
      if (!/^\+?[0-9]{9,15}$/.test(p)) throw new Error(fr ? "Saisissez un numéro de téléphone valide." : "Enter a valid phone number.");
      await socketClient.request("me:update", { phone: p });
      setEditingPhone(false);
      setNewPhone("");
      setCode("");
      setCodeSent(false);
      setSmsOutcome(null);
      status.reload();
      toast(fr ? "Numéro mis à jour. Demandez un nouveau code." : "Number updated. Ask for a new code.");
    });

  const ok = status.phoneVerified || status.emailVerified;

  return (
    <div id="verification" className="card-premium scroll-mt-24 space-y-4 p-6">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-3 ${ok ? "bg-emerald-50" : "bg-amber-50"}`}>
          {ok ? <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" /> : <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{fr ? "Vérification du compte" : "Account verification"}</h2>
          <p className="text-sm text-slate-600">
            {!status.loaded
              ? (fr ? "Chargement…" : "Loading…")
              : ok
                ? (fr ? "Votre compte est vérifié." : "Your account is verified.")
                : status.required
                  ? (fr ? "Requise pour commander et recharger le portefeuille. Un seul des deux suffit." : "Required to place orders and top up the wallet. Either one is enough.")
                  : (fr ? "Recommandée pour sécuriser votre compte." : "Recommended to secure your account.")}
          </p>
        </div>
      </div>

      {status.loaded && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{fr ? "Téléphone" : "Phone"}</p>
                <p className="truncate text-sm text-slate-600">{hasPhone ? maskPhone(phone) : fr ? "Aucun numéro" : "No number yet"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.phoneVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                {status.phoneVerified ? (fr ? "Vérifié" : "Verified") : fr ? "Non vérifié" : "Not verified"}
              </span>
            </div>
            {!status.phoneVerified && (
              <>
                {hasPhone && !editingPhone && (
                  <div className="space-y-2">
                    {smsOff && <SendStatus outcome={{ sent: false, reason: "not_configured" }} channel="phone" fr={fr} />}
                    <Button size="sm" variant="secondary" onClick={sendCode} disabled={smsOff || busy !== null || smsTimer.left > 0}>
                      {busy === "sms" ? "…" : smsTimer.left > 0 ? (fr ? `Renvoyer dans ${clock(smsTimer.left)}` : `Resend in ${clock(smsTimer.left)}`) : codeSent ? (fr ? "Renvoyer le code" : "Resend code") : (fr ? "Envoyer un code par SMS" : "Send a code by SMS")}
                    </Button>
                    <SendStatus outcome={smsOutcome} channel="phone" fr={fr} />
                    {codeSent && (
                      <div className="flex gap-2">
                        <input
                          className="input-premium w-full px-3 py-2 text-sm"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="123456"
                          aria-label={fr ? "Code à 6 chiffres" : "6-digit code"}
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => { if (e.key === "Enter") void verifyCode(); }}
                        />
                        <Button size="sm" onClick={verifyCode} disabled={busy !== null}>{busy === "code" ? "…" : fr ? "Vérifier" : "Verify"}</Button>
                      </div>
                    )}
                  </div>
                )}
                {!hasPhone && !editingPhone && (
                  <p className="text-sm text-slate-600">{fr ? "Ajoutez d'abord un numéro de téléphone." : "Add a phone number first."}</p>
                )}
                {editingPhone ? (
                  <div className="space-y-2">
                    <input
                      className="input-premium w-full px-3 py-2 text-sm"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+243 81 234 5678"
                      aria-label={fr ? "Nouveau numéro de mobile" : "New mobile number"}
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveNumber(); }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={saveNumber} disabled={busy !== null}>{busy === "number" ? "…" : fr ? "Enregistrer le numéro" : "Save number"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingPhone(false); setNewPhone(""); }} disabled={busy !== null}>{fr ? "Annuler" : "Cancel"}</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setNewPhone(phone ?? ""); setEditingPhone(true); }} className="block text-xs text-[var(--primary)] underline">
                    {hasPhone ? (fr ? "Changer de numéro" : "Change number") : (fr ? "Ajouter un numéro" : "Add a number")}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">E-mail</p>
                <p className="truncate text-sm text-slate-600">{maskEmail(rt.user?.email)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.emailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                {status.emailVerified ? (fr ? "Vérifié" : "Verified") : fr ? "Non vérifié" : "Not verified"}
              </span>
            </div>
            {!status.emailVerified && (
              <div className="space-y-2">
                {mailOff && <SendStatus outcome={{ sent: false, reason: "not_configured" }} channel="email" fr={fr} />}
                <Button size="sm" variant="secondary" onClick={sendEmail} disabled={mailOff || busy !== null || mailTimer.left > 0}>
                  {busy === "email" ? "…" : mailTimer.left > 0 ? (fr ? `Renvoyer dans ${clock(mailTimer.left)}` : `Resend in ${clock(mailTimer.left)}`) : mailOutcome ? (fr ? "Renvoyer le lien" : "Resend link") : (fr ? "Envoyer le lien de vérification" : "Send verification link")}
                </Button>
                <SendStatus outcome={mailOutcome} channel="email" fr={fr} />
                <button type="button" onClick={() => status.reload()} className="block text-xs text-[var(--primary)] underline">
                  {fr ? "J'ai cliqué sur le lien, actualiser" : "I clicked the link, refresh"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {ok && cartCount > 0 && (
        <Link href="/shop/checkout" className="inline-block text-sm font-medium text-[var(--primary)] underline">
          {fr ? "Retourner à la caisse" : "Back to checkout"}
        </Link>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
