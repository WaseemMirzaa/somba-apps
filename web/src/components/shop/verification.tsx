"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { useShop } from "@/context/shop-context";
import { authApi } from "@/lib/realtime/auth-api";
import { useVerificationStatus, type VerificationStatus } from "@/lib/shop-live";

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

/** Profile > Verification: confirm the phone by SMS code and/or the email by link. */
export function VerificationCard() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const status = useVerificationStatus();
  const { cartCount } = useShop();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"sms" | "code" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasPhone = !!rt.user?.phone;

  async function run(kind: "sms" | "code" | "email", fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || (fr ? "Échec de la demande." : "The request failed."));
    } finally {
      setBusy(null);
    }
  }

  const sendCode = () =>
    run("sms", async () => {
      await authApi.sendPhoneOtp();
      setCodeSent(true);
      setNotice(fr ? "Code envoyé par SMS." : "Code sent by SMS.");
    });
  const verifyCode = () =>
    run("code", async () => {
      if (!/^\d{6}$/.test(code.trim())) throw new Error(fr ? "Le code comporte 6 chiffres." : "The code has 6 digits.");
      await authApi.verifyPhoneOtp(code.trim());
      setCode("");
      setCodeSent(false);
      status.reload();
      toast(fr ? "Téléphone vérifié" : "Phone verified");
    });
  const sendEmail = () =>
    run("email", async () => {
      const res = await authApi.sendEmailVerification();
      setNotice(
        res.sent === false && status.emailVerified
          ? fr ? "E-mail déjà vérifié." : "Email already verified."
          : fr ? "E-mail de vérification envoyé. Ouvrez le lien reçu." : "Verification email sent. Open the link you receive.",
      );
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
                  ? (fr ? "Requise pour commander et recharger le portefeuille." : "Required to place orders and top up the wallet.")
                  : (fr ? "Recommandée pour sécuriser votre compte." : "Recommended to secure your account.")}
          </p>
        </div>
      </div>

      {status.loaded && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <p className="text-sm font-medium">{fr ? "Téléphone" : "Phone"} {rt.user?.phone ? `· ${rt.user.phone}` : ""}</p>
            {status.phoneVerified ? (
              <p className="mt-1 text-sm text-emerald-700">{fr ? "Vérifié" : "Verified"}</p>
            ) : !hasPhone ? (
              <p className="mt-1 text-sm text-slate-600">{fr ? "Ajoutez d'abord un numéro de téléphone à votre profil (Modifier)." : "Add a phone number to your profile first (Edit)."}</p>
            ) : (
              <div className="mt-2 space-y-2">
                <Button size="sm" variant="secondary" onClick={sendCode} disabled={busy !== null}>
                  {busy === "sms" ? "…" : codeSent ? (fr ? "Renvoyer le code" : "Resend code") : (fr ? "Envoyer un code par SMS" : "Send a code by SMS")}
                </Button>
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
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void verifyCode(); }}
                    />
                    <Button size="sm" onClick={verifyCode} disabled={busy !== null}>{busy === "code" ? "…" : fr ? "Vérifier" : "Verify"}</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4">
            <p className="text-sm font-medium">E-mail {rt.user?.email ? `· ${rt.user.email}` : ""}</p>
            {status.emailVerified ? (
              <p className="mt-1 text-sm text-emerald-700">{fr ? "Vérifié" : "Verified"}</p>
            ) : (
              <div className="mt-2 space-y-2">
                <Button size="sm" variant="secondary" onClick={sendEmail} disabled={busy !== null}>
                  {busy === "email" ? "…" : fr ? "Envoyer le lien de vérification" : "Send verification link"}
                </Button>
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
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    </div>
  );
}
