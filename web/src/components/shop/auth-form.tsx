"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import { authApi } from "@/lib/realtime/auth-api";

type AuthMode = "register" | "login" | "otp" | "verify-email" | "forgot" | "reset";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { locale } = useLocale();
  const { signInReal } = useAuth();
  const { login: realLogin, register: realRegister } = useRealtime();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fr = locale === "fr";
  const verifyRan = useRef(false);

  // The emailed link carries ?token=… Read it AFTER mount: reading it during
  // render makes the server HTML differ from the client's (hydration error).
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  useEffect(() => {
    // Intentional: must run post-mount to stay hydration-safe.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLinkToken(new URLSearchParams(window.location.search).get("token"));
    setTokenChecked(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Opening the verification link confirms the email automatically.
  useEffect(() => {
    if (mode !== "verify-email" || verifyRan.current || !linkToken) return;
    const token = linkToken;
    verifyRan.current = true;
    setBusy(true);
    authApi
      .verifyEmail(token)
      .then(() => setNotice(fr ? "E-mail vérifié ✓" : "Email verified ✓"))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [mode, fr, linkToken]);

  async function submit() {
    setError(null);
    // Real backend auth for the customer app.
    if (mode === "login" || mode === "register") {
      if (!email || !password || (mode === "register" && !name)) {
        setError(fr ? "Veuillez remplir tous les champs." : "Please fill in all fields.");
        return;
      }
      setBusy(true);
      try {
        const user =
          mode === "register"
            ? await realRegister({ email, password, name, role: "customer" })
            : await realLogin(email, password);
        signInReal(user.role, { name: user.name, email: user.email });
        router.push("/shop/account");
      } catch (e) {
        setError(
          (e as Error).message ||
            (fr ? "Échec de la connexion." : "Sign-in failed."),
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        if (!email) { setError(fr ? "Saisissez votre e-mail." : "Enter your email."); return; }
        await authApi.forgotPassword(email);
        // Same message whether or not the account exists (no enumeration).
        setNotice(fr ? "Si un compte existe, un lien de réinitialisation vient d'être envoyé." : "If an account exists for that email, a reset link is on its way.");
      } else if (mode === "reset") {
        const token = linkToken;
        if (!token) { setError(fr ? "Lien invalide : ouvrez le lien reçu par e-mail." : "Invalid link — open the link from your email."); return; }
        await authApi.resetPassword(token, password);
        router.push("/shop/login");
      } else if (mode === "otp") {
        await authApi.verifyPhoneOtp(otp);
        router.push("/shop/verify-email");
      } else if (mode === "verify-email") {
        if (linkToken) router.push("/shop/account");
        else { await authApi.sendEmailVerification(); setNotice(fr ? "E-mail de vérification renvoyé." : "Verification email sent."); }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setError(null);
    try {
      await authApi.sendPhoneOtp();
      setNotice(fr ? "Nouveau code envoyé." : "A new code was sent.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const titles: Record<AuthMode, { en: string; fr: string }> = {
    register: { en: "Create Account", fr: "Créer un compte" },
    login: { en: "Sign In", fr: "Connexion" },
    otp: { en: "Verify OTP", fr: "Vérifier OTP" },
    "verify-email": { en: "Verify Email", fr: "Vérifier l'email" },
    forgot: { en: "Forgot Password", fr: "Mot de passe oublié" },
    reset: { en: "Reset Password", fr: "Réinitialiser" },
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">{fr ? titles[mode].fr : titles[mode].en}</h1>
      <div className="card-premium space-y-4 p-6">
        {mode === "register" && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="text" placeholder={fr ? "Nom complet" : "Full name"} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        {(mode === "register" || mode === "login" || mode === "forgot") && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="email" placeholder={fr ? "E-mail" : "Email"} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        )}
        {(mode === "register" || mode === "login" || mode === "reset") && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" type="password" placeholder={fr ? "Mot de passe" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        )}
        {mode === "otp" && (
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
        )}
        {mode === "verify-email" && (
          <p className="text-sm text-slate-600">{fr ? "Cliquez sur le lien envoyé à votre email." : "Click the link sent to your email."}</p>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {mode === "otp" && (
          <button type="button" onClick={resendOtp} className="text-sm text-[var(--primary)]">
            {fr ? "Renvoyer le code" : "Resend code"}
          </button>
        )}
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? (fr ? "Veuillez patienter…" : "Please wait…") : mode === "verify-email" ? (!tokenChecked || linkToken ? (fr ? "Continuer" : "Continue") : (fr ? "Renvoyer l'e-mail" : "Resend email")) : mode === "reset" ? (fr ? "Réinitialiser" : "Reset password") : mode === "otp" ? (fr ? "Vérifier" : "Verify") : mode === "forgot" ? (fr ? "Envoyer lien" : "Send link") : mode === "login" ? (fr ? "Se connecter" : "Sign in") : mode === "register" ? (fr ? "Créer le compte" : "Create account") : (fr ? "Continuer" : "Continue")}
        </Button>
      </div>
      <div className="text-center text-sm text-slate-500">
        {mode === "login" && <Link href="/shop/forgot" className="text-[var(--primary)]">{fr ? "Mot de passe oublié ?" : "Forgot password?"}</Link>}
        {mode === "login" && " · "}
        {mode === "login" && <Link href="/shop/register" className="text-[var(--primary)]">{fr ? "Créer un compte" : "Create account"}</Link>}
        {mode === "register" && <Link href="/shop/login" className="text-[var(--primary)]">{fr ? "Déjà un compte ?" : "Already have an account?"}</Link>}
      </div>
    </div>
  );
}
